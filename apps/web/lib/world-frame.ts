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
 * WORLD_SIZE is an arbitrary unit scale (not real-world distance) — Leaflet
 * with CRS.Simple just needs *a* consistent numeric space, matching how
 * every other flat-plane game map (not just WoW fan tools) uses Leaflet.
 */
export const WORLD_SIZE = 10000;

export interface FractionRect {
  x: number; // 0-1
  y: number; // 0-1
  width: number;
  height: number;
}

export interface WorldRect {
  /** World-frame units, 0-WORLD_SIZE, y increasing south (screen/CSS convention) */
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
    x: frac.x * WORLD_SIZE,
    y: frac.y * WORLD_SIZE,
    width: frac.width * WORLD_SIZE,
    height: frac.height * WORLD_SIZE,
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
 * Leaflet (with CRS.Simple) uses [lat, lng] pairs. We negate our y (which
 * increases south/downward, per docs/COORDINATE_SYSTEM.md's confirmed
 * screen/CSS-style convention used everywhere else in this app) so that
 * increasing y still moves visually downward on the rendered map instead
 * of flipping the whole world upside down.
 */
export function toLatLng(worldX: number, worldY: number): [number, number] {
  return [-worldY, worldX];
}

export function rectToLatLngBounds(rect: WorldRect): [[number, number], [number, number]] {
  const sw = toLatLng(rect.x, rect.y + rect.height);
  const ne = toLatLng(rect.x + rect.width, rect.y);
  return [sw, ne];
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
