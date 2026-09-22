import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AtlasDataset } from "./atlas-data-core";

export * from "./atlas-data-core";

let cached: AtlasDataset | null = null;

/**
 * Reads the AllTheThings importer's output. There is no live database in
 * this dev environment (see docs/INGESTION_ARCHITECTURE.md) — a real
 * deployment would query Postgres here instead; everything downstream of
 * this function (the discovery panel, the map) is written against the
 * same @atlas/shared canonical types either way, so swapping this for a
 * DB-backed loader later doesn't touch the rest of the app.
 *
 * Server-only (uses node:fs) — import from "./atlas-data-core" instead in
 * any client component that only needs the pure query functions/types.
 */
export async function loadAtlasDataset(): Promise<AtlasDataset> {
  if (cached) return cached;
  const path = join(process.cwd(), "public", "data", "burning-steppes.json");
  const raw = await readFile(path, "utf-8");
  cached = JSON.parse(raw) as AtlasDataset;
  return cached;
}
