# Importer: Hyjal

**Status: does not exist and should not — Hyjal is a reference
implementation, not a data source.**

Per the project's own repeated, explicit constraint (see
`docs/PROJECT_RECON.md`, `docs/DATA_SOURCE_MATRIX.md`,
`docs/DATA_PROVENANCE.md`'s license table): hyjal.cc is treated strictly as
a UX/architecture benchmark. Nothing from it is imported into this
project's canonical database. This directory exists only to satisfy the
requested `importers/{source}/` folder structure.

What Hyjal *did* inform (properly, as architecture reference rather than
data import):

- `docs/MAP_ARCHITECTURE.md` — the static-manifest + PMTiles rendering
  approach.
- `packages/shared/src/coordinates.ts`'s `ADT_TILE` conversion — validated
  independently against public wowdev.wiki documentation, and separately
  corroborated by reading Hyjal's own PMTiles archive's *public,
  openly-specified container metadata* (not proprietary application code)
  during Phase 1 research.

If a future phase decides to cross-check our own place names/IDs against
Hyjal's public `manifest.json` for QA purposes, that would be a `hyjal_observed`
provenance source per `docs/DATA_MODEL.md` — not routine ingestion, and not
what this directory is for.
