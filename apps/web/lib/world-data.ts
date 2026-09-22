import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorldGeography } from "./world-data-core";

export * from "./world-data-core";

let cached: WorldGeography | null = null;

/**
 * Reads importers/wago's output — real Blizzard zone/continent boundary
 * data (bounding boxes derived from DB2's AreaTable + UiMapAssignment, per
 * docs/RECOMMENDED_DATA_SOURCES.md), not artwork. Regenerate with
 * `npm run import:world --workspace=@atlas/importer-wago`.
 *
 * Server-only (uses node:fs) — import from "./world-data-core" instead in
 * any client component that only needs the pure geometry functions/types.
 */
export async function loadWorldGeography(): Promise<WorldGeography> {
  if (cached) return cached;
  const path = join(process.cwd(), "public", "data", "world.json");
  const raw = await readFile(path, "utf-8");
  cached = JSON.parse(raw) as WorldGeography;
  return cached;
}
