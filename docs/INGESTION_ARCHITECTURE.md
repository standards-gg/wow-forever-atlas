# Ingestion Architecture

Pipeline design for turning the sources in `RECOMMENDED_DATA_SOURCES.md`
into the canonical model in `DATA_MODEL.md`, with the provenance guarantees
from `DATA_PROVENANCE.md` and the matching rules from `ENTITY_MATCHING.md`.
This is an architecture document, not an implementation — no importer code
is written in Phase 1, per the brief's explicit constraint.

## Pipeline stages

```
Fetch → Normalize → Match → Merge → Store → (Publish, out of scope this phase)
```

1. **Fetch** — pull raw source data, per source:
   - `wago_db2`: HTTP GET against `wago.tools/db2/<Table>/csv?build=<pinned build>`
     for the confirmed relevant table set (`RECOMMENDED_DATA_SOURCES.md`).
     Also fetch `wago.tools/api/files?...&format=csv` (confirmed this phase
     to be the reliable format — `format=json` timed out; a real,
     documented operational constraint for Phase 2's fetcher) to detect new
     tables becoming available as wago.tools' own schema coverage grows.
   - `att`: sparse git checkout of `.contrib/.db/forever/` (both the active
     `zones/`/`dungeons & raids/` tree and `zzOLD/`, per this phase's
     confirmed finding that zzOLD is live, compiled, load-bearing data, not
     dead weight) at a pinned commit SHA, mirroring the sparse-checkout
     pattern `forever-quest-markers`' own CI action already uses
     (confirmed: it checks out exactly `.contrib/.db/forever`,
     `.contrib/Parser/lib/Constants`, `.contrib/Standard.lua`).
   - `questiedb`: read-only, design-reference fetches only, per the
     license posture in `DATA_PROVENANCE.md` — not a bulk ingestion target
     until a maintainer conversation resolves redistribution rights.

2. **Normalize** — parse each source's native format into a common
   intermediate representation:
   - DB2 CSV → typed rows (straightforward).
   - ATT's Lua constructor DSL → parsed via our own from-scratch
     lexer/parser/preprocessor/evaluator, **written independently** rather
     than reusing `forever-quest-markers`' GPLv3 `att_dsl` package (explicit
     brief constraint: do not copy GPL code into this project). This
     phase's ATT deep-dive documented the exact algorithm shape
     (preprocess `#if` directives → lex/parse Lua subset → tree-walk
     evaluate recognized constructor calls → extract by walking for
     `questID` keys with top-down context inheritance → mark attunement
     chains via BFS) precisely enough to implement independently — the
     *behavior* is public knowledge from reading a GPLv3 project's public
     interface/output, not its literal source text.
   - Every intermediate record carries its raw `coordinate_space` tag
     (per `COORDINATE_SYSTEM.md`) — normalization does not convert
     coordinates yet; that happens in Match/Merge once the target zone's
     `UiMapAssignment` row is resolved.

3. **Match** — apply `ENTITY_MATCHING.md`'s tiered rules per entity type,
   producing either a resolved canonical-entity link or a
   `entity_review_queue` row.

4. **Merge** — combine matched records into the canonical entity's
   provenance-tagged fields (`DATA_PROVENANCE.md`'s per-field
   conflict-resolution table), converting coordinates to `WORLD_SPACE`
   where a transform is resolvable, tagging unresolved ones explicitly.

5. **Store** — write to the canonical PostgreSQL/PostGIS schema
   (`DATA_MODEL.md`), append-only for provenance records (never overwrite a
   prior source's recorded value — provenance history is itself data worth
   keeping, directly enabling the version/rollback requirement below).

## Build pinning and versioning

**Confirmed necessity, not a hypothetical concern** — this phase directly
observed real churn within a single day: ATT's Burning Steppes/Searing
Gorge/Blackrock Mountain zzOLD pruning commits all landed 2026-09-21, and a
zone (Darnassus) graduated from zzOLD to the active tree on 2026-09-22, the
same day as this research. QuestieDB's own latest commit at both Phase 0
and this phase's re-check was a revert. **The upstream data genuinely moves
within hours, not weeks.**

Design:

- **Every ingestion run is pinned** to an explicit `(wago_build_number,
  att_commit_sha)` pair, recorded on every provenance record from that run
  (mirrors `forever-quest-markers`' own confirmed `Metadata.lua` pattern:
  `attCommit`, `attRef`, plus counts for reproducibility — and
  `ElliotWood/Forever`'s confirmed 6-hourly scheduled-diff CI pattern, both
  real, working precedents worth copying architecturally, not literally).
- **Re-sync is scheduled, not continuous** — given the confirmed churn
  rate, a daily or twice-daily re-sync against the latest wago build and
  ATT commit is a defensible starting cadence; tighten later if needed.
- **Changed-record detection**: per source, hash the raw fetched record
  (e.g. a DB2 row, an ATT quest table) and compare against the
  previous run's hash for the same external ID. Unchanged → skip
  re-processing. Changed → re-run Normalize→Match→Merge for that record
  only, and log the diff (old provenance value vs. new) rather than
  silently overwriting.
- **The same Atlas entity persists across builds** — an Atlas `Quest`'s
  `atlas_id` never changes when the upstream `wago_build_number` or
  `att_commit_sha` advances; only its provenance records accumulate new
  entries. A `quest_history` view (or simply querying provenance records
  ordered by `imported_at`) gives the "how has this looked across builds"
  view the brief requires, without a separate versioning subsystem.
- **Rollback**: because provenance records are append-only and Merge
  recomputes `resolved_value` from the conflict-resolution rules rather
  than mutating in place, rolling back to a prior build's view of an
  entity is a query (filter provenance records by
  `imported_at <= target_run_timestamp`), not a destructive operation.

## Handling the confirmed zzOLD/graduation churn specifically

Because ATT physically *moves* files from `zzOLD/` to the active tree as
zones get reviewed (confirmed real, e.g. Darnassus, 2026-09-22), a naive
"diff by file path" change-detection scheme would misread a graduation as
a delete+add. **Rule**: change detection for ATT sources keys on the
**quest/entity ID found inside the file**, not the file path — a quest
that moves from `zzOLD/.../Burning Steppes.lua` to
`zones/eastern kingdoms/burning steppes.lua` in a future ATT commit should
be recognized as the same source record (same `QuestID`), just relocated,
producing zero spurious re-processing beyond noting the path change in the
provenance log.

## What's explicitly out of scope for this document (per Phase 1 constraints)

No importer code, no ORM schema migrations, no actual scheduled-job
implementation (cron, queue, etc.) — those are Phase 2 decisions once this
architecture is agreed. This document defines the shape of the pipeline and
the guarantees it must uphold, not its concrete implementation.
