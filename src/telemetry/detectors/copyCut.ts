import {
  clipboardAction,
  hasClipboardDefense,
  poisonClipboardText,
} from "../clipboardPoison";
import type { Detach, DetectorContext } from "../types";

function insideEditor(editorEl: HTMLElement | null, target: EventTarget | null): boolean {
  return Boolean(editorEl && target instanceof Node && editorEl.contains(target));
}

function selectedText(): string {
  return window.getSelection()?.toString() ?? "";
}

export function attachCopyCutDetector(context: DetectorContext): Detach {
  const defendClipboard = (event: ClipboardEvent, kind: "copy_attempt" | "cut_attempt") => {
    const selection = selectedText();
    if (!insideEditor(context.editorEl, event.target) && selection.length === 0) return;

    const defenseEnabled = hasClipboardDefense(context.config);
    const poisoned = defenseEnabled
      ? poisonClipboardText(selection, context.config)
      : { text: selection, applied: [] };

    if (defenseEnabled) {
      event.preventDefault();
      event.clipboardData?.setData("text/plain", poisoned.text);
    }

    context.emit(kind, {
      method: "event",
      selectionLen: selection.length,
      action: clipboardAction(context.config, poisoned.applied),
      defenses: poisoned.applied,
      outputLen: defenseEnabled ? poisoned.text.length : selection.length,
    }, "alert");
  };

  const onCopy = (event: ClipboardEvent) => defendClipboard(event, "copy_attempt");
  const onCut = (event: ClipboardEvent) => defendClipboard(event, "cut_attempt");

  const onContextMenu = (event: MouseEvent) => {
    if (!insideEditor(context.editorEl, event.target)) return;
    context.emit("ctx_menu", { pos: { x: event.clientX, y: event.clientY } }, "warn");
  };

  document.addEventListener("copy", onCopy, true);
  document.addEventListener("cut", onCut, true);
  document.addEventListener("contextmenu", onContextMenu, true);

  return () => {
    document.removeEventListener("copy", onCopy, true);
    document.removeEventListener("cut", onCut, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
  };
}
