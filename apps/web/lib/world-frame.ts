import { getZoneContents, type AtlasDataset } from "./atlas-data-core";
import type { ContinentGeography, WorldGeography, ZoneGeography } from "./world-data-core";
import { continentRectInWorld, zoneRectInContinent } from "./world-data-core";
import { slugify } from "./slug";
import type { TileManifestEntry } from "./tiles";

/**
 * Composes the per-continent and per-zone percentage rectangles (already
 * computed in world-data.ts from real DB2 bounds) into ONE flat coordinate
 * frame for the whole world — what makes a single continuous, seamlessly
 * zoomable map possible (per Hyjal's own architecture) instead of three
 * separate pages each with their own local 0-100 space.
 *
 * WORLD_HEIGHT is an arbitrary unit scale (not real-world distance) — the
 * map just needs *a* consistent numeric space, matching how every other
 * flat-plane game map (not just WoW fan tools) works.
 *
 * The frame is NOT square. Blizzard's real Azeroth world-map background
 * (the shared canvas both continents' `worldMapPlacement` UI-fractions are
 * placed within) is wider than it is tall — confirmed empirically by
 * comparing each continent's real world-space aspect ratio (from its ADT
 * `worldBounds`, i.e. actual in-game yards) against its UI-map placement
 * aspect ratio (from `worldMapPlacement` fractions): Eastern Kingdoms and
 * Kalimdor independently give a real-yards-per-placement-fraction ratio
 * (X vs Y) of 1.4826 and 1.5163 — nearly identical despite being unrelated
 * landmasses, which only makes sense if it's a property of the shared
 * canvas itself, not either continent's shape. Forcing that onto a square
 * WORLD_SIZE x WORLD_SIZE frame (the earlier, wrong approach) squeezed
 * everything horizontally — exactly the "Kalimdor is contracted on the
 * horizontal" distortion reported. WORLD_ASPECT_RATIO corrects for it.
 */
export const WORLD_HEIGHT = 10000;
export const WORLD_ASPECT_RATIO = 1.5; // avg(1.4826, 1.5163) rounds to a clean 3:2
export const WORLD_WIDTH = WORLD_HEIGHT * WORLD_ASPECT_RATIO;

export interface FractionRect {
  x: number; // 0-1
  y: number; // 0-1
  width: number;
  height: number;
}

export interface WorldRect {
  /** World-frame units, 0-WORLD_WIDTH by 0-WORLD_HEIGHT, y increasing south (screen/CSS convention) */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function continentFractionInWorld(continent: ContinentGeography): FractionRect {
  const r = continentRectInWorld(continent); // 0-100
  return { x: r.x / 100, y: r.y / 100, width: r.width / 100, height: r.height / 100 };
}

export function zoneFractionInWorld(zone: ZoneGeography, continent: ContinentGeography): FractionRect {
  const continentFrac = continentFractionInWorld(continent);
  const zoneInContinent = zoneRectInContinent(zone, continent); // 0-100, relative to continent
  return {
    x: continentFrac.x + (zoneInContinent.x / 100) * continentFrac.width,
    y: continentFrac.y + (zoneInContinent.y / 100) * continentFrac.height,
    width: (zoneInContinent.width / 100) * continentFrac.width,
    height: (zoneInContinent.height / 100) * continentFrac.height,
  };
}

export function fractionToWorldRect(frac: FractionRect): WorldRect {
  return {
    x: frac.x * WORLD_WIDTH,
    y: frac.y * WORLD_HEIGHT,
    width: frac.width * WORLD_WIDTH,
    height: frac.height * WORLD_HEIGHT,
  };
}

/** A point given as 0-100 percent within a zone's own space, composed into world-frame units. */
export function pointInZoneToWorld(zoneWorld: WorldRect, xPercent: number, yPercent: number): { x: number; y: number } {
  return {
    x: zoneWorld.x + (xPercent / 100) * zoneWorld.width,
    y: zoneWorld.y + (yPercent / 100) * zoneWorld.height,
  };
}

/**
 * MapLibre GL JS expects real [lng, lat] pairs (it projects through Web
 * Mercator), but our world is a flat, fictional plane with no real
 * geography. The standard trick other fictional/game-world MapLibre
 * projects use (Valheim, Minecraft map viewers, etc.) is to fabricate a
 * small lng/lat window near the equator/prime meridian — Mercator
 * distortion is proportional to how far from the equator you are, and at
 * a span of a few degrees it's well under 0.1%, i.e. visually a flat
 * plane. DEGREES_PER_UNIT is one uniform scale applied to both axes — it's
 * only a units conversion, so it can't itself introduce distortion; WORLD_HEIGHT
 * (not WORLD_WIDTH) anchors it since height is the frame's undistorted axis.
 * Both raster images and marker/pin positions go through this same
 * transform, so nothing can drift out of alignment relative to each other.
 */
const DEGREES_SPAN = 4;
const DEGREES_PER_UNIT = DEGREES_SPAN / WORLD_HEIGHT;

/** [lng, lat] — negate y (which increases south/downward, our screen/CSS convention) since lat increases north. */
export function toLngLat(worldX: number, worldY: number): [number, number] {
  return [worldX * DEGREES_PER_UNIT, -worldY * DEGREES_PER_UNIT];
}

export function rectToLngLatBounds(rect: WorldRect): [[number, number], [number, number]] {
  const sw = toLngLat(rect.x, rect.y + rect.height);
  const ne = toLngLat(rect.x + rect.width, rect.y);
  return [sw, ne];
}

/** Corner order MapLibre's `image` source expects: top-left, top-right, bottom-right, bottom-left. */
export function rectToLngLatCorners(rect: WorldRect): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    toLngLat(rect.x, rect.y),
    toLngLat(rect.x + rect.width, rect.y),
    toLngLat(rect.x + rect.width, rect.y + rect.height),
    toLngLat(rect.x, rect.y + rect.height),
  ];
}

