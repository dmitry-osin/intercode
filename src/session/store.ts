import { defaultRoomConfig, type SessionMeta, type TelemetryEvent } from "@/types";

const metaKey = (sessionId: string) => `intqst:session:${sessionId}`;
const codeKey = (sessionId: string) => `intqst:code:${sessionId}`;
const telemetryKey = (sessionId: string) => `intqst:telemetry:${sessionId}`;
const editsKey = (sessionId: string) => `intqst:edits:${sessionId}`;
const nameKey = "intqst:display-name";

/** Миграция ключей хранилища со старого бренда intercode:* на intqst:*. */
function migrateKey(newKey: string, oldKey: string): void {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      if (storage.getItem(newKey) === null) {
        const old = storage.getItem(oldKey);
        if (old !== null) {
          storage.setItem(newKey, old);
          storage.removeItem(oldKey);
        }
      }
    }
  } catch {
    /* storage недоступен */
  }
}

export function saveSessionMeta(meta: SessionMeta): void {
  localStorage.setItem(metaKey(meta.id), JSON.stringify(meta));
}

export function loadSessionMeta(sessionId: string): SessionMeta | null {
  migrateKey(metaKey(sessionId), `intercode:session:${sessionId}`);
  const raw = localStorage.getItem(metaKey(sessionId));
  if (!raw) return null;
  try {
    const meta = JSON.parse(raw) as SessionMeta;
    return {
      ...meta,
      config: { ...defaultRoomConfig, ...meta.config },
    };
  } catch {
    return null;
  }
}

export function saveFinalCode(sessionId: string, code: string): void {
  localStorage.setItem(codeKey(sessionId), code);
}

export function loadFinalCode(sessionId: string): string {
  return localStorage.getItem(codeKey(sessionId)) ?? "";
}

export function saveTelemetryHistory(sessionId: string, events: TelemetryEvent[]): void {
  sessionStorage.setItem(telemetryKey(sessionId), JSON.stringify(events.slice(-5000)));
}

export function loadTelemetryHistory(sessionId: string): TelemetryEvent[] {
  const raw = sessionStorage.getItem(telemetryKey(sessionId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TelemetryEvent[];
  } catch {
    return [];
  }
}

export function saveEditCount(sessionId: string, count: number): void {
  localStorage.setItem(editsKey(sessionId), String(count));
}

export function loadEditCount(sessionId: string): number {
  return Number(localStorage.getItem(editsKey(sessionId)) ?? 0);
}

export function loadDisplayName(): string {
  return localStorage.getItem(nameKey) ?? "";
}

const roleNameKey = (role: string) => `intqst:name:${role}`;

/** Имя роли из хранилища браузера; если его нет — значение по умолчанию текущей локали. */
export function loadRoleName(role: "interviewer" | "interviewee" | "viewer", fallback: string): string {
  return localStorage.getItem(roleNameKey(role))?.trim() || fallback;
}

export function saveRoleName(role: "interviewer" | "interviewee" | "viewer", name: string): void {
  const trimmed = name.trim();
  if (trimmed) localStorage.setItem(roleNameKey(role), trimmed);
  else localStorage.removeItem(roleNameKey(role));
}

export function saveDisplayName(name: string): void {
  localStorage.setItem(nameKey, name);
}
