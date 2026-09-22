# Spawn Data Strategy

**The highest-priority Phase 1 investigation**, per the brief. This is the
concrete, evidence-based answer to: *"Where can Atlas obtain NPC/GameObject
spawn coordinates?"*

## The problem, stated precisely (now stronger than Phase 0 knew)

Phase 0 established that client DB2 has no NPC spawn positions. This
phase's DB2 deep-dive strengthens that finding materially: **the `Creature`
table in the current build doesn't hold a generic NPC/monster roster at
all** — its 178 rows are entirely vanity/companion pets (confirmed:
searching for "Hogger," the single most famous Classic mob, returns zero
matches). This was cross-checked against the **complete** Blizzard DB2
schema catalog (all 1,342 table definitions in `wowdev/WoWDBDefs`, not a
guessed subset) — searching for anything containing "spawn," "placement,"
or "position" across every table in every WoW version turns up nothing
relevant (only unrelated systems: UI widget layout, esports camera framing,
character-customization scene placement). **This is a hard, structural
fact about how the game engine is built** (terrain files describe the
world; a separate server-side database describes what's alive in it,
confirmed by cross-referencing the ADT format spec itself — its `MDDF`/
`MODF` chunks are documented as static doodad/WMO placement only, with no
creature-spawn chunk anywhere), not a tooling gap we can work around with
more effort.

`GameObjects` DB2 does carry positions but is confirmed **narrow**: of
1,514 rows total (the entire game), 1,505 are `TypeID=5` — road signposts.
Burning Steppes' own 6 rows are all zone-boundary signs. Its schema fields
(`PhaseID`, `PhaseGroupID`, `PhaseUseFlags`) mark it architecturally as a
phased/hotfix-object mechanism, not a general static-object catalog.

## Every approach investigated, with confirmed findings

