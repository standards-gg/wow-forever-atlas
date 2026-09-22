# Project Recon — Summary

Phase 0 synthesis across all six per-source deep dives in this folder
(`SOURCE_WAGO.md`, `SOURCE_ATT.md`, `SOURCE_QUESTIEDB.md`,
`SOURCE_FOREVERATLAS.md`, `SOURCE_HYJAL.md`, `SOURCE_FREIERBUND.md`).
Research date: 2026-09-22. Labels: **CONFIRMED**, **STRONG INFERENCE**,
**SPECULATION**, per project convention.

## 0. The framing correction — read this first

The original project brief describes World of Warcraft: Forever as a
private server. **Four independent research passes (Wago, ATT, ForeverAtlas,
QuestieDB), each reading different primary sources, converged on the
opposite conclusion without prompting each other:**

- **CONFIRMED**: Established WoW fan-media outlets (Wowhead, Icy Veins,
  MMO-Champion) cover "WoW: Forever" as an official Blizzard "Classic+"
  branch. A public beta opened **2026-09-17**, with a stated global launch
  of **2026-11-04**.
- **CONFIRMED**: Forever runs on modern client infrastructure —
  `WOW_PROJECT_ID = WOW_PROJECT_MAINLINE`, Interface version **16001**,
  sharing "the vast majority of APIs available in 12.1.5" (per
  `Thunderz96/forever-addon-kit`, cited in `SOURCE_FOREVERATLAS.md` §0).
  Private-server emulator projects essentially never target this kind of
  live, modern infrastructure — they target old, static, fully-reverse-
  engineered client builds.
- **CONFIRMED**: AllTheThings' own Forever data describes it, in its own
  source comments, as "a new flavor for World of Warcraft that takes place
  in a new world called Azeroth Forever," with Blizzard-style beta phases
  (Phase 1 = level 20, Phase 2 = level 30) — Blizzard-internal language, not
  emulator-project language (`SOURCE_ATT.md` §1).
- **CONFIRMED**: `wago.tools` — a mirror of live Blizzard client DB2 data —
  carries a `wow_classic_beta` product branch at build `1.60.1.69913`
  (`SOURCE_WAGO.md` §1), which is the exact build line every other source
  independently references (ATT: `1.60.1.69893`; QuestieDB: `1.60.1.69893`
  / `1.60.1.69913`; Hyjal.cc's footer: `1.60.1.69876`). A private-server
  emulator would not appear as a tracked branch of Blizzard's own official
  CDN/build-manifest system.
- **CONFIRMED**: "ForeverAtlas," the ecosystem the brief specifically named
  as a data source, turned out to be two low-provenance fan/SEO websites
  with no addon, no repo, and content admittedly compiled secondhand from
  Blizzard panel recaps and other fansites (`SOURCE_FOREVERATLAS.md` §1–3) —
  consistent with a ~1-week-old official beta hype wave, not a mature,
  years-old private-server community ecosystem (which is what "ForeverAtlas"
  would need to be if Forever were a long-running private server).

**Bottom line (STRONG INFERENCE, not yet user-confirmed):** WoW: Forever
is most likely an official Blizzard Classic+ branch, currently in a public
beta that started 2026-09-17 and is due to launch 2026-11-04. This project
should be built on that assumption **provisionally** — it changes the
sourcing strategy from "reverse-engineer a private server's SQL/DBC exports"
to "combine official client data-mining (DB2 via wago.tools) with
community addon tooling (AllTheThings, Questie/QuestieDB) built around a
live beta," and it changes the licensing posture from "private-server
community norms" to "Blizzard ToS/EULA-adjacent data-mining norms" (the
same posture Wowhead/wow.tools/Questie have operated under for years).

**This still needs explicit confirmation from the project owner before
Phase 1 (schema/pipeline implementation) locks in a licensing strategy
around it.** Everything else in this recon and in `DATA_SOURCE_MATRIX.md`
is written to be correct either way, but the licensing conclusions
specifically assume the official-beta reading.

## 1. Convergent technical facts (corroborated across ≥2 independent sources)

