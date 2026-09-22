/**
 * A minimal, from-scratch AST for the subset of Lua AllTheThings' data
 * files actually use: nested constructor-call expressions building up a
 * tree (root(...), m(...), q(...), objective(...), i(...), etc.) and table
 * literals with positional and ["key"]/bare-key entries. This is an
 * original implementation of a well-known, generic grammar subset — it
 * does not borrow code or structure from any GPL-licensed project (e.g.
 * `forever-quest-markers`' `att_dsl`), only the *publicly observable
 * behavior* of ATT's own file format, which this project's Phase 1
 * research already documented independently. See docs/INGESTION_ARCHITECTURE.md.
 *
 * Deliberately NOT a general-purpose Lua interpreter: no local/if/for
 * statements, no operators beyond unary minus, no function *definitions*.
 * ATT's own data files don't use any of that (confirmed by direct
 * inspection of real fetched fixtures) — supporting it would be scope
 * creep for a data importer.
 */

export type LuaValue = number | string | boolean | null | LuaTable | LuaCall | LuaIdentifier;

export interface LuaTable {
  kind: "table";
  /** Positional (array-part) entries, in source order. */
  array: LuaValue[];
  /** Keyed entries — both `["key"] = value` and bare `key = value` forms. */
  fields: Record<string, LuaValue>;
  /**
   * This table's own inline name, e.g. "Arcanite" from `q(7630, {\t--
   * Arcanite`. Populated from the `{` token's trailing comment.
   */
  name?: string;
  /** Trailing comment for a scalar array entry, by index, if any (e.g. NPC/creature-ID lists). */
  arrayComments?: Record<number, string>;
  /** Trailing comment for a scalar keyed entry, by key, if any (e.g. `["qg"] = 14437, -- Name`). */
  fieldComments?: Record<string, string>;
}

export interface LuaCall {
  kind: "call";
  /** e.g. "q", "m", "maproot", "objective", "i", "ach", "root", "fp", "n" */
  name: string;
  args: LuaValue[];
}

/** An unresolved bare identifier or dotted path, e.g. "MAP.BURNING_STEPPES", "WARLOCK". */
export interface LuaIdentifier {
  kind: "identifier";
  name: string;
}

export function isLuaTable(v: LuaValue | undefined): v is LuaTable {
  return typeof v === "object" && v !== null && "kind" in v && v.kind === "table";
}

export function isLuaCall(v: LuaValue | undefined): v is LuaCall {
  return typeof v === "object" && v !== null && "kind" in v && v.kind === "call";
}

export function isLuaIdentifier(v: LuaValue | undefined): v is LuaIdentifier {
  return typeof v === "object" && v !== null && "kind" in v && v.kind === "identifier";
}
