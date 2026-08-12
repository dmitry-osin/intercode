import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import {
  maxSeverity,
  newEventId,
  normalizeTelemetryEvent,
  sanitizeConfig,
  TELEMETRY_BASE_SEVERITY,
} from "./protocol.js";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_AUTH = 2;
const MESSAGE_QUERY_AWARENESS = 3;

const TELEMETRY_CAP = 5000;
const MAX_CONNS_PER_ROOM = 20;
// Комната без единого участника выгружается из памяти (RAM) через час простоя,
// и одновременно её сессия автоматически помечается завершённой (см. Room.markEndedByIdle
// и RoomManager.gc) — считаем интервью брошенным, если час никто не подключался.
const ROOM_IDLE_TTL_MS = 60 * 60 * 1000;
const GC_INTERVAL_MS = 5 * 60 * 1000;
// Файлы завершённой сессии (meta/doc/telemetry) безвозвратно удаляются с диска
// через 12 часов после завершения — см. RoomManager.purgeExpiredSessions.
const ENDED_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 30 * 60 * 1000;
const DOC_SAVE_DEBOUNCE_MS = 2_000;
const TELEMETRY_FLUSH_MS = 1_000;

const DEFAULT_CONFIG = {
  copyBlocked: true,
  clipboardObfuscation: false,
  clipboardCorruption: false,
  aiPromptInjection: false,
  pasteThresholdAlert: true,
  devtoolsHeuristics: true,
};

function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(data, { binary: typeof data !== "string" });
  }
}

function sendJson(ws, obj) {
  send(ws, JSON.stringify(obj));
}

function broadcastJson(room, obj, filter) {
  const msg = JSON.stringify(obj);
  for (const [ws, conn] of room.conns) {
    if (!filter || filter(conn)) send(ws, msg);
  }
}

function broadcastBinary(room, data, except) {
  for (const [ws, conn] of room.conns) {
    if (conn !== except) send(ws, data);
  }
}

/** Телеметрию видят интервьюер и наблюдатель, но не кандидат (§5 ТЗ). */
function canSeeTelemetry(conn) {
  return conn.role === "interviewer" || conn.role === "viewer";
}

export class Room {
  constructor(manager, meta, docState, telemetry) {
    this.manager = manager;
    this.store = manager.store;
    this.meta = meta;
    this.id = meta.id;
    this.config = { ...DEFAULT_CONFIG, ...(meta.config ?? {}) };

    this.doc = new Y.Doc({ gc: true });
    this.ytext = this.doc.getText("code"); // то же имя Y.Text, что у клиента
    if (docState && docState.byteLength > 0) {
      Y.applyUpdate(this.doc, docState);
    } else if (typeof meta.initialCode === "string" && meta.initialCode.length > 0) {
      this.ytext.insert(0, meta.initialCode);
    }

    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);

    this.conns = new Map(); // ws -> { clientId, role, name, alive }
    this.telemetry = telemetry ?? [];
    this.telemetryIds = new Set(this.telemetry.map((e) => e.id));
    this.pendingTelemetry = [];
    this.idleSince = null;

    this._docSaveTimer = null;
    this._telemetryFlushTimer = null;

    this.doc.on("update", (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      broadcastBinary(this, encoding.toUint8Array(encoder), null);
      this._scheduleDocSave();
      void origin;
    });

