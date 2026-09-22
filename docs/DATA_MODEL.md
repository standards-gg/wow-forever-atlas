# Data Model

Canonical Atlas entities and their relationships. This is the implementation-ready
model referenced by `GEOGRAPHIC_GRAPH.md` (the graph these entities form),
`COORDINATE_SYSTEM.md` (how positions are represented), `ENTITY_MATCHING.md`
(how records from different sources resolve to one of these), and
`DATA_PROVENANCE.md` (how every fact is attributed).

**Non-negotiable rule, unchanged from Phase 0:** every entity below has an
Atlas-owned primary key (a ULID or UUID, generator TBD in Phase 2 — not
decided here since it's an implementation detail, not an architecture one).
Blizzard IDs, ATT IDs, QuestieDB IDs, and any future telemetry-assigned IDs
are **never** primary keys. They live in a `external_reference` table (see
below) keyed by `(atlas_entity_type, atlas_id, source, source_id)`.

## Why this matters more than it might first appear

Phase 1 research surfaced a concrete, real example of why this rule is not
academic: Burning Steppes has **two different, both-official Blizzard ID
schemes** for the same zone — the legacy `AreaTable.ID = 46` (used by
QuestieDB's `zoneIds.lua`, and by any Classic-era tooling) and the modern
`UiMapID = 1428` (used by `UiMapAssignment`, and — per ATT's own documented
convention of `MAP.KALIMDOR = 1414`-style constants, which are UiMapIDs, not
AreaIDs — almost certainly what ATT's `MAP.BURNING_STEPPES` constant equals).
Neither is "more canonical" than the other; both are legitimate external IDs
for the same zone, from the same vendor (Blizzard), used by different tools.
If either one were used as our primary key, we'd have picked a side in a
distinction that doesn't need picking — which is exactly the failure mode
this project's own founding principle exists to prevent.

## `external_reference` (cross-reference table)

| Field | Type | Notes |
|---|---|---|
| `atlas_entity_type` | enum | e.g. `Zone`, `NPC`, `Quest` |
| `atlas_id` | Atlas ID | FK to the canonical entity |
| `source` | enum | `wago_db2`, `att`, `questiedb`, `forever_quest_pins`, `atlas_telemetry`, `manual_curation`, `hyjal_observed` (see caveat below) |
| `source_id_type` | string | e.g. `AreaTable.ID`, `UiMapID`, `QuestID`, `NpcID` — the *namespace*, not just "the ID," per the Burning Steppes example above |
| `source_id` | string | the actual external ID |
| `source_build` | string, nullable | client/data build this reference was observed against (e.g. `1.60.1.69913`, an ATT commit SHA) |
| `confidence` | enum | `verified`, `inferred`, `unverified` (see `ENTITY_MATCHING.md`) |
| `recorded_at` | timestamp | when this cross-reference was captured |

**Caveat on `hyjal_observed`:** Hyjal is a UX/architecture reference, not a
data source (per `DATA_SOURCE_MATRIX.md`) — we do not import its data. This
source enum value exists only in case a future Phase explicitly decides to
cross-check our own place names/IDs against Hyjal's public `manifest.json`
place list for QA purposes; it does not imply routine ingestion.

## Canonical entities

### `Continent`
Top-level map (`Map.ID` in DB2 terms — e.g. Eastern Kingdoms = 0, Kalimdor =
1, plus Forever-custom continents Dalaran City = 2980, Zephras Isle = 2991
per Hyjal's own public metadata). Fields: `atlas_id`, `name`, `directory`
(client-internal name, for reference), `is_custom_forever_content` (bool).

### `Zone`
A top-level area within a continent (`AreaTable.ParentAreaID = 0`). Fields:
`atlas_id`, `continent_id` (FK), `name`, `level_range_min/max`,
`faction_hostility` (per Freier Bund's zone stats box pattern — worth
carrying since it's genuinely useful "what's around me" context), `world_bounds`
(see `COORDINATE_SYSTEM.md` — the `UiMapAssignment.Region_0..5` box).

### `Subzone`
A named area nested inside a `Zone` (`AreaTable.ParentAreaID = <parent
zone's AreaID>`). Confirmed real example: Burning Steppes (AreaID 46) has
at least 13 subzones per QuestieDB's `areaIdToUiMapId.lua`/
`subZoneToParentZone.lua` (Dreadmaul Rock, Ruins of Thaurissan, Flame Crest,
Blackrock Stronghold, The Pillar of Ash, **Blackrock Mountain**, Altar of
Storms, Blackrock Pass, Morgan's Vigil, Slither Rock, Terror Wing Path,
Draco'dar, Poacher's Den). Fields: `atlas_id`, `zone_id` (FK), `name`.
**Note**: a `Subzone` can itself be the containing area for an `Instance`
entrance (Blackrock Mountain contains Blackrock Depths/Spire entrances) —
see `GEOGRAPHIC_GRAPH.md` for how containment composes with instance entry.
**Note on cross-zone subzones**: Blackrock Mountain is confirmed to exist as
*two separate* `AreaTable` rows — one under Burning Steppes (AreaID 254) and
one under Searing Gorge (AreaID 1445) — because the real mountain range
straddles both zones. Model these as two distinct `Subzone` rows (not a
single subzone with two parents), each linked to its own containing `Zone`,
matching Blizzard's own data model rather than inventing a many-to-many
containment relationship that doesn't otherwise exist in this schema.

### `Location`
A single, reusable point-in-the-world record. **This is the "placement"
half of the canonical entity/placement split** modeled on Freier Bund's own
data (confirmed in `SOURCE_FREIERBUND.md` §4: 737 monster *pins* for only
108 unique monster *entities* — placement and identity are different
concerns). Fields: `atlas_id`, `coordinate_space` (see `COORDINATE_SYSTEM.md`),
`x`, `y`, `z` (nullable), `zone_id` (FK, nullable if unresolved),
`subzone_id` (FK, nullable). A `Location` has no meaning on its own — it
only matters via what points at it (an `NPCSpawn`, a `GameObjectSpawn`, an
`InstanceEntrance`, a `POI`, a `FlightPath` node).

### `NPC`
A named creature/monster/vendor/quest-giver *definition* (what it is, not
where it is). Fields: `atlas_id`, `name`, `npc_type` (enum: `quest_giver`,
`vendor`, `trainer`, `hostile`, `friendly`, `boss` — non-exclusive, an NPC
can be both quest-giver and vendor), `is_boss` (bool, links to `Boss` below
when true). **Confirmed material gap (Phase 1 DB2 pass):** in the current
Forever beta build, the `Creature` DB2 table holds only 178 vanity/companion
pet rows (verified: searching for "Hogger" — the single most famous Classic
mob — returns zero matches). **There is no client-side NPC/monster roster
at all in this build**, not merely no spawn positions. NPC identity itself
(name, type) has to come from community sources (ATT's inline comments next
to `qg=` IDs, QuestieDB's Npc entity table) or our own telemetry, not from
Blizzard's client data. See `SPAWN_DATA_STRATEGY.md`.

### `NPCSpawn`
A specific place an `NPC` can be found. Fields: `atlas_id`, `npc_id` (FK),
`location_id` (FK), `is_patrol` (bool), `patrol_path` (nullable, array of
`Location` FKs, for the "static point + heuristic second point" pattern
`forever-quest-markers` already uses for patrols per `SOURCE_ATT.md` §4).
One `NPC` → many `NPCSpawn` (the many-to-one pattern Freier Bund
demonstrates directly).

### `GameObject`
A definition for a static or interactive world object (a door, a chest, a
lever, a resource node's *type* if not modeled separately — see
`ResourceNode` below for why gathering nodes get their own entity instead).
Fields: `atlas_id`, `name`, `object_type` (enum, mirrors Blizzard's own
`GameObjects.TypeID` loosely: `door`, `chest`, `quest_object`, `signpost`,
`resource_node_marker`, `other`). **Confirmed finding**: in this build,
Blizzard's own `GameObjects` DB2 table (1,514 rows total, entire game) is
overwhelmingly (1,505 of 1,514 rows) `TypeID=5` road signposts — Burning
Steppes' own 6 rows are all zone-boundary signs. This table is **not** a
general static-object catalog; do not expect it to populate this entity for
anything beyond signposts.

### `GameObjectSpawn`
Analogous to `NPCSpawn`: `atlas_id`, `gameobject_id` (FK), `location_id`
(FK).

### `Quest`
Fields: `atlas_id`, `name`, `level_requirement_min/max`, `faction`
(`alliance`/`horde`/`both`), `is_repeatable`, `is_daily`/`is_weekly`/etc.
(mirroring the boolean-flag set confirmed present in Forever Quest Pins'
output schema — `isBreadcrumb`, `isDaily`, `isWeekly`, `isYearly`,
`isMonthly`, `isWarEffort`, `isAttunement`, `isInstanceQuest`), `given_by`
(FK to `NPC`, nullable — some quests are item-started per Phase 0's
`SOURCE_ATT.md` finding that item-started quests without a coordinate get
omitted from pins), `turned_in_at` (FK to `NPC`, nullable — **confirmed
this is frequently the same NPC as `given_by`, but Freier Bund's own data
model shows it is sometimes different and should always be a distinct
field, not assumed equal**).

### `QuestObjective`
A single step within a `Quest`. Fields: `atlas_id`, `quest_id` (FK),
`order_index`, `objective_type` (enum: `kill`, `collect_item`,
`interact_object`, `interact_npc`, `event`, `spell`), `target_npc_id` (FK,
nullable), `target_gameobject_id` (FK, nullable), `target_item_id` (FK,
nullable), `location_id` (FK, nullable — objectives can have their own
coordinate distinct from the quest-giver's, per ATT's `objective()` records
confirmed in `SOURCE_ATT.md` §6).

### `QuestChain`
A named, ordered sequence of quests (mirrors ATT's `QuestLine`/
`QuestLineXQuest` DB2 pair, confirmed present this session — real chain
names like "To Have Loved and Lost," linked to member `QuestID`s via
`OrderIndex`). Fields: `atlas_id`, `name`, `member_quest_ids` (ordered array
of `Quest` FKs). **Note**: this is a materially different mechanism from
`QuestPrerequisite` below — a `QuestChain` is a named, curated grouping;
prerequisites are a raw dependency graph. Both should be modeled; they are
not redundant (Freier Bund's own linear "Questfolge" display is really a
prerequisite-chain *walk*, not necessarily a named `QuestLine`).

### `QuestPrerequisite`
Not a standalone entity with its own table necessarily, but a relationship:
`Quest.source_quests` (array of `Quest` FKs — confirmed real ATT field,
e.g. `q(7630, {sourceQuests = {7626,7627,7628}, ...})`), plus
`Quest.source_quest_num_required` (int — confirmed real Forever Quest Pins
output field, for "need N of the above" logic), plus `Quest.alt_quests`
(array of FKs — faction-mirrored/equivalent quest variants, confirmed real).

### `Item`
Fields: `atlas_id`, `name`, `item_class`, `item_subclass`, `icon` (from
DB2's confirmed-present `Item`/`ItemSparse` pair).

### `Vendor`
Not a separate identity from `NPC` — a **role** an `NPC` plays. Model as
`NPC.npc_type` including `vendor`, plus a separate `VendorInventory` join
table (`npc_id`, `item_id`, `price`, `stock`) if/when inventory data is
sourced (currently **MISSING** for Forever per the vertical slice — no
source investigated this phase supplies vendor inventories at all).

### `Instance`
A dungeon or raid. Fields: `atlas_id`, `name`, `instance_type` (`dungeon`/
`raid`), `map_id` (the Blizzard `Map.ID` this instance occupies — confirmed
real and distinct per instance, e.g. Blackrock Spire = 229, Blackrock Depths
= 230), `is_forever_original` (bool — true for `hall of thanes`/`ruins of
lordaeron`, confirmed genuinely new per `SOURCE_ATT.md` and Phase 1's ATT
deep-dive).

### `InstanceEntrance`
Fields: `atlas_id`, `instance_id` (FK), `location_id` (FK — the entrance's
position in the outdoor world). **Confirmed gap**: this phase did not pull
an actual entrance coordinate for Blackrock Depths/Spire (the natural
candidate mechanism is `AreaTrigger`, confirmed to carry `Pos_0/1/2` +
`Radius`/box dimensions, but it wasn't queried for this specific case this
session) — tracked in `OPEN_QUESTIONS.md`. Hyjal's own UI (confirmed,
`SOURCE_HYJAL.md` §6-7) explicitly models the case where an instance has
*no* resolvable entrance pin yet ("Location unavailable") — mirror that as
an allowed, non-error state: `InstanceEntrance.location_id` is nullable.

### `Boss`
Fields: `atlas_id`, `instance_id` (FK), `name`, `order_index`. **Confirmed
high-confidence source**: DB2's `DungeonEncounter` table, filtered by the
correct `Map.ID` (not `LFGDungeons.MapID`, which is confirmed unreliable —
see `RECOMMENDED_DATA_SOURCES.md`), returned real, lore-accurate boss lists
for both Blackrock Spire (14 bosses) and Blackrock Depths (21
bosses/encounters), directly cross-checked against known Classic content.

### `FlightPath`
A taxi node. Fields: `atlas_id`, `name`, `location_id` (FK), `faction`
(`alliance`/`horde`/`both`). **Confirmed real source**: DB2's `TaxiNodes`
table, e.g. Burning Steppes' two real, confirmed nodes: "Flame Crest,
Burning Steppes" (Horde) and "Morgan's Vigil, Burning Steppes" (Alliance),
both with real world coordinates falling inside the zone's confirmed
bounding box. `FlightPathConnection` (a separate join table: `from_node_id`,
`to_node_id`) is not yet sourced this phase (DB2 doesn't appear to encode
route legality/cost directly in `TaxiNodes` — tracked as an open question).

### `ResourceNode`
A gathering node (herb/ore/fish). Modeled as its own entity, not folded
into `GameObject`, because (a) Freier Bund's own data explicitly treats
gathering as second-class/prose-only content and this project's stated
UX principle is to *not* repeat that mistake (`SOURCE_FREIERBUND.md`'s "UX
Patterns Worth Preserving" section says exactly this), and (b) the
long-term data source for this (GatherMate2-style telemetry, per
`SPAWN_DATA_STRATEGY.md`) is structurally the same telemetry pipeline as
`NPCSpawn`/`GameObjectSpawn`, so keeping it a first-class, symmetrically-
modeled entity (with its own `Location` via `ResourceNodeSpawn`) costs
nothing and avoids a future migration. Fields: `atlas_id`, `resource_type`
(`herb`/`ore`/`fishing_pool`), `name` (e.g. "Mithril Deposit").
`ResourceNodeSpawn`: `atlas_id`, `resource_node_id` (FK), `location_id`
(FK). **Confirmed status**: zero coordinate data found for this category
anywhere this phase — MISSING, see the vertical slice in `PHASE_1_REPORT.md`.

### `POI`
A point of interest not otherwise covered (graveyards/spirit healers,
scenic landmarks, etc., per Freier Bund's "Ort/POI" category). Fields:
`atlas_id`, `name`, `poi_type`, `location_id` (FK). **Confirmed status**:
DB2's `AreaPOI` table exists and does carry positions, but returned **zero
rows** for Burning Steppes (AreaID 46) specifically — its ~120 Eastern
Kingdoms rows are all major-settlement icons (Goldshire, Darkshire, etc.),
not general zone POIs. MISSING for this zone; may be populated for
higher-traffic zones — worth re-checking per-zone rather than assuming
uniformly absent.

### `Landmark`
Not in the master brief's explicit entity list, but added here because
Freier Bund's data model depends on it structurally (`SOURCE_FREIERBUND.md`
§4: Landmark is a first-class entity type — sub-areas, camps, dungeon/raid
entrance zones, towers, caves — distinct from `Subzone` in that a Landmark
is a *point of interest with breadcrumb significance*, not necessarily a
formal `AreaTable` row). **Decision**: model `Landmark` as a specialization
of `Subzone` where `Subzone.is_landmark = true`, rather than a fully
separate entity — Blackrock Mountain is simultaneously a real `AreaTable`
subzone row *and* functions as a Landmark in the Freier-Bund sense (it's
the containing node for instance entrances in the breadcrumb hierarchy).
Avoids a redundant parallel hierarchy.

## Relationship summary

See `GEOGRAPHIC_GRAPH.md` for the full graph and containment-hierarchy
diagram. Quick reference:

- `Continent 1―N Zone 1―N Subzone` (containment)
- `Zone/Subzone 1―N Location` (a location belongs to exactly one
  zone/subzone, resolved at ingestion time from its coordinates — see
  `COORDINATE_SYSTEM.md`)
- `NPC 1―N NPCSpawn N―1 Location`
- `GameObject 1―N GameObjectSpawn N―1 Location`
- `ResourceNode 1―N ResourceNodeSpawn N―1 Location`
- `Quest N―1 NPC` (given_by), `Quest N―1 NPC` (turned_in_at, distinct FK)
- `Quest 1―N QuestObjective`, each optionally targeting an `NPC`,
  `GameObject`, or `Item`, and optionally its own `Location`
- `Quest N―N Quest` (self-referential, via `source_quests`/`alt_quests`)
- `QuestChain 1―N Quest` (ordered membership, distinct from the
  prerequisite graph above)
- `Instance 1―N Boss`, `Instance 1―N InstanceEntrance N―1 Location`
- `FlightPath N―1 Location`, `FlightPath N―N FlightPath` (route legality —
  not yet sourced)
- `Zone N―N Zone` via a shared `Subzone`/`Landmark` (Freier Bund's own
  "adjacent zone" mechanism, confirmed as the *only* zone-to-zone
  navigation signal it has — worth reproducing as a derived relationship,
  not a hand-maintained adjacency table)
