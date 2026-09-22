/**
 * Minimal CSV parser for wago.tools' DB2 exports. Handles quoted fields
 * (which may contain commas, e.g. `AreaName_lang` values like "Dun Morogh")
 * but deliberately doesn't handle embedded newlines-in-quotes or escaped
 * quotes — not needed for any DB2 table this importer reads (verified
 * against real fetched data), and not worth the extra complexity for a
 * data importer over pulling in a full CSV library.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  cells.push(current);
  return cells;
}
