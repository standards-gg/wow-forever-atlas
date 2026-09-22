# Open Questions

Cross-cutting unresolved items. Updated after Phase 1 — resolved Phase 0
items are marked so; new Phase 1 items are appended. Keep this current;
don't let it go stale.

## Needs the project owner's input (unresolved, carried from Phase 0)

1. **Is WoW: Forever an official Blizzard Classic+ beta, or a specific
   private server the project owner already has in mind?** Not
   re-investigated in Phase 1 (out of scope — Phase 1 was data/technical
   validation, not this framing question). Still the single highest-
   priority item awaiting confirmation; see `PROJECT_RECON.md` §0. Every
   Phase 1 finding continues to independently reinforce the "official
   beta" reading (e.g. `wow_classic_beta` as a tracked Blizzard CDN
   branch, `WOW_PROJECT_ID`-style modern client identifiers) but this
   remains unconfirmed by the owner.
2. Should we reach out to QuestieDB's maintainers about data reuse before
   any bulk ingestion? **Sharper now than in Phase 0**: AllTheThings'
   MIT license makes this a non-issue for ATT (confirmed clean, see
   `DATA_PROVENANCE.md`); QuestieDB still has no license at all
   (re-confirmed fresh this phase — still 404 on `LICENSE`/`LICENSE.md`).
   Recommend this conversation happen before Phase 2 needs QuestieDB data
   specifically, not before Phase 2 starts generally (Phase 2 can begin
   fully on ATT alone).
3. **wago.tools' redistribution policy is unknown and unasked.** Explicitly
   flagged `UNKNOWN — NEEDS MAINTAINER CONFIRMATION` in
   `DATA_PROVENANCE.md`'s license table. Worth a direct ask on their
   Discord (linked from their site footer) before Phase 2 ships any
   redistributed DB2-derived dataset publicly.
4. **Map rendering engine choice (MapLibre GL JS vs. a custom three.js
   scene matching Hyjal's approach) is a recommendation, not a decision.**
   `MAP_ARCHITECTURE.md` recommends MapLibre for a simpler v1 given our
   product's actual differentiator is the entity graph, not 3D visual
   fidelity — but this is exactly the kind of "prefer a simple
   architecture first" call the original brief said should be "based on
   the actual requirements discovered during research," so it's presented
   here for explicit sign-off rather than assumed.

## Resolved in Phase 1

5. ~~How should the three-plus coordinate systems reconcile?~~ **Resolved**
   — see `COORDINATE_SYSTEM.md`. `WORLD_SPACE` is canonical; exact,
   lossless conversion to/from the 0-100 UI-percent system is defined and
   worked through a real example (Burning Steppes' Flame Crest flight
   point). ADT-tile conversion is one-directional by design (tile → zone,
   not tile → exact point), matching what's actually needed.
6. ~~How complete is `GameObjects` DB2 relative to all placed objects?~~
   **Resolved — confirmed narrow.** 1,505 of 1,514 rows game-wide are
   `TypeID=5` road signposts; Burning Steppes' own 6 rows are all
   zone-boundary signs. Not a general static-object catalog. See
   `SPAWN_DATA_STRATEGY.md`.
7. ~~Where do NPC/GameObject spawn positions come from?~~ **Answered with a
   concrete phased strategy**, not "solved" in the sense of data existing
   yet — see `SPAWN_DATA_STRATEGY.md`. The underlying data gap is real and
   will persist into Phase 2/3; what's resolved is *what to do about it*
   (ATT bootstrap → manual pilot → `QuestieTrace`-modeled companion addon
   → long-term telemetry), not the gap itself.
8. ~~Which DB2 table(s) carry quest narrative text?~~ **Deepened, still
   technically open, but now precisely scoped.** Confirmed via a full CASC
   file-manifest sweep that no *exportable* table carries it —
   `QuestObjective.db2` exists in the client but has no wago.tools CSV
   schema registered (a tooling gap, not confirmed absence). Phase 2
   follow-up: try a different DB2 reader against this specific file before
   concluding the text doesn't exist client-side.

## New/deepened in Phase 1

9. **Instance entrance world coordinates not yet pulled.** `AreaTrigger`
   (confirmed to carry `Pos_0/1/2` + radius/box dimensions) is the likely
   mechanism, but wasn't queried for a specific case (e.g. Blackrock
   Depths/Spire's real-world entrance point) this phase. Closable Phase 2
   follow-up.
10. **Flight path route legality/cost not sourced.** `TaxiNodes` gives
    real node positions (confirmed) but nothing about which nodes connect
    to which, at what cost. Likely `TaxiPath`/`TaxiPathNode` DB2 tables —
    not queried this phase.
11. **Vendor inventories have no source at all** across everything
    investigated in Phase 0 or Phase 1. Not even a partial/candidate
    source identified yet.
12. **Gathering nodes have no source at all**, same as vendors — expected
    to eventually be solved by the same companion-telemetry pipeline as
    NPC/GameObject spawns (`ResourceNodeSpawn` in `DATA_MODEL.md` is
    already modeled symmetrically for this reason), but zero coordinate
    data exists today from any investigated source.
13. **Burning Steppes' subzone list is currently only cross-checked via
    QuestieDB's reference data** (license-encumbered, design-reference
    only per `DATA_PROVENANCE.md`). Should be independently re-derived
    directly from `wago_db2`'s `AreaTable` filtered by
    `ParentAreaID = 46`, which wasn't explicitly queried this phase (only
    the top-level zone lookup was) — a quick, closable Phase 2 validation
    step before trusting the subzone list operationally.
14. **ATT's `zzOLD → active` graduation is a real, fast-moving churn
    source.** Confirmed this phase: Burning Steppes/Searing Gorge/
    Blackrock Mountain were pruned 2026-09-21; Darnassus graduated from
    `zzOLD` to the active tree 2026-09-22 (the day of this research).
    `INGESTION_ARCHITECTURE.md`'s change-detection design (key on quest ID
    found inside the file, not file path) accounts for this, but the
    *rate* of change means Phase 2's re-sync cadence should be tuned
    empirically once real ingestion is running, not assumed from this
    phase's one-week snapshot.
15. **PMTiles' exact ADT-tile-to-tile-pyramid ratio is unverified** (a
    candidate 2:1 relationship at Hyjal's `max_zoom=7` was proposed, not
    confirmed) — noted in `MAP_ARCHITECTURE.md` as not required for our
    own pipeline (we can define our own tiling convention), but worth
    resolving if literal parity with Hyjal's tile addressing ever matters.
16. **Whether stock per-ADT minimap resolution is visually adequate** for
    our target zoom range hasn't been empirically checked (render a
    mosaic, compare against a known reference) — a quick Phase 2
    validation step before committing to the minimap-only extraction
    pipeline in `MAP_ARCHITECTURE.md`.

## Lower priority / follow-up research (carried from Phase 0, still valid)

17. Re-check `SOURCE_QUESTIEDB.md`/`SOURCE_ATT.md` (and now
    `RECOMMENDED_DATA_SOURCES.md`) periodically — both ecosystems are
    confirmed to still be changing fast.
18. Confirm before publishing further: `benjamh681/wow-forever-atlas`
    ("Travelcraft") shares this repo's slug almost exactly — not a
    blocker, just a naming collision worth being aware of.
