# Source Deep Dive: Wago.tools / DB2 Ecosystem

Phase 0 research doc. Covers what wago.tools actually is, whether it carries
"Forever" (the private/Classic+ server this project targets) data, what the
`ElliotWood/Forever` GitHub repo actually documents, which DB2 tables were
directly verified to exist for the Forever build, and licensing notes.

Labels: **CONFIRMED** (directly verified against a primary source in this
session), **STRONG INFERENCE** (well-supported, not directly verified),
**SPECULATION** (a guess worth recording, not verified). Nothing below is
stated as fact without one of these labels.

---

## 1. What wago.tools is

**CONFIRMED** — wago.tools ("Wago Tools", part of the Wago ecosystem) is a
public web tool that browses and exports Blizzard's client-side **DB2**
database tables (the client's binary data format, successor to the old MPQ
`.dbc`/`.db2` files, delivered over Blizzard's CASC/CDN system) for every WoW
build it has ingested. It is not scoped to one game version — it tracks nearly
every actively-patched Blizzard product/branch simultaneously.

Site structure (confirmed by loading `https://wago.tools/` and
`https://wago.tools/db2` directly):

- Top nav: **Files**, **Tables**, **Maps**, **Builds**, **Hotfixes**,
  **Feedback Portal**.
- A per-page **build selector** (defaults to the newest retail build) and a
  **locale selector** (defaults to `enUS`) — table exports are per-build,
  per-locale.
- Footer links: GitHub, Discord, "Branding", **APIs**.
- Copyright footer: "© 2021 - 2026 Wago Tools. All rights reserved." No
  visible terms-of-use/license page beyond that footer line (see §4).

**CONFIRMED** — the front page lists "Current WoW versions," i.e. the latest
known build per product branch, e.g. (snapshot taken during this research,
2026-09-22):

| Name | Product (branch) | Build |
| --- | --- | --- |
| Retail | `wow` | 12.1.0.69875 |
| Classic | `wow_classic` | 5.5.4.69585 |
| Classic Era | `wow_classic_era` | 1.15.9.69722 |
| **Classic Beta** | `wow_classic_beta` | **1.60.1.69913** |
| Dev 2 | `wowdev2` (`_classic_alpha_`) | 1.60.1.69913 |
| Classic Titan | `wow_classic_titan` | 3.80.2.69874 |
| … (17+ other branches: PTR, Vendor 1-4, Event 1/3, Live Test 1/2, etc.) | | |

The `wow_classic_beta` branch is the one relevant to Forever — see §2.

### 1.1 Programmatic API — CONFIRMED

`https://wago.tools/apis` documents a small public HTTP API (verified live):

- `GET /api/builds` — every version known, per product. Verified: returns a
  large JSON object keyed by product name, each value a list of
  `{product, version, created_at, build_config, product_config, cdn_config,
  is_bgdl}` — i.e. this mirrors Blizzard's CDN "versions" manifest per
  product, not a Wago-authored schema.
- `GET /api/builds/latest` — latest version per product.
- `GET /api/builds/{product}/latest` — latest version for one product.
- `GET /api/casc/{fdid}` — raw CASC file by FileDataID (supports a `version`
  query arg).
- `GET /api/info/{fdid}` — metadata about a file by FileDataID.
- `GET /api/files` — all files in a given version (supports `version`,
  `product`, and `format` = `csv`|`json` args).

### 1.2 DB2 table export — CONFIRMED (verified directly, not just documented)

Every DB2 table can be pulled as CSV with:

```
https://wago.tools/db2/<TableName>/csv?build=<full.build.number>
```

This session fetched dozens of tables this way for build `1.60.1.69913`
(the `wow_classic_beta` build that is Forever's beta — see §2) and got real
CSV rows back with HTTP 200, column headers, and plausible WoW game data. A
nonexistent table name returns HTTP 404 with `{"errors":"Table not found."}` —
also confirmed directly (tried `JournalEncounter`, `WorldMapArea`, `Quest`,
`UiMapPoint`, others — see §3).

This means: **wago.tools is a live, queryable mirror of Blizzard's actual
client DB2 schema for the exact build Forever's beta client ships**, not a
curated or Forever-specific dataset. It has no per-table documentation beyond
the raw column names Blizzard's client uses internally (which is why several
columns in the exports below are auto-named things like
`Field_11_0_0_54210_011` — unnamed/unstructured leftovers from Blizzard's own
schema definitions, a known wago.tools/wow.tools quirk).

### 1.3 Is this "Forever" data, or retail/Classic data mirrored under a build label?

**CONFIRMED, important distinction**: wago.tools does not know or care about
"Forever" as a concept. It ingests and republishes **whatever DB2 tables ship
inside the client build**, labeled only by Blizzard's internal build number
and product branch (`wow_classic_beta`, etc.). Forever's custom content
(new talent trees, new races, new zones/quests if any) is present **only to
the extent Blizzard's own Forever beta client build embeds it** as DB2 rows.
Anything Forever implements server-side only (spawn tables, loot tables,
scripted quest logic, NPC AI) will **not** appear in wago.tools, because DB2
is client data, not server data. This matches how `ElliotWood/Forever` uses
it: purely for client-embedded systems (talent nodes, spell effects, items),
never for anything server-authoritative.

---

## 2. What `github.com/ElliotWood/Forever` actually is

**CONFIRMED (corrects a mis-assumption in the task brief)**: this repository
is **not** a map/quest/NPC/data-extraction project. It is a fork of
[`wowsims/classic`](https://github.com/wowsims/classic) — a Go+TypeScript
**combat DPS/TPS simulator** (the well-known "wowsims" family of tools used
by the WoW theorycrafting community) — adapted to model **World of Warcraft:
Forever**, described in the repo's own README as "the Classic+ game announced
at BlizzCon 2026." Verified via the GitHub API (`ElliotWood/Forever` repo
metadata: `fork: true`, `parent: wowsims/classic`, language Go, MIT license,
created 2026-09-13) and by reading the actual README and repo file tree
directly (not summarized secondhand).

What the repo contains, confirmed from its file tree and README:

- `sim/`, `proto/`, `ui/` — the inherited wowsims combat simulator engine,
  spec UIs, and protobuf wire format between them.
- A `RulesetClassic` / `RulesetForever` switch gating new combat mechanics
  (periodic-crit dots, unified hit/crit, bonus-healing-grants-spell-power,
  racial reshuffling, new races including "The Skyborne").
- New, non-switchable talent trees for all nine classes.
- `tools/forever_talents/` — the part of this repo that actually talks to
  wago.tools (see §2.1).
- `tools/database/` (`wago_db.go`, `wowhead_db.go`, …) — importers that build
  the simulator's **item/gear database** (`assets/database/db.json`) from a
  mix of wago.tools DB2 CSV exports (`assets/db_inputs/wago_db2_items.csv`)
  and Wowhead-scraped tooltip text (`wowhead_item_tooltips.csv`,
  `wowhead_spell_tooltips.csv`). This is item/spell data for combat
  simulation, not map/geography data.
- `tools/data_watch/` — a scheduled diff watcher (see below) comparing new
  client builds and Wowhead's gear planner, for items/spells/talents only.

There is **no map, zone, quest, NPC-spawn, GameObject-spawn, or dungeon/raid
layout data or tooling anywhere in this repository.** A search of the full
repo tree for map/quest/npc/zone-related paths turned up only UI icon image
assets (e.g. `assets/img/wowhead/icons/large/inv_misc_map02.jpg`), which are
just item icons, not geographic data.

**Implication for this project**: `ElliotWood/Forever` cannot serve as a
methodology reference for the Atlas's Map/Quest/NPC/GameObject pipeline. Its
only transferable value is (a) proof that Forever's beta client is real,
build-versioned, and DB2-introspectable via wago.tools, and (b) a concrete,
working example of the wago.tools CSV-fetch pattern.

### 2.1 The one thing it does document in detail: reading beta DB2 via wago.tools

**CONFIRMED** (read directly from the README and `tools/forever_talents/`):

- Forever's beta client build is identified as shipping under the
  **`wow_classic_beta` product** as version **`1.60.x`**. The README states
  the first observed build was `1.60.1.69893`; wago.tools' live front page
  (checked this session) currently shows `wow_classic_beta` at
  `1.60.1.69913`, i.e. the same major/minor line, later patch — consistent
  and mutually corroborating.
- Build discovery: `https://wago.tools/api/builds`, sorted client-side by
  `created_at` (the API's own list "is not ordered").
  **CONFIRMED** the endpoint returns exactly that shape.
- Table fetch: `https://wago.tools/db2/<Table>/csv?build=<build>` — no client
  install or manual data extraction needed; the whole pipeline is plain HTTP.
- Tables the repo actually reads (talent/spell system only): `TraitTree`,
  `TraitNode`, `TraitNodeEntry`, `TraitNodeXTraitNodeEntry`,
  `TraitDefinition`, `TraitDefinitionEffectPoints`, `TraitEdge`,
  `CurvePoint`, `SpellName`, `Spell`, `SpellEffect`. It explicitly notes to
  **ignore** `Talent`/`TalentTab` in this build ("unchanged Classic Era
  leftovers").
- Methodology notes worth keeping in mind for our own importer design: (1)
  per-rank numeric values must be read from `CurvePoint` via each effect's
  `CurveID`, not from `SpellEffect.EffectBasePointsF`, which "only holds one
  value and is sometimes stale"; (2) tooltip text uses Blizzard's `$s1`/`$m1`
  token syntax with unit conversions (durations in ms, rage in tenths) that
  must be parsed, not assumed numeric; (3) some position/id fields in these
  particular tables are known to contain stray/duplicate data requiring
  manual disambiguation. These are all specific to the Trait/Spell tables,
  but the general lesson — **wago.tools gives you the raw client table
  verbatim, including its rough edges; expect to write normalization/cleanup
  logic per table, not assume clean data** — is directly relevant to our
  Normalization stage.
- Automated monitoring: `.github/workflows/watch_wowhead_forever.yml` runs
  every 6 hours, diffing the newest `1.60.x` build's DB2 tables
  (`tools/data_watch/wago_db2_diff.py`) and Wowhead's Forever gear-planner
  snapshot, opening a `data-change` PR on drift. This is a pattern worth
  copying for our own pipeline (scheduled re-diff against the newest Forever
  beta build) but again scoped to items/spells/talents in this repo, not
  world content.

---

## 3. DB2 tables relevant to an atlas — verified against build `1.60.1.69913`

The task asked which DB2 tables would provide Map, AreaTable, Quest*,
Creature/NPC, GameObject, Instance/Map (dungeons/raids), JournalEncounter,
Item, and WorldMapArea/coordinate-transform data. Rather than trust
`ElliotWood/Forever` (which never touches these), this session queried
`https://wago.tools/db2/<Table>/csv?build=1.60.1.69913` directly for each
candidate table name and recorded the real HTTP result. **CONFIRMED** means
the table returned HTTP 200 with real CSV rows against Forever's own beta
build, at the moment of this research. Column lists below are the actual
CSV header row.

### 3.1 Maps, zones, world geometry — CONFIRMED present

| Table | Status | Notable columns (from live header) |
| --- | --- | --- |
| `Map` | CONFIRMED | `ID, Directory, MapName_lang, MapType, InstanceType, ExpansionID, AreaTableID, ParentMapID, WdtFileDataID, MaxPlayers, …` |
| `AreaTable` | CONFIRMED | `ID, ZoneName, AreaName_lang, ContinentID, ParentAreaID, AreaBit, ZoneMusic, ExplorationLevel, Flags_0/1, LiquidTypeID_0..3, …` |
| `AreaPOI` | CONFIRMED | `Name_lang, Description_lang, ID, Pos_0/1/2, ContinentID, AreaID, WMOGroupID, PoiDataType, …` (map POI icons with world-space coordinates) |
| `AreaTrigger` | CONFIRMED | `Pos_0/1/2, ID, ContinentID, Radius, ShapeType, …` (trigger volumes, e.g. zone transitions) |
| `TaxiNodes` | CONFIRMED | `Name_lang, Pos_0/1/2, ID, ContinentID, Facing, …` (flight-master points, with coordinates) |
| `Light` / `LightParams` | CONFIRMED | environment/skybox data per map region — probably out of scope but exists |
| `ZoneMusic` / `ZoneIntroMusicTable` | CONFIRMED | ambient/zone audio, out of scope but exists |

`Map.AreaTableID` and `AreaTable.ParentAreaID`/`ContinentID` give a
CONFIRMED path to reconstruct the zone hierarchy (continent → zone → subzone)
directly from these two tables.

### 3.2 Coordinate-transform / world-map-to-UI-map tables — CONFIRMED, but under different names than guessed

The task brief named `WorldMapArea`/`WorldMapContinent`/`WorldMapTransforms`
as candidates. **CONFIRMED these exact table names do NOT exist** in this
build (`https://wago.tools/db2/WorldMapArea/csv?...` etc. all returned HTTP
404 `{"errors":"Table not found."}`). Those are pre-Legion (MPQ/.dbc-era)
table names; the client's schema moved on.

**CONFIRMED replacement tables exist** and appear to be the modern
equivalent (retail-style `UiMap*` system, present even in this Classic-beta
build):

| Table | Status | Notable columns |
| --- | --- | --- |
| `UiMap` | CONFIRMED | `ID, Name_lang, ParentUiMapID, Type, System, …` |
| `UiMapAssignment` | CONFIRMED | `ID, UiMapID, MapID, AreaID, UiMin_0/1, UiMax_0/1, Region_0..5, …` — this is the actual world-coordinate ↔ UI-map-percentage transform table (bounding box + region) |
| `UiMapArt` / `UiMapXMapArt` | CONFIRMED | map texture/art linkage |
| `WorldMapOverlay` | CONFIRMED | `ID, UiMapArtID, TextureWidth/Height, OffsetX/Y, HitRect*, AreaID_0..3, …` — sub-region overlays with area associations |

(`UiMapPoint` and `UiMapLink` were also tried and returned 404 — not present
under those names.)

**STRONG INFERENCE**: `UiMapAssignment` is the table our
Geographic/Entity Graph and coordinate-system design should target for
world→map transforms, not the old `WorldMapArea` name assumed in the task
brief. This should be verified further once real coordinate math is
implemented (see Open Questions).

### 3.3 Quests — CONFIRMED, but data is far more fragmented than a single "Quest" table

**CONFIRMED**: there is **no** table literally named `Quest` in this build
(404). Quest data on the client side is split across many small DB2 tables,
several of which were directly verified:

| Table | Status | Notable columns |
| --- | --- | --- |
| `QuestV2` | CONFIRMED | `ID, UniqueBitFlag, UiQuestDetailsThemeID` — minimal, just quest ID + flags |
| `QuestInfo` | CONFIRMED | `ID, InfoName_lang, Type, Modifiers, Profession` — quest category labels (Elite, Raid, Dungeon, PvP, …) |
| `QuestSort` | CONFIRMED | `ID, SortName_lang, UiOrderIndex, Flags` — quest log sort/category headers |
| `QuestXP` | CONFIRMED | `ID, Difficulty_0..9` — XP reward table by content-difficulty band |
| `QuestFactionReward` | CONFIRMED | reputation reward table, same difficulty-band shape |
| `QuestPOIPoint` | CONFIRMED | `ID, X, Y, Z, QuestPOIBlobID` — quest objective map-marker coordinates |
| `QuestPOI` | NOT FOUND (404) | tried directly, table absent under this name in this build |

**Not directly tested but likely present, based on general WoW DB2 schema
knowledge** (**SPECULATION**, not verified this session): quest text/title,
objectives, prerequisite chains, and giver/turn-in NPC links normally live in
tables such as `QuestTemplate`-adjacent client tables (naming varies by
client era) — this session did not exhaustively probe the full quest-table
family (there are 15-20+ Quest* tables in a modern client) and cannot
confirm the exact name(s) that carry quest title/objective text for this
build. **This is an open question requiring further probing before schema
design** (see §5).

### 3.4 Creatures / NPCs — CONFIRMED present, but definitions only, no spawn coordinates

| Table | Status | Notable columns |
| --- | --- | --- |
| `Creature` | CONFIRMED | `ID, Name_lang, NameAlt_lang, Title_lang, Classification, CreatureType, CreatureFamily, DisplayID_0..3, …` — this is NPC **definition** data (name/type/model), no world position |
| `CreatureDisplayInfo` | CONFIRMED | model/visual data per display ID |

**CONFIRMED, important for schema design**: neither `Creature` nor
`CreatureDisplayInfo` carries a world position. Client DB2 does not ship
NPC spawn locations — those are server-authoritative (typically a
`creature`/spawn table in whatever database engine runs the server, e.g.
TrinityCore-style SQL on private servers). **This means wago.tools/DB2 alone
cannot give us "where is this NPC in the world" — that has to come from a
Forever-specific server-side data source, not from wago.tools.** This is a
material finding for the Data Source Matrix.

### 3.5 GameObjects — CONFIRMED present, and (unlike creatures) some do carry positions

| Table | Status | Notable columns |
| --- | --- | --- |
| `GameObjects` | CONFIRMED | `Name_lang, Pos_0/1/2, Rot_0..3, ID, OwnerID, DisplayID, Flags, Scale, TypeID, PhaseID, …` — this table **does** include world-space position/rotation |
| `GameObjectDisplayInfo` | CONFIRMED | `ID, GeoBox_0..5, FileDataID, …` — model/geometry data per display ID |

**STRONG INFERENCE**: this `GameObjects` DB2 table is the modern
(post-Legion) mechanism for a specific subset of static/hotfix-driven object
placements (e.g. world-quest objects, seasonal objects) — not necessarily a
complete listing of every static object placed in the world by map/WDT data
(most map-authored static objects are baked into WDT/ADT files, not this
DB2 table). **Not confirmed** how complete `GameObjects` is for Forever's
actual object placements; needs follow-up.

### 3.6 Instances / dungeons / raids — CONFIRMED present via `Map` + dedicated tables

| Table | Status | Notable columns |
| --- | --- | --- |
| `Map.InstanceType` | CONFIRMED | field exists on `Map` (values observed: 0, 1, 2 in the small sample pulled) |
| `LFGDungeons` | CONFIRMED | `ID, Name_lang, Description_lang, TypeID, ExpansionLevel, MapID, DifficultyID, MinGear, …` — Dungeon Finder listing, maps dungeon/raid name to `MapID` |
| `MapDifficulty` | CONFIRMED | `ID, DifficultyID, LockID, MaxPlayers, MapID, Message_lang, …` — per-map difficulty configs (e.g. raid size) |
| `DungeonEncounter` | CONFIRMED | `ID, Name_lang, MapID, DifficultyID, OrderIndex, Bit, …` — this is the boss/encounter listing keyed to a map |

### 3.7 Boss "journal" (encounter journal / Adventure Guide) — NOT FOUND under the guessed names

**CONFIRMED**: `JournalEncounter`, `JournalInstance`, and `JournalTier` all
returned HTTP 404 ("Table not found") against build `1.60.1.69913`. These
are the modern retail Encounter Journal table names (introduced Cataclysm+);
their absence here is plausibly because this Classic-lineage build doesn't
ship the Encounter Journal feature/UI at all, or uses different table names.
**Best verified substitute found**: `DungeonEncounter` (§3.6) gives boss
name + map + difficulty + ordering, which may be sufficient for an atlas
"which bosses are in this dungeon" feature even without journal flavor text.
Flavor-text/lore fields (if any exist for Forever) are **unverified** — open
question.

### 3.8 Items — CONFIRMED present

| Table | Status | Notable columns |
| --- | --- | --- |
| `Item` | CONFIRMED | `ID, ClassID, SubclassID, InventoryType, IconFileDataID, …` |
| `ItemSparse` | CONFIRMED | `ID, Description_lang, Display_lang, ExpansionID, ItemRange, StatPercentEditor, …` — the "full" item record (name, description, stats) |
| `ItemXItemEffect` | CONFIRMED | item-to-spell-effect linkage |

This matches how `ElliotWood/Forever` itself sources item data (§2), giving
double confirmation that the Item/ItemSparse pair is real and usable.

### 3.9 Misc confirmed-useful tables found along the way

`Faction`, `ChrRaces`, `ChrClasses`, `SkillLine`, `Achievement` all returned
CONFIRMED 200 responses with substantive columns — useful for entity
metadata/labels elsewhere in the Atlas, not core to geography.

### 3.10 Summary table

| Atlas need | DB2 table(s) confirmed | Verified? |
| --- | --- | --- |
| Map / continent list | `Map` | CONFIRMED |
| Zone / subzone hierarchy | `AreaTable` | CONFIRMED |
| World→UI-map coordinate transform | `UiMapAssignment`, `UiMap`, `WorldMapOverlay` | CONFIRMED (name differs from brief's guess) |
| Quest existence/flags | `QuestV2`, `QuestInfo`, `QuestSort` | CONFIRMED |
| Quest map markers | `QuestPOIPoint` | CONFIRMED |
| Quest title/objective text | *unknown table name* | **NOT VERIFIED** |
| NPC definitions (name/type/model) | `Creature`, `CreatureDisplayInfo` | CONFIRMED |
| NPC spawn locations | *none in DB2* | CONFIRMED ABSENT — needs a server-side source |
| Static object placement + position | `GameObjects` | CONFIRMED (completeness unverified) |
| Dungeon/raid ↔ map linkage | `LFGDungeons`, `MapDifficulty`, `Map.InstanceType` | CONFIRMED |
| Boss/encounter listing | `DungeonEncounter` | CONFIRMED |
| Encounter Journal / lore text | `JournalEncounter` etc. | CONFIRMED ABSENT under that name |
| Items | `Item`, `ItemSparse` | CONFIRMED |

---

## 4. Licensing / redistribution notes

- **wago.tools itself**: **CONFIRMED no explicit license/ToS page was found**
  on the site. The only legal marking observed is the footer copyright,
  "© 2021 - 2026 Wago Tools. All rights reserved." There is no visible EULA,
  API terms, or redistribution policy for the DB2 exports. The site's GitHub
  link on the footer points to a maintainer account
  (`https://github.com/QartemisT`), whose public repos include
  `DBCDumpHost` ("Tool powering DBC pages/model viewer data on wow.tools") —
  **STRONG INFERENCE** this is the same person/toolchain behind wago.tools'
  sibling site wow.tools, but this session did not locate wago.tools' own
  source repository or a license file for it specifically.
- **The underlying data itself (DB2 tables) is Blizzard Entertainment's
  copyrighted game client content**, extracted/mirrored by a third-party
  community tool. **SPECULATION**: this operates in the same long-standing
  legal gray area as Wowhead, wow.tools, and every other WoW data-mining
  site — tolerated by Blizzard in practice, not formally licensed for
  redistribution or commercial reuse. This project should **not** assume a
  clear legal right to bulk-redistribute raw DB2 exports; treat wago.tools
  as a research/ingestion input, not a redistribution-safe data source, until
  actual legal terms are found (or a lawyer/maintainer is consulted).
- **`ElliotWood/Forever` (the GitHub repo)**: **CONFIRMED MIT License**,
  inherited from `wowsims/classic` (copyright "wowsims team", 2024, per the
  `LICENSE` file fetched directly). The README explicitly asks downstream
  users to "keep a user visible link back to wowsims/classic in anything
  built on this." This license covers the **simulator code**, not any
  Blizzard game data it references — it does not grant any rights over the
  DB2 data itself.
- **No indication** either source imposes API rate limits or authentication;
  none was hit during this session's direct CSV/API probing (a few dozen
  unauthenticated GET requests all succeeded immediately). This should not be
  read as a guarantee — a real importer should still be a polite, rate-limited
  client and cache aggressively rather than re-fetching on every run.

---

## 5. Open Questions

1. **Which DB2 table(s) carry quest title, description, and objective text**
   for this build? `QuestV2`/`QuestInfo`/`QuestSort` only gave flags and
   category labels; the actual quest narrative/objective text table was not
   identified in this session's limited probing and needs a systematic sweep
   of the `Quest*` table family (there are commonly 15-20 such tables in a
   modern client schema).
2. **Where do NPC and GameObject spawn locations actually come from for
   Forever**, given `Creature`/`CreatureDisplayInfo` confirmed have no
   position data? Options to investigate: the private server's own database
   (if Forever's server software/dump is available to this project), ADT/WDT
   map-file parsing (a much heavier extraction path, not wago.tools-based),
   or community addon data (e.g. Questie-style spawn databases, which are
   *not* DB2-sourced and would need their own SOURCE_*.md — see
   `docs/SOURCE_QuestieDB.md` per the project's docs index).
3. **How complete is the `GameObjects` DB2 table** relative to all
   objects actually placed in Forever's world? Likely covers only a specific
   hotfix/dynamic-object mechanism, not every static object — needs
   confirmation against a known zone's object count from another source.
4. **Is there a Forever-specific Encounter Journal / lore-text table** at
   all, given `JournalEncounter`/`JournalInstance`/`JournalTier` are absent?
   Or does Forever (being Classic-lineage) simply never have shipped this
   feature, meaning boss lore text has no client-data source and would need
   Wowhead/community text instead?
5. **What is wago.tools' actual policy on data reuse/redistribution?** No
   ToS page was found; worth directly asking on their Discord (linked from
   the footer) before this project ships any redistributed DB2-derived
   dataset publicly, rather than relying on the community-norm assumption
   in §4.
6. **Does the Forever beta client (`wow_classic_beta` 1.60.x) actually
   contain new/modified zones, quests, or NPCs beyond the talent/item
   changes `ElliotWood/Forever` tracks?** This document confirmed the tables
   *exist* and are queryable, but did not diff Forever's `Map`/`AreaTable`/
   `Creature`/`QuestV2` row counts against a known-good pre-Forever Classic
   Era build to see whether Forever has added any new geography yet. That
   diff is the real test of whether wago.tools is useful as a *Forever*
   source versus just a generic Classic-lineage source.
7. **Build-pinning strategy**: Forever is in active beta and its DB2 build
   number changes frequently (confirmed: `1.60.1.69893` → `1.60.1.69913`
   between the README's writing and this session). The Atlas's ingestion
   pipeline needs an explicit policy for tracking/pinning to a build (mirrors
   `ElliotWood/Forever`'s own 6-hourly watcher pattern, §2.1) rather than
   silently drifting.
