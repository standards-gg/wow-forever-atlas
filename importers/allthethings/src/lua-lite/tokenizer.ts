export type TokenType =
  | "NUMBER"
  | "STRING"
  | "IDENT"
  | "LBRACE"
  | "RBRACE"
  | "LBRACKET"
  | "RBRACKET"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EQUALS"
  | "DOT"
  | "MINUS"
  | "SEMICOLON"
  | "TRUE"
  | "FALSE"
  | "NIL"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  /**
   * Text of a `-- comment` immediately following this token on the same
   * source line, if any. ATT's data format has no dedicated "display name"
   * field for quests/NPCs/flight paths — the only human-readable name is
   * an inline editor comment (confirmed by direct inspection of real
   * fetched fixtures, e.g. `q(7630, {\t-- Arcanite`). Capturing this at the
   * token level, rather than a separate regex pass over raw text, keeps
   * name extraction in sync with the same lexer that parses everything else.
   */
  trailingComment?: string;
}

const KEYWORDS: Record<string, TokenType> = {
  true: "TRUE",
  false: "FALSE",
  nil: "NIL",
};

/** Tokenizes ATT's Lua-subset source. Strips `--` line comments as it goes. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  const peek = (offset = 0) => source[i + offset];

  while (i < n) {
    const c = source[i];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "-" && peek(1) === "-") {
      // line comment: skip to end of line, attaching its text to the
      // previous token if that token is on the same source line.
      i += 2;
      const start = i;
      while (i < n && source[i] !== "\n") i++;
      const commentText = source.slice(start, i).trim();
      const last = tokens[tokens.length - 1];
      if (last && last.line === line && commentText.length > 0) {
        last.trailingComment = commentText;
      }
      continue;
    }
    if (c === "{") {
      tokens.push({ type: "LBRACE", value: "{", line });
      i++;
      continue;
    }
    if (c === "}") {
      tokens.push({ type: "RBRACE", value: "}", line });
      i++;
      continue;
    }
    if (c === "[") {
      tokens.push({ type: "LBRACKET", value: "[", line });
      i++;
      continue;
    }
    if (c === "]") {
      tokens.push({ type: "RBRACKET", value: "]", line });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "LPAREN", value: "(", line });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN", value: ")", line });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "COMMA", value: ",", line });
      i++;
      continue;
    }
    if (c === "=") {
      tokens.push({ type: "EQUALS", value: "=", line });
      i++;
      continue;
    }
    if (c === ".") {
      tokens.push({ type: "DOT", value: ".", line });
      i++;
      continue;
    }
    if (c === "-") {
      tokens.push({ type: "MINUS", value: "-", line });
      i++;
      continue;
    }
    if (c === ";") {
      tokens.push({ type: "SEMICOLON", value: ";", line });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const startLine = line;
      let value = "";
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < n) {
          const escaped = source[i + 1];
          const map: Record<string, string> = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'" };
          value += map[escaped] ?? escaped;
          i += 2;
          continue;
        }
        if (source[i] === "\n") line++;
        value += source[i];
        i++;
      }
      if (i >= n) throw new Error(`Unterminated string literal starting at line ${startLine}`);
      i++; // closing quote
      tokens.push({ type: "STRING", value, line: startLine });
      continue;
    }
    if (/[0-9]/.test(c)) {
      let value = "";
      while (i < n && /[0-9.]/.test(source[i])) {
        value += source[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value, line });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let value = "";
      while (i < n && /[A-Za-z0-9_]/.test(source[i])) {
        value += source[i];
        i++;
      }
      const keyword = KEYWORDS[value];
      tokens.push({ type: keyword ?? "IDENT", value, line });
      continue;
    }
    throw new Error(`Unexpected character '${c}' at line ${line}`);
  }

  tokens.push({ type: "EOF", value: "", line });
  return tokens;
}
