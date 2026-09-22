# Source: Questie / QuestieDB / Quest TLDR

Research pass on the Questie addon ecosystem as a candidate Vanilla/Classic quest-data
baseline for WoW Forever Atlas. Findings labeled per project convention.

Primary sources consulted (all fetched directly, September 22 2026):
- https://github.com/Questie/Questie (main addon, `master` branch)
- https://github.com/Questie/QuestieDB (data library, `master` branch), plus its raw files
  `README.md`, `PROVENANCE.md`, `CONTEXT.md`, `docs/api.md`, `docs/forever.md`
- https://www.curseforge.com/wow/addons/quest-tldr

## 1. What Questie / QuestieDB is

**CONFIRMED.** Questie (`Questie/Questie`) is a long-running, actively maintained WoW Classic
quest-helper addon (1.1k GitHub stars, 364 forks, 22,355+ commits, 491 releases, latest
`v11.38.0`). It draws quest notes on the map/minimap (start/turn-in/objective markers), tracks
quest progress, shows party members' quest progress, supports a searchable "Quests by Zone"
journal, and ships translations for all official WoW Classic client languages plus
community-added Ukrainian.

**CONFIRMED.** `QuestieDB` (`Questie/QuestieDB`, formerly named `QuestieTDB`) is a **separate**
repository/project that owns "Questie's data model" — the actual entity database — while
Questie itself is now just one consumer of it. QuestieDB has its own release cycle, its own
contract-versioned public Lua API (`LibQuestieDB`, plus shorthand globals `QuestDB`, `NpcDB`,
`ItemDB`, `ObjectDB`), and its own generator/validation toolchain, independent of a Questie
checkout.

**CONFIRMED.** Both repositories are unusually heavily engineered/documented for WoW addons:
they contain `CLAUDE.md` and `AGENTS.md` files, ADR (architecture decision record) directories,
and very precise engineering vocabulary docs (`CONTEXT.md`). This indicates active,
professionalized (and likely AI-agent-assisted) maintenance, not an abandoned scrape dump.

## 2. What data QuestieDB contains

**CONFIRMED**, from `docs/api.md` and `docs/forever.md`:

- Four entity types, each with an identical read API: **Quest, Npc, Item, Object**.
- Quest schema has 36 fields (`LibQuestieDB.Meta.Quest.fieldCount`), including `name`,
  `startedBy`, `finishedBy`, `objectives`, `objectivesText`, `requiredLevel`, `triggerEnd`,
  `preQuestSingle`, `requiredRaces`, and more. Field names/indices are generated from Questie's
  original key enums (`questKeys`, `npcKeys`, `itemKeys`, `objectKeys`).
- **Coordinates** are stored per entity as `spawns(id) -> { [zoneOrMapId] = { {x, y}, ... } }`
  (example given: `NpcDB.spawns(30) --> { [12] = { {36.43, 55.89}, ... } }`). Coordinates are
  preserved "raw" — no legacy compiler-grid quantization — in both its two read modes.
- **Quest chains / prerequisites** exist as fields (`preQuestSingle`, `startedBy`, `finishedBy`,
  and `objectives` with typed sub-objectives: kill-credit, object, item, event, spell).
- NPC `minLevelHealth`/`maxLevelHealth` are explicitly **deprecated** and now return placeholder
  values (`0`/`1`) — NPC health is no longer stored at all.
- **Localization**: nine generated non-English locales (`deDE esES esMX frFR koKR ptBR ruRU zhCN
  zhTW`) plus support for arbitrary "custom" locales via a correction mechanism; `enUS` is the
  base/authoritative language.
- **Coverage by expansion ("flavor")**: Classic Era, TBC, Wrath, Cataclysm, Mists — **and
  Forever** (see §4). Vanilla/Era also serves "Season of Discovery" (SoD); Wrath also serves a
  "Titan Reforged" season.
- **Support data** (separate from the entity store): zone/UI-map lookup tables, quest XP
  tables, drop tables, and faction templates, shipped as plain Lua tables/strings.

