import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { AppTheme } from "@/app/theme";

const lightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#7c3aed" },
  { tag: [tags.string, tags.special(tags.string)], color: "#047857" },
  { tag: [tags.number, tags.bool, tags.null], color: "#b45309" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#1d4ed8" },
  { tag: [tags.comment, tags.blockComment], color: "#64748b", fontStyle: "italic" },
  { tag: tags.typeName, color: "#0f766e" },
  { tag: tags.propertyName, color: "#be185d" },
  { tag: tags.operator, color: "#334155" },
]);

const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#c084fc" },
  { tag: [tags.string, tags.special(tags.string)], color: "#6ee7b7" },
  { tag: [tags.number, tags.bool, tags.null], color: "#fbbf24" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#93c5fd" },
  { tag: [tags.comment, tags.blockComment], color: "#94a3b8", fontStyle: "italic" },
  { tag: tags.typeName, color: "#5eead4" },
  { tag: tags.propertyName, color: "#f9a8d4" },
  { tag: tags.operator, color: "#e2e8f0" },
]);

const hcHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#ffff00", fontWeight: "700" },
  { tag: [tags.string, tags.special(tags.string)], color: "#00ff66" },
  { tag: [tags.number, tags.bool, tags.null], color: "#ff9f1a" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#66d9ff" },
  { tag: [tags.comment, tags.blockComment], color: "#c0c0c0", fontStyle: "italic" },
  { tag: tags.typeName, color: "#ffffff", textDecoration: "underline" },
  { tag: tags.propertyName, color: "#ff66cc" },
  { tag: tags.operator, color: "#ffffff" },
]);

export function editorThemeFor(theme: AppTheme): Extension {
  const dark = theme !== "light";
  const highlight = theme === "light" ? lightHighlight : theme === "dark" ? darkHighlight : hcHighlight;

  return [
    EditorView.theme(
      {
        "&": {
          height: "100%",
          minHeight: "420px",
          backgroundColor: "hsl(var(--editor-bg))",
          color: "hsl(var(--editor-fg))",
          fontSize: "14px",
        },
        ".cm-scroller": {
          fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
          lineHeight: "1.55",
        },
        ".cm-content": {
          padding: "14px 0",
          caretColor: "hsl(var(--primary))",
        },
        ".cm-gutters": {
          backgroundColor: "hsl(var(--editor-gutter))",
          color: "hsl(var(--muted-foreground))",
          border: "none",
          borderRight: "1px solid hsl(var(--border))",
        },
        ".cm-activeLine": {
          backgroundColor: "hsl(var(--editor-active) / 0.72)",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "hsl(var(--editor-active))",
          color: "hsl(var(--foreground))",
        },
        "&.cm-focused": {
          outline: "none",
        },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
          backgroundColor: "hsl(var(--primary) / 0.24)",
        },
        ".cm-cursor": {
          borderLeftColor: "hsl(var(--primary))",
        },
        ".cm-tooltip": {
          backgroundColor: "hsl(var(--popover))",
          color: "hsl(var(--popover-foreground))",
          border: "1px solid hsl(var(--border))",
        },
        ".cm-tooltip-autocomplete ul li[aria-selected]": {
          backgroundColor: "hsl(var(--accent))",
          color: "hsl(var(--accent-foreground))",
        },
        ".cm-panels": {
          backgroundColor: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
        },
      },
      { dark },
    ),
    syntaxHighlighting(highlight),
  ];
}
