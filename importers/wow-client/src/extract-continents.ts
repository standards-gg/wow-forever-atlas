#!/usr/bin/env node
/**
 * Extracts one seamless, whole-continent real-terrain composite per
 * continent directly from a local WoW: Forever install — the base layer
 * the map needs to look like one continuous landmass (matching how every
 * fan world map, hyjal.cc included, is built: a stitched continent image
 * underneath, with per-zone detail layered on top when you zoom in).
 * Per-zone crops (src/cli.ts) still provide the higher-detail zoomed-in
 * layer.
 *
 * Renders the real ground-texture layers (adt-tex.ts/adt-terrain.ts) —
 * the same blended grass/dirt/rock look the game itself draws — rather
 * than the WDT's minimap tile, a small abstracted icon meant only for the
 * in-game minimap UI, not a cartographic image.
 *
 * The tile grid per continent is a fixed 64x64 (see wdt.ts), but only the
 * tiles that actually have terrain get a tex0 ADT — this crops to the
 * real populated bounding box instead of extracting 64x64 mostly-empty
 * tiles.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalCasc } from "./casc/local-casc.js";
import { parseWdtMaid } from "./wdt.js";
import { parseAdtTex } from "./adt-tex.js";
import { renderAdtTile } from "./adt-terrain.js";
import { decodeBlp, type DecodedImage } from "./blp.js";
import { encodePng } from "./png.js";
import { blitTile, boxDownsample, downscaleFactor, slugify } from "./extract-shared.js";

const INSTALL_DIR = process.env.WOW_INSTALL_DIR ?? "C:\\Program Files (x86)\\World of Warcraft";
const PRODUCT = "wow_classic_beta";
const CHUNK_PIXELS = 32; // 16 chunks/side * 32px = 512px native per ADT tile — continents cover far more tiles than a single zone, so a lower per-tile resolution keeps this tractable
const TILE_PIXELS = 16 * CHUNK_PIXELS;
const GRID_SIZE = 64;
// A continent's populated tile range can be 40+ tiles on a side — this is
// the low-detail base layer the whole map fits into at once, so it can be
// downsampled harder than a single zone crop.
const MAX_DIMENSION = 6144;

interface ContinentGeography {
  mapId: number;
  name: string;
  wdtFileDataId: number;
}

interface WorldGeography {
  continents: ContinentGeography[];
}

const here = dirname(fileURLToPath(import.meta.url));
const worldJsonPath = join(here, "..", "..", "..", "apps", "web", "public", "data", "world.json");
const outputDir = join(here, "..", "..", "..", "apps", "web", "public", "data", "continents");

async function main() {
  const world = JSON.parse(readFileSync(worldJsonPath, "utf-8")) as WorldGeography;

  console.error(`Opening local CASC storage at ${INSTALL_DIR} (${PRODUCT})...`);
  const casc = await LocalCasc.open(INSTALL_DIR, PRODUCT);

  mkdirSync(outputDir, { recursive: true });
  const manifest: { slug: string; name: string; width: number; height: number; tileMinCol: number; tileMinRow: number; tileMaxCol: number; tileMaxRow: number }[] = [];

  for (const continent of world.continents) {
    console.error(`\n${continent.name}: fetching WDT (FileDataID ${continent.wdtFileDataId}) and parsing MAID chunk...`);
    const wdt = casc.getFileByFileDataId(continent.wdtFileDataId);
    const { tex0AdtFileDataIdByTile } = parseWdtMaid(wdt);

    let minCol = GRID_SIZE, maxCol = -1, minRow = GRID_SIZE, maxRow = -1;
    for (const idx of tex0AdtFileDataIdByTile.keys()) {
      const col = idx % GRID_SIZE;
      const row = Math.floor(idx / GRID_SIZE);
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
    }
    if (maxCol < 0) {
      console.error(`  no populated tiles found, skipping`);
      continue;
    }

    const cols = maxCol - minCol + 1;
    const rows = maxRow - minRow + 1;
    const width = cols * TILE_PIXELS;
    const height = rows * TILE_PIXELS;
    console.error(`  populated range: col ${minCol}-${maxCol}, row ${minRow}-${maxRow} (native ${width}x${height})`);
    const composite = Buffer.alloc(width * height * 4);

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

    let extracted = 0;
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const idx = row * GRID_SIZE + col;
        const tex0Id = tex0AdtFileDataIdByTile.get(idx);
        if (!tex0Id) continue;
        try {
          const tex = parseAdtTex(casc.getFileByFileDataId(tex0Id));
          const textureImages = new Map<number, DecodedImage>();
          for (const fdid of tex.textureFileDataIds) {
            const img = getTexture(fdid);
            if (img) textureImages.set(fdid, img);
          }
          const rendered = renderAdtTile(tex, textureImages, CHUNK_PIXELS);
          blitTile(composite, width, rendered, (col - minCol) * TILE_PIXELS, (row - minRow) * TILE_PIXELS);
          extracted++;
        } catch (err) {
          console.error(`  tile (col=${col}, row=${row}) failed: ${(err as Error).message}`);
        }
      }
    }
    console.error(`  ${extracted}/${cols * rows} tiles extracted`);

    const factor = downscaleFactor(width, height, MAX_DIMENSION);
    const { data: finalData, width: finalWidth, height: finalHeight } =
      factor > 1 ? boxDownsample(composite, width, height, factor) : { data: composite, width, height };
    console.error(`  downsampled by ${factor}x to ${finalWidth}x${finalHeight}`);

    const slug = slugify(continent.name);
    const png = encodePng(finalWidth, finalHeight, finalData);
    writeFileSync(join(outputDir, `${slug}.png`), png);
    console.error(`  wrote ${slug}.png (${png.byteLength} bytes)`);

    manifest.push({
      slug,
      name: continent.name,
      width: finalWidth,
      height: finalHeight,
      tileMinCol: minCol,
      tileMinRow: minRow,
      tileMaxCol: maxCol,
      tileMaxRow: maxRow,
    });
  }

  writeFileSync(join(outputDir, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), continents: manifest }, null, 2));
  console.error(`\nWrote ${manifest.length}/${world.continents.length} continent composites to ${outputDir}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