export interface WorldZone {
  zone: ZoneGeography;
  continent: ContinentGeography;
  slug: string;
  worldRect: WorldRect;
  hasEntityData: boolean;
  tile?: TileManifestEntry;
}

export interface WorldContinent {
  continent: ContinentGeography;
  slug: string;
  worldRect: WorldRect;
  tile?: TileManifestEntry;
}

/** One seamless real-terrain image per continent — the base layer under the higher-detail per-zone tiles. */
export function buildWorldContinents(world: WorldGeography, continentTiles: TileManifestEntry[]): WorldContinent[] {
  const tileBySlug = new Map(continentTiles.map((t) => [t.slug, t]));
  return world.continents.map((continent) => {
    const slug = slugify(continent.name);
    return {
      continent,
      slug,
      worldRect: fractionToWorldRect(continentFractionInWorld(continent)),
      tile: tileBySlug.get(slug),
    };
  });
}

export function buildWorldZones(
  world: WorldGeography,
  entityDataset: AtlasDataset | null,
  tiles: TileManifestEntry[]
): WorldZone[] {
  const zoneNamesWithData = new Set(entityDataset?.zones.map((z) => z.name) ?? []);
  const tileBySlug = new Map(tiles.map((t) => [t.slug, t]));

  return world.zones.map((zone) => {
    const continent = world.continents.find((c) => c.mapId === zone.continentMapId)!;
    const slug = slugify(zone.name);
    return {
      zone,
      continent,
      slug,
      worldRect: fractionToWorldRect(zoneFractionInWorld(zone, continent)),
      hasEntityData: zoneNamesWithData.has(zone.name),
      tile: tileBySlug.get(slug),
    };
  });
}

export interface WorldPin {
  id: string;
  worldX: number;
  worldY: number;
  kind: "quest_giver" | "flight_path";
  label: string;
  sublabel?: string;
  zoneSlug: string;
}

/** All entity pins across every zone that has imported data, composed into the single world frame. */
export function buildWorldPins(worldZones: WorldZone[], dataset: AtlasDataset | null): WorldPin[] {
  if (!dataset) return [];
  const pins: WorldPin[] = [];
  for (const wz of worldZones) {
    if (!wz.hasEntityData) continue;
    const entityZone = dataset.zones.find((z) => z.name === wz.zone.name);
    if (!entityZone) continue;
    const { pins: zonePins } = getZoneContents(dataset, entityZone);
    for (const p of zonePins) {
      const { x, y } = pointInZoneToWorld(wz.worldRect, p.x, p.y);
      pins.push({ id: p.id, worldX: x, worldY: y, kind: p.kind, label: p.label, sublabel: p.sublabel, zoneSlug: wz.slug });
    }
  }
  return pins;
}