**CONFIRMED**, storage/architecture detail (may matter for our own pipeline design, not
necessarily for reuse): data ships two ways — "Source mode" (plain Lua tables, corrections
applied live) and "Baked mode" (pre-generated, CBOR-encoded columns embedded as WoW addon TOC
metadata, decoded lazily at runtime with no file I/O). A generator (`generate.lua` / Python
orchestration) turns owned source data + "Corrections" (targeted fact fixes, `id -> field ->
value`) into the Baked artifact. This corrections-registry design (Static, folded in at build
time, vs. Dynamic, applied at query time, with clear ownership/precedence rules) is a
reasonably mature pattern and could be a useful *design reference* for how we structure our own
correction/override layer — independent of whether we ever ingest their actual data.

## 3. Quest TLDR — what it is and how it relates to QuestieDB's data

**CONFIRMED**, from the live CurseForge listing (page title: "(Forever) Quest TLDR", project ID
1701570, author **Sinatrax**):

- Quest TLDR is a WoW addon that condenses quest text into a checklist panel next to the quest
  window: objective checklist with counters, numbered steps for long quest text, coordinates for
  mob/object/item sources, turn-in NPC location, clickable names opening map waypoints. It works
  in the quest dialog, quest log, and world map.
- **It is explicitly built for, and only distributed for, WoW Forever**: "Flavors: Forever",
  "Game Versions: 1.60.1", description says "Built for WoW Forever."
- **Stated data source, verbatim**: *"Quest data based on the open QuestieDB project."* This
  confirms Quest TLDR is a presentation/UX layer over QuestieDB's data, not an independent data
  source — same underlying facts, different UI treatment (checklist vs. map pins/tracker).
- **Coverage stated on the page**: "All 4244 vanilla quests, with 3842 NPCs, 749 objects and
  2783 items." This is Classic/Vanilla-era coverage.
- **Explicit gap, stated by the author**: *"Quests added in Forever aren't in the database yet:
  for those you still get the checklist, steps and text hints, just no coordinates."* This is a
  direct, first-party confirmation of the exact gap our project's brief anticipates for
  Forever-original quests.
- **License**: CurseForge lists Quest TLDR's license as **"All Rights Reserved."**
- Author Sinatrax also publishes a second, related Forever-only addon, "Forever - Quest
  Marker" (nameplate markers for active-quest mobs), reinforcing that this is a small
  Forever-focused addon-author ecosystem building on top of QuestieDB rather than a
  distinct data pipeline.

## 4. QuestieDB already has first-class "Forever" support — this is the headline finding

**CONFIRMED**, directly from the QuestieDB repository (file tree, `README.md`, `docs/forever.md`,
`PROVENANCE.md`), as of the September 2026 snapshot fetched:

- **`Forever` is one of QuestieDB's six generated "flavors"** (Vanilla/Era, TBC, Wrath, Cata,
  Mists, **Forever**), with its own owned input directories: `data/Forever`,
  `src/corrections/Forever`, `l10n/Forever`, `support/Forever`, and its own
  `foreverQuestFixes.lua` / `foreverNPCFixes.lua` / `foreverItemFixes.lua` /
  `foreverObjectFixes.lua` correction files.
- Recent commit history on the repo's file listing includes: "feat(corrections): add Forever
  correction templates," "feat: update TOC metadata with detailed author and category
  information," "implement Forever raceKeys & sortKeys," "docs: document Forever integration and
  maintenance," "feat(dbc): generate Forever map support candidates," "[feature] Support Forever
  in QuestieDB," and "feat(validation): add Forever checks and Golden baseline." The very latest
  commit on `master` at fetch time was *"Revert 'add Forever zone lookups'"* — i.e. Forever
  support is actively in flux, not finished/stable.
- **A dedicated Era→Forever coordinate migration toolchain exists** (`questiedb.sh
  dbc-coordinates`, `questiedb.sh convert-forever`), built against Blizzard DBC (client
  database) exports. Per `docs/forever.md`: conversion "changed 13,691 [coordinate] pairs and
  explicitly retained six unresolved points"; current maps contain "1,064 forward and 54
  canonical reverse DBC relationships, plus 40 compatibility pairs." The adopted source/target
  client builds are recorded as **1.15.9.69722 → 1.60.1.69893** (with a separately "researched"
  Forever UI-source build of 1.60.1.69913 noted as *not* the same build).
