import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface TileManifestEntry {
  slug: string;
  name: string;
  width: number;
  height: number;
}

interface TileManifest {
  generatedAt: string;
  tilePixels: number;
  zones: TileManifestEntry[];
}

let cached: TileManifest | null = null;

/**
 * Reads importers/wow-client's output manifest — real in-game minimap
 * tiles extracted directly from a local client install (see
 * importers/wow-client/README.md), not present for most zones yet.
 */
async function loadTileManifest(): Promise<TileManifest | null> {
  if (cached) return cached;
  try {
    const path = join(process.cwd(), "public", "data", "tiles", "manifest.json");
    cached = JSON.parse(await readFile(path, "utf-8")) as TileManifest;
    return cached;
  } catch {
    return null;
  }
}

export async function loadTileManifestEntries(): Promise<TileManifestEntry[]> {
  const manifest = await loadTileManifest();
  return manifest?.zones ?? [];
}

export async function findRealTileImage(
  zoneSlug: string
): Promise<{ url: string; width: number; height: number } | undefined> {
  const manifest = await loadTileManifest();
  const entry = manifest?.zones.find((z) => z.slug === zoneSlug);
  if (!entry) return undefined;
  return { url: `/data/tiles/${entry.slug}.png`, width: entry.width, height: entry.height };
}
