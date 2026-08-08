import type { CollabSession } from "@/collab/provider";
import type { RoomConfig, TelemetryEvent, TelemetrySeverity, TelemetryType } from "@/types";
import { telemetryBaseSeverity } from "@/types";
import { uuid } from "@/lib/id";
import { TelemetrySender } from "./sender";
import type { DetectorContext } from "./types";
import { attachCopyCutDetector } from "./detectors/copyCut";
import { attachPasteDetector } from "./detectors/paste";
import { attachVisibilityDetector } from "./detectors/visibility";
import { attachKeyCombosDetector } from "./detectors/keyCombos";
import { attachTypingBurstDetector } from "./detectors/typingBurst";
import { attachDevtoolsHeuristicDetector } from "./detectors/devtoolsHeuristic";
import { attachFullscreenDetector } from "./detectors/fullscreen";
import { attachSelectionDumpDetector } from "./detectors/selectionDump";

export function attachTelemetryCollector(
  provider: CollabSession,
  editorEl: HTMLElement | null,
  config: RoomConfig,
): () => void {
  if (provider.role !== "interviewee") return () => undefined;

  const sender = new TelemetrySender(provider);
  let lastPasteAt = 0;
  const context: DetectorContext = {
    editorEl,
    config,
    markPaste: () => {
      lastPasteAt = Date.now();
    },
    wasRecentPaste: (withinMs) => Date.now() - lastPasteAt <= withinMs,
    emit: (type: TelemetryType, payload: Record<string, unknown>, severity?: TelemetrySeverity) => {
      const event: TelemetryEvent = {
        id: uuid(),
        actor: provider.clientId,
        ts: Date.now(),
        srvTs: null,
        type,
        sev: severity ?? telemetryBaseSeverity[type],
        p: payload,
      };
      sender.send(event);
    },
  };

  const detachStatus = provider.onStatus((status) => {
    if (status.connected) sender.flush();
  });
  sender.flush();

  const detachDetectors = [
    attachCopyCutDetector(context),
    attachPasteDetector(context),
    attachVisibilityDetector(context),
    attachKeyCombosDetector(context),
    attachTypingBurstDetector(context),
    attachDevtoolsHeuristicDetector(context),
    attachFullscreenDetector(context),
    attachSelectionDumpDetector(context),
  ];

  return () => {
    detachStatus();
    detachDetectors.forEach((detach) => detach());
  };
}