- **Client identification is unsettled**: the Forever client is selected in QuestieDB's TOC via
  `AllowLoadGameType camelot, forever` — both tokens map to the same owned files. The docs
  explicitly flag that "camelot" is currently the default/working token and that "a subsequent
  user-run probe reported `camelot, forever selected`," but caution this does **not** prove the
  `forever` token is recognized independently, nor has full client-build/native-selection
  acceptance been established. **STRONG INFERENCE**: "Camelot" may be an internal/legacy
  codename for the WoW Forever server core or client build (this is not stated anywhere we
  found, and is not confirmed).
- The docs are candid about incompleteness: *"This is not complete new Forever content: dungeon
  entrances, consumer-supplied coordinates, new entities and race/class policy still need
  separate review,"* and *"No production release or client installation is authorized by these
  offline checks"* — i.e., as of this snapshot, Forever support in QuestieDB is a **work in
  progress**, primarily consisting of (a) legacy Vanilla quest/NPC/item/object data carried over
  unchanged, plus (b) coordinate-conversion tooling remapping Era coordinates onto Forever's UI
  maps, plus (c) a small and growing set of Forever-specific hand-authored corrections. It is
  explicitly **not** a source of new Forever-original quest content.
- **PROVENANCE.md** confirms QuestieDB's own data pedigree: its schema and initial data were
  imported from `Questie/Questie` at commit `454b9d0` (Sept 15 2026, "Bump version to v11.38.0"),
  then diverged — "QuestieDB now maintains these sources directly." Corrections trace back to
  Questie's `Database/Corrections/`; support data (zones, quest XP, drop tables, faction
  templates) traces back to Questie's `Database/`.

