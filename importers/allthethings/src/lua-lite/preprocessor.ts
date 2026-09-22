/**
 * Strips `-- #if <expr>` / `-- #elseif <expr>` / `-- #else` / `-- #endif`
 * guarded blocks, per the mechanism docs/RECOMMENDED_DATA_SOURCES.md and
 * Phase 1's ATT deep-dive confirmed ATT's own Parser tool uses (preprocessor
 * tags like FOREVER/CAMELOT gating version-specific blocks). Confirmed real
 * fixtures fetched in Phase 2 (Burning Steppes.lua, Searing Gorge.lua) don't
 * happen to use this directive at all, so this module is validated against
 * synthetic test cases rather than a real fixture — it exists because other
 * files in ATT's tree are confirmed to use it, and a real importer needs to
 * handle that, not just the two files this project happened to fetch first.
 *
 * Inactive lines are blanked (replaced with an empty line), not deleted, so
 * line numbers stay accurate for error messages — same approach Phase 1
 * documented ATT's own Parser using.
 */

export interface PreprocessorContext {
  activeTags: Set<string>;
}

export const DEFAULT_FOREVER_TAGS: PreprocessorContext = {
  activeTags: new Set([
    "ANYCLASSIC",
    "FOREVER",
    "CAMELOT",
    "CLASSIC",
    "CRIEVE",
    "EXPLORATION",
    "IGNORE_ERRORS",
    "OBJECTIVES",
    "NOSIMPLIFY",
  ]),
};

const DIRECTIVE_RE = /^\s*--\s*#(if|elseif|else|endif)\b(.*)$/i;

function evaluateCondition(expr: string, ctx: PreprocessorContext): boolean {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return true;
  // Support "A AND B", "A OR B", "NOT A" (case-insensitive), single-tag terms only —
  // this is the subset actually documented in Phase 1's findings.
  const orParts = trimmed.split(/\s+OR\s+/i);
  return orParts.some((orPart) =>
    orPart
      .split(/\s+AND\s+/i)
      .every((term) => {
        const t = term.trim();
        const negated = /^NOT\s+/i.test(t);
        const tag = t.replace(/^NOT\s+/i, "").trim();
        const has = ctx.activeTags.has(tag);
        return negated ? !has : has;
      })
  );
}

export function preprocess(source: string, ctx: PreprocessorContext = DEFAULT_FOREVER_TAGS): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  // Stack of {active: boolean, everTaken: boolean} per nested #if.
  const stack: { active: boolean; everTaken: boolean }[] = [];

  const currentlyActive = () => stack.every((frame) => frame.active);

  for (const line of lines) {
    const match = DIRECTIVE_RE.exec(line);
    if (!match) {
      out.push(currentlyActive() ? line : "");
      continue;
    }
    const [, directive, rest] = match;
    const d = directive.toLowerCase();
    if (d === "if") {
      const taken = currentlyActive() && evaluateCondition(rest, ctx);
      stack.push({ active: taken, everTaken: taken });
    } else if (d === "elseif") {
      if (stack.length === 0) throw new Error("Preprocessor: #elseif without matching #if");
      const frame = stack[stack.length - 1];
      const parentActive = stack.slice(0, -1).every((f) => f.active);
      const taken = parentActive && !frame.everTaken && evaluateCondition(rest, ctx);
      frame.active = taken;
      frame.everTaken = frame.everTaken || taken;
    } else if (d === "else") {
      if (stack.length === 0) throw new Error("Preprocessor: #else without matching #if");
      const frame = stack[stack.length - 1];
      const parentActive = stack.slice(0, -1).every((f) => f.active);
      const taken = parentActive && !frame.everTaken;
      frame.active = taken;
      frame.everTaken = frame.everTaken || taken;
    } else if (d === "endif") {
      if (stack.length === 0) throw new Error("Preprocessor: #endif without matching #if");
      stack.pop();
    }
    out.push(""); // directive lines themselves are always blanked
  }
  if (stack.length > 0) throw new Error("Preprocessor: unterminated #if block");
  return out.join("\n");
}
