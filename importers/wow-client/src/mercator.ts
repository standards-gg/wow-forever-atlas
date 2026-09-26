import type { AdtTile } from "@atlas/shared";

/**
 * Standard Web Mercator "slippy map" tile math (the same public-domain
 * formulas documented on the OSM wiki's "Slippy map tilenames" page, used
 * by every XYZ raster tile server) — needed because a MapLibre `raster`
 * source (and the PMTiles archive format hyjal.cc/map itself was confirmed
 * to use, by inspecting its own network requests) always addresses tiles
 * by real global Web Mercator {z,x,y}, not an arbitrary local scheme.
 */
export function lngLatToTileFrac(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = n * ((lng + 180) / 360);
  const latRad = (lat * Math.PI) / 180;
  const y = (n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2;
  return { x, y };
}

export function tileToLngLat(x: number, y: number, z: number): { lng: number; lat: number } {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lng, lat };
}

/**
 * Mirrors apps/web/lib/world-frame.ts's constants exactly (WORLD_HEIGHT,
 * WORLD_ASPECT_RATIO, DEGREES_SPAN) — this importer can't import that
 * Next.js app file directly, so these are duplicated. Keep in sync; both
 * only affect where our fabricated lng/lat window sits, not any real
 * game data, so changing them is always safe as long as both sides agree.
 */
const WORLD_HEIGHT = 10000;
const WORLD_ASPECT_RATIO = 1.5;
const WORLD_WIDTH = WORLD_HEIGHT * WORLD_ASPECT_RATIO;
const DEGREES_SPAN = 4;
const DEGREES_PER_UNIT = DEGREES_SPAN / WORLD_HEIGHT;

export interface ContinentPlacement {
  worldMapPlacement: { uiMinX: number; uiMinY: number; uiMaxX: number; uiMaxY: number };
}

/** The ADT tile-index bounding box of every populated tile in a continent's WDT. */
export interface PopulatedTileRange {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export interface LngLatRect {
  lngMin: number;
  lngMax: number;
  latMin: number;
  latMax: number;
}

/**
 * An ADT tile's fabricated lng/lat bounds. Deliberately does NOT go through
 * continent.worldBounds (Blizzard's full theoretical continent extent, per
 * DB2) as the normalizing frame — this is a beta, and the populated ADT
 * tile grid (real terrain that currently exists) only covers a smaller
 * slice of that declared extent (confirmed empirically: Eastern Kingdoms'
 * populated tiles span only ~35% of worldBounds' own north-south range,
 * despite spanning ~95% of its east-west range — using worldBounds as the
 * reference frame here squeezed the whole tile pyramid ~2.7x in one axis).
 * extract-continents.ts's existing (already-shipped, already-verified)
 * whole-continent image sidesteps this the same way: it places the
 * populated tile bounding box directly to fill worldMapPlacement's
 * rectangle, not continent.worldBounds — matching that exactly (as a
 * fraction-of-populated-range composed with worldMapPlacement) is what
 * keeps this tile pyramid a drop-in replacement for the same visual
 * footprint, not a different-looking layout.
 */
export function adtTileLngLatRect(continent: ContinentPlacement, range: PopulatedTileRange, tile: AdtTile): LngLatRect {
  const fracColMin = (tile.col - range.minCol) / (range.maxCol - range.minCol + 1);
  const fracColMax = (tile.col + 1 - range.minCol) / (range.maxCol - range.minCol + 1);
  const fracRowMin = (tile.row - range.minRow) / (range.maxRow - range.minRow + 1);
  const fracRowMax = (tile.row + 1 - range.minRow) / (range.maxRow - range.minRow + 1);

  const { uiMinX, uiMinY, uiMaxX, uiMaxY } = continent.worldMapPlacement;
  // col increases east (lng+), row increases south (lat-) — same convention
  // extract-continents.ts's blitTile + rectToLngLatCorners already establish.
  const azMinX = uiMinX + fracColMin * (uiMaxX - uiMinX);
  const azMaxX = uiMinX + fracColMax * (uiMaxX - uiMinX);
  const azMinY = uiMinY + fracRowMin * (uiMaxY - uiMinY);
  const azMaxY = uiMinY + fracRowMax * (uiMaxY - uiMinY);

  const wx0 = azMinX * WORLD_WIDTH;
  const wx1 = azMaxX * WORLD_WIDTH;
  const wy0 = azMinY * WORLD_HEIGHT;
  const wy1 = azMaxY * WORLD_HEIGHT;

  return {
    lngMin: wx0 * DEGREES_PER_UNIT,
    lngMax: wx1 * DEGREES_PER_UNIT,
    // lat increases north (screen-up), world-frame Y increases south (screen-down) — same flip as world-frame.ts's toLngLat.
    latMin: -wy1 * DEGREES_PER_UNIT,
    latMax: -wy0 * DEGREES_PER_UNIT,
  };
}