| Fact | Corroborated by |
|---|---|
| Current build line is `1.60.1.x` | Wago (`.69913`), ATT (`.69893`), QuestieDB (`.69893`/`.69913`), Hyjal (`.69876`) |
| Interface version `16001` | ATT `.toc`, ForeverAtlas §0 (`forever-addon-kit`) |
| Internal codename **"Camelot"** for the same content publicly called "Forever" | ATT (`db/Camelot/` build output dir + `CAMELOT` preprocessor tag), QuestieDB (`AllowLoadGameType camelot, forever`) — independently observed in two unrelated codebases |
| Forever's zone geography reuses Classic/Vanilla `MAP.*` / `UiMapID` space, with targeted additions | ATT §2 (`MAP.KALIMDOR = 1414` etc., same as Classic) |
| Coordinates do **not** carry over 1:1 from Classic Era to Forever and need active remapping | QuestieDB's Era→Forever DBC-diff tool (13,691 pairs converted, 6 unresolved); Wago's discovery that `WorldMapArea` is gone, replaced by `UiMapAssignment` |
| Forever adds genuinely new instances not in vanilla/Classic | ATT (`hall of thanes.lua`, `ruins of lordaeron.lua`), Hyjal's Instances panel ("New" tag: City of Dalaran, Excavation Site: Wetlands, Krol'dok Stronghold, Ruins of Lordaeron, The Drowned City, The Hall of Thanes) |
| Forever adds new top-level zones beyond stock continents | Hyjal's continent switcher includes **Dalaran City** and **Zephras Isle**, not present in stock WoW |
| The ~1,200 new-quest gap from the brief is real and currently unaddressed by any community dataset | Quest TLDR's own page: Forever-added quests have "no coordinates" yet; QuestieDB's Forever flavor is explicitly "not complete new Forever content" |

## 2. What each source is actually good for

See `DATA_SOURCE_MATRIX.md` for the full comparison. One-line verdicts:

- **Wago.tools** — best source for zone/continent hierarchy, coordinate-
  transform tables, quest POI markers, and items. **Cannot** provide NPC or
  GameObject spawn positions (not present in client DB2 at all — a material
  architectural gap, see §3).
- **AllTheThings** — best-licensed (MIT), best-structured community source
  for quests, quest chains/prerequisites, NPCs, instances, with a
  purpose-built, already-proven conversion pipeline (`forever-quest-markers`)
  we can study.
- **QuestieDB / Quest TLDR** — richest single technical reference for the
  Classic→Forever coordinate-migration problem, but **not license-clear**
  (no LICENSE file; Quest TLDR is "All Rights Reserved") — treat as design
  reference, not an ingestion source, unless the maintainers grant
  permission.
- **ForeverAtlas** — not a real data source. Two low-provenance fan
  websites, no addon, no repo, no license, secondhand content. Discard as a
  source; irrelevant beyond the naming collision warning in §4.
- **Hyjal.cc** — reference implementation for the *map/UI layer* only. Fully
  static architecture (Astro + three.js + PMTiles + a single manifest.json
  per continent, no backend API) — directly informs `MAP_ARCHITECTURE.md`.
  Not a data source (nothing was scraped or reused).
- **Freier Bund** — reference implementation for the *discovery/IA layer*
  only. Its "Umgebung" (surroundings) tab — a categorized, counted, linked
  roster of everything in a zone — is the clearest existing embodiment of
  this project's "what is around me?" core question. Not a data source
  (different game entirely).

## 3. Material architectural findings that affect the data model

