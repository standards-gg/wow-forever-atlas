# Source Deep Dive: "ForeverAtlas"

Research date: 2026-09-22. This document labels every substantive claim
`CONFIRMED`, `STRONG INFERENCE`, or `SPECULATION` per project convention.
Given how new this ecosystem is (see below), a large share of the findings
are necessarily `STRONG INFERENCE` or `SPECULATION` — this is stated
explicitly rather than glossed over.

## 0. Critical framing correction — read this first

The research brief describes "World of Warcraft: Forever" as **a private
server**. Every piece of evidence gathered points the other way:

- **CONFIRMED**: Established, pre-existing WoW fan-media outlets that this
  research has independent prior knowledge of as legitimate (Wowhead,
  Icy Veins, MMO-Champion) are covering "WoW: Forever" as an **official
  Blizzard product** — a new "Classic+"-style branch alongside Classic and
  retail ("Worldsoul"). Wowhead runs it under `wowhead.com/forever` with a
  dated news pipeline; Icy Veins covers Blizzard dev-team statements about
  its addon policy.
- **CONFIRMED**: A public beta for WoW: Forever opened **2026-09-17**, with a
  stated global launch of **2026-11-04, 3pm PT**. Multiple independent addon
  developer repos (see §5) reference porting work explicitly framed as
  "beta assessment" for that launch window, and one repo (`benjamh681/wow-forever-atlas`,
  see §6) was created on GitHub on exactly 2026-09-17 — the beta's opening
  day — which is consistent with a fresh wave of tooling built around a new
  official beta rather than a mature long-running private-server addon
  ecosystem.
- **CONFIRMED**: Forever runs on the modern ("Mainline"/Midnight-era) client
  UI stack, not the legacy Classic API — `WOW_PROJECT_ID = WOW_PROJECT_MAINLINE`,
  Interface version 16001, sharing "the vast majority of APIs available in
  12.1.5." This is a technical detail that is very unlikely to be true of an
  independent emulator project (those almost always target old, static
  client builds), and strongly supports it being Blizzard's own live-service
  infrastructure.
- **STRONG INFERENCE**: One MMO-Champion forum thread does describe an
  alleged leak of "World of Warcraft: Forever" content, and community
  members in that thread were skeptical, calling it fake. This thread is
  about content *speculation* (a supposed roadmap/expansion leak) and is a
  different question from whether "WoW: Forever" itself exists as a real,
  currently-in-beta Blizzard branch — the beta's existence is corroborated
  independently by the addon-developer evidence in §5, which is not the
  kind of thing a hoax thread would produce.

