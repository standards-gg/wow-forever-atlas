/**
 * Canonical entity types, per docs/DATA_MODEL.md. These are the shapes
 * importers normalize into and the API serves — never a source's native
 * shape (ATT's Lua tables, DB2's CSV rows, etc.) directly.
 */
import type { AtlasId } from "./atlas-id.js";
import type { CoordinateSpace } from "./coordinates.js";

// ---- Provenance (docs/DATA_PROVENANCE.md) ----------------------------------

export type ProvenanceSource =
  | "wago_db2"
  | "att"
  | "questiedb"
  | "forever_quest_pins"
  | "atlas_telemetry"
  | "manual_curation";

export type ProvenanceConfidence = "verified" | "inferred" | "unverified";

export interface ProvenanceRecord {
  source: ProvenanceSource;
  sourceUrl?: string;
  sourceIdType: string; // e.g. "QuestID", "AreaTable.ID", "UiMapID" — the namespace, not just the id
  sourceId: string;
  sourceVersion?: string; // e.g. a git commit SHA
  buildNumber?: string; // e.g. "1.60.1.69913"
  importedAt: string; // ISO 8601
  lastVerifiedAt?: string;
  confidence: ProvenanceConfidence;
  transformation?: string; // e.g. "UI_MAP_TRANSFORM -> WORLD_SPACE via UiMapAssignment AreaID=46"
  attributionRequired?: boolean;
  attributionText?: string;
}

export interface ExternalReference {
  atlasEntityType: string;
  atlasId: AtlasId;
  source: ProvenanceSource;
  sourceIdType: string;
  sourceId: string;
  sourceBuild?: string;
  confidence: ProvenanceConfidence;
  recordedAt: string;
}

/** Common fields every canonical entity carries. */
export interface AtlasEntityBase {
  atlasId: AtlasId;
  provenance: ProvenanceRecord[];
}

// ---- Geography --------------------------------------------------------------

export interface Continent extends AtlasEntityBase {
  atlasId: AtlasId<"continent">;
  name: string;
  directory?: string;
  isCustomForeverContent: boolean;
}

export interface Zone extends AtlasEntityBase {
  atlasId: AtlasId<"zone">;
  continentId: AtlasId<"continent">;
  name: string;
  levelRangeMin?: number;
  levelRangeMax?: number;
  factionHostility?: string;
  worldBounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface Subzone extends AtlasEntityBase {
  atlasId: AtlasId<"subzone">;
  zoneId: AtlasId<"zone">;
  name: string;
  isLandmark: boolean;
  /** For a shared landmark like Blackrock Mountain, the *other* zone it also belongs to. */
  sharedWithZoneId?: AtlasId<"zone">;
}

export interface Location extends AtlasEntityBase {
  atlasId: AtlasId<"location">;
  coordinateSpace: CoordinateSpace;
  x: number;
  y: number;
  z?: number;
  zoneId?: AtlasId<"zone">;
  subzoneId?: AtlasId<"subzone">;
}

// ---- NPCs / objects ----------------------------------------------------------

export type NpcType = "quest_giver" | "vendor" | "trainer" | "hostile" | "friendly" | "boss";

export interface Npc extends AtlasEntityBase {
  atlasId: AtlasId<"npc">;
  name: string;
  npcTypes: NpcType[];
  isBoss: boolean;
}

export interface NpcSpawn extends AtlasEntityBase {
  atlasId: AtlasId<"npc_spawn">;
  npcId: AtlasId<"npc">;
  locationId: AtlasId<"location">;
  isPatrol: boolean;
  patrolPathLocationIds?: AtlasId<"location">[];
}

export type GameObjectType =
  | "door"
  | "chest"
  | "quest_object"
  | "signpost"
  | "resource_node_marker"
  | "other";

export interface GameObject extends AtlasEntityBase {
  atlasId: AtlasId<"game_object">;
  name: string;
  objectType: GameObjectType;
}

export interface GameObjectSpawn extends AtlasEntityBase {
  atlasId: AtlasId<"game_object_spawn">;
  gameObjectId: AtlasId<"game_object">;
  locationId: AtlasId<"location">;
}

// ---- Quests -------------------------------------------------------------------

export type QuestObjectiveType = "kill" | "collect_item" | "interact_object" | "interact_npc" | "event" | "spell";

export interface QuestObjective extends AtlasEntityBase {
  atlasId: AtlasId<"quest_objective">;
  questId: AtlasId<"quest">;
  orderIndex: number;
  objectiveType: QuestObjectiveType;
  targetNpcId?: AtlasId<"npc">;
  targetGameObjectId?: AtlasId<"game_object">;
  targetItemId?: AtlasId<"item">;
  locationId?: AtlasId<"location">;
  description?: string;
}

export interface Quest extends AtlasEntityBase {
  atlasId: AtlasId<"quest">;
  name: string;
  levelRequirementMin?: number;
  levelRequirementMax?: number;
  faction: "alliance" | "horde" | "both";
  isRepeatable: boolean;
  isDaily: boolean;
  isWeekly: boolean;
  isMonthly: boolean;
  isYearly: boolean;
  isWarEffort: boolean;
  isAttunement: boolean;
  isInstanceQuest: boolean;
  isBreadcrumb: boolean;
  givenByNpcId?: AtlasId<"npc">;
  turnedInAtNpcId?: AtlasId<"npc">;
  sourceQuestIds: AtlasId<"quest">[];
  sourceQuestNumRequired?: number;
  altQuestIds: AtlasId<"quest">[];
  classes?: number[];
  races?: number[];
}

export interface QuestChain extends AtlasEntityBase {
  atlasId: AtlasId<"quest_chain">;
  name: string;
  memberQuestIds: AtlasId<"quest">[]; // ordered
}

// ---- Items --------------------------------------------------------------------

export interface Item extends AtlasEntityBase {
  atlasId: AtlasId<"item">;
  name: string;
  itemClass?: number;
  itemSubclass?: number;
  icon?: string;
}

// ---- Instances ------------------------------------------------------------------

export interface Instance extends AtlasEntityBase {
  atlasId: AtlasId<"instance">;
  name: string;
  instanceType: "dungeon" | "raid";
  mapId: number; // Blizzard Map.ID, confirmed real and distinct per instance
  isForeverOriginal: boolean;
}

export interface InstanceEntrance extends AtlasEntityBase {
  atlasId: AtlasId<"instance_entrance">;
  instanceId: AtlasId<"instance">;
  locationId?: AtlasId<"location">; // nullable: Hyjal's own confirmed "Location unavailable" pattern
}

export interface Boss extends AtlasEntityBase {
  atlasId: AtlasId<"boss">;
  instanceId: AtlasId<"instance">;
  name: string;
  orderIndex: number;
}

// ---- Travel ---------------------------------------------------------------------

export interface FlightPath extends AtlasEntityBase {
  atlasId: AtlasId<"flight_path">;
  name: string;
  locationId: AtlasId<"location">;
  faction: "alliance" | "horde" | "both";
}

export type ResourceType = "herb" | "ore" | "fishing_pool";

export interface ResourceNode extends AtlasEntityBase {
  atlasId: AtlasId<"resource_node">;
  resourceType: ResourceType;
  name: string;
}

export interface ResourceNodeSpawn extends AtlasEntityBase {
  atlasId: AtlasId<"resource_node_spawn">;
  resourceNodeId: AtlasId<"resource_node">;
  locationId: AtlasId<"location">;
}

export interface Poi extends AtlasEntityBase {
  atlasId: AtlasId<"poi">;
  name: string;
  poiType: string;
  locationId: AtlasId<"location">;
}
