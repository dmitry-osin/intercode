import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { WebSocketServer } from "ws";
import { SessionStore } from "./store.js";
import { RoomManager } from "./rooms.js";
import {
  newSessionId,
  newToken,
  roleFromCode,
  sanitizeDisplayName,
} from "./protocol.js";

const PORT = Number(process.env.PORT ?? 8090);
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;
const MAX_BODY_BYTES = 1024 * 1024; // 1 МБ
const MAX_INITIAL_CODE = 200 * 1024;

const LANGUAGES = new Set([
  "typescript",
  "javascript",
  "python",
  "java",
  "go",
  "rust",
  "cpp",
  "csharp",
  "sql",
  "kotlin",
]);

const CONFIG_KEYS = [
  "copyBlocked",
  "clipboardObfuscation",
  "clipboardCorruption",
  "aiPromptInjection",
  "pasteThresholdAlert",
  "devtoolsHeuristics",
];

const store = new SessionStore(DATA_DIR);
const manager = new RoomManager(store);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function setCommonHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Авторизация по r + k из query (§4 ТЗ: токен в URL, без аккаунтов). */
function authorize(meta, url) {
  const role = roleFromCode(url.searchParams.get("r") ?? "");
  const token = url.searchParams.get("k") ?? "";
  if (!role || !token) return null;
  if (meta?.tokens?.[role] !== token) return null;
  return role;
}

function sanitizeConfig(raw) {
  const config = {};
  if (raw && typeof raw === "object") {
    for (const key of CONFIG_KEYS) {
      if (typeof raw[key] === "boolean") config[key] = raw[key];
    }
    if (typeof raw.aiPromptText === "string") {
      config.aiPromptText = raw.aiPromptText.slice(0, 4000);
    }
  }
  return config;
}

