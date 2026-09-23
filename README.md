# WoW Forever Atlas

An independently implemented interactive atlas for World of Warcraft: Forever —
combining Hyjal-grade map polish with Freier Bund-style zone discovery
("what is around me, and how is it connected?"), backed by a real data
pipeline and canonical database rather than a scraper.

## Status

Phase 0 (research) and Phase 1 (data strategy) are complete — see
[`docs/`](docs/). The map itself is on MapLibre GL JS: one continuous,
seamlessly zoomable world (both continents, all 49 real outdoor
zones/cities, correctly positioned from Blizzard's own DB2 data), with
pan/zoom, tilt/rotate (native pitch/bearing), a top-down reset, and
**real in-game terrain imagery for every zone and both continents**,
extracted directly from a local WoW: Forever client install (not
GUI-driven, not scraped from any third party). The map's camera position,
tilt and current selection round-trip through the URL (a "Share view"
button copies it), and a real vertical slice for Burning Steppes/Searing
Gorge has quests/NPCs/flight paths from AllTheThings. See "What's real vs.
not yet" below for the precise, honest boundary of what's tested vs. not.

## Repository layout

```
docs/               Phase 0/1 research and architecture docs
db/                  PostgreSQL + PostGIS schema (migrations/) and docker-compose.yml
packages/shared/     Canonical entity types, atlas_id formatting, coordinate conversion (tested)
importers/
  allthethings/      Real: Lua-DSL parser + normalizer + CLI, tested against live data
  wago/              Real: fetches continent/zone geography (boundaries) from wago.tools DB2
  wow-client/        Real: reads local CASC game storage directly, extracts real minimap textures
  professions/       Real: builds the Profession Codex (DB2 recipes/items + ATT sources + client icons)
  questiedb/         Intentionally not implemented — licensing unresolved, design-reference only
  foreveratlas/       Intentionally not implemented — not a real data source (see docs/SOURCE_FOREVERATLAS.md)
  hyjal/              Intentionally not implemented — reference implementation, not a data source
  freierbund/         Intentionally not implemented — historical UX reference, not a data source
apps/web/            Next.js app: the Azeroth world map, continent maps, zone pages, and the Profession Codex
```

## Architecture

```
Forever Data Sources → Importers → Normalization → Entity Matching
  → Canonical Atlas Database → Geographic/Entity Graph → API
  → Interactive Web Application (Map + Search + Discovery UI)
```

The frontend must be replaceable without destroying the data layer. The map
renderer must be replaceable without destroying the database. External source
IDs are never used as our primary keys — see `packages/shared/src/atlas-id.ts`
and `docs/DATA_MODEL.md`.

## What's real vs. not yet (read before trusting a claim in this repo)

**Real, tested, run against live data:**
- `packages/shared/src/coordinates.ts` — world↔UI-percent and world↔ADT-tile
  conversions, cross-validated against two independent real coordinates
  (DB2's `TaxiNodes` vs. AllTheThings' own `fp()` records for the same
  entities). See its tests.
- `importers/allthethings` — a from-scratch Lua-subset tokenizer/parser
  (not derived from any GPL code) and normalizer, run against AllTheThings'
  real, live-fetched `Burning Steppes.lua`/`Searing Gorge.lua`, producing
  the exact confirmed quest counts from Phase 1's research (22 + 36 = 58).
- `importers/wago` — fetches real `AreaTable`/`UiMapAssignment` data from
  wago.tools and derives the actual Blizzard continent→zone UiMap
  hierarchy. Tested against real fetched fixtures (49 real outdoor
  zones/cities found; dungeon-interior AreaIDs correctly excluded).
- `importers/wow-client` — reads local CASC game storage directly (no
  `wow.export` GUI involved — it has no CLI, so this project implemented
  the same binary-format reading from scratch, with full MIT attribution;
  see its README) and extracts real minimap textures. Tested both with
  synthetic unit fixtures and a real integration test against a live
  install (skipped automatically on machines without one).
- `apps/web` — a real Next.js app: one continuous MapLibre GL JS world map
  (both continents, all 49 real zones, positioned from real data), with
  pan/zoom, tilt/rotate, a top-down reset, and camera/selection state
  round-tripped through the URL (`Share view`). Every zone and both
  continents render **real extracted terrain imagery**; `apps/web/lib/biome.ts`
  (a generated, non-scraped biome color) is only a last-resort fallback
  for a zone with no continent image behind it and no tile of its own —
  not expected to trigger given current data. Burning Steppes/Searing
  Gorge additionally have full quest/NPC/flight-path data from
  AllTheThings; every other zone's discovery panel says so honestly.

- `importers/professions` + `apps/web/app/(codex)` — the **Profession
  Codex**: all 12 professions and 2,520 recipes from Blizzard DB2 data
  (thresholds, reagents, categories, outputs, item tooltips), recipe-item
  sources from AllTheThings, and 1,242 icons extracted from the client.
  Routes: `/professions`, `/professions/{profession}`,
  `/professions/{profession}/{recipe}`, `/recipes`, `/recipes/{recipe}`,
  `/item/{item}`. See `importers/professions/README.md`.

**Reviewed but not integration-tested:**
- `db/migrations/0001_init.sql` — written carefully against
  `docs/DATA_MODEL.md`, but there was no Postgres/Docker available in the
  development sandbox this was built in. Run it yourself
  (`db/docker-compose.yml`) before trusting it against production data.

**Deliberately not built:**
- `questiedb`/`foreveratlas`/`hyjal`/`freierbund` importers — see each
  one's `README.md` for why (license status, or "not a real data source"
  per Phase 0 research).

## Docs index

- `docs/PROJECT_RECON.md`, `docs/DATA_SOURCE_MATRIX.md` — Phase 0 synthesis
- `docs/SOURCE_*.md` — per-source deep dives (Wago, ATT, QuestieDB, ForeverAtlas, Hyjal, Freier Bund)
- `docs/PHASE_1_REPORT.md`, `docs/RECOMMENDED_DATA_SOURCES.md`, `docs/SPAWN_DATA_STRATEGY.md` — Phase 1 synthesis and decision matrix
- `docs/DATA_MODEL.md`, `docs/GEOGRAPHIC_GRAPH.md`, `docs/COORDINATE_SYSTEM.md` — data modeling
- `docs/ENTITY_MATCHING.md`, `docs/DATA_PROVENANCE.md`, `docs/INGESTION_ARCHITECTURE.md` — pipeline design
- `docs/MAP_ARCHITECTURE.md` — map rendering architecture
- `docs/OPEN_QUESTIONS.md` — unresolved decisions, tracked over time

Findings are labeled `CONFIRMED`, `STRONG INFERENCE`, `SPECULATION`, or
`UNKNOWN` — never presented as fact without that label.

## Development

```bash
npm install
npm test                                                          # all tests
npm run import:att:burning-steppes                                # regenerate quest/NPC data
npm run import:world --workspace=@atlas/importer-wago              # regenerate world/zone geography
npm run extract:minimaps --workspace=@atlas/importer-wow-client     # regenerate real per-zone terrain imagery (needs a local client install)
npm run extract:continents --workspace=@atlas/importer-wow-client   # regenerate the whole-continent base map images (needs a local client install)
npm run import:professions                                         # regenerate the Profession Codex dataset
npm run extract:icons                                              # extract codex icons (needs a local client install)
npm run dev:web                                                    # http://localhost:3000
```
