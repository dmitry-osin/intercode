import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AnalyticsStore } from "./analytics.js";

/**
 * Персистентность без внешней БД (§9 ТЗ): JSON-сессии, бинарные снапшоты
 * Yjs-документов и JSONL-логи телеметрии в DATA_DIR.
 *
 *   DATA_DIR/
 *     sessions/<id>.json      — метаданные сессии (токены, конфиг, initialCode)
 *     docs/<id>.bin           — Y.encodeStateAsUpdate(doc)
 *     telemetry/<id>.jsonl    — по одному событию на строку
 */
export class SessionStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.sessionsDir = path.join(dataDir, "sessions");
    this.docsDir = path.join(dataDir, "docs");
    this.telemetryDir = path.join(dataDir, "telemetry");
    this._writeQueues = new Map(); // сериализация записей в один файл
    this.analytics = new AnalyticsStore(dataDir);
  }

  async init() {
    await mkdir(this.sessionsDir, { recursive: true });
    await mkdir(this.docsDir, { recursive: true });
    await mkdir(this.telemetryDir, { recursive: true });
    await this.analytics.init();
  }

  _sessionPath(id) {
    return path.join(this.sessionsDir, `${id}.json`);
  }

  _docPath(id) {
    return path.join(this.docsDir, `${id}.bin`);
  }

  _telemetryPath(id) {
    return path.join(this.telemetryDir, `${id}.jsonl`);
  }

  /** Атомарная запись через tmp + rename. */
  async _atomicWrite(file, data) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(file === tmp ? file : tmp, data);
    await rename(tmp, file);
  }

  /** Цепочка записей, чтобы конкурентные сейвы одной сессии не перемешивались. */
  _enqueue(key, job) {
    const prev = this._writeQueues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(job);
    this._writeQueues.set(key, next);
    return next;
  }

  async saveSessionMeta(meta) {
    const snapshot = structuredClone(meta);
    return this._enqueue(`meta:${meta.id}`, async () => {
      const previous = await this.loadSessionMeta(snapshot.id);
      await this._atomicWrite(this._sessionPath(snapshot.id), JSON.stringify(snapshot, null, 2));
      await this.analytics.session(snapshot, previous).catch((error) => console.error("[analytics] session:", error));
    });
  }

  async loadSessionMeta(id) {
    try {
      const raw = await readFile(this._sessionPath(id), "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async listSessionIds() {
    try {
      const files = await readdir(this.sessionsDir);
      return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
    } catch {
      return [];
    }
  }

  async saveDocState(id, update) {
    return this._enqueue(`doc:${id}`, () =>
      this._atomicWrite(this._docPath(id), Buffer.from(update)),
    );
  }

  async loadDocState(id) {
    try {
      const buf = await readFile(this._docPath(id));
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async appendTelemetry(id, events) {
    const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    return this._enqueue(`tel:${id}`, async () => {
      const file = this._telemetryPath(id);
      let prev = "";
      try {
        prev = await readFile(file, "utf8");
      } catch {
        /* файла ещё нет */
      }
      await this._atomicWrite(file, prev + lines);
      await this.analytics.events(events).catch((error) => console.error("[analytics] telemetry:", error));
    });
  }

  async loadTelemetry(id) {
    try {
      const raw = await readFile(this._telemetryPath(id), "utf8");
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async deleteSession(id) {
    await rm(this._sessionPath(id), { force: true }).catch(() => {});
    await rm(this._docPath(id), { force: true }).catch(() => {});
    await rm(this._telemetryPath(id), { force: true }).catch(() => {});
  }
}