**Implication:** if "WoW: Forever" is in fact an official Blizzard branch
currently in a ~1-month-old public beta, then there is no "private server"
data-source landscape to map in the sense the brief assumes (no server-side
emulator repos, no custom DBC/server data files reverse-engineered by a
private-server team). Everything discovered below should be read through
that lens. **This document does not resolve the discrepancy — it surfaces
it.** The user/project owner should confirm which "WoW: Forever" is actually
meant before Phase 0 conclusions are finalized, because it changes the
entire sourcing strategy (official client data-mining + community addons,
vs. a private-server team's own DBC exports).

## 1. What "ForeverAtlas" concretely is

- **CONFIRMED**: No GitHub repository named `ForeverAtlas` (or close
  variants) exists — a GitHub code search for "ForeverAtlas" returns zero
  repository results.
- **CONFIRMED**: No CurseForge or Wago addon listing named "ForeverAtlas"
  was found. The only "Atlas"-branded addon found for the Forever branch is
  **AtlasLoot Classic Forever** (CurseForge), which is the long-running
  **AtlasLoot** franchise (an in-game loot-table/BiS browser addon) ported
  to the Forever branch. This is unrelated to zone/map atlases and is very
  likely an unrelated naming coincidence, not "ForeverAtlas."
- **CONFIRMED**: Two live websites use the name: `foreveratlas.com` and
  `wowforeveratlas.com`. Both present as independent, ad/guide-style fan
  content sites (talent calculators, quest walkthroughs, zone/dungeon
  directories, "not affiliated with or endorsed by Blizzard Entertainment"
  disclaimers). Neither exposes a maintainer's name, an organization, a
  GitHub link, an API, or a data-license.
- **STRONG INFERENCE**: These are guide/wiki-style content sites, not an
  addon and not a structured data repository. `wowforeveratlas.com`
  explicitly self-describes its sourcing as **compiled from other public
  sources** (see §3) rather than as an original data pipeline.
- **STRONG INFERENCE**: Given the beta only opened 2026-09-17, and both
  sites read as generic, templated guide content with vague/absent
  authorship, these are most plausibly part of a wave of SEO-oriented fan
  sites that sprang up around a newly announced, hyped Blizzard beta —
  a common and unremarkable pattern in gaming media, but one that means
  neither site should be treated as an authoritative or stable data source.
  Some corroborating signals for this reading: near-total absence of named
  maintainers, no changelog/version history, generic marketing-style prose,
  and (on `wowforeveratlas.com`) a page timestamp of "Updated 2026-09-22" —
  i.e., the day this research was performed.
- A separate, apparently unrelated project, **`benjamh681/wow-forever-atlas`**
  on GitHub ("Travelcraft" web map/route planner, also branded on its
  GitHub Pages site), happens to share almost the exact name of this
  project's own repo. See §6 for why this matters for the project directly.

**Bottom line on "what it is":** ForeverAtlas, as far as could be determined,
is **a pair of independent fan websites** (guide/reference content), **not**
an addon and **not** a data repository with any published schema, export, or
API. No single maintainer or organization could be identified for either
site.

## 2. Relationship to "ForeverLog"

- **SPECULATION / unconfirmed**: No addon, site, or repo literally named
  "ForeverLog" with substantive documentation was found. The only concrete
  mention is a single line on `warcraftforever.games/addons/forevertools`
  describing a different addon ("ForeverTools," a quest/loot automation
  helper) sequencing itself to run "after ForeverLog has recorded the drop."
  That page itself has the same generic, low-provenance character as the
  ForeverAtlas sites (no maintainer name, no GitHub link, no way to verify
  "ForeverLog" actually exists as shipped software) — treat this as
  **unverified**, not as confirmation that ForeverLog is real.
- **CONFIRMED**: A real, verifiable, and likely-related project **does**
  exist under a very similar name: **"Forever Logs"** at `foreverlogs.gg`,
  a Warcraft-Logs-style combat-log analysis platform for WoW: Forever, with
  an open-source uploader client at `github.com/FangYuanWoW/forever-logs-uploader`
  ("live-log and upload World of Warcraft: Forever combat logs to
  foreverlogs.gg"). This is a genuine community telemetry pipeline: players
  run the uploader, it captures `COMBAT_LOG_EVENT_UNFILTERED` data client-side
  and pushes it to a central site for parsing/ranking, exactly like
  Warcraft Logs does for retail/Classic.
- **STRONG INFERENCE**: "ForeverLog" as referenced by the low-provenance
  ForeverTools page is most likely either (a) a garbled/informal reference
  to the real "Forever Logs" (foreverlogs.gg) project, or (b) a fabricated
  detail in generic SEO copy. Either way, no evidence supports "ForeverLog"
  as a distinct, independently-existing addon separate from Forever Logs.
- **Important scope caveat (CONFIRMED from what Forever Logs/its uploader
  actually describes itself as)**: even the real "Forever Logs" project is
  scoped to **combat logs** (DPS/HPS parses, encounter timelines) — the
  Warcraft Logs use case. There is no evidence it collects or feeds an
  atlas-style dataset (zone/quest/vendor/gathering-node/coordinate data).
  **It is not evidence of a telemetry pipeline feeding ForeverAtlas** — no
  link between "Forever Logs" and either `foreveratlas.com` or
  `wowforeveratlas.com` was found anywhere in the material reviewed.

**Bottom line on the relationship:** the two names appear to describe
**unrelated projects that happen to rhyme**. There is no confirmed data flow
from any "ForeverLog"/"Forever Logs" telemetry into "ForeverAtlas" content.

## 3. Data coverage and provenance, by category

Because ForeverAtlas is a guide website rather than a documented pipeline,
provenance had to be inferred from what the sites say about themselves and
from the broader ecosystem. `wowforeveratlas.com` is the only property that
stated its own sourcing explicitly; that statement is treated as the best
available evidence for the whole "ForeverAtlas" brand.

| Category | Likely origin | Basis |
|---|---|---|
| Zones / dungeons / raids / battlegrounds directory | **(c) Other community sources**: official Blizzard "What's Next"/"Found Photos" panel recap posts, plus secondary community preview sites (e.g. a site referred to as "WOWTBC.GG") and Wowhead zone guides | **CONFIRMED** (site's own stated sourcing) |
| Zone/world map imagery | **(c) Other community sources**: datamined map files as surfaced and republished by Icy Veins and Wowhead loading-screen coverage, explicitly caveated on-site as "file presence does not confirm playable content" | **CONFIRMED** (site's own stated sourcing/disclaimer) |
| Talent calculator / character planner | Unclear — no sourcing statement found; could be hand-built from official talent-tree announcements | **SPECULATION** |
| Quests, items, mobs, loot, vendors, gathering nodes, precise in-game coordinates | **No sourcing statement found on any ForeverAtlas property for these categories specifically.** Given (i) the beta is ~1 week old at time of writing, (ii) the site's own admitted reliance on secondhand/datamined sources for the categories it *does* explain, and (iii) the absence of any addon or telemetry pipeline tied to the brand, it is unlikely ForeverAtlas has original, client-verified data for these categories yet | **SPECULATION** |

For contrast, here is what **real, verifiable** Forever-branch data
tooling looks like today (none of it is branded "ForeverAtlas"), which is
useful context for where an atlas project's actual data might need to come
from instead:

- **`Thunderz96/forever-addon-kit`** (GitHub, MIT-licensed): a real,
  empirically-tested repo of API findings for the Forever beta. It captures
  a full client API baseline (6,045 global functions, 11,417 named frames,
  269 namespaces) and ships a tool, **ForeverBeacon**, that harvests quest
  data with map positions directly via "API probes and server queries"
  against the live beta client — i.e., **(a) client/live-server-derived
  data**, not community telemetry. Its README also names the **AllTheThings**
  addon (a long-established WoW collections/quest-tracking addon, ported to
  Forever) as "the best structured Forever dataset found so far" — i.e.
  **(c) another community-maintained addon**, not ForeverAtlas.
- **`Caeth/CleanCombatLog`** and **`FangYuanWoW/forever-logs-uploader`**:
  combat-log tooling, `(a)`/`(c)` client-derived and community-telemetry
  respectively, but scoped to combat parsing, not atlas data.
- **`coffeelover1010/classic-like-wow-forever`**: a Classic-UI-style addon
  port for Forever; not an atlas/data project.

**Overall conclusion on data provenance**: nothing found supports the idea
that "ForeverAtlas" — as it exists today — has a nontrivial data pipeline of
its own. Its zone/dungeon overview content is admittedly secondhand
(official announcements + other fansites' datamining). Item/quest/loot/
vendor/gathering/coordinate-level detail, if ForeverAtlas has any at all,
has no stated source and cannot be confirmed. The *real* client-derived and
telemetry-derived data tooling that exists for the Forever branch right now
lives in separate, unrelated projects (`forever-addon-kit`, `AllTheThings`,
`forever-logs-uploader`), none of which are called ForeverAtlas or
ForeverLog.

## 4. Licensing / redistribution terms

- **CONFIRMED**: No LICENSE file, ToS page, or explicit data-redistribution
  policy was found for either `foreveratlas.com` or `wowforeveratlas.com`.
  The only legal-adjacent statements found are boilerplate: "not affiliated
  with or endorsed by Blizzard Entertainment" and "game imagery belongs to
  Blizzard Entertainment."
- **CONFIRMED**: `benjamh681/wow-forever-atlas` (the unrelated GitHub repo,
  see §6) has **no license field set** (GitHub API reports `license: none`),
  meaning it is "all rights reserved" by default under GitHub's terms —
  its code/content should not be reused without contacting the author.
- **CONFIRMED**: `Thunderz96/forever-addon-kit` is MIT-licensed.
- No license information could be found for `forever-logs-uploader` or
  `CleanCombatLog` from the material reviewed.

**Practical takeaway**: there is no license under which "ForeverAtlas"
content could be legally imported wholesale even if it had useful data —
it would need to be treated as a reference/inspiration source only, with
original data sourced independently (client data-mining, our own community
telemetry, or explicitly-licensed community addons like `forever-addon-kit`).

## 5. Ecosystem map (real projects found, for reference)

| Name | Type | Real/Verified? | Scope |
|---|---|---|---|
| foreveratlas.com | Website | Confirmed to exist; low provenance | Talent calc, quest guides, zone/dungeon directory |
| wowforeveratlas.com | Website | Confirmed to exist; low provenance | Zone/dungeon/raid/BG directory with stated (secondhand) sourcing |
| world-of-warcraft-forever.wiki | Website | Confirmed to exist; low provenance | Generic server-list/addon-category guidance, no named addons |
| `benjamh681/wow-forever-atlas` ("Travelcraft") | GitHub repo + GitHub Pages site | Confirmed real repo (3 stars/3 forks, created 2026-09-17) | Web map/route planner; minimal README, no license, no stated data sources |
| foreverlogs.gg + `FangYuanWoW/forever-logs-uploader` | Website + open-source uploader | Confirmed real | Combat-log upload/analysis (Warcraft-Logs-style) |
| `Thunderz96/forever-addon-kit` | GitHub repo (MIT) | Confirmed real | API baseline capture, quest/position harvesting tool (ForeverBeacon), references AllTheThings port |
| `Caeth/CleanCombatLog` | GitHub repo | Confirmed real | Beta-test combat log display addon |
| `coffeelover1010/classic-like-wow-forever` | GitHub repo | Found via search, not independently opened | Classic-style UI addon port |
| AtlasLoot Classic Forever | CurseForge addon | Confirmed real, unrelated to "atlas" mapping | Loot-table/BiS browser (franchise addon, not map/zone data) |

## 6. Note on naming collision with this project's own repo name

`benjamh681/wow-forever-atlas` on GitHub is a small, currently-maintained,
unlicensed project whose repo name is effectively identical to this
project's own repo name (`wow-forever-atlas`). This is separate from the
already-known `foreveratlas.com` naming coincidence flagged in the task
brief. It doesn't block anything, but:
- it means a plain GitHub search for "wow-forever-atlas" will surface a
  different, unrelated, unlicensed project alongside ours;
- worth double-checking before publishing that our repo's URL/slug doesn't
  get confused with it in search or in community discussion.

## Open Questions

1. **Is "World of Warcraft: Forever" actually the official Blizzard beta
   branch described in §0, or is the project's target actually a
   differently-named private/emulated server that happens to share this
   name?** This is the single most consequential unresolved question — it
   changes whether "Forever Data Sources" means client data-mining of an
   official Blizzard beta client plus community addons/telemetry, or
   reverse-engineered server-side DBC/SQL exports from a private-server
   team. Needs direct confirmation from the project owner.
2. Does "ForeverAtlas" (either site) have *any* actual item/quest/loot/
   vendor/gathering-node/coordinate data, or is it currently limited to
   zone/dungeon-directory-level content plus a talent calculator? Could not
   be fully verified without deeper crawling of both sites' subpages.
3. Is the "ForeverLog" mentioned on `warcraftforever.games` a real, shipped
   addon distinct from "Forever Logs" (foreverlogs.gg), or a naming
   confusion/fabrication in low-quality SEO copy? Unresolved.
4. Who maintains `foreveratlas.com` and `wowforeveratlas.com`? No named
   individual, team, or organization was found on either site.
5. Because the Forever beta is only ~1 week old as of this research date
   (2026-09-22), all findings here have a short shelf life — the addon and
   fan-site ecosystem is likely to change substantially before the
   2026-11-04 launch. This document should be revisited closer to launch.
6. Could not check Wago.io's addon listings or Discord-linked community
   resources directly (no Discord access, and Wago search did not surface a
   "ForeverAtlas" listing in the queries run) — a follow-up pass with direct
   Wago/Discord access would be worthwhile if those are accessible to the
   project owner.
