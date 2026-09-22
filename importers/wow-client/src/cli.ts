#!/usr/bin/env node
/**
 * Extracts real in-game minimap tiles directly from a local WoW: Forever
 * install (no wow.export GUI involved — see importers/wow-client/README.md)
 * and writes one stitched PNG per zone, sized/cropped to that zone's own
 * real ADT tile range, for the web app to render as the actual zone map.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalCasc } from "./casc/local-casc.js";
import { parseWdtMaid, tileIndex } from "./wdt.js";
import { decodeBlp, type DecodedImage } from "./blp.js";
import { encodePng } from "./png.js";

const INSTALL_DIR = process.env.WOW_INSTALL_DIR ?? "C:\\Program Files (x86)\\World of Warcraft";
const PRODUCT = "wow_classic_beta";

// Confirmed real (docs/RECOMMENDED_DATA_SOURCES.md / wago.tools Map.csv, Map.ID=0 row).
const EASTERN_KINGDOMS_WDT_FILEDATAID = 775971;
const TILE_PIXELS = 512;

// Real ADT tile ranges, computed from the same confirmed real UiMapAssignment
// world bounds already used elsewhere in this project (packages/shared's
// worldToAdtTile) — see importers/wago/test/zones.test.ts for the source bounds.
const ZONES = [
  { slug: "burning-steppes", name: "Burning Steppes", minCol: 32, maxCol: 37, minRow: 45, maxRow: 48 },
  { slug: "searing-gorge", name: "Searing Gorge", minCol: 32, maxCol: 36, minRow: 43, maxRow: 46 },
];

const outputDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web", "public", "data", "tiles");

async function main() {
  console.error(`Opening local CASC storage at ${INSTALL_DIR} (${PRODUCT})...`);
  const casc = await LocalCasc.open(INSTALL_DIR, PRODUCT);

  console.error("Fetching Eastern Kingdoms WDT and parsing MAID chunk...");
  const wdt = casc.getFileByFileDataId(EASTERN_KINGDOMS_WDT_FILEDATAID);
  const { minimapFileDataIdByTile } = parseWdtMaid(wdt);

  const tileCache = new Map<number, DecodedImage | null>();
  const getTile = (col: number, row: number): DecodedImage | null => {
    const idx = tileIndex(col, row);
    if (tileCache.has(idx)) return tileCache.get(idx)!;
    const minimapId = minimapFileDataIdByTile.get(idx);
    let decoded: DecodedImage | null = null;
    if (minimapId) {
      try {
        decoded = decodeBlp(casc.getFileByFileDataId(minimapId));
      } catch (err) {
        console.error(`  tile (col=${col}, row=${row}) failed: ${(err as Error).message}`);
      }
    }
    tileCache.set(idx, decoded);
    return decoded;
  };

  mkdirSync(outputDir, { recursive: true });

  for (const zone of ZONES) {
    const cols = zone.maxCol - zone.minCol + 1;
    const rows = zone.maxRow - zone.minRow + 1;
    const width = cols * TILE_PIXELS;
    const height = rows * TILE_PIXELS;
    const composite = Buffer.alloc(width * height * 4);

    let extracted = 0;
    for (let row = zone.minRow; row <= zone.maxRow; row++) {
      for (let col = zone.minCol; col <= zone.maxCol; col++) {
        const tile = getTile(col, row);
        if (!tile) continue;
        blitTile(composite, width, tile, (col - zone.minCol) * TILE_PIXELS, (row - zone.minRow) * TILE_PIXELS);
        extracted++;
      }
    }

    console.error(`${zone.name}: ${extracted}/${cols * rows} tiles extracted (${width}x${height})`);

    const png = encodePng(width, height, composite);
    const pngPath = join(outputDir, `${zone.slug}.png`);
    writeFileSync(pngPath, png);
    console.error(`  wrote ${pngPath} (${png.byteLength} bytes)`);
  }

  writeFileSync(
    join(outputDir, "manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tilePixels: TILE_PIXELS,
        zones: ZONES.map((z) => ({
          slug: z.slug,
          name: z.name,
          width: (z.maxCol - z.minCol + 1) * TILE_PIXELS,
          height: (z.maxRow - z.minRow + 1) * TILE_PIXELS,
        })),
      },
      null,
      2
    )
  );
}

function blitTile(composite: Buffer, compositeWidth: number, tile: DecodedImage, destX: number, destY: number): void {
  for (let y = 0; y < tile.height; y++) {
    const srcStart = y * tile.width * 4;
    const destRowStart = ((destY + y) * compositeWidth + destX) * 4;
    tile.rgba.copy(composite, destRowStart, srcStart, srcStart + tile.width * 4);
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
