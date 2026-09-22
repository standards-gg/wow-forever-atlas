import {
  type AtlasId,
  type Continent,
  type FlightPath,
  type Location,
  type Npc,
  type NpcSpawn,
  type ProvenanceRecord,
  type Quest,
  type Zone,
} from "@atlas/shared";
import { AtlasIdAllocator } from "./atlas-id-allocator.js";
import { parseLuaLite } from "./lua-lite/parser.js";
import { preprocess } from "./lua-lite/preprocessor.js";
import { isLuaCall, isLuaIdentifier, isLuaTable, type LuaCall, type LuaTable, type LuaValue } from "./lua-lite/types.js";
import { resolveKnownMap } from "./map-constants.js";

export interface NormalizeOptions {
  /** e.g. "att" — always "att" today, kept explicit for future importer reuse. */
  source: "att";
  sourceUrl: string;
  /** The ATT git commit this source file was fetched at. */
  sourceVersion: string;
  importedAt?: string;
  /**
   * Shared across every `normalizeZoneFile` call in one import run, so atlas
   * IDs never collide across files and the same real zone/NPC (e.g. a
   * Burning Steppes NPC referenced from a Searing Gorge quest's coord)
   * resolves to the same atlas_id everywhere. Defaults to a fresh session
   * (single-file use, e.g. unit tests) if omitted.
   */
  session?: NormalizeSession;
}

/** Cross-file state for one import run — see NormalizeOptions.session. */
export class NormalizeSession {
  readonly ids = new AtlasIdAllocator();
  readonly continentsByName = new Map<string, Continent>();
  readonly zonesByMapIdentifier = new Map<string, Zone>();
  readonly npcsByBlizzardId = new Map<number, Npc>();
}

export interface NormalizeResult {
  continents: Continent[];
  zones: Zone[];
  quests: Quest[];
  flightPaths: FlightPath[];
  npcs: Npc[];
  npcSpawns: NpcSpawn[];
  locations: Location[];
  /** Things this pass deliberately did not attempt to extract, so gaps are visible, not silent. */
  warnings: string[];
}

interface WalkContext {
  mapIdentifier?: string;
}

function walk(value: LuaValue, ctx: WalkContext, visit: (call: LuaCall, ctx: WalkContext) => void): void {
  if (isLuaCall(value)) {
    let nextCtx = ctx;
    if (value.name === "m" || value.name === "maproot") {
      const mapArgIndex = value.name === "maproot" ? 1 : 0;
      const mapArg = value.args[mapArgIndex];
      if (isLuaIdentifier(mapArg)) {
        nextCtx = { ...ctx, mapIdentifier: mapArg.name };
      }
    }
    visit(value, nextCtx);
    for (const arg of value.args) walk(arg, nextCtx, visit);
  } else if (isLuaTable(value)) {
    for (const item of value.array) walk(item, ctx, visit);
    for (const key of Object.keys(value.fields)) walk(value.fields[key], ctx, visit);
  }
}

function numberArray(value: LuaValue | undefined): number[] {
  if (value === undefined) return [];
  if (typeof value === "number") return [value];
  if (isLuaTable(value)) return value.array.filter((v): v is number => typeof v === "number");
  return [];
}

function resolveFaction(value: LuaValue | undefined): "alliance" | "horde" | "both" {
  if (isLuaIdentifier(value)) {
    if (/HORDE/i.test(value.name)) return "horde";
    if (/ALLIANCE/i.test(value.name)) return "alliance";
  }
  return "both";
}

/**
 * Extracts the {x, y, mapIdentifier} triple from a `coord`/`coords` field.
 * Per Forever Quest Pins' own confirmed behavior (docs/RECOMMENDED_DATA_SOURCES.md),
 * when multiple coordinates exist the first is treated as primary.
 */
function extractCoordTriple(
  table: LuaTable,
  fallbackMapIdentifier: string | undefined
): { x: number; y: number; mapIdentifier: string | undefined } | undefined {
  const coordField = table.fields["coord"];
  const coordsField = table.fields["coords"];
  const triple = isLuaTable(coordField)
    ? coordField
    : isLuaTable(coordsField) && isLuaTable(coordsField.array[0])
      ? coordsField.array[0]
      : undefined;
  if (!triple || typeof triple.array[0] !== "number" || typeof triple.array[1] !== "number") {
    return undefined;
  }
  const mapArg = triple.array[2];
  const mapIdentifier = isLuaIdentifier(mapArg) ? mapArg.name : fallbackMapIdentifier;
  return { x: triple.array[0], y: triple.array[1], mapIdentifier };
}

