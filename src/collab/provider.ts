import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { loadSessionMeta, saveSessionMeta } from "@/session/store";
import { randomId, uuid } from "@/lib/id";
import { defaultRoomConfig, type Role, type SessionMeta, type TelemetryEvent } from "@/types";
import { roleColor, validateToken } from "./roles";
import { fetchServerSession, probeServerApi, serverWsUrl, SessionFetchError } from "./api";

export type TransportMode = "local" | "server";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export interface CollabStatus {
  connected: boolean;
  mode: TransportMode;
  error: string | null;
}

interface CreateCollabOptions {
  sessionId: string;
  role: Role;
  token: string;
  displayName: string;
}

interface LocalMessage {
  kind: "y-update" | "sync-request" | "sync-state" | "awareness" | "awareness-leave" | "telemetry" | "meta";
  sender?: string;
  to?: string;
  update?: number[];
  state?: number[];
  clients?: number[];
  event?: TelemetryEvent;
  meta?: SessionMeta;
}

type TelemetryHandler = (event: TelemetryEvent) => void;
type StatusHandler = (status: CollabStatus) => void;
type MetaHandler = (meta: SessionMeta) => void;

export class CollabError extends Error {
  readonly code: "not_found" | "bad_token" | "transport";

  constructor(code: "not_found" | "bad_token" | "transport", message: string) {
    super(message);
    this.code = code;
  }
}

export class CollabSession {
  readonly sessionId: string;
  readonly role: Role;
  readonly clientId = `c_${randomId(6)}`;
  readonly doc = new Y.Doc();
  readonly ytext = this.doc.getText("code");
  readonly awareness = new Awareness(this.doc);
  readonly joinedAt = Date.now();
  clockOffset = 0;