| # | Approach | What it provides | Precision | Completeness | Forever-compatible | Automation | Legal posture | Difficulty | Maintenance | Scales to whole world? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Client DB2 (exhaustive re-check) | Nothing new beyond `AreaPOI`/`GameObjects`/`TaxiNodes`/`AreaTrigger` (already in `RECOMMENDED_DATA_SOURCES.md`) | N/A | **Confirmed zero for NPCs**, narrow for objects | Yes (it's the live client) | Full | Gray area (wago.tools ToS unconfirmed) | Low (already done) | Low | **No — structurally incapable for NPCs** |
| 2 | Wago ecosystem beyond DB2 | Nothing — confirmed no spawn-scan dataset anywhere in the Wago brand | — | — | — | — | — | — | — | No |
| 3 | ATT quest-tied coordinates | Quest-giver/objective positions only | High (per-record) | **Confirmed narrow**: ~81 pins/zone average; cross-referenced against Freier Bund's real Burning Steppes census (108 unique monsters/737 spawns, 57 quest NPCs, 18 vendors) — covers roughly the quest-NPC bucket only, near-zero of ambient mobs | Yes | High (already parseable) | **Clean (MIT)** | Low | Low (re-sync with ATT) | No — real but partial coverage only |
| 4 | QuestieDB `spawns()` | Vanilla-baseline NPC/object coordinates, Forever-migrated where the zone's transform is identity (Burning Steppes qualifies, confirmed) | Medium-high (inherited Classic-era precision) | Zone-dependent; explicitly **not** a source of new Forever content | Partially (Vanilla baseline only) | Medium | **Unclear (no license)** | Low (design reference) | Medium (actively unstable upstream) | No — same underlying Classic-era ceiling as ATT/Wowhead-era data |
| 5 | Historical precedent (how Classic spawn DBs were actually built) | Not data itself — a planning input | — | — | — | — | — | — | — | — |
| 6/7 | WoW client extraction beyond DB2 / ADT-WDT parsing | **Confirmed theoretically incapable of NPC data** (ADT's `MDDF`/`MODF` chunks are static doodad/WMO placement only, per the public ADT format spec); *can* yield complete static doodad/WMO placement (a real, smaller win for landmarks/decor) | High (for what it can provide) | Full, for static geometry only | Yes (legal client install) | Medium (mature tooling: `wow-adt`/`wow-wdt` Rust crates, `CascView`) | Clean (legal client extraction) | Medium | Low | Partial — objects only, never NPCs |
| 8 | Hyjal-derived data | **Confirmed zero** — its `manifest.json` schema has no NPC/mob entry type, only zone/place names + dungeon-entrance pins | — | — | — | — | N/A (not our data to take) | — | — | No |
| 9 | Public Blizzard Lua APIs | Live, in-client-session only — confirmed no offline/server-side equivalent exists | High (live) | N/A offline | Yes, but only while a client is running | None offline | N/A | N/A | N/A | Implies approach #12 is the only real path |
| 10 | Other community datasets | **`Thunderz96/forever-addon-kit`'s ForeverBeacon** — confirmed real, MIT-licensed, but confirmed (via close reading) to be the **same quest-tied-coordinate pattern as ATT**, not a general spawn scanner, despite its README's "with positions" phrasing | Medium | Same ceiling as #3 | Yes, Forever-specific | High (existing tool) | Clean (MIT) | Low | Low | No — doesn't solve ambient-mob coverage either |
| 11 | Manual curation | Full, ground-truth accuracy for whatever's covered | Very high | **Confirmed not tractable at world scale** — a single vanilla-scale zone has ~220 entities/~800+ spawn points (Freier Bund census); world-scale would take many months for a small team | Yes | None | Clean | Low (just time) | High (ongoing) | **No — but right-sized for a 1-3 zone pilot** (exactly what the Burning Steppes vertical slice is) |
| 12 | **Companion telemetry addon** | Full, real, growing coverage over time | Medium (crowd-observed, needs de-duplication/clustering) | Starts sparse, grows — confirmed historical pattern (GatherMate2/MobInfo2 era: 1-3 years to "comprehensive") | Yes, purpose-built | High once shipped | **Strong precedent, low risk** (see below) | Medium (a few weeks, per a confirmed working reference implementation) | Medium (ongoing data pipeline, but self-sustaining via players) | **Yes — the only approach that does** |
| 13 | Hybrid | Combines the above | — | — | — | — | — | — | — | **This is the recommendation** |

## The centerpiece finding: a live, directly-reusable precedent for #12

**`Questie/QuestieTrace`** — confirmed real, actively pushed the same day
as this research — is a shipped addon built by the Questie team to solve
*exactly* this problem (per `Questie/Questie` issue #7840, "Data Capture
Tool," closed as "Fixed by `Questie/QuestieTrace`"). It already has a
working, production consent → capture → strip-PII → export → upload
pipeline: `/qlt consent` opens a consent flow; a documented privacy policy
strips player names, realm names, and player GUIDs before recording or
export; `/qlt export` produces a shareable string submitted to a central
site (`questie.dev/trace`). This is a **stronger precedent than Forever
Logs** for our specific purpose (Forever Logs is combat-log-only; QuestieTrace
is the same category of data — entity/position/event capture — built by a
directly comparable project, released the same week as this research).

Historical precedent (GatherMate2, MobInfo2, SilverDragon — all confirmed
via direct reading of their own descriptions) shows this passive-telemetry
model, not manual survey, is how every comprehensive Classic-era spawn
database has ever actually been built. Expect a similar timeline here:
useful coverage of early/high-traffic zones within weeks-to-months of a
shipped addon; comprehensive world coverage on a multi-month-to-year
horizon.

## Recommendation — ranked, phased

1. **Immediate (weeks 1-4)**: bootstrap with ATT's quest-tied coordinates
   (parse `.contrib/.db/forever/` directly, including `zzOLD/`, per
   `RECOMMENDED_DATA_SOURCES.md`). Explicitly label these in the UI as
   "quest-related pins," not "every NPC here" — the coverage ratio doesn't
   support the stronger claim.
2. **Immediate, parallel (weeks 1-2)**: manually curate the Burning
   Steppes vertical-slice zone (already underway) as a bounded pilot and
   ground-truth validation set — not a template for world-scale coverage.
3. **Near-term (months 1-3)**: design and ship a minimal companion
   telemetry addon modeled directly on `Questie/QuestieTrace`'s
   consent/privacy/export architecture (study its `AGENTS.md` and
   `/qlt consent`→`/qlt export` flow as the reference implementation, not
   ATT/GatherMate2-era precedent alone). Scope v1 narrowly: nameplate/
   unit-seen events → `(npcID, x, y, mapID)`; object-interaction events →
   `(objectID, x, y, mapID)`.
4. **Ongoing (months 3-12+)**: treat telemetry as the real long-term
   source of full-world coverage, budgeted on the multi-month timeline the
   historical precedent demonstrates — not weeks. Layer it on top of the
   ATT bootstrap rather than replacing it (curated quest-giver pins remain
   a distinct, valuable signal from noisy raw observed positions).
5. **Explicitly not pursued as primary strategies**: ADT/WDT parsing for
   NPC data (structurally impossible, confirmed via the format spec, not
   just difficult), `GameObjects` DB2 as a general object source
   (confirmed narrow/phased-object-scoped), QuestieDB/Quest TLDR bulk data
   (unlicensed), Wowhead scraping (unclear ToS, no new evidence changes
   Phase 0's caution).

## Why this ordering (the core insight)

Every "already exists" source investigated — ATT, ForeverBeacon, QuestieDB
— independently converges on the same narrow slice: **quest-tied
coordinates only**. None of them, including the newest Forever-specific
tool found, has solved ambient NPC/object coverage, because the client
Lua API genuinely cannot see what it isn't currently rendering, and no
offline client-data source encodes it either. The only mechanism that has
ever produced this data, for any Classic-era WoW server, historically, is
the passive-telemetry-addon model — and this project has the unusual
advantage of a directly comparable, currently-active reference
implementation (`QuestieTrace`) to build from rather than invent.
