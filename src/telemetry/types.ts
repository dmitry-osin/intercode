import type { RoomConfig, TelemetrySeverity, TelemetryType } from "@/types";

export type TelemetryEmit = (
  type: TelemetryType,
  payload: Record<string, unknown>,
  severity?: TelemetrySeverity,
) => void;

export interface DetectorContext {
  emit: TelemetryEmit;
  editorEl: HTMLElement | null;
  config: RoomConfig;
  markPaste: () => void;
  wasRecentPaste: (withinMs: number) => boolean;
}

export type Detach = () => void;
