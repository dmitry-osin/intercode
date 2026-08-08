import { useEffect, useRef } from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { AppTheme } from "@/app/theme";
import type { CollabSession } from "@/collab/provider";
import { editorThemeFor } from "./cm-themes";
import { intercodeAutocomplete } from "./autocomplete";
import { loadLanguage } from "./languages";

export type IndentSetting = "2" | "4" | "tab";

interface CodeEditorProps {
  collab: CollabSession;
  language: string;
  theme: AppTheme;
  readOnly: boolean;
  indent: IndentSetting;
  onReady?: (view: EditorView | null) => void;
  onDocChange?: (code: string) => void;
}

export function CodeEditor({
  collab,
  language,
  theme,
  readOnly,
  indent,
  onReady,
  onDocChange,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let view: EditorView | null = null;
    let undoManager: Y.UndoManager | null = null;

    const mount = async () => {
      const languageExtension = await loadLanguage(language);
      if (cancelled || !containerRef.current) return;
      undoManager = readOnly ? null : new Y.UndoManager(collab.ytext);
      const state = EditorState.create({
        doc: collab.ytext.toString(),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          foldGutter(),
          indentUnit.of(indent === "tab" ? "\t" : " ".repeat(Number(indent))),
          highlightSelectionMatches(),
          editorThemeFor(theme),
          languageExtension,
          intercodeAutocomplete(language),
          yCollab(collab.ytext, collab.awareness, { undoManager: undoManager ?? false }),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ "aria-label": "Совместный редактор кода" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onDocChange?.(update.state.doc.toString());
          }),
          keymap.of([
            ...(undoManager ? yUndoManagerKeymap : []),
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap,
            ...foldKeymap,
            ...defaultKeymap,
            indentWithTab,
          ]),
        ],
      });
      view = new EditorView({ state, parent: containerRef.current });
      onReady?.(view);
    };

    void mount();

    return () => {
      cancelled = true;
      onReady?.(null);
      undoManager?.destroy();
      view?.destroy();
    };
  }, [collab, indent, language, onDocChange, onReady, readOnly, theme]);

  return <div ref={containerRef} className="h-full min-h-[420px] overflow-hidden rounded-xl border bg-card" />;
}
