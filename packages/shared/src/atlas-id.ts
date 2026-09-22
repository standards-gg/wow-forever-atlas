/**
 * Canonical Atlas ID formatting, per docs/DATA_MODEL.md's founding rule:
 * external IDs (Blizzard, ATT, QuestieDB, ...) are never primary keys.
 * Format: atlas_<entity_type>_<6-digit zero-padded sequence>, e.g.
 * "atlas_quest_000001". The sequence itself is assigned by a per-type
 * Postgres sequence at insert time (see db/migrations) — this module only
 * knows how to format/parse the resulting string, not generate the number.
 */

export const ATLAS_ENTITY_TYPES = [
  "continent",
  "zone",
  "subzone",
  "location",
  "npc",
  "npc_spawn",
  "game_object",
  "game_object_spawn",
  "quest",
  "quest_objective",
  "quest_chain",
  "item",
  "instance",
  "instance_entrance",
  "boss",
  "flight_path",
  "resource_node",
  "resource_node_spawn",
  "poi",
] as const;

export type AtlasEntityType = (typeof ATLAS_ENTITY_TYPES)[number];

/** Branded string type so an AtlasId can't be silently confused with a raw string. */
export type AtlasId<T extends AtlasEntityType = AtlasEntityType> = string & {
  readonly __atlasEntityType: T;
};

export function formatAtlasId<T extends AtlasEntityType>(entityType: T, sequence: number): AtlasId<T> {
  if (!ATLAS_ENTITY_TYPES.includes(entityType)) {
    throw new Error(`Unknown atlas entity type: ${entityType}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Atlas ID sequence must be a positive integer, got ${sequence}`);
  }
  return `atlas_${entityType}_${String(sequence).padStart(6, "0")}` as AtlasId<T>;
}

export interface ParsedAtlasId {
  entityType: AtlasEntityType;
  sequence: number;
}

export function parseAtlasId(id: string): ParsedAtlasId {
  const match = /^atlas_([a-z_]+)_(\d{6,})$/.exec(id);
  if (!match) {
    throw new Error(`Not a valid atlas ID: ${id}`);
  }
  const [, entityType, sequenceStr] = match;
  if (!ATLAS_ENTITY_TYPES.includes(entityType as AtlasEntityType)) {
    throw new Error(`Not a valid atlas entity type in ID: ${id}`);
  }
  return { entityType: entityType as AtlasEntityType, sequence: Number.parseInt(sequenceStr, 10) };
}