  private readonly token: string;
  private displayName: string;
  private readonly color: string;
  private readonly meta: SessionMeta;
  private mode: TransportMode = "local";
  private channel: BroadcastChannel | null = null;
  private serverSocket: WebSocket | null = null;
  private serverReconnectTimer: number | null = null;
  private serverRetries = 0;
  private serverRejected: string | null = null;
  private serverDocListener: ((update: Uint8Array, origin: unknown) => void) | null = null;
  private serverAwarenessListener:
    | ((changed: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void)
    | null = null;
  private readonly telemetryHandlers = new Set<TelemetryHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly metaHandlers = new Set<MetaHandler>();
  private status: CollabStatus = { connected: false, mode: "local", error: null };
  private closed = false;

  private constructor(options: CreateCollabOptions, meta: SessionMeta) {
    this.sessionId = options.sessionId;
    this.role = options.role;
    this.token = options.token;
    this.displayName = options.displayName || `Участник-${randomId(4)}`;
    this.meta = meta;
    this.color = roleColor(this.role);
  }

  static async create(options: CreateCollabOptions): Promise<CollabSession> {
    let meta = loadSessionMeta(options.sessionId);
    let mode: TransportMode = "local";

    if (await probeServerApi()) {
      // Server-режим (self-hosted): мету и права проверяет сервер по токену.
      mode = "server";
      try {
        const remote = await fetchServerSession(options.sessionId, options.role, options.token);
        // Сливаем токены с локальной копией, чтобы не затереть ссылки лобби интервьюера.
        const merged: SessionMeta = {
          ...remote,
          hostName: options.displayName || remote.hostName,
          tokens: {
            interviewer: remote.tokens.interviewer || meta?.tokens.interviewer || "",
            interviewee: remote.tokens.interviewee || meta?.tokens.interviewee || "",
            viewer: remote.tokens.viewer || meta?.tokens.viewer || "",
          },
        };
        merged.tokens[options.role] = options.token;
        meta = merged;
        saveSessionMeta(merged);
      } catch (error) {
        if (error instanceof SessionFetchError) {
          throw new CollabError(
            error.code === "transport" ? "transport" : error.code,
            error.code === "not_found"
              ? "Сессия не найдена на сервере."
              : error.code === "bad_token"
                ? "Ссылка не прошла проверку роли: сервер отклонил токен."
                : "Сервер недоступен. Попробуйте позже.",
          );
        }
        throw new CollabError("transport", "Не удалось связаться с сервером IntQst");
      }
    } else {
      if (!meta) {
        throw new CollabError(
          "not_found",
          "Сессия не найдена в этом браузере. Для демо откройте ссылку из лобби на этой же машине.",
        );
      }
      if (!validateToken(meta, options.role, options.token)) {
        throw new CollabError("bad_token", "Ссылка не прошла проверку роли: токен не совпадает.");
      }
    }

    meta ??= {
      id: options.sessionId,
      title: "IntQst session",
      createdAt: Date.now(),
      closedAt: null,
      language: "typescript",
      initialCode: "",
      hostName: options.displayName,
      config: defaultRoomConfig,
      tokens: { interviewer: "", interviewee: "", viewer: "" },
    };

    const session = new CollabSession(options, meta);
    if (mode === "server") session.connectServer();
    else session.connectLocal();
    return session;
  }

  get sessionMeta(): SessionMeta {
    return this.meta;
  }

  get currentStatus(): CollabStatus {
    return this.status;
  }

  onTelemetry(handler: TelemetryHandler): () => void {
    this.telemetryHandlers.add(handler);
    return () => this.telemetryHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  onMeta(handler: MetaHandler): () => void {
    this.metaHandlers.add(handler);
    return () => this.metaHandlers.delete(handler);
  }

  setDisplayName(name: string): void {
    this.displayName = name.trim() || this.displayName;
    this.pushLocalAwareness();
  }

  sendMeta(meta: SessionMeta): void {
    this.emitMeta(meta);
    if (this.mode === "server") {
      // На сервере мету меняет только интервьюер; шлём патч языка.
      this.sendServerJson({ type: "meta", patch: { language: meta.language } });
      return;
    }
    this.channel?.postMessage({ kind: "meta", meta, sender: this.clientId } satisfies LocalMessage);
  }

  sendTelemetry(event: TelemetryEvent): void {
    const enriched = { ...event, srvTs: event.srvTs ?? Date.now() };
    if (this.mode === "server") {
      if (!this.serverSocket || this.serverSocket.readyState !== WebSocket.OPEN) {
        throw new Error("Server socket is not open");
      }
      this.sendServerJson({ type: "tel", event: enriched });
      return;
    }
    this.emitTelemetry(enriched);
    this.channel?.postMessage({ kind: "telemetry", event: enriched, sender: this.clientId } satisfies LocalMessage);
  }

  /** Сессия завершена организатором (сообщение сервера) или локально. */
  endSession(): void {
    if (this.closed) return;
    this.meta.status = "ended";
    this.closed = true;
    // Сначала финальный статус/мета для обработчиков UI, затем разборка сокета.
    this.setStatus({ ...this.status, connected: false });
    this.emitMeta(this.meta);
    this.awareness.setLocalState(null);
    this.teardownServerSocket();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.mode !== "server") {
      try {
        this.sendTelemetry(this.presenceEvent("session_leave"));
      } catch {
        // Канал уже мог закрыться; leave-событие best effort.
      }
    }
    // В server-режиме session_leave генерирует сам сервер при закрытии сокета.
    this.awareness.setLocalState(null);
    if (this.channel) {
      this.channel.postMessage({ kind: "awareness-leave", clients: [this.doc.clientID], sender: this.clientId } satisfies LocalMessage);
      this.channel.close();
    }
    this.teardownServerSocket();
    this.doc.destroy();
    this.setStatus({ ...this.status, connected: false });
  }

  private connectLocal(): void {
    this.mode = "local";
    this.setStatus({ connected: true, mode: "local", error: null });
    this.channel = new BroadcastChannel(`intqst-room-${this.sessionId}`);
    this.channel.onmessage = (message: MessageEvent<LocalMessage>) => this.handleLocalMessage(message.data);

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "bc" || this.closed) return;
      this.channel?.postMessage({ kind: "y-update", update: Array.from(update), sender: this.clientId } satisfies LocalMessage);
    });

    this.awareness.on("change", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === "bc" || this.closed) return;
      const clients = [...added, ...updated, ...removed];
      if (clients.length === 0) return;
      const update = encodeAwarenessUpdate(this.awareness, clients);
      this.channel?.postMessage({ kind: "awareness", update: Array.from(update), sender: this.clientId } satisfies LocalMessage);
    });

    this.pushLocalAwareness();
    this.channel.postMessage({ kind: "sync-request", sender: this.clientId } satisfies LocalMessage);

    window.setTimeout(() => {
      if (this.ytext.length === 0 && this.role === "interviewer") {
        this.doc.transact(() => this.ytext.insert(0, this.meta.initialCode), "initial");
      }
      this.sendTelemetry(this.presenceEvent("session_join"));
    }, 180);

    window.addEventListener("beforeunload", this.beforeUnload);
  }

  // ── Server-режим: свой WebSocket-сервер (y-protocols + JSON телеметрия) ─────

  private connectServer(): void {
    this.mode = "server";
    this.setStatus({ connected: false, mode: "server", error: null });

    this.serverDocListener = (update, origin) => {
      if (origin === "remote" || this.closed) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.sendServerBinary(encoding.toUint8Array(encoder));
    };
    this.doc.on("update", this.serverDocListener);

    this.serverAwarenessListener = ({ added, updated, removed }, origin) => {
      if (origin === "remote" || this.closed) return;
      const clients = [...added, ...updated, ...removed];
      if (clients.length === 0) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, clients));
      this.sendServerBinary(encoding.toUint8Array(encoder));
    };
    this.awareness.on("change", this.serverAwarenessListener);

    this.pushLocalAwareness();
    this.openServerSocket();
    window.addEventListener("beforeunload", this.beforeUnload);
  }

  private openServerSocket(): void {
    if (this.closed || this.serverRejected) return;
    const ws = new WebSocket(serverWsUrl(this.sessionId, this.role, this.token, this.displayName));
    ws.binaryType = "arraybuffer";
    this.serverSocket = ws;

    ws.onopen = () => {
      this.serverRetries = 0;
      // Handshake по y-protocols: просим состояние документа у сервера.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      ws.send(encoding.toUint8Array(encoder));
      this.sendServerJson({ type: "hello", role: this.role, name: this.displayName });
      this.setStatus({ connected: true, mode: "server", error: null });
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        this.handleServerJson(event.data);
        return;
      }
      this.handleServerBinary(new Uint8Array(event.data as ArrayBuffer));
    };

    ws.onclose = () => {
      if (this.serverSocket === ws) this.serverSocket = null;
      if (this.closed || this.serverRejected) return;
      this.setStatus({ connected: false, mode: "server", error: "Соединение с сервером потеряно, переподключение…" });
      const delay = Math.min(10_000, 1000 * 2 ** this.serverRetries++);
      this.serverReconnectTimer = window.setTimeout(() => this.openServerSocket(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private teardownServerSocket(): void {
    if (this.serverReconnectTimer !== null) {
      window.clearTimeout(this.serverReconnectTimer);
      this.serverReconnectTimer = null;
    }
    if (this.serverDocListener) {
      this.doc.off("update", this.serverDocListener);
      this.serverDocListener = null;
    }
    if (this.serverAwarenessListener) {
      this.awareness.off("change", this.serverAwarenessListener);
      this.serverAwarenessListener = null;
    }
    const ws = this.serverSocket;
    this.serverSocket = null;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.onclose = null;
      ws.close();
    }
  }

  private sendServerBinary(data: Uint8Array): void {
    const ws = this.serverSocket;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }

  private sendServerJson(obj: Record<string, unknown>): void {
    const ws = this.serverSocket;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  private handleServerBinary(data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);
    if (messageType === MSG_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, "remote");
      if (encoding.length(encoder) > 1) {
        this.sendServerBinary(encoding.toUint8Array(encoder));
      }
      return;
    }
    if (messageType === MSG_AWARENESS) {
      applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), "remote");
    }
  }

  private handleServerJson(raw: string): void {
    let message: { type?: string; [key: string]: unknown };
    try {
      message = JSON.parse(raw) as { type?: string; [key: string]: unknown };
    } catch {
      return;
    }
    switch (message.type) {
      case "welcome": {
        const serverTime = typeof message.serverTime === "number" ? message.serverTime : Date.now();
        this.clockOffset = serverTime - Date.now();
        if (message.config && typeof message.config === "object") {
          Object.assign(this.meta.config, message.config);
        }
        if (message.session && typeof message.session === "object") {
          const s = message.session as { language?: string; status?: "active" | "ended" };
          if (s.language) this.meta.language = s.language;
          if (s.status) this.meta.status = s.status;
        }
        this.emitMeta(this.meta);
        this.setStatus({ connected: true, mode: "server", error: null });
        break;
      }
      case "reject": {
        this.serverRejected = String(message.reason ?? "reject");
        this.setStatus({
          connected: false,
          mode: "server",
          error:
            this.serverRejected === "bad_token"
              ? "Сервер отклонил токен доступа."
              : this.serverRejected === "session_closed"
                ? "Сессия завершена организатором."
                : this.serverRejected === "room_full"
                  ? "Комната переполнена."
                  : "Сервер отклонил подключение.",
        });
        this.teardownServerSocket();
        break;
      }
      case "tel_feed":
      case "tel_history": {
        if (Array.isArray(message.events)) {
          (message.events as TelemetryEvent[]).forEach((event) => this.emitTelemetry(event));
        }
        break;
      }
      case "meta": {
        if (message.patch && typeof message.patch === "object") {
          const patch = message.patch as { language?: string; status?: "active" | "ended" };
          if (patch.language) this.meta.language = patch.language;
          if (patch.status) this.meta.status = patch.status;
          this.emitMeta(this.meta);
        }
        break;
      }
      case "session_ended": {
        // Сервер сообщил: интервьюер завершил сессию — закрываемся у всех ролей.
        this.endSession();
        break;
      }
      case "pong":
        break;
      default:
        break;
    }
  }

  private handleLocalMessage(message: LocalMessage): void {
    if (this.closed || message.sender === this.clientId) return;
    if (message.kind === "y-update" && message.update) {
      Y.applyUpdate(this.doc, new Uint8Array(message.update), "bc");
      return;
    }
    if (message.kind === "sync-request") {
      const state = Y.encodeStateAsUpdate(this.doc);
      this.channel?.postMessage({ kind: "sync-state", state: Array.from(state), to: message.sender, sender: this.clientId } satisfies LocalMessage);
      const awarenessUpdate = encodeAwarenessUpdate(this.awareness, Array.from(this.awareness.getStates().keys()));
      this.channel?.postMessage({ kind: "awareness", update: Array.from(awarenessUpdate), sender: this.clientId } satisfies LocalMessage);
      return;
    }
    if (message.kind === "sync-state" && message.state && message.to === this.clientId) {
      Y.applyUpdate(this.doc, new Uint8Array(message.state), "bc");
      return;
    }
    if (message.kind === "awareness" && message.update) {
      applyAwarenessUpdate(this.awareness, new Uint8Array(message.update), "bc");
      return;
    }
    if (message.kind === "awareness-leave" && message.clients) {
      removeAwarenessStates(this.awareness, message.clients, "bc");
      return;
    }
    if (message.kind === "telemetry" && message.event) {
      this.emitTelemetry(message.event);
      return;
    }
    if (message.kind === "meta" && message.meta) {
      this.emitMeta(message.meta);
    }
  }

  private pushLocalAwareness(): void {
    this.awareness.setLocalStateField("user", {
      clientId: this.clientId,
      name: this.displayName,
      role: this.role,
      color: this.color,
      joinedAt: this.joinedAt,
      ua: navigator.userAgent,
    });
  }

  private presenceEvent(type: "session_join" | "session_leave"): TelemetryEvent {
    return {
      id: uuid(),
      actor: this.clientId,
      ts: Date.now(),
      srvTs: null,
      type,
      sev: "info",
      p: { role: this.role, name: this.displayName, ua: navigator.userAgent },
    };
  }

  private emitTelemetry(event: TelemetryEvent): void {
    this.telemetryHandlers.forEach((handler) => handler(event));
  }

  private emitMeta(meta: SessionMeta): void {
    this.metaHandlers.forEach((handler) => handler(meta));
  }

  private setStatus(status: CollabStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private readonly beforeUnload = (): void => this.close();
}
