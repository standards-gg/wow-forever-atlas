#!/usr/bin/env node
/**
 * Builds a standard Web Mercator XYZ raster tile pyramid (256x256 PNGs,
 * `{z}/{x}/{y}.png`) of real ground-texture terrain for a whole continent —
 * the same fundamental technique hyjal.cc/map itself uses, confirmed by
 * inspecting its own network requests (a PMTiles archive, which is just
 * this exact tile pyramid packed into one file — see
 * importers/wow-client/README.md for the follow-up `pmtiles-convert` step
 * that packs this directory into one).
 *
 * This supersedes both extract-continents.ts (one whole-continent image,
 * capped and downscaled for a single MapLibre `image` source) and cli.ts
 * (separate per-zone rectangular crops, which don't tile seamlessly since
 * real zones are irregular shapes and their rectangular bounds heavily
 * overlap — confirmed empirically, 121 overlapping pairs across 49 zones).
 * One continuous, real-coastline-shaped tile pyramid per continent serves
 * every zoom level; there is no zone-rectangle image in the rendering
 * layer at all any more.
 *
 * Three passes:
 *  1. Render every populated ADT tile once (same parseAdtTex/renderAdtTile
 *     pipeline as the other extractors) to a raw RGBA scratch file — raw,
 *     not PNG, so this doesn't need a PNG *decoder* we don't have, and
 *     avoids repeated encode/decode of the same pixels.
 *  2. Cut the deepest zoom level directly from those scratch buffers: for
 *     each output tile, find the (usually 1, up to 4 at ADT-tile-boundary-
 *     straddling edges) contributing ADT tiles via mercator.ts's exact
 *     coordinate chain, and resample each's overlapping region in.
 *  3. Build every shallower level by combining each 2x2 block of child
 *     tiles into one parent tile (standard mipmap-style pyramid, reusing
 *     the same 2x box-average as the other extractors' downscaling).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { LocalCasc } from "./casc/local-casc.js";
import { parseWdtMaid, tileIndex } from "./wdt.js";
import { parseAdtTex } from "./adt-tex.js";
import { renderAdtTile } from "./adt-terrain.js";
import { decodeBlp, type DecodedImage } from "./blp.js";
import { encodePng } from "./png.js";
import { slugify } from "./extract-shared.js";
import { adtTileLngLatRect, lngLatToTileFrac, tileToLngLat, type ContinentPlacement, type LngLatRect, type PopulatedTileRange } from "./mercator.js";
import type { AdtTile } from "@atlas/shared";

const INSTALL_DIR = process.env.WOW_INSTALL_DIR ?? "C:\\Program Files (x86)\\World of Warcraft";
const PRODUCT = "wow_classic_beta";
const CHUNK_PIXELS = 64; // 16 chunks/side * 64px = 1024px native per ADT tile — matches the best per-zone quality already shipped
const ADT_TILE_PIXELS = 16 * CHUNK_PIXELS;
const GRID_SIZE = 64;
const OUTPUT_TILE_SIZE = 256;
const MIN_Z = 7; // matches the map's own configured minZoom and typical whole-continent-fit view
const MAX_Z = 14; // ~native ground-texture resolution at this render quality — see docs/PROJECT_RECON.md math

const scratchRoot = process.env.WOW_TILE_SCRATCH ?? join(tmpdir(), "wow-atlas-tile-scratch");
const here = dirname(fileURLToPath(import.meta.url));
const worldJsonPath = join(here, "..", "..", "..", "apps", "web", "public", "data", "world.json");
const outputDir = join(here, "..", "..", "..", "apps", "web", "public", "data", "tile-pyramids");

interface ContinentGeography extends ContinentPlacement {
  name: string;
  wdtFileDataId: number;
}

interface WorldGeography {
  continents: ContinentGeography[];
}

function scratchPathFor(continentSlug: string, col: number, row: number): string {
  return join(scratchRoot, continentSlug, `${col}_${row}.rgba`);
}

function readScratchTile(path: string): Buffer | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path);
}

/** Nearest-neighbor blit of one rectangular region of `src` into a rectangular region of `dest`, clipped to both buffers. Both rects are in destination/source pixel space respectively and may be fractional. */
function blitResampled(
  dest: Buffer,
  destSize: number,
  destRect: { x: number; y: number; width: number; height: number },
  src: Buffer,
  srcSize: number,
  srcRect: { x: number; y: number; width: number; height: number }
): void {
  if (destRect.width <= 0 || destRect.height <= 0 || srcRect.width <= 0 || srcRect.height <= 0) return;
  const x0 = Math.max(0, Math.floor(destRect.x));
  const y0 = Math.max(0, Math.floor(destRect.y));
  const x1 = Math.min(destSize, Math.ceil(destRect.x + destRect.width));
  const y1 = Math.min(destSize, Math.ceil(destRect.y + destRect.height));
  for (let dy = y0; dy < y1; dy++) {
    const v = (dy + 0.5 - destRect.y) / destRect.height;
    const sy = Math.min(srcSize - 1, Math.max(0, Math.floor(srcRect.y + v * srcRect.height)));
    const srcRowStart = sy * srcSize * 4;
    const destRowStart = dy * destSize * 4;
    for (let dx = x0; dx < x1; dx++) {
      const u = (dx + 0.5 - destRect.x) / destRect.width;
      const sx = Math.min(srcSize - 1, Math.max(0, Math.floor(srcRect.x + u * srcRect.width)));
      const si = srcRowStart + sx * 4;
      const di = destRowStart + dx * 4;
      dest[di] = src[si];
      dest[di + 1] = src[si + 1];
      dest[di + 2] = src[si + 2];
      dest[di + 3] = src[si + 3];
    }
  }
}

