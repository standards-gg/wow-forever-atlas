# Importer: Wago (DB2)

**Status: partially real.** `src/zones.ts` fetches `AreaTable` +
`UiMapAssignment` from wago.tools for the current `wow_classic_beta` build
and produces real, Blizzard-sourced world/continent/zone **geography**
(bounding boxes and the real parent-child UiMap hierarchy — confirmed
directly from `UiMap.ParentUiMapID`: 947 "Azeroth" → 1415 "Eastern
Kingdoms"/1414 "Kalimdor" → each zone's own UiMapID). This is what powers
the web app's world/continent map views. Run it:

```bash
npm run import:world --workspace=@atlas/importer-wago
```

Tested against real fetched fixtures (`fixtures/AreaTable.csv`,
`fixtures/UiMapAssignment.csv`) — see `test/zones.test.ts`, including a
check that the real 49 outdoor zones/cities are found, dungeon-interior
AreaIDs (Blackrock Depths/Spire) are correctly excluded, and Kalimdor is
placed west of Eastern Kingdoms on the shared world map, matching real
Blizzard data.

## What's still not implemented here

Per `docs/RECOMMENDED_DATA_SOURCES.md`, the rest of the confirmed-relevant
DB2 table set (`AreaPOI`, `GameObjects`, `TaxiNodes`,
`QuestV2`/`QuestInfo`/`QuestSort`, `DungeonEncounter`, `Item`/`ItemSparse`)
is not yet fetched/normalized into canonical `NPCSpawn`/`FlightPath`/
`Instance`/`Boss`/`Item` entities the way `importers/allthethings` does for
quests. Also unresolved: `docs/DATA_PROVENANCE.md`'s licensing flag —
wago.tools' redistribution terms are still `UNKNOWN — NEEDS MAINTAINER
CONFIRMATION`. What's here is being used for local development only; get
that answered before shipping this data publicly.
