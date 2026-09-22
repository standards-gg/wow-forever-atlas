# Importer: QuestieDB

**Status: not implemented, and should not be until licensing is resolved.**

Per `docs/DATA_PROVENANCE.md`'s license review: `Questie/QuestieDB` has
**no LICENSE file** (re-confirmed as of Phase 1's research — still 404 on
`LICENSE`/`LICENSE.md`). Default copyright applies. This project's own
constraint ("do not build the architecture around an assumption of
redistribution rights") means this importer must not bulk-ingest
QuestieDB's data tables without explicit maintainer permission.

## What this directory is for today

Design-reference only, per `docs/SPAWN_DATA_STRATEGY.md` and
`docs/RECOMMENDED_DATA_SOURCES.md` — QuestieDB's Era→Forever
coordinate-migration methodology (DBC-diffing two client builds' UiMap
assignment tables to derive a per-zone affine transform) directly informed
this project's own `packages/shared/src/coordinates.ts` design. No data was
copied; the *technique* (documented, publicly, by QuestieDB's own open
development process) is not itself copyrightable.

## Before writing real importer code here

Reach out to the QuestieDB maintainers about reuse terms
(`docs/OPEN_QUESTIONS.md` #2). If/when that's resolved, this importer
should follow the same shape as `importers/allthethings`: `fetch.ts`,
`normalize.ts`, provenance tagged `source: "questiedb"`.