1. **NPC and GameObject spawn coordinates are not in client DB2.**
   `Creature`/`CreatureDisplayInfo` define what an NPC *is* (name, model,
   type) but never where it stands in the world — that's server-authoritative
   data (confirmed absent via direct table probing, `SOURCE_WAGO.md` §3.4).
   `GameObjects` does carry positions but its completeness for static
   world-authored objects (vs. a specific hotfix/dynamic mechanism) is
   unconfirmed. **This means our Ingestion Architecture needs a real
   plan for spawn-position data that isn't "just read DB2"** — options
   include community spawn-scanning (addon telemetry, the pattern
   Questie/ATT's own coordinate data ultimately derives from), or a
   server-side data source if one becomes available. This is the single
   most consequential open technical question from Phase 0.
2. **Three different coordinate spaces are in play** and will need explicit
   reconciliation in `COORDINATE_SYSTEM.md`:
   - Client DB2 world-space (`AreaPOI.Pos_0/1/2`, `GameObjects.Pos_0/1/2`,
     `TaxiNodes.Pos_0/1/2`) — real 3D world coordinates.
   - The `UiMapAssignment` bounding-box/region transform — world-space to
     0–100 UI-map-percentage, the modern (post-Legion) mechanism, present
     even in this Classic-lineage build.
   - ATT/QuestieDB's `coord = {x, y, MAP.ZONE}` convention — the older
     0–100 percentage system keyed to a `UiMapID`, which is what most
     community Classic-era tooling actually uses.
   - Hyjal.cc's own `manifest.json` — large-magnitude 3D world-space
     coordinates with `tileSize: 533.33` matching real ADT tile geometry,
     i.e. raw world coordinates, not percentages.
   We should pick one canonical internal representation (world-space is the
   most information-preserving and what Hyjal itself uses) and treat
   percentage-based systems as a derived view, not the source of truth.
3. **Quest text/objective content location in DB2 is unresolved.** Wago
   confirmed `QuestV2`/`QuestInfo`/`QuestSort` exist but only carry flags and
   category labels, not narrative text — the actual quest-text table(s)
   were not identified this session and need a follow-up sweep
   (`SOURCE_WAGO.md` Open Question #1). Quest narrative content will likely
   need to come from AllTheThings/community sources rather than DB2 directly.
4. **All community datasets are actively moving targets right now**, not
   stable references — QuestieDB's own latest commit at research time was a
   revert of Forever work; ATT's Forever tree has open, recent
   Forever-specific correction PRs; the beta itself is ~1 week old with a
   ~6-week runway to launch. **Any Phase 1 ingestion design needs an explicit
   build-pinning / re-sync policy from day one**, not an assumption of
   stability (mirrors the pattern `ElliotWood/Forever`'s own 6-hourly CI
   watcher already uses for items/spells).

## 4. Housekeeping note

`SOURCE_FOREVERATLAS.md` §6 flags that an unrelated GitHub project,
`benjamh681/wow-forever-atlas` ("Travelcraft"), created the same day the
beta opened, has a nearly identical repo slug to this project's own
`wow-forever-atlas`. Worth keeping in mind before this repo is made public
or shared in community spaces, to avoid confusion — no action needed now.

## 5. Recommended next steps (Phase 0 → Phase 1)

1. **Get explicit confirmation from the project owner** on the
   official-beta-vs-private-server question (§0) before finalizing
   `DATA_PROVENANCE.md`'s licensing conclusions.
2. Write `DATA_MODEL.md` / `GEOGRAPHIC_GRAPH.md` / `COORDINATE_SYSTEM.md`,
   using the convergent facts in §1 and the open problems in §3 as direct
   inputs — in particular, design the schema so canonical entity IDs are
   ours (never Blizzard's or ATT's), with a documented cross-reference table
   per external ID system, per the project's own non-negotiable principle.
3. Write `ENTITY_MATCHING.md` explicitly addressing how records from Wago
   (DB2), AllTheThings (Lua source), and any future spawn-position source
   get reconciled into one canonical entity per real-world thing.
4. Write `MAP_ARCHITECTURE.md` informed directly by Hyjal's static-asset
   pattern (§2) — a real, low-cost, provenly-scalable approach worth
   adopting or adapting rather than reinventing.
5. Write `UI_ARCHITECTURE.md` and `PRODUCT_SPEC.md` informed directly by
   Freier Bund's "Umgebung" pattern (§2) as the core "what's around me"
   feature, while explicitly avoiding its accessibility anti-pattern
   (tooltip-only map pins) and its shallow/prose-only treatment of
   gathering nodes and flight paths.
6. Only after the above: begin `INGESTION_ARCHITECTURE.md` and the actual
   importer code, per the project's own "research before implementation"
   principle.