/** Мета без токенов — для кандидата/наблюдателя. */
function publicMeta(meta, role) {
  const { tokens: _tokens, ...rest } = meta;
  return role === "interviewer" ? meta : rest;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP API
// ─────────────────────────────────────────────────────────────────────────────

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /api/healthz — фронтенд использует как пробу server-режима.
  if (req.method === "GET" && url.pathname === "/api/healthz") {
    sendJson(res, 200, { ok: true, service: "intercode-server", time: Date.now() });
    return;
  }

  // POST /api/sessions — создание сессии; id и токены генерирует сервер.
  if (req.method === "POST" && url.pathname === "/api/sessions") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "bad_body" });
      return;
    }
    const language = LANGUAGES.has(body.language) ? body.language : "typescript";
    const initialCode =
      typeof body.initialCode === "string"
        ? body.initialCode.slice(0, MAX_INITIAL_CODE)
        : "";
    const meta = {
      id: newSessionId(),
      createdAt: Date.now(),
      language,
      initialCode,
      status: "active",
      config: sanitizeConfig(body.config),
      tokens: {
        interviewer: newToken(),
        interviewee: newToken(),
        viewer: newToken(),
      },
    };
    await store.saveSessionMeta(meta);
    sendJson(res, 201, meta);
    return;
  }

  // /api/sessions/:id[/update|/export]
  if (parts[0] === "api" && parts[1] === "sessions" && parts[2]) {
    const id = parts[2];
    if (!/^[\w-]{6,32}$/.test(id)) {
      sendJson(res, 400, { error: "bad_id" });
      return;
    }
    const meta = await store.loadSessionMeta(id);
    if (!meta) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const role = authorize(meta, url);
    if (!role) {
      sendJson(res, 401, { error: "bad_token" });
      return;
    }
    const action = parts[3];

    if (req.method === "GET" && !action) {
      sendJson(res, 200, publicMeta(meta, role));
      return;
    }

    if (req.method === "POST" && action === "update") {
      if (role !== "interviewer") {
        sendJson(res, 403, { error: "forbidden" });
        return;
      }
      let body;
      try {
        body = await readBody(req);
      } catch {
        sendJson(res, 400, { error: "bad_body" });
        return;
      }
      const patch = {};
      if (typeof body.status === "string" && ["active", "ended"].includes(body.status)) {
        patch.status = body.status;
      }
      if (typeof body.language === "string" && LANGUAGES.has(body.language)) {
        patch.language = body.language;
      }
      Object.assign(meta, patch);
      await store.saveSessionMeta(meta);
      manager.applyMetaPatch(id, patch);
      if (patch.status === "ended") {
        // Явно сообщаем подключённым участникам о завершении до reject'а новых входов.
        manager.rooms.get(id)?.broadcastSessionEnded();
      }
      sendJson(res, 200, meta);
      return;
    }

    // Экспорт снапшота *.codesession.json (§8 ТЗ) — с сервера, с любого устройства.
    if (req.method === "GET" && action === "export") {
      const room = manager.rooms.get(id);
      if (room) await room.persistNow().catch(() => {});
      const [docState, telemetry] = await Promise.all([
        store.loadDocState(id),
        store.loadTelemetry(id),
      ]);
      let code = "";
      if (room) {
        code = room.ytext.toString();
      } else if (docState) {
        const { Doc, applyUpdate, getText } = await import("yjs");
        const doc = new Doc();
        applyUpdate(doc, docState);
        code = doc.getText("code").toString();
        doc.destroy();
        void getText;
      } else {
        code = meta.initialCode ?? "";
      }
      const snapshot = {
        version: 1,
        session: publicMeta(meta, role),
        code,
        telemetry,
        exportedAt: Date.now(),
      };
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${id}.codesession.json"`,
      });
      res.end(JSON.stringify(snapshot, null, 2));
      return;
    }
  }

  sendJson(res, 404, { error: "not_found" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Static files (single-container режим: фронтенд из STATIC_DIR)
// ─────────────────────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

async function handleStatic(req, res, url) {
  if (!STATIC_DIR) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(STATIC_DIR, pathname));
  if (!filePath.startsWith(STATIC_DIR)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(data);
  } catch {
    // SPA fallback — хэш-роутинг работает и без него, но путь / всегда отдаёт приложение.
    try {
      const data = await readFile(path.join(STATIC_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
      res.end(data);
    } catch {
      sendJson(res, 404, { error: "not_found" });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server + WebSocket
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  setCommonHeaders(res);
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await handleStatic(req, res, url);
    }
  } catch (err) {
    console.error("[http] error:", err);
    if (!res.headersSent) sendJson(res, 500, { error: "internal" });
    else res.end();
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  // WS-путь: /ws/<sessionId>?r=i|e|v&k=<token>&name=...
  const match = /^\/ws\/([\w-]{6,32})$/.exec(url.pathname);
  if (!match) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  const sessionId = match[1];
  const meta = await store.loadSessionMeta(sessionId);
  const fail = (reason) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: "reject", reason }));
      ws.close(4000, reason);
    });
  };
  if (!meta) return fail("session_not_found");
  const role = authorize(meta, url);
  if (!role) return fail("bad_token");
  if (meta.status === "ended") return fail("session_closed");

  try {
    const room = await manager.getRoom(meta);
    if (room.isFull) return fail("room_full");
    wss.handleUpgrade(req, socket, head, (ws) => {
      const name = sanitizeDisplayName(url.searchParams.get("name") ?? "", role);
      const conn = room.addConnection(ws, {
        clientId: Math.floor(Math.random() * 2 ** 31),
        role,
        name,
      });
      ws.room = room;
      ws.conn = conn;

      ws.on("message", (data, isBinary) => {
        try {
          if (isBinary) {
            room.handleBinaryMessage(ws, conn, data);
          } else {
            let msg;
            try {
              msg = JSON.parse(data.toString());
            } catch {
              return;
            }
            room.handleClientMessage(ws, conn, msg);
          }
        } catch (err) {
          console.error("[ws] message error:", err);
        }
      });
      ws.on("pong", () => {
        conn.alive = true;
      });
      ws.on("close", () => {
        room.removeConnection(ws);
      });
      ws.on("error", () => {
        room.removeConnection(ws);
      });
    });
  } catch (err) {
    console.error("[ws] upgrade error:", err);
    fail("internal");
  }
});

// Keep-alive: каждые 15 секунд ping, мёртвые соединения закрываем (§7 ТЗ).
const pingTimer = setInterval(() => {
  for (const room of manager.rooms.values()) {
    for (const [ws, conn] of room.conns) {
      if (!conn.alive) {
        ws.terminate();
        room.removeConnection(ws);
        continue;
      }
      conn.alive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }
}, 15_000);
pingTimer.unref?.();

async function shutdown() {
  console.log("[intercode] shutting down…");
  clearInterval(pingTimer);
  await manager.shutdown();
  server.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await store.init();
server.listen(PORT, () => {
  console.log(`[intercode] server listening on :${PORT}`);
  console.log(`[intercode] data dir: ${DATA_DIR}`);
  if (STATIC_DIR) console.log(`[intercode] static dir: ${STATIC_DIR}`);
});
