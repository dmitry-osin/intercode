import type { Detach, DetectorContext } from "../types";

export function attachPasteDetector(context: DetectorContext): Detach {
  const onPaste = (event: ClipboardEvent) => {
    if (context.editorEl && event.target instanceof Node && !context.editorEl.contains(event.target)) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    context.markPaste();
    const lines = text.split(/\r\n|\r|\n/).length;
    const alert = text.length > context.config.pasteThresholdAlert || lines > 3;
    context.emit("paste", { len: text.length, lines, source: "clipboard" }, alert ? "alert" : "warn");
  };

  document.addEventListener("paste", onPaste, true);
  return () => document.removeEventListener("paste", onPaste, true);
}
