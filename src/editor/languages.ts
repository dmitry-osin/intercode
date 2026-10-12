import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";

export type LanguageId =
  | "typescript"
  | "javascript"
  | "python"
  | "java"
  | "go"
  | "rust"
  | "cpp"
  | "csharp"
  | "sql"
  | "kotlin";

export const languageLabels: Record<LanguageId, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  java: "Java",
  go: "Go",
  rust: "Rust",
  cpp: "C/C++",
  csharp: "C#",
  sql: "SQL",
  kotlin: "Kotlin",
};

export const languageIds = Object.keys(languageLabels) as LanguageId[];

export async function loadLanguage(language: string): Promise<Extension> {
  switch (language as LanguageId) {
    case "javascript": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript();
    }
    case "python": {
      const { python } = await import("@codemirror/lang-python");
      return python();
    }
    case "java": {
      const { java } = await import("@codemirror/lang-java");
      return java();
    }
    case "go": {
      const { go } = await import("@codemirror/legacy-modes/mode/go");
      return StreamLanguage.define(go);
    }
    case "rust": {
      const { rust } = await import("@codemirror/lang-rust");
      return rust();
    }
    case "cpp": {
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    }
    case "csharp": {
      const { csharp } = await import("@codemirror/legacy-modes/mode/clike");
      return StreamLanguage.define(csharp);
    }
    case "sql": {
      const { sql } = await import("@codemirror/lang-sql");
      return sql();
    }
    case "kotlin": {
      const { kotlin } = await import("@codemirror/legacy-modes/mode/clike");
      return StreamLanguage.define(kotlin);
    }
    case "typescript":
    default: {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ typescript: true });
    }
  }
}

export const starterCode: Record<LanguageId, string> = {
  typescript: `function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {\n  // TODO: implement debounce\n  return fn;\n}\n`,
  javascript: `function debounce(fn, ms) {\n  // TODO: implement debounce\n  return fn;\n}\n`,
  python: `def debounce(fn, ms):\n    # TODO: implement debounce\n    return fn\n`,
  java: `class Solution {\n    // TODO: implement debounce\n}\n`,
  go: `package main\n\n// TODO: implement debounce\n`,
  rust: `fn debounce() {\n    // TODO: implement debounce\n}\n`,
  cpp: `#include <functional>\n\n// TODO: implement debounce\n`,
  csharp: `public class Solution {\n    // TODO: implement debounce\n}\n`,
  sql: `-- TODO: write a query\nSELECT 1;\n`,
  kotlin: `class Solution {\n    // TODO: implement debounce\n}\n`,
};
