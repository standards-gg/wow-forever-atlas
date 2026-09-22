# Importer: Wago (DB2)

**Status: not yet implemented.** Scaffolded per the requested
`importers/{source}/` structure; no code has been written here yet.

## What this importer should do, per `docs/RECOMMENDED_DATA_SOURCES.md`

Fetch DB2 tables from `wago.tools` for a pinned `wow_classic_beta` build
(`https://wago.tools/db2/<Table>/csv?build=<build>`), for the confirmed
relevant table set: `Map`, `AreaTable`, `UiMapAssignment`, `AreaPOI`,
`GameObjects`, `TaxiNodes`, `QuestV2`/`QuestInfo`/`QuestSort`,
`DungeonEncounter`, `Item`/`ItemSparse`. Normalize into `Continent`, `Zone`,
`Location` (world-space), `FlightPath`, `Instance`, `Boss`, `Item` entities.

## Why it isn't built yet

1. **Licensing is unresolved** (`docs/DATA_PROVENANCE.md`'s A–F table marks
   wago.tools `UNKNOWN — NEEDS MAINTAINER CONFIRMATION` for redistribution).
   The AllTheThings importer was built first specifically because it has a
   clean, complete MIT answer and doesn't block on this.
2. Given the effort budget for this pass, one importer was built
   completely and correctly (parser, normalizer, real tests against real
   fetched data) rather than several built shallowly. AllTheThings was
   chosen because it's the richest structured source for the vertical
   slice's core content (quests, chains, NPCs).

## Interface it should implement, for consistency with `importers/allthethings`

- `fetch.ts` — HTTP GET against wago.tools' documented API, pinned to an
  explicit build number.
- `normalize.ts` — DB2 CSV rows → canonical entities, tagging every
  `Location` with `coordinateSpace: "WORLD_SPACE"` (DB2's native space, per
  `docs/COORDINATE_SYSTEM.md` — no conversion needed at ingestion, unlike
  ATT's UI-percent coordinates).
- Provenance: `source: "wago_db2"`, `sourceIdType` per table (e.g.
  `"AreaTable.ID"`, `"TaxiNodes.ID"`), `buildNumber` always set.
