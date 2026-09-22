import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLuaLite } from "../src/lua-lite/parser.js";
import { preprocess } from "../src/lua-lite/preprocessor.js";
import { isLuaCall, isLuaTable, type LuaCall } from "../src/lua-lite/types.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

describe("preprocess", () => {
  it("keeps a block whose tag is active", () => {
    const src = `-- #if FOREVER\nq(1, {})\n-- #endif\n`;
    const out = preprocess(src, { activeTags: new Set(["FOREVER"]) });
    expect(out).toContain("q(1, {})");
  });

  it("blanks a block whose tag is inactive", () => {
    const src = `-- #if SOME_OTHER_TAG\nq(1, {})\n-- #endif\nq(2, {})\n`;
    const out = preprocess(src, { activeTags: new Set(["FOREVER"]) });
    expect(out).not.toContain("q(1, {})");
    expect(out).toContain("q(2, {})");
  });

  it("handles #else", () => {
    const src = `-- #if SOME_OTHER_TAG\nq(1, {})\n-- #else\nq(2, {})\n-- #endif\n`;
    const out = preprocess(src, { activeTags: new Set(["FOREVER"]) });
    expect(out).not.toContain("q(1, {})");
    expect(out).toContain("q(2, {})");
  });

  it("throws on an unterminated #if block", () => {
    expect(() => preprocess("-- #if FOREVER\nq(1, {})\n")).toThrow();
  });
});

describe("parseLuaLite — synthetic constructs", () => {
  it("parses a simple call with a named table and inline comments", () => {
    const src = `q(7630, {\t-- Arcanite\n\t["qg"] = 14437,\t-- Gorzeeki Wildeyes\n\t["lvl"] = 60,\n})`;
    const [stmt] = parseLuaLite(src);
    expect(isLuaCall(stmt)).toBe(true);
    const call = stmt as LuaCall;
    expect(call.name).toBe("q");
    expect(call.args[0]).toBe(7630);
    const table = call.args[1];
    expect(isLuaTable(table)).toBe(true);
    if (!isLuaTable(table)) throw new Error("unreachable");
    expect(table.name).toBe("Arcanite");
    expect(table.fields["qg"]).toBe(14437);
    expect(table.fieldComments?.["qg"]).toBe("Gorzeeki Wildeyes");
    expect(table.fields["lvl"]).toBe(60);
  });

  it("parses nested tables, dotted identifiers, and array entries with comments", () => {
    const src = `q(1, {\n\t["coord"] = { 12.4, 31.6, MAP.BURNING_STEPPES },\n\t["crs"] = {\n\t\t7029,\t-- Blackrock Battlemaster\n\t},\n})`;
    const [stmt] = parseLuaLite(src) as [LuaCall];
    const table = stmt.args[1];
    if (!isLuaTable(table)) throw new Error("unreachable");
    const coord = table.fields["coord"];
    if (!isLuaTable(coord)) throw new Error("unreachable");
    expect(coord.array[0]).toBe(12.4);
    expect(coord.array[1]).toBe(31.6);
    expect(coord.array[2]).toEqual({ kind: "identifier", name: "MAP.BURNING_STEPPES" });
    const crs = table.fields["crs"];
    if (!isLuaTable(crs)) throw new Error("unreachable");
    expect(crs.array[0]).toBe(7029);
    expect(crs.arrayComments?.[0]).toBe("Blackrock Battlemaster");
  });

  it("parses multiple top-level statements", () => {
    const stmts = parseLuaLite(`q(1, {})\nq(2, {})\n`);
    expect(stmts).toHaveLength(2);
  });
});

describe("parseLuaLite — real fetched AllTheThings fixtures", () => {
  it("parses the real Burning Steppes.lua without error and finds the expected structure", () => {
    const src = readFileSync(fixturesDir + "burning-steppes.lua", "utf-8");
    const stmts = parseLuaLite(preprocess(src));
    expect(stmts).toHaveLength(1);
    const root = stmts[0] as LuaCall;
    expect(root.name).toBe("root");
  });

  it("parses the real Searing Gorge.lua without error", () => {
    const src = readFileSync(fixturesDir + "searing-gorge.lua", "utf-8");
    const stmts = parseLuaLite(preprocess(src));
    expect(stmts).toHaveLength(1);
  });
});