    this.awareness.on("update", ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
      );
      broadcastBinary(this, encoding.toUint8Array(encoder), null);
      void origin;
    });
  }

  get isFull() {
    return this.conns.size >= MAX_CONNS_PER_ROOM;
  }

  get participantCount() {
    return this.conns.size;
  }

  addConnection(ws, { clientId, role, name }) {
    const conn = { clientId, role, name, alive: true, local: true };
    this.conns.set(ws, conn);
    this.idleSince = null;

    // Yjs sync step 1 + текущие awareness-состояния (handshake по y-protocols).
    {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      send(ws, encoding.toUint8Array(encoder));
    }
    if (this.awareness.states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(this.awareness.states.keys()),
        ),
      );
      send(ws, encoding.toUint8Array(encoder));
    }

    // Прикладной JSON-протокол: welcome + история телеметрии страницами по 500 (§7 ТЗ).
    sendJson(ws, {
      type: "welcome",
      role,
      clientId,
      serverTime: Date.now(),
      config: this.config,
      session: this.publicSession(),
    });
    this.sendTelemetryHistory(ws);

    // Сервер генерирует событие присоединения сам — клиенту нельзя доверять.
    this.acceptServerEvent("session_join", role, { name, participants: this.participantCount });
    return conn;
  }

  removeConnection(ws) {
    const conn = this.conns.get(ws);
    if (!conn) return;
    this.conns.delete(ws);
    awarenessProtocol.removeAwarenessStates(this.awareness, [conn.clientId], null);
    this.acceptServerEvent("session_leave", conn.role, {
      name: conn.name,
      participants: this.participantCount,
    });
    if (this.conns.size === 0) {
      this.idleSince = Date.now();
    }
  }

  publicSession() {
    return {
      id: this.meta.id,
      language: this.meta.language ?? "typescript",
      createdAt: this.meta.createdAt,
      status: this.meta.status ?? "active",
    };
  }

  /** Комната простаивала без единого участника дольше ROOM_IDLE_TTL_MS — считаем
   *  интервью брошенным (никто явно не завершал сессию через UI) и помечаем её
   *  завершённой сами, с closedAt = сейчас. Дальше файлы подберёт периодический
   *  RoomManager.purgeExpiredSessions() спустя ENDED_SESSION_TTL_MS. Участников
   *  в комнате уже нет, поэтому broadcastSessionEnded() не нужен. */
  async markEndedByIdle() {
    if (this.meta.status === "ended") return;
    this.meta.status = "ended";
    this.meta.closedAt = Date.now();
    await this.store.saveSessionMeta(this.meta);
  }

  sendTelemetryHistory(ws) {
    const pageSize = 500;
    const events = this.telemetry;
    if (events.length === 0) {
      sendJson(ws, { type: "tel_history", events: [], done: true });
      return;
    }
    for (let i = 0; i < events.length; i += pageSize) {
      sendJson(ws, {
        type: "tel_history",
        events: events.slice(i, i + pageSize),
        done: i + pageSize >= events.length,
      });
    }
  }

  /** Событие, сгенерированное сервером (join/leave). */
  acceptServerEvent(type, role, p) {
    const event = {
      id: newEventId(),
      actor: role,
      ts: Date.now(),
      srvTs: Date.now(),
      type,
      sev: TELEMETRY_BASE_SEVERITY[type] ?? "info",
      p: { role, ...p },
    };
    this._commitTelemetry([event]);
  }

  handleClientMessage(ws, conn, msg) {
    switch (msg.type) {
      case "hello":
        // Клиент прислал имя/мету после подключения; welcome уже отправлен в addConnection.
        if (typeof msg.name === "string" && msg.name.trim()) {
          conn.name = msg.name.trim().slice(0, 40);
        }
        break;
      case "tel": {
        const event = normalizeTelemetryEvent(msg.event, conn.role, this.config);
        if (event) this.acceptClientEvents([event]);
        break;
      }
      case "tel_batch": {
        const raw = Array.isArray(msg.events) ? msg.events.slice(0, 200) : [];
        const events = raw
          .map((e) => normalizeTelemetryEvent(e, conn.role, this.config))
          .filter(Boolean);
        if (events.length > 0) this.acceptClientEvents(events);
        break;
      }
      case "ping":
        sendJson(ws, { type: "pong", serverTime: Date.now() });
        break;
      case "meta": {
        // Метаданные сессии (язык, статус и настройки анти-чита) меняет только интервьюер.
        if (conn.role !== "interviewer" || !msg.patch || typeof msg.patch !== "object") break;
        const patch = {};
        if (typeof msg.patch.language === "string") patch.language = msg.patch.language;
        if (typeof msg.patch.status === "string" && ["active", "ended"].includes(msg.patch.status)) {
          patch.status = msg.patch.status;
          // Фиксируем момент завершения — от него считается ENDED_SESSION_TTL_MS
          // до удаления файлов сессии (см. RoomManager.purgeExpiredSessions).
          if (msg.patch.status === "ended" && !this.meta.closedAt) patch.closedAt = Date.now();
        }
        // Настройки анти-чита/телеметрии применяются в реальном времени: обновляем
        // и живой config комнаты (используется в normalizeTelemetryEvent), и мету
        // для персистентности; клиентам рассылаем только валидированный патч.
        let configPatch = null;
        if (msg.patch.config && typeof msg.patch.config === "object") {
          const sanitized = sanitizeConfig(msg.patch.config);
          if (Object.keys(sanitized).length > 0) configPatch = sanitized;
        }
        if (Object.keys(patch).length === 0 && !configPatch) break;
        Object.assign(this.meta, patch);
        if (configPatch) {
          this.meta.config = { ...this.meta.config, ...configPatch };
          this.config = { ...this.config, ...configPatch };
        }
        void this.store.saveSessionMeta(this.meta);
        broadcastJson(
          this,
          { type: "meta", patch: configPatch ? { ...patch, config: configPatch } : patch },
          () => true,
        );
        break;
      }
      default:
        break;
    }
  }

  acceptClientEvents(events) {
    // Дедупликация по id на сервере (§7 ТЗ) + лимит журнала.
    const fresh = [];
    for (const e of events) {
      if (this.telemetryIds.has(e.id)) continue;
      this.telemetryIds.add(e.id);
      fresh.push(e);
    }
    if (fresh.length === 0) return;
    this._commitTelemetry(fresh);
  }

  _commitTelemetry(events) {
    this.telemetry.push(...events);
    if (this.telemetry.length > TELEMETRY_CAP) {
      const overflow = this.telemetry.length - TELEMETRY_CAP;
      const removed = this.telemetry.splice(0, overflow);
      for (const e of removed) this.telemetryIds.delete(e.id);
    }
    this.pendingTelemetry.push(...events);
    this._scheduleTelemetryFlush();
    // Лента телеметрии: интервьюеру и наблюдателю (§7 ТЗ, tel_feed).
    broadcastJson(this, { type: "tel_feed", events }, canSeeTelemetry);
  }

  _scheduleTelemetryFlush() {
    if (this._telemetryFlushTimer) return;
    this._telemetryFlushTimer = setTimeout(() => {
      this._telemetryFlushTimer = null;
      void this.flushTelemetry();
    }, TELEMETRY_FLUSH_MS);
  }

  async flushTelemetry() {
    if (this.pendingTelemetry.length === 0) return;
    const batch = this.pendingTelemetry.splice(0);
    await this.store.appendTelemetry(this.id, batch).catch(() => {
      // Возвращаем в очередь при сбое диска.
      this.pendingTelemetry.unshift(...batch);
    });
  }

  _scheduleDocSave() {
    if (this._docSaveTimer) return;
    this._docSaveTimer = setTimeout(() => {
      this._docSaveTimer = null;
      void this.store.saveDocState(this.id, Y.encodeStateAsUpdate(this.doc));
    }, DOC_SAVE_DEBOUNCE_MS);
  }

  handleBinaryMessage(ws, conn, data) {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case MESSAGE_SYNC: {
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        if (conn.role === "viewer") {
          // Read-only (§5 ТЗ): от наблюдателя принимаем только SyncStep1
          // (запрос состояния) и SyncStep2 (ответ на наш запрос — безопасно:
          // его содержимое определяет сервер). Произвольные update отбрасываем.
          const syncType = decoding.readVarUint(decoder);
          if (syncType === syncProtocol.messageYjsSyncStep1) {
            // ВАЖНО: syncType в ответ НЕ пишем — readSyncStep1 сам
            // сериализует исходящий SyncStep2 (writeSyncStep2 пишет свой
            // messageYjsSyncStep2). Эхо входящего syncType давало бы
            // кадр [SYNC][Step1][Step2][…], который клиент разбирает
            // как SyncStep1 и применяет мусор вместо состояния документа.
            syncProtocol.readSyncStep1(decoder, encoder, this.doc);
          } else if (syncType === syncProtocol.messageYjsSyncStep2) {
            // readSyncStep2(decoder, doc, transactionOrigin): encoder здесь не нужен,
            // ответ на SyncStep2 не положен.
            syncProtocol.readSyncStep2(decoder, this.doc, conn);
          }
        } else {
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn);
        }
        if (encoding.length(encoder) > 1) {
          send(ws, encoding.toUint8Array(encoder));
        }
        break;
      }
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
      case MESSAGE_AUTH:
        // Авторизация по токену в query при upgrade — auth-сообщения не используем.
        break;
      case MESSAGE_QUERY_AWARENESS: {
        const encoderOut = encoding.createEncoder();
        encoding.writeVarUint(encoderOut, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoderOut,
          awarenessProtocol.encodeAwarenessUpdate(
            this.awareness,
            Array.from(this.awareness.states.keys()),
          ),
        );
        send(ws, encoding.toUint8Array(encoderOut));
        break;
      }
      default:
        break;
    }
  }

  async persistNow() {
    await this.flushTelemetry();
    await this.store.saveDocState(this.id, Y.encodeStateAsUpdate(this.doc));
  }

  /** Уведомить всех участников о завершении сессии до разрыва соединений. */
  broadcastSessionEnded() {
    broadcastJson(this, { type: "session_ended", endedAt: Date.now() }, () => true);
  }

  async dispose() {
    clearTimeout(this._docSaveTimer);
    clearTimeout(this._telemetryFlushTimer);
    await this.persistNow().catch(() => {});
    this.awareness.destroy();
    this.doc.destroy();
  }
}

