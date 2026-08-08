import type { CollabSession } from "@/collab/provider";
import type { TelemetryEvent } from "@/types";
import {
  appendBufferedEvent,
  clearBufferedEvents,
  loadBufferedEvents,
  storeBufferedEvents,
} from "./buffer";

export class TelemetrySender {
  private readonly provider: CollabSession;
  private flushing = false;

  constructor(provider: CollabSession) {
    this.provider = provider;
  }

  send(event: TelemetryEvent): void {
    try {
      this.provider.sendTelemetry(event);
    } catch {
      appendBufferedEvent(this.provider.sessionId, this.provider.clientId, event);
    }
  }

  flush(): void {
    if (this.flushing || !this.provider.currentStatus.connected) return;
    this.flushing = true;
    const queued = loadBufferedEvents(this.provider.sessionId, this.provider.clientId);
    const failed: TelemetryEvent[] = [];
    for (const event of queued) {
      try {
        this.provider.sendTelemetry(event);
      } catch {
        failed.push(event);
      }
    }
    if (failed.length > 0) storeBufferedEvents(this.provider.sessionId, this.provider.clientId, failed);
    else clearBufferedEvents(this.provider.sessionId, this.provider.clientId);
    this.flushing = false;
  }
}
