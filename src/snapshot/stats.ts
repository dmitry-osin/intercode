import type { SessionMeta, TelemetryEvent } from "@/types";

export function computeStats(
  meta: SessionMeta,
  telemetry: TelemetryEvent[],
  editsTotal: number,
  exportedAt: number,
): {
  durationMs: number;
  telemetryCounts: Record<string, number>;
  editsTotal: number;
  awayTotalMs: number;
} {
  const telemetryCounts: Record<string, number> = {};
  let awayTotalMs = 0;
  for (const event of telemetry) {
    telemetryCounts[event.type] = (telemetryCounts[event.type] ?? 0) + 1;
    if ((event.type === "visibility_visible" || event.type === "window_focus") && typeof event.p.awayMs === "number") {
      awayTotalMs += event.p.awayMs;
    }
  }
  return {
    durationMs: Math.max(0, (meta.closedAt ?? exportedAt) - meta.createdAt),
    telemetryCounts,
    editsTotal,
    awayTotalMs,
  };
}