/** Combines up to four 2x child tiles (any may be absent) into one half-resolution parent tile — the pyramid's mipmap step. */
function combineQuadrants(
  nw: Buffer | undefined,
  ne: Buffer | undefined,
  sw: Buffer | undefined,
  se: Buffer | undefined,
  childSize: number
): Buffer | undefined {
  if (!nw && !ne && !sw && !se) return undefined;
  const half = childSize / 2;
  const out = Buffer.alloc(childSize * childSize * 4);
  const quadrants: [Buffer | undefined, number, number][] = [
    [nw, 0, 0],
    [ne, half, 0],
    [sw, 0, half],
    [se, half, half],
  ];
  for (const [child, offX, offY] of quadrants) {
    if (!child) continue;
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const sx = x * 2;
        const sy = y * 2;
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((sy + dy) * childSize + (sx + dx)) * 4;
            r += child[i];
            g += child[i + 1];
            b += child[i + 2];
            a += child[i + 3];
          }
        }
        const oi = ((offY + y) * childSize + (offX + x)) * 4;
        out[oi] = Math.round(r / 4);
        out[oi + 1] = Math.round(g / 4);
        out[oi + 2] = Math.round(b / 4);
        out[oi + 3] = Math.round(a / 4);
      }
    }
  }
  return out;
}

