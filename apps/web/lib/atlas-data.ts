import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Continent, FlightPath, Location, Npc, NpcSpawn, Quest, Zone } from "@atlas/shared";

export interface AtlasDataset {
  generatedAt: string;
  sourceVersion: string;
  zoneFilesImported: string[];
  continents: Continent[];
  zones: Zone[];
  quests: Quest[];
  flightPaths: FlightPath[];
  npcs: Npc[];
  npcSpawns: NpcSpawn[];
  locations: Location[];
  warnings: string[];
}

let cached: AtlasDataset | null = null;

/**
 * Reads the AllTheThings importer's output. There is no live database in
 * this dev environment (see docs/INGESTION_ARCHITECTURE.md) — a real
 * deployment would query Postgres here instead; everything downstream of
 * this function (the zone page, the discovery panel, the map) is written
 * against the same @atlas/shared canonical types either way, so swapping
 * this for a DB-backed loader later doesn't touch the rest of the app.
 */
export async function loadAtlasDataset(): Promise<AtlasDataset> {
  if (cached) return cached;
  const path = join(process.cwd(), "public", "data", "burning-steppes.json");
  const raw = await readFile(path, "utf-8");
  cached = JSON.parse(raw) as AtlasDataset;
  return cached;
}

export function findZoneByName(dataset: AtlasDataset, name: string): Zone | undefined {
  return dataset.zones.find((z) => z.name.toLowerCase() === name.toLowerCase());
}

export function npcById(dataset: AtlasDataset, id: string | undefined): Npc | undefined {
  if (!id) return undefined;
  return dataset.npcs.find((n) => n.atlasId === id);
}

export function locationById(dataset: AtlasDataset, id: string | undefined): Location | undefined {
  if (!id) return undefined;
  return dataset.locations.find((l) => l.atlasId === id);
}

export interface ZoneContents {
  quests: Quest[];
  npcs: Npc[];
  flightPaths: FlightPath[];
  pins: { id: string; x: number; y: number; kind: "quest_giver" | "flight_path"; label: string; sublabel?: string }[];
}

/**
 * The "what is around me?" query, per docs/GEOGRAPHIC_GRAPH.md — resolved
 * here by walking the same denormalized `Location.zoneId` the doc
 * specifies (rather than a live spatial join), exactly the design it calls
 * for. This dataset is small enough to do in memory; a real deployment
 * would run the equivalent as a single indexed SQL query.
 */
export function getZoneContents(dataset: AtlasDataset, zone: Zone): ZoneContents {
  const locationsInZone = new Set(
    dataset.locations.filter((l) => l.zoneId === zone.atlasId).map((l) => l.atlasId)
  );

  const flightPaths = dataset.flightPaths.filter((f) => locationsInZone.has(f.locationId));

  const npcSpawnsInZone = dataset.npcSpawns.filter((s) => locationsInZone.has(s.locationId));
  const npcIdsInZone = new Set(npcSpawnsInZone.map((s) => s.npcId));
  const npcs = dataset.npcs.filter((n) => npcIdsInZone.has(n.atlasId));

  const quests = dataset.quests.filter((q) => q.givenByNpcId && npcIdsInZone.has(q.givenByNpcId));

  const pins: ZoneContents["pins"] = [];
  for (const spawn of npcSpawnsInZone) {
    const loc = locationById(dataset, spawn.locationId);
    const npc = npcById(dataset, spawn.npcId);
    if (!loc || !npc) continue;
    const questsFromThisGiver = quests.filter((q) => q.givenByNpcId === npc.atlasId);
    pins.push({
      id: spawn.locationId,
      x: loc.x,
      y: loc.y,
      kind: "quest_giver",
      label: npc.name,
      sublabel:
        questsFromThisGiver.length === 1
          ? questsFromThisGiver[0].name
          : `${questsFromThisGiver.length} quests`,
    });
  }
  for (const fp of flightPaths) {
    const loc = locationById(dataset, fp.locationId);
    if (!loc) continue;
    pins.push({ id: fp.atlasId, x: loc.x, y: loc.y, kind: "flight_path", label: fp.name, sublabel: fp.faction });
  }

  return { quests, npcs, flightPaths, pins };
}
