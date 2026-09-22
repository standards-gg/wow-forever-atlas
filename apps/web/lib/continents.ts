import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ContinentTileEntry {
  slug: string;
  name: string;
  width: number;
  height: number;
}

interface ContinentManifest {
  generatedAt: string;
  continents: ContinentTileEntry[];
}

let cached: ContinentManifest | null = null;

/**
 * Reads importers/wow-client's whole-continent output manifest (see
 * extract-continents.ts) — one seamless, real in-game minimap composite
 * per continent, the base layer under the higher-detail per-zone tiles.
 */
async function loadContinentManifest(): Promise<ContinentManifest | null> {
  if (cached) return cached;
  try {
    const path = join(process.cwd(), "public", "data", "continents", "manifest.json");
    cached = JSON.parse(await readFile(path, "utf-8")) as ContinentManifest;
    return cached;
  } catch {
    return null;
  }
}

export async function loadContinentTileEntries(): Promise<ContinentTileEntry[]> {
  const manifest = await loadContinentManifest();
  return manifest?.continents ?? [];
}
