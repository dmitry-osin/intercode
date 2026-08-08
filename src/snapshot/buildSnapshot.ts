import { byteSize } from "@/lib/format";
import { loadEditCount } from "@/session/store";
import type { Participant, Role, SessionMeta, SessionSnapshot, TelemetryEvent } from "@/types";
import { computeStats } from "./stats";

function participantsFromTelemetry(meta: SessionMeta, telemetry: TelemetryEvent[]): Array<Participant & { leftAt: number | null }> {
  const participants = new Map<string, Participant & { leftAt: number | null }>();
  for (const event of [...telemetry].sort((a, b) => a.ts - b.ts)) {
    if (event.type === "session_join") {
      participants.set(event.actor, {
        clientId: event.actor,
        role: (event.p.role as Role) ?? "viewer",
        displayName: String(event.p.name ?? event.actor),
        color: "#2563eb",
        joinedAt: event.ts,
        leftAt: null,
        ua: String(event.p.ua ?? ""),
      });
    }
    if (event.type === "session_leave") {
      const participant = participants.get(event.actor);
      if (participant) participant.leftAt = event.ts;
    }
  }
  if (participants.size === 0) {
    participants.set("local-host", {
      clientId: "local-host",
      role: "interviewer",
      displayName: meta.hostName,
      color: "#2563eb",
      joinedAt: meta.createdAt,
      leftAt: meta.closedAt,
      ua: "",
    });
  }
  return Array.from(participants.values());
}

export function buildSnapshot(meta: SessionMeta, finalCode: string, telemetry: TelemetryEvent[]): SessionSnapshot {
  const exportedAt = Date.now();
  const sortedTelemetry = [...telemetry].sort((a, b) => (a.srvTs ?? a.ts) - (b.srvTs ?? b.ts));
  return {
    format: "intercode-session",
    formatVersion: 1,
    exportedAt,
    session: {
      id: meta.id,
      title: meta.title,
      createdAt: meta.createdAt,
      closedAt: meta.closedAt,
      language: meta.language,
      config: meta.config,
    },
    participants: participantsFromTelemetry(meta, sortedTelemetry),
    code: {
      initial: meta.initialCode,
      final: finalCode,
      checkpoints: [{ ts: exportedAt, label: "export", sizeBytes: byteSize(finalCode) }],
    },
    telemetry: sortedTelemetry,
    stats: computeStats(meta, sortedTelemetry, loadEditCount(meta.id), exportedAt),
  };
}
