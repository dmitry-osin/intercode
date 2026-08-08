import { defaultRoomConfig, type SessionMeta, type TelemetryEvent } from "@/types";

const metaKey = (sessionId: string) => `intercode:session:${sessionId}`;
const codeKey = (sessionId: string) => `intercode:code:${sessionId}`;
const telemetryKey = (sessionId: string) => `intercode:telemetry:${sessionId}`;
const editsKey = (sessionId: string) => `intercode:edits:${sessionId}`;
const nameKey = "intercode:display-name";

export function saveSessionMeta(meta: SessionMeta): void {
  localStorage.setItem(metaKey(meta.id), JSON.stringify(meta));
}

export function loadSessionMeta(sessionId: string): SessionMeta | null {
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

export function saveDisplayName(name: string): void {
  localStorage.setItem(nameKey, name);
}
