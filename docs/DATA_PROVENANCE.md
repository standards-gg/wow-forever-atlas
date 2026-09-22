# Data Provenance

Every imported fact in WoW Forever Atlas must be traceable to where it came
from, when, against what build, and under what license. This doc defines
the provenance model, the multi-source-per-entity design, and the
license/redistribution posture per source — the last of which is a direct,
literal answer to the Phase 1 brief's section 11 (A–F review).

## Provenance record

Every field of every canonical entity that was populated from an external
source (as opposed to Atlas's own derived/computed value, like a
denormalized `zone_id`) carries a provenance record:

```
source: enum { wago_db2, att, questiedb, forever_quest_pins,
               atlas_telemetry, manual_curation }
source_url: string                    -- repo URL, wago.tools URL, etc.
source_id: string                     -- the external ID (QuestID, NpcID, ...)
source_id_type: string                -- the namespace (see ENTITY_MATCHING.md)
source_version: string | null         -- e.g. a git commit SHA
build_number: string | null           -- e.g. "1.60.1.69913"
imported_at: timestamp
last_verified_at: timestamp
confidence: enum { verified, inferred, unverified }
transformation: string | null         -- e.g. "UI_MAP_TRANSFORM -> WORLD_SPACE
                                          via UiMapAssignment AreaID=46"
attribution_required: bool
attribution_text: string | null
```

## Multi-source-per-entity — do not overwrite, layer

Per the brief's explicit example, an Atlas `Quest` should be able to carry:

```
Atlas Quest #<atlas_id> ("Arcanite")
├── wago_db2 reference:      QuestID 7630 (build 1.60.1.69913) — existence/flags only
├── att reference:           QuestID 7630, .contrib/.db/forever/zzOLD/.../Burning Steppes.lua
│                             (ATT commit 3365ae17615c..., confirmed real record:
│                              sourceQuests={7626,7627,7628}, qg=14437, coord={12.4,31.6,MAP.BURNING_STEPPES})
├── questiedb reference:     (not separately checked for this specific quest — QuestieDB
│                             is design-reference-only per license posture, see below)
└── manual_correction:       none yet
```

**Rule, confirmed necessary by this phase's findings**: when two sources
disagree (e.g. Wago's `QuestV2` confirms a `QuestID` exists but carries no
text, while ATT's Lua record for the same ID carries a full quest-giver/
coordinate/prerequisite record), **both records are kept, tagged by
source**, and a `resolved_value` is computed by the conflict-resolution
rule for that field (see below) — the losing source's data is never
deleted, only deprioritized for display.

## Conflict resolution — per-field, per-entity-type, not a global source ranking

The brief is explicit that "different entity types may have different
authoritative sources" — Phase 1's findings make this concrete, not
hypothetical:

| Field / entity type | Authoritative source | Why (confirmed evidence) |
|---|---|---|
| Zone/subzone existence, hierarchy, world bounds | `wago_db2` (`AreaTable`, `UiMapAssignment`) | Confirmed complete and internally consistent for Burning Steppes; this is Blizzard's own live client data, the strongest possible source for "does this zone exist and where" |
| Quest existence (ID, flags) | `wago_db2` (`QuestV2`) as existence-check, but... | ...quest *content* (giver, coords, chain, text) has **no DB2 source at all confirmed this phase** — `QuestObjective.db2` exists in CASC but wago.tools cannot export it (unregistered schema, confirmed distinct from "table doesn't exist") |
| Quest content (giver, coords, chain, prerequisites) | `att` | Confirmed richest, best-licensed (MIT), actively curated (e.g. the dated 2026-09-21 Burning Steppes pruning commit) source for this |
| Instance ↔ Map linkage | `wago_db2`, specifically **`DungeonEncounter`, not `LFGDungeons`** | `LFGDungeons.MapID` confirmed unreliable (reports 0 for all three Blackrock instances); `DungeonEncounter` confirmed accurate via lore cross-check — see `ENTITY_MATCHING.md` |
| Boss/encounter listing | `wago_db2` (`DungeonEncounter`) | Confirmed accurate |
| NPC identity (name, type) | `att` (inline comments) as primary, cross-checked against `questiedb`'s Npc table if licensing is resolved | No DB2 source exists this phase (`Creature` table confirmed to hold only vanity pets) |
| NPC/GameObject spawn positions | **none confirmed authoritative yet** — see `SPAWN_DATA_STRATEGY.md` | This is the confirmed, unresolved core gap of the whole project |
| Coordinate-space transforms | `wago_db2` (`UiMapAssignment`), computed by us | Confirmed exact/lossless; no need to trust a third party's pre-computed transform when we can derive it ourselves from the same primary source QuestieDB uses |