async function buildContinentPyramid(casc: LocalCasc, continent: ContinentGeography): Promise<void> {
  const slug = slugify(continent.name);
  console.error(`\n${continent.name}: fetching WDT (FileDataID ${continent.wdtFileDataId}) and parsing MAID chunk...`);
  const wdt = casc.getFileByFileDataId(continent.wdtFileDataId);
  const { tex0AdtFileDataIdByTile } = parseWdtMaid(wdt);

  const populated: AdtTile[] = [];
  let minCol = GRID_SIZE, maxCol = -1, minRow = GRID_SIZE, maxRow = -1;
  for (const idx of tex0AdtFileDataIdByTile.keys()) {
    const col = idx % GRID_SIZE;
    const row = Math.floor(idx / GRID_SIZE);
    populated.push({ col, row });
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  if (populated.length === 0) {
    console.error(`  no populated tiles found, skipping`);
    return;
  }
  const range: PopulatedTileRange = { minCol, maxCol, minRow, maxRow };
  console.error(`  ${populated.length} populated ADT tiles (col ${minCol}-${maxCol}, row ${minRow}-${maxRow})`);

  // Pass 1: render every populated ADT tile once, to a raw RGBA scratch file.
  mkdirSync(join(scratchRoot, slug), { recursive: true });
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

  const tileRects = new Map<string, LngLatRect>();
  let rendered = 0;
  for (const tile of populated) {
    const idx = tileIndex(tile.col, tile.row);
    const tex0Id = tex0AdtFileDataIdByTile.get(idx)!;
    const key = `${tile.col}_${tile.row}`;
    const path = scratchPathFor(slug, tile.col, tile.row);
    try {
      if (!existsSync(path)) {
        const tex = parseAdtTex(casc.getFileByFileDataId(tex0Id));
        const textureImages = new Map<number, DecodedImage>();
        for (const fdid of tex.textureFileDataIds) {
          const img = getTexture(fdid);
          if (img) textureImages.set(fdid, img);
        }
        const out = renderAdtTile(tex, textureImages, CHUNK_PIXELS);
        writeFileSync(path, out.rgba);
      }
      tileRects.set(key, adtTileLngLatRect(continent, range, tile));
      rendered++;
      if (rendered % 100 === 0) console.error(`  rendered ${rendered}/${populated.length} ADT tiles...`);
    } catch (err) {
      console.error(`  tile (col=${tile.col}, row=${tile.row}) failed: ${(err as Error).message}`);
    }
  }
  console.error(`  ${rendered}/${populated.length} ADT tiles rendered to scratch`);

  // Pass 2: cut the deepest zoom level directly from the scratch buffers.
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const rect of tileRects.values()) {
    const nw = lngLatToTileFrac(rect.lngMin, rect.latMax, MAX_Z);
    const se = lngLatToTileFrac(rect.lngMax, rect.latMin, MAX_Z);
    xMin = Math.min(xMin, Math.floor(nw.x));
    xMax = Math.max(xMax, Math.ceil(se.x));
    yMin = Math.min(yMin, Math.floor(nw.y));
    yMax = Math.max(yMax, Math.ceil(se.y));
  }
  console.error(`  deepest level z=${MAX_Z}: tile range x[${xMin},${xMax}) y[${yMin},${yMax}) = ${(xMax - xMin) * (yMax - yMin)} tiles`);

  // pmtiles-convert (importers/wow-client/README.md's packing step) requires
  // this sidecar in the tile directory's root.
  let lngMin = Infinity, lngMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const rect of tileRects.values()) {
    lngMin = Math.min(lngMin, rect.lngMin);
    lngMax = Math.max(lngMax, rect.lngMax);
    latMin = Math.min(latMin, rect.latMin);
    latMax = Math.max(latMax, rect.latMax);
  }
  mkdirSync(join(outputDir, slug), { recursive: true });
  writeFileSync(
    join(outputDir, slug, "metadata.json"),
    JSON.stringify({
      name: continent.name,
      format: "png",
      minzoom: MIN_Z,
      maxzoom: MAX_Z,
      bounds: [lngMin, latMin, lngMax, latMax].join(","),
    })
  );

  const levelDir = (z: number) => join(outputDir, slug, String(z));
  let cut = 0;
  const totalDeepest = (xMax - xMin) * (yMax - yMin);
  for (let ty = yMin; ty < yMax; ty++) {
    for (let tx = xMin; tx < xMax; tx++) {
      const nw = tileToLngLat(tx, ty, MAX_Z);
      const se = tileToLngLat(tx + 1, ty + 1, MAX_Z);
      const outRect: LngLatRect = { lngMin: nw.lng, lngMax: se.lng, latMin: se.lat, latMax: nw.lat };

      let out: Buffer | undefined;
      for (const tile of populated) {
        const rect = tileRects.get(`${tile.col}_${tile.row}`);
        if (!rect) continue;
        const overlapLngMin = Math.max(outRect.lngMin, rect.lngMin);
        const overlapLngMax = Math.min(outRect.lngMax, rect.lngMax);
        const overlapLatMin = Math.max(outRect.latMin, rect.latMin);
        const overlapLatMax = Math.min(outRect.latMax, rect.latMax);
        if (overlapLngMin >= overlapLngMax || overlapLatMin >= overlapLatMax) continue;

        const src = readScratchTile(scratchPathFor(slug, tile.col, tile.row));
        if (!src) continue;
        if (!out) out = Buffer.alloc(OUTPUT_TILE_SIZE * OUTPUT_TILE_SIZE * 4);

        const destRect = {
          x: ((overlapLngMin - outRect.lngMin) / (outRect.lngMax - outRect.lngMin)) * OUTPUT_TILE_SIZE,
          y: ((outRect.latMax - overlapLatMax) / (outRect.latMax - outRect.latMin)) * OUTPUT_TILE_SIZE,
          width: ((overlapLngMax - overlapLngMin) / (outRect.lngMax - outRect.lngMin)) * OUTPUT_TILE_SIZE,
          height: ((overlapLatMax - overlapLatMin) / (outRect.latMax - outRect.latMin)) * OUTPUT_TILE_SIZE,
        };
        const srcRect = {
          x: ((overlapLngMin - rect.lngMin) / (rect.lngMax - rect.lngMin)) * ADT_TILE_PIXELS,
          y: ((rect.latMax - overlapLatMax) / (rect.latMax - rect.latMin)) * ADT_TILE_PIXELS,
          width: ((overlapLngMax - overlapLngMin) / (rect.lngMax - rect.lngMin)) * ADT_TILE_PIXELS,
          height: ((overlapLatMax - overlapLatMin) / (rect.latMax - rect.latMin)) * ADT_TILE_PIXELS,
        };
        blitResampled(out, OUTPUT_TILE_SIZE, destRect, src, ADT_TILE_PIXELS, srcRect);
      }

      if (out) {
        const dir = join(levelDir(MAX_Z), String(tx));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${ty}.png`), encodePng(OUTPUT_TILE_SIZE, OUTPUT_TILE_SIZE, out));
      }
      cut++;
      if (cut % 500 === 0) console.error(`  cut ${cut}/${totalDeepest} deepest-level tiles...`);
    }
  }
  console.error(`  wrote deepest level z=${MAX_Z}`);

  // Pass 3: build every shallower level from the one below it (mipmap-style).
  let curXMin = xMin, curXMax = xMax, curYMin = yMin, curYMax = yMax;
  for (let z = MAX_Z - 1; z >= MIN_Z; z--) {
    const childXMin = curXMin, childYMin = curYMin;
    curXMin = Math.floor(curXMin / 2);
    curXMax = Math.ceil(curXMax / 2);
    curYMin = Math.floor(curYMin / 2);
    curYMax = Math.ceil(curYMax / 2);
    let written = 0;
    for (let ty = curYMin; ty < curYMax; ty++) {
      for (let tx = curXMin; tx < curXMax; tx++) {
        const readChild = (cx: number, cy: number): Buffer | undefined => {
          const p = join(levelDir(z + 1), String(cx), `${cy}.png`);
          if (!existsSync(p)) return undefined;
          return decodePngRgba(readFileSync(p), OUTPUT_TILE_SIZE);
        };
        const nw = readChild(tx * 2, ty * 2);
        const ne = readChild(tx * 2 + 1, ty * 2);
        const sw = readChild(tx * 2, ty * 2 + 1);
        const se = readChild(tx * 2 + 1, ty * 2 + 1);
        const combined = combineQuadrants(nw, ne, sw, se, OUTPUT_TILE_SIZE);
        if (combined) {
          const dir = join(levelDir(z), String(tx));
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${ty}.png`), encodePng(OUTPUT_TILE_SIZE, OUTPUT_TILE_SIZE, combined));
          written++;
        }
      }
    }
    console.error(`  z=${z}: ${written} tiles (range x[${curXMin},${curXMax}) y[${curYMin},${curYMax}))`);
    void childXMin;
    void childYMin;
  }
}

