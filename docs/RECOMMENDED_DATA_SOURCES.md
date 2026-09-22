# Recommended Data Sources

Phase 1 supersedes `DATA_SOURCE_MATRIX.md` (Phase 0's source-level
comparison) with **field-level, table-level recommendations** validated
against live data this phase. Where Phase 0's conclusions held up, they're
cited, not repeated at length; where this phase corrected or deepened them,
that's called out explicitly.

## Per data category: confirmed primary source, with exact tables/fields

| Data category | Primary source | Exact table/mechanism (confirmed) | Confidence | Notes |
|---|---|---|---|---|
| Continent list | `wago_db2` | `Map` (75 rows confirmed) | High | |
| Zone / subzone hierarchy | `wago_db2` | `AreaTable` (`ParentAreaID`, 1,372 rows confirmed) | High | Cross-validated against QuestieDB's independent zone table for Burning Steppes (AreaID 46 agrees) |
| World-space zone bounds | `wago_db2` | `UiMapAssignment` (`Region_0..5`, confirmed real box for Burning Steppes) | High | Also the world↔UI-percent transform mechanism, see `COORDINATE_SYSTEM.md` |
| Quest existence/flags | `wago_db2` | `QuestV2`, `QuestInfo`, `QuestSort` (confirmed present, minimal fields) | High (existence only) | Confirmed this phase: **no quest narrative text found in any exportable table** — `QuestObjective.db2` exists in the client (CASC manifest) but has no wago.tools schema registered (a tooling gap, re-attempt with a different DB2 reader if text is needed) |
| Quest chains (named) | `wago_db2` | `QuestLine` + `QuestLineXQuest` (confirmed real names, e.g. "To Have Loved and Lost") | Medium | Chain-level naming only, not a substitute for ATT's richer per-quest prerequisite graph |
| Quest content (giver, coords, prerequisites, objectives) | **`att`** | `.contrib/.db/forever/` — **both** the active `zones/`/`dungeons & raids/` tree **and** `zzOLD/` (confirmed this phase: zzOLD is compiled into the shipped build and under active curation, not dead data) | High | MIT-licensed, richest available structured source; see `SOURCE_ATT.md` + this phase's ATT deep-dive |
| Quest map markers (POI) | `wago_db2` | `QuestPOIBlob` + `QuestPOIPoint` (confirmed present, but only ~22 distinct QuestIDs populated in all of Eastern Kingdoms, all newly-added-content IDs in the 91000-97000 range) | Low coverage | Not populated for ported Classic content — don't rely on this for Burning Steppes-style zones |
| NPC identity (name, type) | **`att`** (inline comments) | e.g. `qg = 14437, -- Gorzeeki Wildeyes` (confirmed real syntax) | Medium | **Confirmed: no DB2 source exists at all** — `Creature` table in this build holds only 178 vanity-pet rows (verified: "Hogger" returns zero matches). This is the single biggest correction to Phase 0 this phase produced. |
| NPC spawn positions | **none confirmed authoritative** | See `SPAWN_DATA_STRATEGY.md` | N/A | The core unresolved problem |
| GameObject definitions/positions | `wago_db2` | `GameObjects` (confirmed present, 1,514 rows total game-wide) | **Low, narrow** | Confirmed: 1,505 of 1,514 rows are `TypeID=5` road signposts. Burning Steppes' own 6 rows are all zone-boundary signs. **This table is not a general static-object catalog** — see `SPAWN_DATA_STRATEGY.md` for the real answer (ADT doodad parsing for static geometry; telemetry for interactive objects) |
| Instance ↔ continent map linkage | `wago_db2` | `Map` (`Directory`, `MapName_lang`) | High | |
| Instance ↔ outdoor-zone entrance | **not yet sourced** | Likely `AreaTrigger` (confirmed to carry `Pos_0/1/2` + radius/box — the standard mechanism for zone-transition/portal volumes) | Unconfirmed | Not queried for a specific instance this session — closable Phase 2 follow-up, tracked in `OPEN_QUESTIONS.md` |
| Boss/encounter listing | `wago_db2` | **`DungeonEncounter`, filtered by the real `Map.ID`** | High | **Confirmed correction**: do not use `LFGDungeons.MapID` for this join — confirmed unreliable (reports `MapID=0` for all three Blackrock instances tried). `DungeonEncounter` gave lore-accurate 14/21-boss lists for Blackrock Spire/Depths when filtered by the correct `Map.ID` (229/230) |
| Items | `wago_db2` | `Item` + `ItemSparse` (confirmed present, 31,675 / 19,171 rows) | High | |
| Vendors (inventory) | **not sourced by any investigated source** | — | Missing | No source this phase or Phase 0 supplies vendor stock/pricing for Forever |
| Flight paths | `wago_db2` | `TaxiNodes` (confirmed real, e.g. Burning Steppes' two named/positioned nodes) | High (nodes) / Missing (routes) | Route legality/cost between nodes not sourced this phase — likely `TaxiPath`/`TaxiPathNode`, not queried yet |
| Gathering nodes | **not sourced by any investigated source** | — | Missing | See `SPAWN_DATA_STRATEGY.md` — same long-term telemetry answer as NPC spawns |
| POIs (non-quest, non-settlement) | `wago_db2` | `AreaPOI` (confirmed present, but **zero rows for Burning Steppes**; its ~120 Eastern Kingdoms rows are all major-settlement icons) | Low/zone-dependent | Re-check per zone rather than assuming uniformly populated or absent |
| Map imagery / terrain | **not sourced yet — reproducible pipeline identified** | `wow.export` (extraction) → `WoWTools.Minimaps`/`World-of-MapCraft`-style tiling → `pmtiles` CLI/GDAL/`rio-pmtiles` (packing) | Feasible, unbuilt | See `MAP_ARCHITECTURE.md`. Forever's two custom continents (Dalaran City, Zephras Isle) need the Forever client's own files specifically — a stock Classic client won't have them |

## Corrections to Phase 0 findings, made explicit

1. **`Creature` is not the NPC roster.** Phase 0 (`SOURCE_WAGO.md`) noted
   `Creature` "has no position fields" and treated it as NPC *definition*
   data missing only positions. This phase's direct row inspection shows
   the table's 178 rows in this build are **entirely vanity/companion
   pets** — there is no generic monster roster in client DB2 at all, not
   even name/level/type for ordinary mobs. This is a stronger, more
   specific finding: the gap is NPC identity itself, not just NPC
   position.
2. **`JournalEncounter`/`JournalInstance`/`JournalTier`/`UiMapLink` absence
   is a wago.tools tooling gap, not proof the client lacks this data.**
   Phase 0 treated their 404s as confirming absence. This phase's full
   CASC file-manifest pull shows these `.db2` files **do exist** in the
   client; wago.tools simply has no registered CSV schema for them yet.
   Re-attempt with a different DB2 reader (e.g. a WoWDBDefs-aware tool) in
   Phase 2 if Journal/lore content becomes a priority.
3. **`ElliotWood/Forever` correction stands, reinforced.** Phase 0 already
   corrected the task brief's assumption that this repo was a map/data
   extractor (it's a combat simulator fork) — this phase found nothing to
   revise there.
4. **ATT's Eastern Kingdoms coverage is real, just organizationally
   unmigrated.** Phase 0 only checked `zones/kalimdor/` and didn't find
   Burning Steppes et al. This phase found them in `zzOLD/`, confirmed
   compiled into the shipped build, and confirmed under active curation
   (dated commits from the day before this research).

## What's now genuinely settled vs. still open

**Settled, high confidence**: zone/subzone hierarchy and world bounds
(DB2), quest content structure (ATT), boss listings (DB2's
`DungeonEncounter`), flight nodes (DB2's `TaxiNodes`), items (DB2).

**Still open, tracked in `OPEN_QUESTIONS.md`**: quest narrative text
location, instance entrance coordinates, flight route legality, NPC spawn
positions (the big one — full dedicated doc), vendor inventories, gathering
nodes, general POIs.
