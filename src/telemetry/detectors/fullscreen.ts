import type { Detach, DetectorContext } from "../types";

/** Выход из полноэкранного режима (Esc / F11 / программно). */
export function attachFullscreenDetector(context: DetectorContext): Detach {
  const onFullscreenChange = () => {
    if (!document.fullscreenElement) {
      context.emit("fullscreen_exit", {}, "warn");
    }
  };

  document.addEventListener("fullscreenchange", onFullscreenChange);
  return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
}
