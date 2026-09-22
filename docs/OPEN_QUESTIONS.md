# Open Questions

Cross-cutting unresolved items surfaced during Phase 0 research, tracked
here so they don't get lost across the individual `SOURCE_*.md` docs. Update
this file as questions get resolved or new ones surface — don't let it go
stale.

## Needs the project owner's input

1. **Is WoW: Forever an official Blizzard Classic+ beta, or a specific
   private server this project's owner already has in mind?** Four
   independent Phase 0 research passes converged on "official Blizzard
   beta" (see `PROJECT_RECON.md` §0) — the original brief assumed the
   opposite. This is the single highest-priority open item: it changes the
   licensing posture for every data source in `DATA_SOURCE_MATRIX.md` and
   should be confirmed before Phase 1 locks in a sourcing strategy.
2. Should we reach out to ATT and/or QuestieDB maintainers about data
   reuse/collaboration before Phase 1 ingestion work begins? ATT's MIT
   license makes this a courtesy rather than a requirement; QuestieDB has no
   license, so this would matter more there if we ever want its data instead
   of just its design patterns.

## Technical, to resolve during data-model design

3. Where do NPC and GameObject spawn positions actually come from for
   Forever, given they're confirmed absent from client DB2? (See
   `PROJECT_RECON.md` §3.1 — the top open technical question.)
4. Which DB2 table(s) carry quest title/objective narrative text? Not
   identified in the Wago pass; needs a systematic sweep of the `Quest*`
   table family.
5. How should the three-plus coordinate systems in play (DB2 world-space,
   `UiMapAssignment` transforms, ATT/QuestieDB's 0–100 percentage system,
   Hyjal's raw 3D world coordinates) reconcile into one canonical
   representation? Draft this in `COORDINATE_SYSTEM.md`.
6. How complete is the `GameObjects` DB2 table relative to all objects
   actually placed in Forever's world? Needs a spot-check against a
   known zone's actual object count from another source.

## Lower priority / follow-up research

7. Re-check `SOURCE_QUESTIEDB.md` and `SOURCE_ATT.md` periodically — both
   ecosystems are actively changing (QuestieDB's latest commit at research
   time was a revert of Forever work; ATT has open Forever-specific
   correction PRs) and this research has a short shelf life, especially
   ahead of the 2026-11-04 launch.
8. `SOURCE_HYJAL.md` left several UX mechanics unconfirmed (exact
   shareable-link URL format, whether "Top down" is a real 2D mode or a
   re-posed 3D camera, terrain/elevation data source) — worth a revisit if
   we end up adopting its architecture closely.
9. Confirm before publishing this repo publicly: an unrelated GitHub project
   (`benjamh681/wow-forever-atlas`, "Travelcraft") shares this repo's slug
   almost exactly (`SOURCE_FOREVERATLAS.md` §6) — not a blocker, just a
   naming collision worth being aware of.
