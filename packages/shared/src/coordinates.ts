/**
 * Coordinate system conversions, per docs/COORDINATE_SYSTEM.md.
 *
 * Three coordinate spaces are recognized:
 *  - WORLD_SPACE:      raw client world coordinates (yards). Canonical storage form.
 *  - UI_MAP_TRANSFORM: the 0-1 (or 0-100) UI-map fraction system, derived from a
 *                       zone's UiMapAssignment world-space bounding box. Exact,
 *                       lossless, invertible against WORLD_SPACE for a known zone.
 *  - ADT_TILE:          the 64x64-per-continent terrain tile grid. One-directional
 *                       in practice: world -> tile is exact; tile -> world can only
 *                       recover the tile's bounding rectangle, not the original point.
 */

export type CoordinateSpace = "WORLD_SPACE" | "UI_MAP_TRANSFORM" | "ADT_TILE";

export interface WorldPoint {
  x: number;
  y: number;
  z?: number;
}

export interface UiPercent {
  /** 0-100 */
  x: number;
  /** 0-100 */
  y: number;
}

export interface AdtTile {
  col: number;
  row: number;
}

/**
 * A zone's world<->UI transform, as read directly from DB2's UiMapAssignment
 * table (Region_0..5 = world-space bounding box; UiMin/UiMax = UI-space
 * bounding box, confirmed [0,0]-[1,1] for a zone owning a whole dedicated
 * map tile rather than a sub-rectangle of a parent).
 */
export interface UiMapTransform {
  uiMapId: number;
  areaId: number;
  mapId: number;
  regionMinX: number;
  regionMinY: number;
  regionMaxX: number;
  regionMaxY: number;
  uiMinX: number;
  uiMinY: number;
  uiMaxX: number;
  uiMaxY: number;
}

/** One ADT tile edge, in yards. Confirmed matching Hyjal's own `tileSize` field. */
export const ADT_TILE_SIZE_YARDS = 533.3333333333334;

/**
 * Confirmed real UiMapAssignment row for Burning Steppes (AreaID 46), pulled
 * live from wago.tools against build 1.60.1.69913 during Phase 1 research.
 * Used as the canonical test fixture for this module.
 */
export const BURNING_STEPPES_TRANSFORM: UiMapTransform = {
  uiMapId: 1428,
  areaId: 46,
  mapId: 0, // Eastern Kingdoms
  regionMinX: -8983.333,
  regionMinY: -3195.833,
  regionMaxX: -7031.2495,
  regionMaxY: -266.667,
  uiMinX: 0,
  uiMinY: 0,
  uiMaxX: 1,
  uiMaxY: 1,
};

/**
 * World -> UI fraction (0-1). Exact, invertible for a linear bounding-box map.
 * Multiply by 100 for the 0-100 percentage convention ATT/QuestieDB use.
 *
 * IMPORTANT AXIS NOTE, confirmed empirically against real cross-source data
 * (two independent Burning Steppes flight-master coordinates, matched by ID
 * between DB2's TaxiNodes and AllTheThings' `fp()` records — see
 * importers/allthethings and docs/COORDINATE_SYSTEM.md's "Axis convention"
 * section): WoW's world-space X axis points *north* and Y points *west*,
 * but the UI-map percentage convention has x increasing *east* and y
 * increasing *south*. This is a rotation+flip, not a direct axis-for-axis
 * copy — `ui_x` is derived from world *Y* (flipped), and `ui_y` is derived
 * from world *X* (flipped). An earlier version of this function copied
 * world X -> ui x and world Y -> ui y directly, which is wrong; do not
 * reintroduce that without re-validating against real data first.
 */
