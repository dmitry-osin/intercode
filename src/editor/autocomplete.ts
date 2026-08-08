import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

const keywords: Record<string, string[]> = {
  typescript: ["const", "let", "function", "return", "if", "else", "for", "while", "interface", "type", "class", "async", "await", "import", "export"],
  javascript: ["const", "let", "function", "return", "if", "else", "for", "while", "class", "async", "await", "import", "export"],
  python: ["def", "return", "if", "elif", "else", "for", "while", "class", "import", "from", "lambda", "with", "try", "except"],
  java: ["class", "public", "private", "static", "void", "return", "if", "else", "for", "while", "new", "import"],
  go: ["func", "return", "if", "else", "for", "range", "package", "import", "type", "struct", "defer", "go"],
  rust: ["fn", "let", "mut", "return", "if", "else", "for", "while", "match", "struct", "impl", "use"],
  cpp: ["int", "void", "return", "if", "else", "for", "while", "class", "struct", "template", "include"],
  csharp: ["class", "public", "private", "static", "void", "return", "if", "else", "for", "while", "using", "var"],
  sql: ["SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "GROUP BY", "ORDER BY", "INSERT", "UPDATE", "DELETE", "LIMIT"],
  kotlin: ["class", "fun", "val", "var", "return", "if", "else", "for", "while", "when", "import"],
};

const snippets: Record<string, Completion[]> = {
  typescript: [
    snippetCompletion("function ${name}(${args}) {\n\t${}\n}", { label: "function", detail: "snippet", type: "snippet" }),
    snippetCompletion("const ${name} = async (${args}) => {\n\t${}\n}", { label: "async arrow", detail: "snippet", type: "snippet" }),
  ],
  javascript: [
    snippetCompletion("function ${name}(${args}) {\n\t${}\n}", { label: "function", detail: "snippet", type: "snippet" }),
    snippetCompletion("const ${name} = async (${args}) => {\n\t${}\n}", { label: "async arrow", detail: "snippet", type: "snippet" }),
  ],
  python: [snippetCompletion("def ${name}(${args}):\n\t${}", { label: "def", detail: "snippet", type: "snippet" })],
  go: [snippetCompletion("func ${name}(${args}) {\n\t${}\n}", { label: "func", detail: "snippet", type: "snippet" })],
  rust: [snippetCompletion("fn ${name}(${args}) {\n\t${}\n}", { label: "fn", detail: "snippet", type: "snippet" })],
};

function sourceFor(language: string) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[A-Za-z_$][\w$]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const options: Completion[] = [
      ...(keywords[language] ?? keywords.typescript).map((label) => ({ label, type: "keyword" })),
      ...(snippets[language] ?? []),
    ];
    return { from: word.from, options, validFor: /^[\w$]*$/ };
  };
}

export function intercodeAutocomplete(language: string): Extension {
  return autocompletion({
    override: [sourceFor(language)],
    activateOnTyping: true,
    maxRenderedOptions: 80,
  });
}