export class RoomManager {
  constructor(store) {
    this.store = store;
    this.rooms = new Map(); // id -> Room
    this._gcTimer = setInterval(() => void this.gc(), GC_INTERVAL_MS);
    this._gcTimer.unref?.();
    this._purgeTimer = setInterval(() => void this.purgeExpiredSessions(), PURGE_INTERVAL_MS);
    this._purgeTimer.unref?.();
  }

  /** Загрузить (или восстановить с диска) комнату. */
  async getRoom(meta) {
    const existing = this.rooms.get(meta.id);
    if (existing) return existing;
    const [docState, telemetry] = await Promise.all([
      this.store.loadDocState(meta.id),
      this.store.loadTelemetry(meta.id),
    ]);
    const room = new Room(this, meta, docState, telemetry);
    this.rooms.set(meta.id, room);
    return room;
  }

  /** Обновить мету активной комнаты (например, статус "ended" через HTTP API). */
  applyMetaPatch(id, patch) {
    const room = this.rooms.get(id);
    if (!room) return;
    Object.assign(room.meta, patch);
    broadcastJson(room, { type: "meta", patch }, () => true);
  }

  /** Комнаты без единого участника дольше ROOM_IDLE_TTL_MS выгружаются из RAM
   *  (Yjs-документ, awareness) и одновременно помечаются завершёнными — см.
   *  Room.markEndedByIdle. Данные на диске при этом не удаляются, комната по-прежнему
   *  восстановима (для экспорта/просмотра истории), просто больше не принимает новых
   *  подключений (session_closed). Реальное удаление файлов — задача
   *  purgeExpiredSessions() спустя ENDED_SESSION_TTL_MS после closedAt. */
  async gc() {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      if (room.conns.size === 0 && room.idleSince && now - room.idleSince > ROOM_IDLE_TTL_MS) {
        this.rooms.delete(id);
        await room.markEndedByIdle();
        await room.dispose();
      }
    }
  }

  /** Раз в PURGE_INTERVAL_MS сканирует ВСЕ сохранённые на диске сессии (а не только
   *  загруженные в память комнаты) и безвозвратно удаляет файлы (meta/doc/telemetry)
   *  тех, что завершены (status === "ended") более ENDED_SESSION_TTL_MS назад —
   *  неважно, завершились ли они вручную через UI или автоматически по простою
   *  (Room.markEndedByIdle). Активные (status === "active") сессии никогда не трогаем. */
  async purgeExpiredSessions() {
    const now = Date.now();
    const ids = await this.store.listSessionIds();
    for (const id of ids) {
      // Сессия сейчас загружена в память — её жизненным циклом занимается gc().
      if (this.rooms.has(id)) continue;
      const meta = await this.store.loadSessionMeta(id);
      if (!meta || meta.status !== "ended") continue;
      const endedAt = meta.closedAt ?? meta.createdAt;
      if (now - endedAt > ENDED_SESSION_TTL_MS) {
        await this.store.deleteSession(id);
      }
    }
  }

  async shutdown() {
    clearInterval(this._gcTimer);
    clearInterval(this._purgeTimer);
    for (const room of this.rooms.values()) {
      await room.dispose();
    }
    this.rooms.clear();
  }
}

export { maxSeverity };
