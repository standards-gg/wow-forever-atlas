# WoW Forever Atlas

An independently implemented interactive atlas for World of Warcraft: Forever —
combining Hyjal-grade map polish with Freier Bund-style zone discovery
("what is around me, and how is it connected?"), backed by a real data
pipeline and canonical database rather than a scraper.

## Status

**Phase 0 — Research & Recon.** Before any application code is written, we are
documenting the available data sources and designing the data model. See
[`docs/`](docs/) for the living research and architecture documents.

## Architecture (target)

```
Forever Data Sources → Importers → Normalization → Entity Matching
  → Canonical Atlas Database → Geographic/Entity Graph → API
  → Interactive Web Application (Map + Search + Discovery UI)
```

The frontend must be replaceable without destroying the data layer. The map
renderer must be replaceable without destroying the database. External source
IDs are never used as our primary keys.

## Docs index

- `docs/PROJECT_RECON.md` — overall research summary
- `docs/DATA_SOURCE_MATRIX.md` — comparison of all candidate sources
- `docs/SOURCE_*.md` — per-source deep dives (Wago, ATT, QuestieDB, ForeverAtlas, Hyjal, Freier Bund)
- `docs/DATA_MODEL.md`, `docs/GEOGRAPHIC_GRAPH.md`, `docs/COORDINATE_SYSTEM.md` — data modeling
- `docs/ENTITY_MATCHING.md`, `docs/DATA_PROVENANCE.md`, `docs/INGESTION_ARCHITECTURE.md` — pipeline design
- `docs/MAP_ARCHITECTURE.md`, `docs/UI_ARCHITECTURE.md` — application design
- `docs/PRODUCT_SPEC.md` — product requirements
- `docs/OPEN_QUESTIONS.md` — unresolved decisions, tracked over time

Findings are labeled `CONFIRMED`, `STRONG INFERENCE`, or `SPECULATION` — never
presented as fact without that label.
