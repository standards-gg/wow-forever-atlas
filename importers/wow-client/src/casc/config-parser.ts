/**
 * Parsers for CASC's two small plain-text config formats. Both are
 * confirmed real (read directly from this project's own local install
 * during Phase 2 research) and simple enough to be original,
 * from-scratch implementations rather than ports of wow.export's code.
 */

/** Parses `.build.info` (pipe-delimited, typed headers like `Product!STRING:0`). */
export function parseBuildInfo(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const headerLine = lines.shift();
  if (!headerLine) return [];
  const fields = headerLine.split("|").map((h) => h.split("!")[0].replace(/\s+/g, ""));
  return lines
    .filter((line) => line.trim().length > 0 && !line.startsWith("#"))
    .map((line) => {
      const cells = line.split("|");
      const row: Record<string, string> = {};
      fields.forEach((field, i) => (row[field] = cells[i] ?? ""));
      return row;
    });
}

const KEY_VALUE_RE = /([^\s]+)\s?=\s?(.*)/;

function normalizeConfigKey(key: string): string {
  const parts = key.split("-");
  if (parts.length === 1) return key;
  for (let i = 1; i < parts.length; i++) {
    parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].slice(1);
  }
  return parts.join("");
}

/** Parses BuildConfig/CDNConfig files (`# comment` header, then `key = value` lines). */
export function parseKeyValueConfig(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/);
  const entries: Record<string, string> = {};
  for (const line of lines) {
    if (line.trim().length === 0 || line.startsWith("#")) continue;
    const match = KEY_VALUE_RE.exec(line);
    if (!match) continue;
    entries[normalizeConfigKey(match[1])] = match[2];
  }
  return entries;
}