export function worldToUiFraction(
  point: WorldPoint,
  transform: UiMapTransform
): { x: number; y: number } {
  const spanX = transform.regionMaxX - transform.regionMinX;
  const spanY = transform.regionMaxY - transform.regionMinY;
  if (spanX === 0 || spanY === 0) {
    throw new Error(
      `UiMapTransform for uiMapId=${transform.uiMapId} has a zero-width span; cannot convert`
    );
  }
  const fracWorldX = (point.x - transform.regionMinX) / spanX; // 0 = south edge, 1 = north edge
  const fracWorldY = (point.y - transform.regionMinY) / spanY; // 0 = east edge, 1 = west edge
  const uiSpanX = transform.uiMaxX - transform.uiMinX;
  const uiSpanY = transform.uiMaxY - transform.uiMinY;
  return {
    x: transform.uiMinX + (1 - fracWorldY) * uiSpanX, // ui x: 0 = west, 1 = east
    y: transform.uiMinY + (1 - fracWorldX) * uiSpanY, // ui y: 0 = north, 1 = south
  };
}

/** World -> 0-100 UI percentage, the convention ATT/QuestieDB coord fields use. */
export function worldToUiPercent(point: WorldPoint, transform: UiMapTransform): UiPercent {
  const frac = worldToUiFraction(point, transform);
  return { x: frac.x * 100, y: frac.y * 100 };
}

/** UI fraction (0-1) -> world. Inverse of worldToUiFraction; exact for a linear map. */
export function uiFractionToWorld(
  frac: { x: number; y: number },
  transform: UiMapTransform
): WorldPoint {
  const spanX = transform.regionMaxX - transform.regionMinX;
  const spanY = transform.regionMaxY - transform.regionMinY;
  const uiSpanX = transform.uiMaxX - transform.uiMinX;
  const uiSpanY = transform.uiMaxY - transform.uiMinY;
  if (uiSpanX === 0 || uiSpanY === 0) {
    throw new Error(
      `UiMapTransform for uiMapId=${transform.uiMapId} has a zero-width UI span; cannot invert`
    );
  }
  const fracWorldY = 1 - (frac.x - transform.uiMinX) / uiSpanX;
  const fracWorldX = 1 - (frac.y - transform.uiMinY) / uiSpanY;
  return {
    x: transform.regionMinX + fracWorldX * spanX,
    y: transform.regionMinY + fracWorldY * spanY,
  };
}

/** 0-100 UI percentage -> world. */
export function uiPercentToWorld(percent: UiPercent, transform: UiMapTransform): WorldPoint {
  return uiFractionToWorld({ x: percent.x / 100, y: percent.y / 100 }, transform);
}

/**
 * World -> ADT tile index, per the public wowdev.wiki ADT-grid convention:
 * WoW's world X points north, Y points west; the 64x64 grid's origin (0,0)
 * sits at the grid's center, tile index (32,32). Confirmed against Hyjal's
 * own public tileSize metadata (docs/SOURCE_HYJAL.md, docs/MAP_ARCHITECTURE.md).
 *
 * One-directional by design: exact forward conversion, but the inverse
 * (adtTileToWorldBounds) can only recover the tile's bounding rectangle,
 * never the original sub-tile point — this matches what docs/COORDINATE_SYSTEM.md
 * specifies ("tile -> map", not point-perfect recovery).
 */
export function worldToAdtTile(point: WorldPoint): AdtTile {
  return {
    col: Math.floor(32 - point.y / ADT_TILE_SIZE_YARDS),
    row: Math.floor(32 - point.x / ADT_TILE_SIZE_YARDS),
  };
}

/** The world-space bounding rectangle covered by a given ADT tile index. */
export function adtTileToWorldBounds(tile: AdtTile): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const maxX = (32 - tile.row) * ADT_TILE_SIZE_YARDS;
  const minX = maxX - ADT_TILE_SIZE_YARDS;
  const maxY = (32 - tile.col) * ADT_TILE_SIZE_YARDS;
  const minY = maxY - ADT_TILE_SIZE_YARDS;
  return { minX, maxX, minY, maxY };
}
