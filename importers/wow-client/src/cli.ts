#!/usr/bin/env node
/**
 * Extracts real in-game ground-texture terrain directly from a local
 * WoW: Forever install (no wow.export GUI involved — see
 * importers/wow-client/README.md) and writes one stitched PNG per zone,
 * sized/cropped to that zone's own real ADT tile range, for the web app
 * to render as the actual zone map.
 *
 * Renders the real ground-texture layers (adt-tex.ts/adt-terrain.ts) —
 * the same blended grass/dirt/rock look the game itself draws — rather
 * than the WDT's minimap tile, a small abstracted icon meant only for the
 * in-game minimap UI, not a cartographic image.
 *
 * Zone list and tile ranges are derived from apps/web/public/data/world.json
 * (real Blizzard AreaTable/UiMapAssignment/Map bounds, fetched by
 * importers/wago) — not a curated/partial list — so this covers every zone
 * on both continents, not just a hand-picked slice.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { worldToAdtTile } from "@atlas/shared";
import { LocalCasc } from "./casc/local-casc.js";
import { parseWdtMaid, tileIndex } from "./wdt.js";
import { parseAdtTex } from "./adt-tex.js";
import { renderAdtTile } from "./adt-terrain.js";
import { decodeBlp, type DecodedImage } from "./blp.js";
import { encodePng } from "./png.js";
import { blitTile, boxDownsample, downscaleFactor, slugify } from "./extract-shared.js";

const INSTALL_DIR = process.env.WOW_INSTALL_DIR ?? "C:\\Program Files (x86)\\World of Warcraft";
const PRODUCT = "wow_classic_beta";
const CHUNK_PIXELS = 64; // 16 chunks/side * 64px = 1024px native per ADT tile
const TILE_PIXELS = 16 * CHUNK_PIXELS;
// A stitched composite at native tile resolution can run to 20000+px on a
// side for large zones (e.g. The Barrens) — far more detail than a single
// browser-rendered map overlay needs, and expensive to store/decode. Cap the
// longest side and box-downsample (by a power-of-two factor, since TILE_PIXELS
// divides evenly) rather than serving raw native resolution for every zone.
const MAX_DIMENSION = 4096;

interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ContinentGeography {
  mapId: number;
  name: string;
  wdtFileDataId: number;
}

interface ZoneGeography {
  name: string;
  continentMapId: number;
  worldBounds: WorldBounds;
}

interface WorldGeography {
  continents: ContinentGeography[];
  zones: ZoneGeography[];
}

/** The zone's ADT tile range, from its real world-space bounds — same math used everywhere else in this project. */
function zoneTileRange(bounds: WorldBounds): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
  const corners = [
    [bounds.minX, bounds.minY],
    [bounds.minX, bounds.maxY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
  ];
  const tiles = corners.map(([x, y]) => worldToAdtTile({ x, y }));
  const cols = tiles.map((t) => t.col);
  const rows = tiles.map((t) => t.row);
  return {
    minCol: Math.min(...cols),
    maxCol: Math.max(...cols),
    minRow: Math.min(...rows),
    maxRow: Math.max(...rows),
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const worldJsonPath = join(here, "..", "..", "..", "apps", "web", "public", "data", "world.json");
const outputDir = join(here, "..", "..", "..", "apps", "web", "public", "data", "tiles");

async function main() {
  const world = JSON.parse(readFileSync(worldJsonPath, "utf-8")) as WorldGeography;

  console.error(`Opening local CASC storage at ${INSTALL_DIR} (${PRODUCT})...`);
  const casc = await LocalCasc.open(INSTALL_DIR, PRODUCT);

  mkdirSync(outputDir, { recursive: true });
  const manifestZones: { slug: string; name: string; width: number; height: number }[] = [];

  for (const continent of world.continents) {
    const zones = world.zones.filter((z) => z.continentMapId === continent.mapId);
    if (zones.length === 0) continue;

    console.error(`\n${continent.name}: fetching WDT (FileDataID ${continent.wdtFileDataId}) and parsing MAID chunk...`);
    const wdt = casc.getFileByFileDataId(continent.wdtFileDataId);
    const { tex0AdtFileDataIdByTile } = parseWdtMaid(wdt);

    // Ground textures are heavily reused across tiles/zones (a handful of
    // grass/dirt/rock textures cover a whole continent) — caching decoded
    // BLPs at continent scope avoids re-decoding the same texture hundreds
    // of times.
    const textureCache = new Map<number, DecodedImage | undefined>();
    const getTexture = (fileDataId: number): DecodedImage | undefined => {
      if (textureCache.has(fileDataId)) return textureCache.get(fileDataId);
      let image: DecodedImage | undefined;
      try {
        image = decodeBlp(casc.getFileByFileDataId(fileDataId));
      } catch (err) {
        console.error(`  ground texture ${fileDataId} failed: ${(err as Error).message}`);
      }
      textureCache.set(fileDataId, image);
      return image;
    };

    const renderedTileCache = new Map<number, DecodedImage | null>();
    const getRenderedTile = (col: number, row: number): DecodedImage | null => {
      const idx = tileIndex(col, row);
      if (renderedTileCache.has(idx)) return renderedTileCache.get(idx)!;
      const tex0Id = tex0AdtFileDataIdByTile.get(idx);
      let rendered: DecodedImage | null = null;
      if (tex0Id) {
        try {
          const tex = parseAdtTex(casc.getFileByFileDataId(tex0Id));
          const textureImages = new Map<number, DecodedImage>();
          for (const fdid of tex.textureFileDataIds) {
            const img = getTexture(fdid);
            if (img) textureImages.set(fdid, img);
          }
          rendered = renderAdtTile(tex, textureImages, CHUNK_PIXELS);
        } catch (err) {
          console.error(`  tile (col=${col}, row=${row}) failed: ${(err as Error).message}`);
        }
      }
      renderedTileCache.set(idx, rendered);
      return rendered;
    };

    for (const zone of zones) {
      const slug = slugify(zone.name);
      const range = zoneTileRange(zone.worldBounds);
      const cols = range.maxCol - range.minCol + 1;
      const rows = range.maxRow - range.minRow + 1;
      const width = cols * TILE_PIXELS;
      const height = rows * TILE_PIXELS;
      const composite = Buffer.alloc(width * height * 4);

      let extracted = 0;
      for (let row = range.minRow; row <= range.maxRow; row++) {
        for (let col = range.minCol; col <= range.maxCol; col++) {
          const tile = getRenderedTile(col, row);
          if (!tile) continue;
          blitTile(composite, width, tile, (col - range.minCol) * TILE_PIXELS, (row - range.minRow) * TILE_PIXELS);
          extracted++;
        }
      }

      console.error(`  ${zone.name}: ${extracted}/${cols * rows} tiles extracted (${width}x${height})`);
      if (extracted === 0) continue;

      const factor = downscaleFactor(width, height, MAX_DIMENSION);
      const { data: finalData, width: finalWidth, height: finalHeight } =
        factor > 1 ? boxDownsample(composite, width, height, factor) : { data: composite, width, height };

      const png = encodePng(finalWidth, finalHeight, finalData);
      writeFileSync(join(outputDir, `${slug}.png`), png);
      manifestZones.push({ slug, name: zone.name, width: finalWidth, height: finalHeight });
    }
  }

  writeFileSync(
    join(outputDir, "manifest.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), tilePixels: TILE_PIXELS, zones: manifestZones }, null, 2)
  );
  console.error(`\nWrote ${manifestZones.length}/${world.zones.length} zone tiles to ${outputDir}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
