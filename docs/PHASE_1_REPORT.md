# Phase 1 Report — Data Strategy & Technical Validation

Research date: 2026-09-22. This report synthesizes five parallel deep-
technical validation passes (DB2 schema, AllTheThings + Forever Quest Pins,
QuestieDB, the spawn-position problem, and a Hyjal tile/projection
supplement) plus the Burning Steppes vertical slice, into the documents
listed below. It answers the brief's final success criterion at the end.

## Documents produced/updated this phase

- `RECOMMENDED_DATA_SOURCES.md` — field/table-level source recommendations,
  superseding Phase 0's `DATA_SOURCE_MATRIX.md`
- `SPAWN_DATA_STRATEGY.md` — the centerpiece: the NPC/GameObject
  spawn-position problem, fully evaluated and answered with a phased plan
- `DATA_MODEL.md` — canonical entities, Atlas-owned IDs, cross-reference
  design
- `GEOGRAPHIC_GRAPH.md` — the entity graph, containment hierarchy, and
  "what is around me?" query shape
- `COORDINATE_SYSTEM.md` — the multiple coordinate spaces, reconciled, with
  a worked real example
- `ENTITY_MATCHING.md` — deterministic matching tiers, with real confirmed
  examples of both agreement (Burning Steppes' dual Blizzard ID schemes)
  and conflict (`LFGDungeons.MapID` vs. `DungeonEncounter.MapID`)
- `DATA_PROVENANCE.md` — the provenance model and the full A–F license
  review per source
- `INGESTION_ARCHITECTURE.md` — pipeline stages, build pinning, versioning,
  and how confirmed real churn (ATT's zzOLD graduations) is handled
- `MAP_ARCHITECTURE.md` — the map-rendering architecture, informed by a
  deep, format-level validation of Hyjal's own approach
- `OPEN_QUESTIONS.md` — updated: Phase 0 items resolved or deepened, new
  Phase 1 items added

## Headline findings (things that materially changed understanding)

1. **The `Creature` DB2 table does not contain the NPC/monster roster at
   all** in this build — it holds only 178 vanity/companion pet rows
   (confirmed: searching for "Hogger" returns zero matches). This is a
   stronger, more specific version of Phase 0's "no spawn positions"
   finding: NPC *identity itself* is absent from client data, not just
   position.
2. **`GameObjects` DB2 is confirmed narrow** — 1,505 of 1,514 rows
   game-wide are road signposts. It is not a general static-object
   placement table.
3. **ADT/WDT files are structurally incapable of encoding NPC spawns**,
   confirmed against the public ADT format spec — this closes the
   question definitively rather than leaving it as an effort/tooling
   question.
4. **A live, directly reusable precedent for solving the spawn-position
   problem exists right now**: `Questie/QuestieTrace`, an actively-pushed
   addon with a working consent/privacy/export telemetry pipeline, built
   by the Questie team for exactly this purpose.
5. **ATT's Eastern Kingdoms coverage (Burning Steppes, Searing Gorge,
   Blackrock Mountain) is real** — Phase 0 missed it because it lives in
   `zzOLD/`, which is confirmed **not** dead data: it's compiled into the
   shipped build and under active, dated human+AI curation (pruning
   commits from the day before this research).
6. **`LFGDungeons.MapID` is confirmed unreliable** for instance↔map
   linkage (reports `0` for all three Blackrock instances tried);
   `DungeonEncounter.MapID`, cross-checked against real Map IDs, gave
   lore-accurate boss lists and is the correct join to use instead.
7. **Burning Steppes' two independent Blizzard ID schemes (`AreaTable.ID
   = 46`, `UiMapID = 1428`) are each independently corroborated by two
   unrelated sources** (Wago DB2 and QuestieDB) — a real, concrete example
   of `ENTITY_MATCHING.md`'s strongest automatic-matching tier working as
   designed.
8. **Hyjal's PMTiles archive's own public metadata block states its
   coordinate system outright** ("WoW local 64x64 ADT grid... not
   geographic locations"), directly confirming this project's
   independently-derived `COORDINATE_SYSTEM.md` design without needing to
   reverse-engineer it, and correcting Phase 0's guess that each map has
   its own archive (they share one, addressed by a `slot` index).

## Burning Steppes vertical slice — data-gap classification

Per the brief's requirement: every category classified as **AVAILABLE**,
**PARTIALLY AVAILABLE**, **MISSING**, or **REQUIRES MANUAL CURATION**,
based on real data pulled this phase (not assumption).

| Category | Status | Evidence |
|---|---|---|
| Zone (existence, bounds, continent) | **AVAILABLE** | `AreaTable.ID=46`, `UiMapAssignment` world bounds confirmed exact, `Map.ID=0` (Eastern Kingdoms) |
| Subzones | **PARTIALLY AVAILABLE** | 13 subzones known via QuestieDB's reference tables (license-encumbered — design reference only); not yet independently re-derived from `AreaTable.ParentAreaID=46` directly (tracked in `OPEN_QUESTIONS.md` #13) |
| Map geometry / imagery | **MISSING** (but a concrete, reproducible pipeline is identified, not blocked on research) | No imagery extracted yet; `MAP_ARCHITECTURE.md` defines a real path (`wow.export` → tiling → `pmtiles`) |
| NPC identity (name/type) | **PARTIALLY AVAILABLE** | Confirmed absent from DB2 entirely (`Creature` = vanity pets only); available only via ATT's inline name comments next to `qg=`/`qi=` IDs for quest-related NPCs — general ambient-mob roster identity is **MISSING** |
| NPC spawn positions | **PARTIALLY AVAILABLE** (quest-givers) / **MISSING** (ambient mobs) | ATT's `coord` fields cover quest-givers/objective targets (22+36=58 quest records across Burning Steppes+Searing Gorge's ATT files); general mob spawns confirmed absent from every source investigated — see `SPAWN_DATA_STRATEGY.md` |
| GameObjects (static world objects) | **MISSING** | DB2 gives only 6 road-signpost rows for this zone; no other source investigated supplies interactive/decorative object placement |
| Quest givers | **PARTIALLY AVAILABLE** | ATT's `zzOLD` Burning Steppes.lua (22 quests) + Searing Gorge.lua (36 quests), confirmed real records with `qg`/`coord` fields |
| Quest objectives | **PARTIALLY AVAILABLE** | ATT's `objective()` records structurally support this; not individually enumerated for every Burning Steppes quest this session, but the mechanism is confirmed present and parseable |
| Quest turn-ins | **PARTIALLY AVAILABLE** | Present in some records; not uniformly structured as a distinct field from quest-giver across all quests (matches Phase 0's Freier Bund finding that turn-in is often prose-only even in a mature reference implementation) |
| Quest chains/prerequisites | **AVAILABLE** | ATT's `sourceQuests`/`altQuests` fields confirmed real and directly readable (e.g. `q(7630).sourceQuests = {7626,7627,7628}`) |
| Instances (Blackrock Depths/Spire) | **AVAILABLE** (definition) | Real `Map.ID`s confirmed (229/230), correctly linked via `DungeonEncounter` |
| Instance entrances (world coordinate) | **MISSING** (not yet pulled, likely sourceable) | `AreaTrigger` is the probable mechanism (confirmed to carry positions); not queried for this specific case — see `OPEN_QUESTIONS.md` #9 |
| Bosses | **AVAILABLE** | `DungeonEncounter` confirmed lore-accurate: 14 bosses (Blackrock Spire), 21 (Blackrock Depths) |
| Vendors | **MISSING** | No source investigated in Phase 0 or Phase 1 supplies vendor identity, location, or inventory for Forever |
| Flight paths (nodes) | **AVAILABLE** | `TaxiNodes` confirmed: 2 real, named, positioned nodes (Flame Crest/Horde, Morgan's Vigil/Alliance) |
| Flight paths (routes) | **MISSING** | Node-to-node connectivity/cost not sourced this phase |
| Gathering nodes | **MISSING** | Zero coordinate data from any source; expected long-term telemetry solution, same as ambient NPC spawns |
| POIs (non-quest, non-settlement) | **MISSING** | `AreaPOI` confirmed present as a table but returned zero rows for this zone specifically |
| Discovery points (exploration achievements) | **AVAILABLE** | Confirmed present via ATT's `ach()` references (e.g. "Explore Burning Steppes") + DB2's `Achievement` table (confirmed present in Phase 0) |

**Net read on the vertical slice**: zone/quest-structure/boss data is in
good shape; the entire spawn-position layer (NPCs, GameObjects, gathering
nodes, most POIs) is the confirmed, real gap this whole phase was built to
surface — and it now has a concrete, phased plan rather than an open
question.

## Final decision matrix

| # | Question | Decision | Evidence | Confidence |
|---|---|---|---|---|
| 1 | Primary Forever data source? | AllTheThings (`.contrib/.db/forever/`, incl. `zzOLD/`) for structured content; wago.tools DB2 for zone/map/boss reference data | `RECOMMENDED_DATA_SOURCES.md` | High |
| 2 | Primary quest source? | AllTheThings | Confirmed MIT-licensed, richest structured quest data, actively curated | High |
| 3 | Primary geography source? | wago.tools (`AreaTable`, `UiMapAssignment`, `Map`) | Confirmed complete/consistent for Burning Steppes | High |
| 4 | Primary coordinate source? | wago.tools (`UiMapAssignment`) for the world↔UI transform; raw `WORLD_SPACE` values from `AreaPOI`/`GameObjects`/`TaxiNodes`/`AreaTrigger` | `COORDINATE_SYSTEM.md`, worked example verified | High |
| 5 | NPC definition source? | **None fully authoritative** — ATT inline comments (partial, quest-NPCs only) as best available | `Creature` table confirmed to hold only vanity pets | High confidence in the gap; low confidence in any current source |
| 6 | NPC spawn-position source? | Phased: ATT bootstrap → manual Burning Steppes pilot → `QuestieTrace`-modeled companion addon (long-term) | `SPAWN_DATA_STRATEGY.md` | High (on the plan); the underlying gap remains real |
| 7 | GameObject source? | Static geometry: ADT doodad/WMO parsing (feasible, unbuilt); interactive objects: companion telemetry (long-term) | Confirmed DB2 `GameObjects` is narrow (signposts only); ADT confirmed capable of static geometry only | High |
| 8 | Instance/raid source? | wago.tools `Map` + `DungeonEncounter` (not `LFGDungeons` for map linkage) | Confirmed accurate against real Blackrock content | High |
| 9 | Boss source? | wago.tools `DungeonEncounter`, filtered by the correct `Map.ID` | Confirmed lore-accurate (14/21 bosses) | High |
| 10 | Gathering node source? | None yet — same long-term companion-telemetry answer as NPC spawns | Zero data found from any investigated source | High confidence in the gap |
| 11 | Flight-path source? | wago.tools `TaxiNodes` for nodes; route/cost source still open | Confirmed real, positioned nodes for Burning Steppes | High (nodes) / open (routes) |
| 12 | Map-rendering architecture? | **Recommended**: MapLibre GL JS over a self-produced PMTiles archive (Hyjal-pattern static architecture); three.js/3D as a later enhancement, not v1 | `MAP_ARCHITECTURE.md` | Medium — a recommendation pending explicit sign-off (`OPEN_QUESTIONS.md` #4) |
| 13 | Canonical coordinate system? | `WORLD_SPACE` (raw client coordinates), with exact, lossless conversion to/from the 0–100 UI-percent system via `UiMapAssignment` | `COORDINATE_SYSTEM.md`, matches Hyjal's own confirmed choice and QuestieDB's own internal mechanism | High |
| 14 | Versioning strategy? | Pin every ingestion run to `(wago_build_number, att_commit_sha)`; append-only provenance; change detection keyed on entity ID, not file path | `INGESTION_ARCHITECTURE.md` | High — directly informed by confirmed real churn (ATT zzOLD graduations within a single day) |
| 15 | Provenance strategy? | Per-field provenance records, multi-source-per-entity, never-overwrite | `DATA_PROVENANCE.md` | High |
| 16 | Entity matching strategy? | Six-tier deterministic priority, per-entity-type keys, explicit review queue for ambiguity | `ENTITY_MATCHING.md`, with real confirmed agreement and conflict examples | High |
| 17 | Missing-data strategy? | Explicit null/unresolved states, never invented values (matches Hyjal's own confirmed "Location unavailable" pattern) | `DATA_MODEL.md`, `MAP_ARCHITECTURE.md` | High |
| 18 | Manual curation strategy? | Bounded to 1-3 pilot/launch zones (Burning Steppes first); explicitly not a world-scale strategy | `SPAWN_DATA_STRATEGY.md`, cost-estimated against Freier Bund's real per-zone entity census | High |
| 19 | Legal/licensing risks? | AllTheThings: clean (MIT). wago.tools and QuestieDB: **UNKNOWN, NEEDS MAINTAINER CONFIRMATION** before bulk redistribution. Quest TLDR/ForeverAtlas: not usable sources at all. | `DATA_PROVENANCE.md`'s A–F table | High confidence in what's unresolved; the resolution itself is pending |
| 20 | Recommended Phase 2 implementation? | See below | — | — |

## Recommended Phase 2 scope (for the user's future authorization — not started now)

1. Stand up the canonical PostgreSQL/PostGIS schema per `DATA_MODEL.md`.
2. Build the ATT ingestion pipeline first (clean license, richest data) —
   an independently-written Lua-DSL parser (not GPL-derived), sparse
   `.contrib/.db/forever/` checkout including `zzOLD/`, per
   `INGESTION_ARCHITECTURE.md`.
3. Build the wago.tools DB2 ingestion pipeline for zone/map/boss/item
   reference data, pending the ToS clarification for redistribution
   (can ingest for internal use immediately; hold public redistribution
   until answered).
4. Fully populate the Burning Steppes vertical slice end-to-end as the
   first real integration test of the whole pipeline.
5. Design and begin the companion telemetry addon (`QuestieTrace`-modeled)
   in parallel — this has the longest lead time of anything in this plan
   and should start early.
6. Build the map-rendering prototype (MapLibre + self-produced PMTiles for
   Burning Steppes only, as a scoped proof of concept) once the map
   rendering engine choice (`OPEN_QUESTIONS.md` #4) is confirmed.

## Answering the brief's final success criterion

*"Given a fresh Forever build, where exactly does Atlas get every category
of geographic/entity information, how is it transformed into our canonical
model, how are conflicts resolved, how are missing spawn positions handled,
how is every fact attributed/versioned, and how can the entire dataset be
reproduced?"*

This can now be answered concretely for every category except the ones
explicitly and honestly marked as open (spawn positions' underlying data,
vendor inventories, gathering nodes, flight routes, instance entrances) —
each of which has a named, scoped Phase 2 follow-up rather than a silent
gap. Source → transform → conflict-resolution → provenance → reproduction
are each defined in a specific document (`RECOMMENDED_DATA_SOURCES.md` →
`INGESTION_ARCHITECTURE.md`/`COORDINATE_SYSTEM.md` → `ENTITY_MATCHING.md`/
`DATA_PROVENANCE.md` → `DATA_PROVENANCE.md` → `INGESTION_ARCHITECTURE.md`'s
build-pinning section), and the Burning Steppes vertical slice demonstrates
all of this against real, live-pulled data rather than assumption. **Phase
1 is complete.**

---

**Per the brief's explicit instruction: STOP after Phase 1.** No frontend,
database implementation, or importer code has been written. Phase 2 does
not begin automatically — it awaits the project owner's review and
authorization, particularly on the two items in `OPEN_QUESTIONS.md` #1 and
#4 (the beta-vs-private-server framing, and the map-rendering engine
choice) that shape Phase 2's starting assumptions.
