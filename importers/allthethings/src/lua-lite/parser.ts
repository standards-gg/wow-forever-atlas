import { tokenize, type Token } from "./tokenizer.js";
import type { LuaCall, LuaTable, LuaValue } from "./types.js";

/**
 * Recursive-descent parser for the constructor-call-DSL subset of Lua that
 * AllTheThings' data files use. Original implementation of a generic,
 * long-documented grammar shape — see the note in ./types.ts about why this
 * isn't derived from any GPL-licensed parser.
 */
export class LuaLiteParser {
  private tokens: Token[];
  private pos = 0;

  constructor(source: string) {
    this.tokens = tokenize(source);
  }

  /** Parses every top-level statement (expected to be function calls, e.g. `root(...)`). */
  parseProgram(): LuaValue[] {
    const statements: LuaValue[] = [];
    while (this.peek().type !== "EOF") {
      statements.push(this.parseExpression());
      // Confirmed real fixtures end the top-level call with a trailing `;`.
      while (this.peek().type === "COMMA" || this.peek().type === "SEMICOLON") this.advance();
    }
    return statements;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: Token["type"]): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new Error(`Parse error at line ${t.line}: expected ${type}, got ${t.type} ("${t.value}")`);
    }
    return this.advance();
  }

  private parseExpression(): LuaValue {
    const t = this.peek();
    switch (t.type) {
      case "NUMBER":
        this.advance();
        return Number.parseFloat(t.value);
      case "MINUS": {
        this.advance();
        const num = this.expect("NUMBER");
        return -Number.parseFloat(num.value);
      }
      case "STRING":
        this.advance();
        return t.value;
      case "TRUE":
        this.advance();
        return true;
      case "FALSE":
        this.advance();
        return false;
      case "NIL":
        this.advance();
        return null;
      case "LBRACE":
        return this.parseTable();
      case "IDENT":
        return this.parseIdentifierOrCall();
      default:
        throw new Error(`Parse error at line ${t.line}: unexpected token ${t.type} ("${t.value}")`);
    }
  }

  private parseIdentifierOrCall(): LuaValue {
    let name = this.expect("IDENT").value;
    while (this.peek().type === "DOT") {
      this.advance();
      name += "." + this.expect("IDENT").value;
    }
    if (this.peek().type === "LPAREN") {
      this.advance();
      const args: LuaValue[] = [];
      while (this.peek().type !== "RPAREN") {
        args.push(this.parseExpression());
        if (this.peek().type === "COMMA") {
          this.advance();
        } else {
          break;
        }
      }
      this.expect("RPAREN");
      const call: LuaCall = { kind: "call", name, args };
      return call;
    }
    return { kind: "identifier", name };
  }

  private parseTable(): LuaTable {
    const lbrace = this.expect("LBRACE");
    const table: LuaTable = { kind: "table", array: [], fields: {} };
    if (lbrace.trailingComment) table.name = lbrace.trailingComment;

    while (this.peek().type !== "RBRACE") {
      let pendingField: string | undefined;
      let pendingArrayIndex: number | undefined;

      if (this.peek().type === "LBRACKET") {
        this.advance();
        const keyToken = this.peek();
        let key: string;
        if (keyToken.type === "STRING") {
          key = this.advance().value;
        } else if (keyToken.type === "NUMBER") {
          key = this.advance().value;
        } else {
          throw new Error(`Parse error at line ${keyToken.line}: expected string/number table key`);
        }
        this.expect("RBRACKET");
        this.expect("EQUALS");
        table.fields[key] = this.parseExpression();
        pendingField = key;
      } else if (this.peek().type === "IDENT" && this.peek(1).type === "EQUALS") {
        const key = this.advance().value;
        this.expect("EQUALS");
        table.fields[key] = this.parseExpression();
        pendingField = key;
      } else {
        pendingArrayIndex = table.array.length;
        table.array.push(this.parseExpression());
      }

      // A trailing `-- comment` after this entry attaches to whichever
      // token ends up last: the separating comma if one follows (the
      // common real-world case, e.g. `14437,\t-- Gorzeeki Wildeyes`), or
      // the value's own last token if this was the table's final entry.
      if (this.peek().type === "COMMA") {
        this.advance();
      }
      const comment = this.tokens[this.pos - 1]?.trailingComment;
      if (comment) {
        if (pendingField !== undefined) (table.fieldComments ??= {})[pendingField] = comment;
        else if (pendingArrayIndex !== undefined) (table.arrayComments ??= {})[pendingArrayIndex] = comment;
      }
      if (this.tokens[this.pos - 1]?.type !== "COMMA") break;
    }
    this.expect("RBRACE");
    return table;
  }
}

export function parseLuaLite(source: string): LuaValue[] {
  return new LuaLiteParser(source).parseProgram();
}