export function normalizeZoneFile(rawSource: string, opts: NormalizeOptions): NormalizeResult {
  const importedAt = opts.importedAt ?? new Date().toISOString();
  const session = opts.session ?? new NormalizeSession();
  const ids = session.ids;
  const result: NormalizeResult = {
    continents: [],
    zones: [],
    quests: [],
    flightPaths: [],
    npcs: [],
    npcSpawns: [],
    locations: [],
    warnings: [],
  };

  const provenanceFor = (sourceIdType: string, sourceId: string | number): ProvenanceRecord => ({
    source: opts.source,
    sourceUrl: opts.sourceUrl,
    sourceIdType,
    sourceId: String(sourceId),
    sourceVersion: opts.sourceVersion,
    importedAt,
    confidence: "verified",
  });

  function getOrCreateNpc(blizzardNpcId: number, name: string | undefined): AtlasId<"npc"> {
    const existing = session.npcsByBlizzardId.get(blizzardNpcId);
    if (existing) {
      // A later, named sighting of an NPC we'd only seen anonymously before
      // (e.g. referenced by ID from another zone's quest first) upgrades the name.
      if (name && existing.name.startsWith("Unknown NPC #")) existing.name = name;
      return existing.atlasId;
    }
    const atlasId = ids.next("npc");
    const npc: Npc = {
      atlasId,
      name: name ?? `Unknown NPC #${blizzardNpcId}`,
      npcTypes: [],
      isBoss: false,
      provenance: [
        {
          ...provenanceFor("NpcID", blizzardNpcId),
          // NPC identity has no DB2 source at all (confirmed, see
          // docs/RECOMMENDED_DATA_SOURCES.md) — this name comes only from
          // ATT's inline editor comment next to the qg/cr reference, which
          // is a real but low-confidence signal, not authoritative data.
          confidence: name ? "inferred" : "unverified",
          transformation: "name extracted from ATT inline comment, not a structured field",
        },
      ],
    };
    session.npcsByBlizzardId.set(blizzardNpcId, npc);
    result.npcs.push(npc);
    return atlasId;
  }

  function getOrCreateContinent(name: string): AtlasId<"continent"> {
    const existing = session.continentsByName.get(name);
    if (existing) return existing.atlasId;
    const atlasId = ids.next("continent");
    const continent: Continent = { atlasId, name, isCustomForeverContent: false, provenance: [] };
    session.continentsByName.set(name, continent);
    result.continents.push(continent);
    return atlasId;
  }

  function getOrCreateZone(mapIdentifier: string | undefined): AtlasId<"zone"> | undefined {
    if (!mapIdentifier) return undefined;
    const known = resolveKnownMap(mapIdentifier);
    if (!known) return undefined;
    const existing = session.zonesByMapIdentifier.get(mapIdentifier);
    if (existing) return existing.atlasId as AtlasId<"zone">;
    const atlasId = ids.next("zone");
    const zone: Zone = {
      atlasId,
      // Every known map in this MVP importer is Eastern Kingdoms — a real
      // importer would resolve this from DB2's Map/AreaTable, not assume it.
      continentId: getOrCreateContinent("Eastern Kingdoms"),
      name: known.name,
      provenance: [
        {
          source: "wago_db2",
          sourceIdType: "AreaTable.ID",
          sourceId: String(known.areaId),
          importedAt,
          confidence: "verified",
          transformation: `Cross-validated AreaID/UiMapID pair, not derived from this ATT file — see importers/allthethings/src/map-constants.ts`,
        },
      ],
    };
    session.zonesByMapIdentifier.set(mapIdentifier, zone);
    result.zones.push(zone);
    return atlasId;
  }

  function createLocation(
    coord: { x: number; y: number; mapIdentifier: string | undefined },
    sourceIdType: string,
    sourceId: string | number
  ): AtlasId<"location"> {
    const known = resolveKnownMap(coord.mapIdentifier);
    const atlasId = ids.next("location");
    const location: Location = {
      atlasId,
      // ATT's coord fields are already in the 0-100 UI-map percentage
      // convention (confirmed cross-validated against DB2 TaxiNodes data
      // for this exact zone — see packages/shared/test/coordinates.test.ts
      // and docs/COORDINATE_SYSTEM.md's corrected worked example).
      coordinateSpace: "UI_MAP_TRANSFORM",
      x: coord.x,
      y: coord.y,
      zoneId: getOrCreateZone(coord.mapIdentifier),
      provenance: [
        {
          ...provenanceFor(sourceIdType, sourceId),
          transformation: known
            ? `mapIdentifier "${coord.mapIdentifier}" resolved to UiMapID ${known.uiMapId} / AreaID ${known.areaId} via a cross-validated known-map table`
            : coord.mapIdentifier
              ? `mapIdentifier "${coord.mapIdentifier}" is not in the known-map table — zone left unresolved rather than guessed`
              : "no map identifier found on this coordinate",
        },
      ],
    };
    result.locations.push(location);
    return atlasId;
  }

  const roots = parseLuaLite(preprocess(rawSource));

  for (const root of roots) {
    walk(root, {}, (call, ctx) => {
      if (call.name === "q") {
        const [idArg, tableArg] = call.args;
        if (typeof idArg !== "number" || !isLuaTable(tableArg)) return;
        const t = tableArg;

        const givenByNpcId = typeof t.fields["qg"] === "number"
          ? getOrCreateNpc(t.fields["qg"] as number, t.fieldComments?.["qg"])
          : undefined;
        // Multi-giver quests (`qgs`) are real (confirmed in Searing Gorge.lua)
        // but DATA_MODEL.md's Quest.givenByNpcId is singular — record every
        // giver as an NPC, but only the first becomes the canonical field,
        // matching Forever Quest Pins' own confirmed simplification.
        const qgsField = t.fields["qgs"];
        let firstOfMany: AtlasId<"npc"> | undefined;
        if (isLuaTable(qgsField)) {
          qgsField.array.forEach((v, i) => {
            if (typeof v !== "number") return;
            const npcId = getOrCreateNpc(v, qgsField.arrayComments?.[i]);
            firstOfMany ??= npcId;
          });
        }

        const coord = extractCoordTriple(t, ctx.mapIdentifier);
        const questGiverId = givenByNpcId ?? firstOfMany;
        if (coord) {
          const locationId = createLocation(coord, "QuestID", idArg);
          // ATT's `coord` on a quest record is the quest-giver's map
          // position (confirmed by direct inspection of real fixtures) —
          // its natural home in the canonical model is an NpcSpawn for the
          // giver, per docs/DATA_MODEL.md, not a dangling, unreferenced Location.
          if (questGiverId) {
            result.npcSpawns.push({
              atlasId: ids.next("npc_spawn"),
              npcId: questGiverId,
              locationId,
              isPatrol: false,
              provenance: [provenanceFor("QuestID", idArg)],
            });
          } else {
            result.warnings.push(
              `Quest ${idArg} (${t.name ?? "unnamed"}) has a coord but no qg/qgs — Location ${locationId} created but not attached to any NPC`
            );
          }
        } else {
          result.warnings.push(`Quest ${idArg} (${t.name ?? "unnamed"}) has no coord field — no Location created`);
        }

        const lvl = t.fields["lvl"];
        const levelMin = typeof lvl === "number" ? lvl : undefined;

        result.quests.push({
          atlasId: ids.next("quest"),
          name: t.name ?? `Unnamed quest #${idArg}`,
          levelRequirementMin: levelMin,
          levelRequirementMax: levelMin,
          faction: resolveFaction(t.fields["races"]),
          isRepeatable: false,
          isDaily: false,
          isWeekly: false,
          isMonthly: false,
          isYearly: false,
          isWarEffort: false,
          isAttunement: false,
          isInstanceQuest: false,
          isBreadcrumb: false,
          givenByNpcId: questGiverId,
          turnedInAtNpcId: undefined, // not a distinct structured field in ATT's data — see docs/DATA_MODEL.md
          sourceQuestIds: [],
          altQuestIds: [],
          provenance: [provenanceFor("QuestID", idArg)],
          // Cross-references to the raw source quest IDs (sourceQuests/altQuests)
          // are recorded as warnings for now rather than resolved AtlasIds,
          // since resolving them requires a second pass once every quest in
          // the zone has an allocated atlas_id (a real importer would do this
          // as a two-pass process — see docs/INGESTION_ARCHITECTURE.md).
        } as Quest);

        const rawSourceQuests = [
          ...numberArray(t.fields["sourceQuest"]),
          ...numberArray(t.fields["sourceQuests"]),
        ];
        const rawAltQuests = numberArray(t.fields["altQuests"]);
        if (rawSourceQuests.length > 0) {
          result.warnings.push(
            `Quest ${idArg}: raw prerequisite QuestIDs [${rawSourceQuests.join(", ")}] recorded but not yet resolved to atlas_ids (requires a second pass over the whole import batch)`
          );
        }
        if (rawAltQuests.length > 0) {
          result.warnings.push(
            `Quest ${idArg}: raw alternate QuestIDs [${rawAltQuests.join(", ")}] recorded but not yet resolved to atlas_ids`
          );
        }
      }

      if (call.name === "fp") {
        const [idArg, tableArg] = call.args;
        if (typeof idArg !== "number" || !isLuaTable(tableArg)) return;
        const t = tableArg;
        const coord = extractCoordTriple(t, ctx.mapIdentifier);
        if (!coord) {
          result.warnings.push(`Flight path ${idArg} (${t.name ?? "unnamed"}) has no coord field`);
          return;
        }
        const locationId = createLocation(coord, "TaxiNodes.ID", idArg);
        result.flightPaths.push({
          atlasId: ids.next("flight_path"),
          name: t.name ?? `Unnamed flight master #${idArg}`,
          locationId,
          faction: resolveFaction(t.fields["races"]),
          provenance: [provenanceFor("TaxiNodes.ID", idArg)],
        });
        if (typeof t.fields["cr"] === "number") {
          getOrCreateNpc(t.fields["cr"] as number, t.fieldComments?.["cr"]);
        }
      }
    });
  }

  return result;
}
