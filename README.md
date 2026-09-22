# WoW Forever Atlas

An independently implemented interactive atlas for World of Warcraft: Forever —
combining Hyjal-grade map polish with Freier Bund-style zone discovery
("what is around me, and how is it connected?"), backed by a real data
pipeline and canonical database rather than a scraper.

## Status

**Phase 2 — early implementation.** Phase 0 (research) and Phase 1 (data
strategy) are complete — see [`docs/`](docs/). Phase 2 has a real, tested
vertical slice for Burning Steppes: a from-scratch AllTheThings Lua-DSL
parser and normalizer producing canonical entities, a coordinate-conversion
module cross-validated against live data, a reviewed (not yet
integration-tested — no local Postgres) PostGIS schema, and a Next.js app
that renders the result. See "What's real vs. not yet" below.

## Repository layout

```
docs/               Phase 0/1 research and architecture docs
db/                  PostgreSQL + PostGIS schema (migrations/) and docker-compose.yml
packages/shared/     Canonical entity types, atlas_id formatting, coordinate conversion (tested)
importers/
  allthethings/      Real: Lua-DSL parser + normalizer + CLI, tested against live data
  wago/              Not yet implemented — see its README for why and what's needed
  questiedb/         Intentionally not implemented — licensing unresolved, design-reference only
  foreveratlas/       Intentionally not implemented — not a real data source (see docs/SOURCE_FOREVERATLAS.md)
  hyjal/              Intentionally not implemented — reference implementation, not a data source
  freierbund/         Intentionally not implemented — historical UX reference, not a data source
apps/web/            Next.js app: a real page rendering the Burning Steppes vertical slice
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
  Run it: `npm run import:att:burning-steppes`.
- `apps/web` — a real Next.js page (`/zones/burning-steppes`) rendering
  that output: a Freier-Bund-style discovery panel and a coordinate-accurate
  (if visually placeholder) map.

**Reviewed but not integration-tested:**
- `db/migrations/0001_init.sql` — written carefully against
  `docs/DATA_MODEL.md`, but there was no Postgres/Docker available in the
  development sandbox this was built in. Run it yourself
  (`db/docker-compose.yml`) before trusting it against production data.

**Deliberately not built:**
- The other five importers — see each one's `README.md` for why (license
  status, or "not a real data source" per Phase 0 research).
- Real map tile imagery — `docs/MAP_ARCHITECTURE.md` defines a reproducible
  pipeline (`wow.export` → tiling → PMTiles); it hasn't been run.

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
npm test                              # coordinate + importer tests
npm run import:att:burning-steppes    # regenerate apps/web/public/data/burning-steppes.json
npm run dev:web                       # http://localhost:3000
```
