import type { TelemetryEvent } from "@/types";

const keyFor = (sessionId: string, clientId: string) => `intercode:telemetry-buffer:${sessionId}:${clientId}`;
const CAP = 500;

export function loadBufferedEvents(sessionId: string, clientId: string): TelemetryEvent[] {
  const raw = sessionStorage.getItem(keyFor(sessionId, clientId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TelemetryEvent[];
  } catch {
    return [];
  }
}

export function storeBufferedEvents(sessionId: string, clientId: string, events: TelemetryEvent[]): void {
  sessionStorage.setItem(keyFor(sessionId, clientId), JSON.stringify(events.slice(-CAP)));
}

export function appendBufferedEvent(sessionId: string, clientId: string, event: TelemetryEvent): void {
  const events = loadBufferedEvents(sessionId, clientId).filter((item) => item.id !== event.id);
  events.push(event);
  storeBufferedEvents(sessionId, clientId, events);
}

export function clearBufferedEvents(sessionId: string, clientId: string): void {
  sessionStorage.removeItem(keyFor(sessionId, clientId));
}