**Implication for us**: the existence of this in-progress Era→Forever coordinate-conversion
tool is directly relevant to our own "Geographic/Entity Graph" and "Coordinate System" design
work — it demonstrates the problem is real (Classic-era coordinates do not map 1:1 onto
Forever's UI maps) and shows one plausible technical approach (DBC-diff-based point remapping),
even though we should not adopt their artifacts or IDs directly (see §6).

## 5. What would carry over as a Classic baseline vs. what's missing

**STRONG INFERENCE**, synthesizing §2–4:

| Category | Carries over from Questie/QuestieDB roughly unchanged | Needs Forever-specific correction | Entirely missing from any Classic-era dataset |
|---|---|---|---|
| Vanilla quest givers, objectives, text, chains | Yes — this is the ~4,244-quest Classic baseline both QuestieDB and Quest TLDR cite | — | — |
| Vanilla NPC/object/item identity (name, IDs, relationships) | Yes | — | — |
| Vanilla NPC/object/item **coordinates** | Partially — QuestieDB is mid-migration; ~13.7k pairs already converted, 6 unresolved, dungeon entrances not yet handled | Yes — coordinate frame differs on Forever's UI maps; this is an active, unfinished effort upstream | — |
| Server-side availability of a Classic quest (may be pulled, altered, or gated differently on Forever) | No — Questie/QuestieDB has no way to know Forever's live server-side quest tables | Yes | — |
| Forever-original quests (brief's ~1,200 new quests) | No | N/A | **Yes — confirmed missing.** Quest TLDR's own page states this outright: Forever-added quests have "no coordinates" in its (QuestieDB-backed) database yet, and get only generic text-parsed hints. |
| Forever-original NPCs/objects/items tied to those new quests | No | N/A | Yes, by the same logic |
| Forever-specific race/class quest-availability rules | Actively being built (`raceKeys`/`sortKeys` commits) but unfinished per the docs | Yes | Partially |

**SPECULATION**: given QuestieDB's admitted instability on Forever support (a revert commit is
the very latest change we observed), treating it as a live upstream dependency would be risky;
treating a **snapshot** of its Vanilla-era tables as one input signal for entity matching is more
defensible than depending on its evolving Forever-specific layer.

## 6. Licensing and redistribution

**CONFIRMED**: Neither `Questie/Questie` nor `Questie/QuestieDB` has a `LICENSE`,
`LICENSE.md`, or `COPYING` file. Verified by:
- Direct fetch of `raw.githubusercontent.com/Questie/Questie/master/LICENSE` → 404.
- Direct fetch of `raw.githubusercontent.com/Questie/QuestieDB/master/LICENSE` → 404.
- Both repos' GitHub "About" sidebar lists only "Readme" under Resources — no license badge
  (GitHub surfaces a detected license there automatically when one exists; its absence here is
  itself a signal, not just an artifact of our search).

**CONFIRMED**: Quest TLDR's CurseForge listing states its license as **"All Rights Reserved."**

**STRONG INFERENCE**: With no license file granting rights, default copyright applies — the
authors have not granted any explicit permission to copy, redistribute, or build a derivative
database from QuestieDB's data or Questie's data outside of using the addon as-is in a WoW
client. GitHub's own Terms of Service note that absent a license, standard copyright law applies
and viewing/forking on GitHub does not itself grant reuse rights. Quest TLDR's explicit "All
Rights Reserved" reinforces the same posture for that project.

**Practical conclusion for WoW Forever Atlas** (consistent with the project's stated principle
that "External source IDs are never used as our primary keys"):
- We should **not** bulk-copy or redistribute QuestieDB's or Quest TLDR's data tables into our
  own canonical database.
- We **can** treat their publicly-documented schema and coordinate/correction methodology as
  design inspiration (already common, unpatentable data-engineering patterns), and we can use
  their public-facing outputs (in-game display, screenshots, community wiki cross-references)
  the way any researcher cross-checks public information — but the bulk structured data itself
  is not confirmed to be freely reusable.
- If we want to use QuestieDB data as a bootstrap/seed for our own independently-verified atlas,
  we should treat it as **requiring explicit permission from the Questie/QuestieDB
  maintainers** before any redistribution, or should independently re-derive equivalent facts
  from primary/permissively-licensed sources (client data files, our own server-side
  observation, community contributions under our own terms).
- **SPECULATION**: because QuestieDB is itself openly building Forever support in the open
  (public repo, public issues), the maintainers may be receptive to a data-sharing or
  collaboration conversation — but no such arrangement is confirmed, and none should be assumed.

## Open Questions

1. Is there any explicit statement anywhere (Discord, wiki, issue tracker) from the
   Questie/QuestieDB maintainers about terms for third-party reuse of the database, beyond the
   absence of a LICENSE file? We did not find one in this pass.
2. Who maintains/operates `Questie/QuestieDB`'s "Forever" flavor, and is that person/group
   affiliated with the WoW Forever server team, Sinatrax (Quest TLDR's author), or an unrelated
   third party? Not established.
3. What is "Camelot" — an internal codename for the WoW Forever server core, a legacy client
   build identifier, or something unrelated? The docs treat it as a live open question
   themselves (tracked in their own Issue #23).
4. What is the actual current state of QuestieDB's Forever coordinate conversion today (this
   doc reflects one snapshot, and the repo's own latest commit was a revert — it is evidently
   still changing rapidly)? Should be re-checked periodically if we ever decide to reference it.
5. Does Quest TLDR (or Forever - Quest Marker) expose any machine-readable export of its data,
   or is all data only accessible by decompiling/reading the addon's Lua source at runtime? Not
   investigated in this pass.
6. Are there other Forever-specific community data efforts (wikis, spreadsheets, Discord
   pinned resources) separate from the Questie ecosystem that already catalog the ~1,200
   Forever-original quests? Not investigated in this pass — worth a dedicated recon pass.
7. Should we contact the QuestieDB or Quest TLDR maintainers directly to ask about
   collaboration/reuse terms before Phase 1 data-pipeline work begins? Recommended, but not
   something this research pass can resolve.
