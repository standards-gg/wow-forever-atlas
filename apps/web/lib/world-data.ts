import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { worldToUiFraction, type UiMapTransform } from "@atlas/shared";
import { slugify } from "./slug";

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ContinentGeography {
  mapId: number;
  uiMapId: number;
  name: string;
  worldBounds: WorldBounds;
  worldMapPlacement: { uiMinX: number; uiMinY: number; uiMaxX: number; uiMaxY: number };
}

export interface ZoneGeography {
  areaId: number;
  uiMapId: number;
  name: string;
  continentMapId: number;
  worldBounds: WorldBounds;
}

export interface WorldGeography {
  build: string;
  fetchedAt: string;
  continents: ContinentGeography[];
  zones: ZoneGeography[];
}

let cached: WorldGeography | null = null;

/**
 * Reads importers/wago's output — real Blizzard zone/continent boundary
 * data (bounding boxes derived from DB2's AreaTable + UiMapAssignment, per
 * docs/RECOMMENDED_DATA_SOURCES.md), not artwork. Regenerate with
 * `npm run import:world --workspace=@atlas/importer-wago`.
 */
export async function loadWorldGeography(): Promise<WorldGeography> {
  if (cached) return cached;
  const path = join(process.cwd(), "public", "data", "world.json");
  const raw = await readFile(path, "utf-8");
  cached = JSON.parse(raw) as WorldGeography;
  return cached;
}

export interface UiRect {
  /** 0-100 */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A WorldBounds box, converted into a 0-100 UI-percent rect against an arbitrary reference transform. */
function boundsToUiRect(bounds: WorldBounds, transform: UiMapTransform): UiRect {
  const a = worldToUiFraction({ x: bounds.minX, y: bounds.minY }, transform);
  const b = worldToUiFraction({ x: bounds.maxX, y: bounds.maxY }, transform);
  // The world<->UI transform includes an axis flip (see packages/shared/src/coordinates.ts),
  // so the min/max corner of a world-space box does not necessarily map to the
  // min/max corner in UI space — always re-derive min/max after transforming.
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return { x: minX * 100, y: minY * 100, width: (maxX - minX) * 100, height: (maxY - minY) * 100 };
}

/** A zone's rectangle within its own continent's map (0-100%), using real DB2 bounds for both. */
export function zoneRectInContinent(zone: ZoneGeography, continent: ContinentGeography): UiRect {
  const transform: UiMapTransform = {
    uiMapId: continent.uiMapId,
    areaId: 0,
    mapId: continent.mapId,
    regionMinX: continent.worldBounds.minX,
    regionMinY: continent.worldBounds.minY,
    regionMaxX: continent.worldBounds.maxX,
    regionMaxY: continent.worldBounds.maxY,
    uiMinX: 0,
    uiMinY: 0,
    uiMaxX: 1,
    uiMaxY: 1,
  };
  return boundsToUiRect(zone.worldBounds, transform);
}

/** A continent's rectangle within the shared "Azeroth" world map (0-100%) — real Blizzard placement, not computed. */
export function continentRectInWorld(continent: ContinentGeography): UiRect {
  const { uiMinX, uiMinY, uiMaxX, uiMaxY } = continent.worldMapPlacement;
  return { x: uiMinX * 100, y: uiMinY * 100, width: (uiMaxX - uiMinX) * 100, height: (uiMaxY - uiMinY) * 100 };
}

export function findZoneBySlug(world: WorldGeography, slug: string): ZoneGeography | undefined {
  return world.zones.find((z) => slugify(z.name) === slug);
}

export function findContinentBySlug(world: WorldGeography, slug: string): ContinentGeography | undefined {
  return world.continents.find((c) => slugify(c.name) === slug);
}
