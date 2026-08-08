import { uuid } from "@/lib/id";
import type { RoomConfig } from "@/types";

const reservedIdentifiers = new Set([
  "abstract", "arguments", "as", "async", "await", "bool", "boolean", "break", "byte", "case", "catch", "char", "class",
  "const", "continue", "debugger", "def", "default", "defer", "delete", "do", "double", "else", "elif", "enum", "export",
  "extends", "false", "final", "finally", "float", "fn", "for", "from", "func", "function", "go", "if", "impl", "implements",
  "import", "in", "include", "instanceof", "int", "interface", "is", "join", "lambda", "let", "long", "match", "mut", "namespace",
  "new", "null", "none", "nil", "of", "package", "private", "protected", "public", "range", "return", "select", "short", "static",
  "string", "struct", "super", "switch", "template", "this", "throw", "throws", "true", "try", "type", "typeof", "undefined",
  "union", "use", "using", "val", "var", "void", "while", "with", "where", "when", "yield",
  "array", "console", "document", "error", "map", "number", "object", "promise", "set", "window",
]);

export interface PoisonedClipboard {
  text: string;
  applied: string[];
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function obfuscateCopiedCode(source: string): string {
  const replacements = new Map<string, string>();
  return source.replace(/\b[A-Za-z_$][\w$]{2,}\b/g, (identifier) => {
    if (reservedIdentifiers.has(identifier.toLowerCase())) return identifier;
    const existing = replacements.get(identifier);
    if (existing) return existing;
    const replacement = `x_${stableHash(identifier)}`;
    replacements.set(identifier, replacement);
    return replacement;
  });
}

export function corruptCopiedCode(source: string): string {
  const marker = uuid();
  const lines = source.split(/\r\n|\r|\n/);
  const corrupted = lines.flatMap((line, index) => {
    const output = [line];
    const trimmed = line.trim();
    if (trimmed.length >= 8 && (index + 1) % 3 === 0) {
      const fragment = trimmed.slice(0, Math.max(6, Math.floor(trimmed.length * 0.45)));
      output.push(`${fragment} // duplicated-line-fragment-${marker.slice(0, 8)}`);
    }
    return output;
  });
  return [
    `intercode-clipboard-marker-${marker}`,
    ...corrupted,
    `corrupted-tail-${marker}`,
  ].join("\n");
}

export function hasClipboardDefense(config: RoomConfig): boolean {
  return (
    config.copyBlocked ||
    config.clipboardObfuscation ||
    config.clipboardCorruption ||
    (config.aiPromptInjection && config.aiPromptText.trim().length > 0)
  );
}

export function poisonClipboardText(source: string, config: RoomConfig): PoisonedClipboard {
  let text = source;
  const applied: string[] = [];

  if (config.clipboardObfuscation) {
    text = obfuscateCopiedCode(text);
    applied.push("obfuscation");
  }
  if (config.clipboardCorruption) {
    text = corruptCopiedCode(text);
    applied.push("corruption");
  }
  if (config.aiPromptInjection && config.aiPromptText.trim()) {
    text = `${text}\n\n${config.aiPromptText.trim()}`;
    applied.push("ai_prompt");
  }

  if (applied.length === 0 && config.copyBlocked) {
    return { text: "", applied: ["blocked"] };
  }
  return { text, applied };
}

export function clipboardAction(config: RoomConfig, applied: string[]): "allowed" | "blocked" | "poisoned" {
  if (applied.length > 0 && applied.some((item) => item !== "blocked")) return "poisoned";
  if (config.copyBlocked) return "blocked";
  return "allowed";
}
