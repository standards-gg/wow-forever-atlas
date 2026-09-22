import { parseCsv } from "./csv.js";

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
  /** This continent's placement within the shared "Azeroth" world map (UiMapID 947), as a 0-1 box. */
  worldMapPlacement: { uiMinX: number; uiMinY: number; uiMaxX: number; uiMaxY: number };
  /** Map.WdtFileDataID — the continent's own WDT, for per-zone terrain-tile extraction. */
  wdtFileDataId: number;
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

/**
 * These three UiMapIDs are confirmed directly from wago.tools' `UiMap`
 * table's own `ParentUiMapID` linkage (fetched live 2026-09-22, build
 * 1.60.1.69913): 947 = "Azeroth" (parent 0, the combined world map),
 * 1415 = "Eastern Kingdoms" (parent 947), 1414 = "Kalimdor" (parent 947).
 * Every outdoor zone's own UiMapID (e.g. 1428 "Burning Steppes") has
 * ParentUiMapID = 1415 or 1414 — this is the real Blizzard hierarchy, not
 * a guess. A separate, unrelated pair (1463/1464, parent 0) also exists
 * with the same continent names but no children — deliberately not used.
 */
const AZEROTH_UI_MAP_ID = 947;
const EASTERN_KINGDOMS_UI_MAP_ID = 1415;
const KALIMDOR_UI_MAP_ID = 1414;

function toNum(v: string): number {
  return Number.parseFloat(v);
}

export function buildWorldGeography(
  areaTableCsv: string,
  uiMapAssignmentCsv: string,
  mapCsv: string,
  build: string
): WorldGeography {
  const areas = parseCsv(areaTableCsv);
  const assignments = parseCsv(uiMapAssignmentCsv);
  const maps = parseCsv(mapCsv);

  const worldMapRows = assignments.filter((a) => Number(a.UiMapID) === AZEROTH_UI_MAP_ID && a.AreaID === "0");

  const continents: ContinentGeography[] = [
    { mapId: 0, uiMapId: EASTERN_KINGDOMS_UI_MAP_ID, name: "Eastern Kingdoms" },
    { mapId: 1, uiMapId: KALIMDOR_UI_MAP_ID, name: "Kalimdor" },
  ].map(({ mapId, uiMapId, name }) => {
    const own = assignments.find((a) => Number(a.UiMapID) === uiMapId && a.AreaID === "0");
    const placement = worldMapRows.find((a) => a.MapID === String(mapId));
    const mapRow = maps.find((m) => m.ID === String(mapId));
    if (!own) throw new Error(`No self-assignment row found for continent UiMapID ${uiMapId}`);
    if (!placement) throw new Error(`No Azeroth world-map placement row found for MapID ${mapId}`);
    if (!mapRow) throw new Error(`No Map.db2 row found for MapID ${mapId}`);
    return {
      mapId,
      uiMapId,
      name,
      wdtFileDataId: Number(mapRow.WdtFileDataID),
      worldBounds: {
        minX: toNum(own.Region_0),
        minY: toNum(own.Region_1),
        maxX: toNum(own.Region_3),
        maxY: toNum(own.Region_4),
      },
      worldMapPlacement: {
        uiMinX: toNum(placement.UiMin_0),
        uiMinY: toNum(placement.UiMin_1),
        uiMaxX: toNum(placement.UiMax_0),
        uiMaxY: toNum(placement.UiMax_1),
      },
    };
  });

  // Real zones/cities placed on the outdoor world map: a top-level
  // AreaTable row (ParentAreaID=0) whose AreaID has a UiMapAssignment
  // entry with MapID 0 or 1. This is a real, Blizzard-data-driven filter
  // (not a curated list) — it naturally excludes dungeon-interior AreaIDs
  // like Blackrock Depths/Spire (which have no such outdoor placement row)
  // and picks up capital cities (which do).
  const outdoorAssignments = assignments.filter((a) => a.MapID === "0" || a.MapID === "1");
  const outdoorAreaIds = new Map(outdoorAssignments.map((a) => [a.AreaID, a]));

  const zones: ZoneGeography[] = areas
    .filter((a) => a.ParentAreaID === "0" && (a.ContinentID === "0" || a.ContinentID === "1"))
    .map((a) => {
      const assignment = outdoorAreaIds.get(a.ID);
      if (!assignment) return null;
      const name = a.AreaName_lang?.trim() || a.ZoneName?.trim() || `Zone #${a.ID}`;
      return {
        areaId: Number(a.ID),
        uiMapId: Number(assignment.UiMapID),
        name,
        continentMapId: Number(assignment.MapID),
        worldBounds: {
          minX: toNum(assignment.Region_0),
          minY: toNum(assignment.Region_1),
          maxX: toNum(assignment.Region_3),
          maxY: toNum(assignment.Region_4),
        },
      };
    })
    .filter((z): z is ZoneGeography => z !== null);

  return { build, fetchedAt: new Date().toISOString(), continents, zones };
}
