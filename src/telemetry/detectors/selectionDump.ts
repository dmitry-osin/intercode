import type { Detach, DetectorContext } from "../types";

const MIN_SELECTION_LEN = 80;
const REEMIT_MS = 5000;

/**
 * Крупное выделение в редакторе (§7 ТЗ): кандидат выделил большой фрагмент —
 * типичный шаг перед копированием или переносом задачи в сторонний инструмент.
 * Событие шлём по завершении выделения (mouseup/keyup), с троттлингом.
 */
export function attachSelectionDumpDetector(context: DetectorContext): Detach {
  if (!context.editorEl) return () => undefined;
  let lastEmittedAt = 0;

  const checkSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const anchor = selection.anchorNode;
    if (!(anchor instanceof Node && context.editorEl?.contains(anchor))) return;
    const len = selection.toString().length;
    if (len < MIN_SELECTION_LEN) return;
    const now = Date.now();
    if (now - lastEmittedAt < REEMIT_MS) return;
    lastEmittedAt = now;
    context.emit("selection_dump", { len }, "info");
  };

  document.addEventListener("mouseup", checkSelection, true);
  document.addEventListener("keyup", checkSelection, true);
  return () => {
    document.removeEventListener("mouseup", checkSelection, true);
    document.removeEventListener("keyup", checkSelection, true);
  };
}
