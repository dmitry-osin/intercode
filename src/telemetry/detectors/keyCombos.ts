import type { Detach, DetectorContext } from "../types";

function comboName(event: KeyboardEvent): string | null {
  const mod = event.metaKey ? "Cmd" : event.ctrlKey ? "Ctrl" : "";
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (event.key === "PrintScreen") return "PrintScreen";
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && key.toLowerCase() === "i") return `${mod}+Shift+I`;
  if (event.metaKey && event.shiftKey && event.key === "4") return "Cmd+Shift+4";
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key.toLowerCase() === "c") return `${mod}+C`;
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key.toLowerCase() === "x") return `${mod}+X`;
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key.toLowerCase() === "a") return `${mod}+A`;
  return null;
}

export function attachKeyCombosDetector(context: DetectorContext): Detach {
  const onKeyDown = (event: KeyboardEvent) => {
    const combo = comboName(event);
    if (!combo) return;
    const selectionLen = window.getSelection()?.toString().length ?? 0;
    // PrintScreen/Win+Shift+S/macOS-шорткаты — вероятный снимок экрана.
    // Срабатывает только пока окно в фокусе: ОС не сообщает о скриншотах как таковых.
    if (combo === "PrintScreen" || combo === "Cmd+Shift+4") {
      context.emit("screenshot_attempt", { method: "hotkey", combo }, "warn");
      return;
    }
    if (combo.endsWith("+C")) {
      context.emit("copy_attempt", { method: "hotkey", selectionLen, combo }, "alert");
      return;
    }
    if (combo.endsWith("+X")) {
      context.emit("cut_attempt", { method: "hotkey", selectionLen, combo }, "alert");
      return;
    }
    context.emit("keystroke_combo", { combo }, "warn");
  };

  document.addEventListener("keydown", onKeyDown, true);
  return () => document.removeEventListener("keydown", onKeyDown, true);
}
