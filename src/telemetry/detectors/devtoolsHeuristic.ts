import type { Detach, DetectorContext } from "../types";

export function attachDevtoolsHeuristicDetector(context: DetectorContext): Detach {
  if (!context.config.devtoolsHeuristics) return () => undefined;
  let lastEmittedAt = 0;

  const interval = window.setInterval(() => {
    const widthDelta = window.outerWidth - window.innerWidth;
    const heightDelta = window.outerHeight - window.innerHeight;
    const suspect = widthDelta > 160 || heightDelta > 160;
    if (suspect && Date.now() - lastEmittedAt > 10_000) {
      lastEmittedAt = Date.now();
      context.emit("devtools_suspect", { heuristic: "window_size_delta", widthDelta, heightDelta }, "warn");
    }
  }, 3000);

  return () => window.clearInterval(interval);
}
