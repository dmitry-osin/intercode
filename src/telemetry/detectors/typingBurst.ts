import type { Detach, DetectorContext } from "../types";

const WINDOW_MS = 1200;
const BURST_CHARS = 90;

export function attachTypingBurstDetector(context: DetectorContext): Detach {
  if (!context.editorEl) return () => undefined;
  let windowStartedAt = 0;
  let chars = 0;
  let emittedInWindow = false;

  const onBeforeInput = (event: InputEvent) => {
    if (!event.inputType.startsWith("insert")) return;
    const now = Date.now();
    if (now - windowStartedAt > WINDOW_MS) {
      windowStartedAt = now;
      chars = 0;
      emittedInWindow = false;
    }
    chars += event.data?.length ?? 1;
    if (!emittedInWindow && chars >= BURST_CHARS && !context.wasRecentPaste(900)) {
      emittedInWindow = true;
      context.emit("typing_burst", { chars, windowMs: now - windowStartedAt }, "warn");
    }
  };

  context.editorEl.addEventListener("beforeinput", onBeforeInput as EventListener);
  return () => context.editorEl?.removeEventListener("beforeinput", onBeforeInput as EventListener);
}
