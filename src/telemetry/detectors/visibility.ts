import type { Detach, DetectorContext } from "../types";

export function attachVisibilityDetector(context: DetectorContext): Detach {
  let hiddenAt: number | null = null;
  let blurredAt: number | null = null;

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      context.emit("visibility_hidden", {}, "warn");
      return;
    }
    const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = null;
    context.emit("visibility_visible", { awayMs }, "warn");
  };

  const onBlur = () => {
    blurredAt = Date.now();
    context.emit("window_blur", {}, "warn");
  };

  const onFocus = () => {
    const awayMs = blurredAt ? Date.now() - blurredAt : 0;
    blurredAt = null;
    context.emit("window_focus", { awayMs }, "warn");
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
}