// Minimal PNG decoder: this project's png.ts only ever needed to *encode*
// until now. Rather than write a general PNG decoder, every PNG this
// pipeline itself reads back (pass 3, reading pass 2's own output) was
// itself written by encodePng moments earlier in this same run, so its
// exact byte layout is known — this only needs to invert that one encoder,
// not handle arbitrary PNGs.
import { inflateSync } from "node:zlib";
function decodePngRgba(png: Buffer, size: number): Buffer {
  let offset = 8; // signature
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IDAT") idat.push(png.subarray(dataStart, dataStart + length));
    offset = dataStart + length + 4; // skip CRC
    if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(size * size * 4);
  const stride = size * 4;
  let prevRow = Buffer.alloc(stride);
  let rawOffset = 0;
  for (let y = 0; y < size; y++) {
    const filter = raw[rawOffset];
    rawOffset++;
    const row = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const outRow = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? outRow[x - 4] : 0;
      const b = prevRow[x];
      const c = x >= 4 ? prevRow[x - 4] : 0;
      let value = row[x];
      switch (filter) {
        case 1: value = (value + a) & 0xff; break;
        case 2: value = (value + b) & 0xff; break;
        case 3: value = (value + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = (value + pr) & 0xff;
          break;
        }
      }
      outRow[x] = value;
    }
    outRow.copy(out, y * stride);
    prevRow = outRow;
  }
  return out;
}

async function main() {
  const world = JSON.parse(readFileSync(worldJsonPath, "utf-8")) as WorldGeography;
  const only = process.argv[2];

  console.error(`Opening local CASC storage at ${INSTALL_DIR} (${PRODUCT})...`);
  const casc = await LocalCasc.open(INSTALL_DIR, PRODUCT);

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(scratchRoot, { recursive: true });

  for (const continent of world.continents) {
    if (only && slugify(continent.name) !== only) continue;
    await buildContinentPyramid(casc, continent);
  }

  console.error(`\nDone. Tile pyramids written to ${outputDir}`);
  console.error(`Scratch (safe to delete) at ${scratchRoot}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
