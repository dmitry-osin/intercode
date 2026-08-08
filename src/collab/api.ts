import { defaultRoomConfig, type Role, type SessionMeta } from "@/types";
import { codeFromRole } from "./roles";

/**
 * HTTP API собственного сервера InterCode (режим self-hosted VPS).
 * Базовый URL — тот же origin (nginx проксирует /api и /ws), либо VITE_API_BASE для dev.
 */

const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

let probeCache: boolean | null = null;

/** Проба server-режима: /api/healthz должен вернуть именно наш JSON (SPA-fallback отсеиваем). */
export async function probeServerApi(): Promise<boolean> {
  if (probeCache !== null) return probeCache;
  try {
    const res = await fetch(`${apiBase}/api/healthz`, { cache: "no-store" });
    if (!res.ok) throw new Error("bad status");
    const data = (await res.json()) as { ok?: boolean; service?: string };
    probeCache = data.ok === true && data.service === "intercode-server";
  } catch {
    probeCache = false;
  }
  return probeCache;
}

export function resetServerProbe(): void {
  probeCache = null;
}

function normalizeServerMeta(raw: Partial<SessionMeta> & { id: string }): SessionMeta {
  return {
    id: raw.id,
    title: raw.title ?? "InterCode session",
    createdAt: raw.createdAt ?? Date.now(),
    closedAt: raw.closedAt ?? null,
    language: raw.language ?? "typescript",
    initialCode: raw.initialCode ?? "",
    hostName: raw.hostName ?? "",
    config: { ...defaultRoomConfig, ...(raw.config ?? {}) },
    tokens: {
      interviewer: raw.tokens?.interviewer ?? "",
      interviewee: raw.tokens?.interviewee ?? "",
      viewer: raw.tokens?.viewer ?? "",
    },
    status: raw.status ?? "active",
  };
}

/** Создать сессию на сервере: id и токены генерируются только там. */
export async function createServerSession(input: {
  language: string;
  initialCode: string;
  config: SessionMeta["config"];
}): Promise<SessionMeta> {
  const res = await fetch(`${apiBase}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status}`);
  const raw = (await res.json()) as SessionMeta;
  return normalizeServerMeta(raw);
}

export class SessionFetchError extends Error {
  readonly code: "not_found" | "bad_token" | "transport";

  constructor(code: "not_found" | "bad_token" | "transport", message: string) {
    super(message);
    this.code = code;
  }
}

/** Получить мету сессии по токену роли (кандидату/наблюдателю токены не отдаются). */
export async function fetchServerSession(
  sessionId: string,
  role: Role,
  token: string,
): Promise<SessionMeta> {
  const url = `${apiBase}/api/sessions/${encodeURIComponent(sessionId)}?r=${codeFromRole(role)}&k=${encodeURIComponent(token)}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new SessionFetchError("transport", "Сервер недоступен");
  }
  if (res.status === 404) throw new SessionFetchError("not_found", "Сессия не найдена на сервере");
  if (res.status === 401) throw new SessionFetchError("bad_token", "Токен не прошёл проверку на сервере");
  if (!res.ok) throw new SessionFetchError("transport", `Ошибка сервера: ${res.status}`);
  const raw = (await res.json()) as SessionMeta;
  return normalizeServerMeta(raw);
}

export async function updateServerSession(
  sessionId: string,
  role: Role,
  token: string,
  patch: { status?: "active" | "ended"; language?: string },
): Promise<void> {
  const url = `${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/update?r=${codeFromRole(role)}&k=${encodeURIComponent(token)}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

/** URL скачивания снапшота *.codesession.json прямо с сервера. */
export function serverExportUrl(sessionId: string, role: Role, token: string): string {
  return `${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/export?r=${codeFromRole(role)}&k=${encodeURIComponent(token)}`;
}

/** WebSocket URL комнаты: /ws/<id>?r&k&name (nginx проксирует на сервер). */
export function serverWsUrl(sessionId: string, role: Role, token: string, name: string): string {
  const explicit = (import.meta.env.VITE_WS_BASE as string | undefined)?.replace(/\/$/, "");
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = explicit || `${proto}//${window.location.host}/ws`;
  const params = new URLSearchParams({ r: codeFromRole(role), k: token, name });
  return `${base}/${encodeURIComponent(sessionId)}?${params.toString()}`;
}