**When a field has no confirmed-authoritative source at all** (NPC spawn
positions being the clearest case), the record is stored with
`confidence: unverified` and the field is left explicitly null rather than
populated from a lower-confidence guess — matching the brief's "do not
invent missing coordinates" constraint directly.

## License / redistribution review (Phase 1 brief §11, A–F)

Superseding `DATA_SOURCE_MATRIX.md`'s Phase 0-level summary with the
sharper A–F framework the brief specifies. Legend: **A** = can we read/use
it, **B** = can we transform it, **C** = can we redistribute *derived*
data, **D** = can we redistribute the *original* data, **E** = must
attribution be preserved, **F** = can generated data be published.

| Source | A | B | C | D | E | F | Basis |
|---|---|---|---|---|---|---|---|
| **wago.tools (DB2)** | Yes | Yes | **UNKNOWN — NEEDS MAINTAINER CONFIRMATION** | **UNKNOWN — NEEDS MAINTAINER CONFIRMATION** | Unclear (no ToS found) | **UNKNOWN — NEEDS MAINTAINER CONFIRMATION** | Confirmed no ToS/license page exists (only a copyright footer). Underlying data is Blizzard's own client content, mirrored under the same long-tolerated norm as Wowhead. **Do not assume "everyone does it" implies a redistribution right** (explicit brief constraint) — this needs an actual answer from wago.tools' Discord/maintainers before Phase 2 ships any redistributed DB2-derived dataset publicly. |
| **AllTheThings** | Yes | Yes | Yes | Yes | **Yes** (MIT notice must be preserved) | Yes | **CONFIRMED MIT, repo-wide**, code and data alike (`SOURCE_ATT.md`). This is the one source with a clean, complete A–F answer. |
| **Forever Quest Pins** (derived data, not upstream ATT) | Yes (study, don't copy code) | Yes | Yes (their own MIT-attributed derived data) | N/A (we don't need their derived data directly — we can derive our own from ATT source) | Yes for their code specifically if reused (GPLv3) | Yes | Their *code* is GPLv3 — **do not copy it into this project** (explicit brief constraint: "do not copy GPL code into MIT/proprietary project files"). Their *converted data* is separately MIT-attributed by them, a template we can follow for our own ATT-derived data, not something we need to import. |
| **QuestieDB / Questie** | Yes (read/study) | Cautious — for design reference only | **NO — UNKNOWN, NEEDS MAINTAINER CONFIRMATION** | **NO — UNKNOWN, NEEDS MAINTAINER CONFIRMATION** | N/A (no license granted at all yet) | No | **CONFIRMED no LICENSE file** in either repo (re-verified fresh this phase, still 404). Default copyright applies. Treat the coordinate-migration *methodology* as a legitimate design reference (facts about how a public, open-development project solved a technical problem are not themselves copyrightable), but **do not bulk-import their data tables** without explicit permission. |
| **Quest TLDR** | Yes (read/observe) | No | No | No | N/A | No | **CONFIRMED "All Rights Reserved"** (CurseForge listing). Not a source; only corroborating evidence of the new-quest coordinate gap. |
| **ForeverAtlas** (fan sites) | Yes (casual reference only) | No | No | No | N/A | No | Not a real data pipeline at all (Phase 0 finding); no license found anywhere; discard as a source entirely. |
| **Hyjal.cc** | Public browsing only | N/A — not a data source | N/A | N/A | N/A | N/A | Reference implementation only; no data was or should be imported from it. The one exception: its **PMTiles container's public metadata block** (format-level, not proprietary application data) was read this phase to understand its own coordinate system — this is reading a public, open file-format's header, not scraping proprietary content, and is explicitly not a data-import decision. |
| **Freier Bund** | Public browsing only | N/A — not a data source, different game | N/A | N/A | N/A | N/A | UX/IA reference only. |

**Practical Phase 2 implication**: the only source with a fully clear A–F
answer today is **AllTheThings**. Every other community source (wago.tools,
QuestieDB) needs an explicit maintainer/legal conversation before its data
(not just its publicly-observable existence) is used beyond
design-reference. This should not block Phase 2 from *starting* — it
should shape Phase 2 to build the ingestion pipeline around ATT first
(fully clear), while that conversation happens in parallel for the others.
