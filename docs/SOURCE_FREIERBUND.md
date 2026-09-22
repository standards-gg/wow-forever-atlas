# Source Deep Dive: Freier Bund "Map & Guide"

**Site:** https://wow.freierbund.de/map_and_guide/
**Role in this project:** Historical UX / information-architecture reference only.
Freier Bund is the community site of an inactive Classic/Cataclysm-era private
server ("Der Freie Bund", on a realm called "Alleria"), unrelated to WoW:
Forever. We are **not** scraping or reusing its data — only studying how it
organizes and surfaces zone information, because its "what is relevant in
this area?" framing is the conceptual feature this project wants to keep.

Pages reviewed live, via browser automation, on 2026-09-22:
- Zone page: `/map_and_guide/40839/Brennende_Steppe.html` (Burning Steppes)
- Zone "Umgebung" (surroundings) tab: `/map_and_guide/40839-1/Brennende_Steppe-Umgebung.html`
- A quest page: `/map_and_guide/333650/Meisselgriff,_das_Herz_der_Steppe.html`
- A Quest-NPC page: `/map_and_guide/41973/Jalinda_Sprig.html`
- A Landmark/dungeon-complex page: `/map_and_guide/40887/Der_Schwarzfels.html` (Blackrock Mountain)

All findings below are labeled **CONFIRMED** (directly observed in the pages
above), **STRONG INFERENCE** (not stated outright but strongly implied by
consistent patterns across the pages seen), or **SPECULATION** (plausible but
unverified). Quest/NPC/flavor text is described structurally, not quoted at
length.

---

## 1. What a Zone Page Shows

**CONFIRMED.** A zone page (e.g. Burning Steppes) has three distinct content
layers stacked on one URL, switchable via tabs at the bottom of the info box:

1. **Main tab (default view):** a large pannable/zoomable static map image of
   the zone, with a "Zoom: 10%–200%" `<select>` and directional pan arrows
   (this is CSS/JS scaling of one big JPEG tile per zone, not a real
   slippy-map tile pyramid — see §4). Above the map is a one-line quest
   count, e.g. **"Hier starten 79 Quests:"** ("79 quests start here"),
   followed by an alphabetically-sorted flat list of every quest whose quest
   giver is physically in this zone, each entry showing the quest's level in
   parentheses, e.g. `Angriff auf den Schreckensfels (52)`. Below the map is
   a stats box: zone name, original (vanilla) English name, faction hostility
   level ("Allianz: aggressiv"), level range ("Stufe 50 - 52"), and a
   freeform "Bemerkenswertes" (notable things) field that on this page held
   gathering-node flavor: herbs and ore types found in the zone.
2. **"Umgebung" (Surroundings) tab:** a categorized, alphabetized **roster of
   every entity of every type located in the zone** — see §3, this is the
   single most important page for the "what's here" feature.
3. **"Kommentare" (Comments) tab:** a chronological user comment thread
   (18 comments observed), each with free-text, a timestamp, a submitter
   name, and a crowd-sourced 5-point "Wertung" (rating) with up/down vote
   links. Comments are almost entirely player-submitted corrections/tips
   (travel routes, flight master coordinates, drop confirmations) — this is
   the site's only structured "unstructured knowledge" channel.
4. A separate, empty in this case, **"Bilder" (Images) tab** for
   user-submitted screenshots.

**CONFIRMED.** Every entity page in the system (zone, quest, NPC, monster,
landmark, item...) reuses this exact shell: header stats box → Umgebung tab →
Kommentare tab → Bilder tab. There is no different template per entity type;
only the fields inside the stats box vary.

**CONFIRMED.** Every entity page also shows a **breadcrumb** above the stats
box reflecting a strict location hierarchy, e.g. for a quest:
`Brennende Steppe » Flammensternposten » John J. Keeshan » Meißelgriff, das Herz der Steppe`
(Zone → named POI/camp → quest-giver NPC → quest). For an NPC located inside a
dungeon: `Sengende Schlucht » Der Schwarzfels » Jalinda Sprig` (Zone → dungeon
landmark → NPC). This shows the data model treats "location" as a chain of
containment (zone contains POIs/landmarks, which contain NPCs, which give
quests), not a flat tag.

**CONFIRMED.** Subzones/hubs (e.g. "Flammensternposten") are not separate
zone pages with their own maps — they are **Landmark**-type entities (see
§4) that sit in the breadcrumb as an intermediate node. There is no distinct
"subzone" page template.

---

## 2. Quest Relationships

**CONFIRMED — quest chains ("Questfolge").** A quest page shows a
**"Questfolge (N)"** ("quest sequence") box listing the linear chain of
quests leading up to and including the current one, in order, each with its
level; the current quest is the last, unlinked entry. Example observed:
`Hexenmeister haben das beste Zeug (50) → Rückkehr zu Keeshan (50) A →
Meißelgriff, das Herz der Steppe`. Chains are shown strictly as **prior
prerequisite quests**, not as a branching tree and not showing quests that
follow. There is no visible indication of how far the chain continues beyond
the current quest.

**STRONG INFERENCE.** The trailing `A` after "Rückkehr zu Keeshan (50)"
denotes a faction restriction (Alliance-only), and the site models
faction-specific quest variants (e.g. "Angriff auf den Schreckensfels"
appearing three times with three different numeric IDs in the same zone
quest list) as **separate quest entities/pages** rather than one quest with
per-faction branches.

**CONFIRMED — quest giver vs. turn-in NPC are distinct.** The quest page has
a **"Vergeben von" (given by)** field naming/linking the quest-giver NPC, and
a separate freeform note under "Bemerkenswertes": *"Das Quest ist bei
[NPC name] abzugeben"* ("this quest is turned in at [NPC]") when the turn-in
NPC differs from the giver. This is prose, not a structured field — i.e. the
turn-in relationship is captured but not as a first-class linked entity the
way the quest-giver is.

**CONFIRMED — quest ↔ monster linkage.** The same "Bemerkenswertes" field
also lists, as prose with (apparently) each monster name a link, which
monsters must be killed to complete the quest's kill objective. This is the
only quest → objective-target linkage observed; item-fetch objectives were
not directly inspected on this pass but the same free-text pattern is
implied (and the zone's "Umgebung" tab does separately enumerate 37
"Quest-Gegenstand" quest items, so an item ↔ quest link likely exists
similarly — **not directly confirmed**).

**CONFIRMED — quest counts.** Quest counts are surfaced at multiple
granularities: per-zone ("Hier starten 79 Quests"), per-NPC ("Hier startet 1
Quest"), and per-landmark (Blackrock Mountain's Landmark page: "Hier starten
18 Quests"). Quests are always counted/listed at their **starting** location
only — there is no separate "quests turned in here" list.

**CONFIRMED — no explicit hub grouping.** The zone-level quest list is a
single flat alphabetical list, not grouped by quest hub, by chain, or by
level (level appears only as a trailing number per entry). Hub-like grouping
only emerges indirectly through the breadcrumb (POI → NPC → quest) and
through the "Umgebung" roster's NPC list, not through the quest list itself.

---

## 3. Navigation, Discovery UX, and "What's Relevant Here"

**CONFIRMED — the "Umgebung" tab is the actual answer to "what is relevant in
this area?"** For Burning Steppes it renders one alphabetized list per
entity type, each with a count in its heading, e.g.:

```
Händler/Handwerker (18)   — vendors/trainers/crafters, named
Landmark (36)             — sub-areas, camps, dungeon/raid entrances, towers, caves
Monster (109)             — every distinct mob/boss found in the zone (incl. raid bosses)
Ort / POI (2)             — here: two "Geistheiler" (spirit healer) graveyard points
Quest-Gegenstand (37)     — quest items
Quest NSC (65)            — quest-giving/related NPCs
Zone (1)                  — "Sengende Schlucht" (Searing Gorge)
```
No "Erfolg" (Achievement), "Trainer", or bare "Quest" categories appeared for
this particular zone (confirmed absent via direct DOM query — see §4), even
though those categories exist site-wide (see §4). Each name in every list is
a link straight to that entity's own page (same template as §1), so the
"Umgebung" tab functions as a **complete, flat, categorized zone index** —
the closest thing on the site to a full "everything here" view, and
conceptually the single most valuable page pattern for this project's "what
is around me" goal.

**CONFIRMED — the "Zone (1): Sengende Schlucht" entry is the only
zone-to-zone navigation link found on this page.** It is not a list of all
geographically adjacent zones (Badlands and the Redridge Mountains border
Burning Steppes too, per user comments, but are not listed here); it appears
instead because Blackrock Mountain, a Landmark physically straddling both
zones, causes Searing Gorge to be pulled in as a related zone. **STRONG
INFERENCE:** cross-zone navigation on this site rides on shared
landmarks/dungeons rather than on an explicit adjacency graph.

**CONFIRMED — no separate zone-to-zone links elsewhere on the page.** There
is no zone picker, breadcrumb trail of zones, or "nearby zones" widget on the
main tab; the only other route to another zone is the free-text site search
box or an out-of-band link (forum, user comment).

**CONFIRMED — community layer is comment-based, not structured Q&A.** All
"soft" knowledge (travel routes, coordinates, NPC locations not otherwise
captured, corrections) lives in the flat, rated comment thread (§1), not in
structured fields. Several comments on the Burning Steppes page exist only
to state information (e.g. flight master coordinates, alternate travel
routes) that arguably should be structured data but isn't — a **gap** this
project should treat as "structured data we should capture directly" rather
than "leave as freeform comments."

**CONFIRMED — one-big-image map, not tiled/slippy.** Network requests for
the zone page loaded exactly one map JPEG
(`/pics/mapping/1/6/16_21_25_29_0-0-40839.jpeg`) plus fixed-percentage zoom
controls (10–200% in a `<select>`) and directional pan buttons implemented as
`javascript:delta(dx,dy)` calls. No tile requests, no pan-triggered network
fetches were observed. **STRONG INFERENCE:** this is a single raster image
scaled/cropped client-side (or server re-requested per pan step via the
`delta()`/`zoom()` JS calls, which were not triggered in this session), i.e.
a much simpler rendering model than a modern tiled map (Leaflet/Mapbox
style).

**CONFIRMED — entity pins exist over the map but are not exposed as normal
`<a>` links in the accessibility tree**; they were only recoverable via a
direct DOM query for `[title]` attributes (see §4). This means the map's
interactive markers are custom-drawn (absolutely positioned elements with a
`title` tooltip and an `href`, not semantic anchors picked up by standard
accessibility-tree traversal) — a UX pattern worth avoiding if we care about
accessibility/screen-reader support.

**CONFIRMED — "add new entry" affordance is first-class and always visible.**
Every zone/entity page header has a persistent "Fehlt etwas? Einfach Typ
auswählen [dropdown of the 9 entity types] und neu eintragen" ("Missing
something? Pick a type and add a new entry") control — the whole site is
architected as an always-open user-editable wiki/map hybrid, not a
read-only reference.

---

## 4. Evidence of the Underlying Data Model

**CONFIRMED — nine entity "types" exist site-wide**, exposed as the options
of the "add new entry" dropdown, each with its own numeric type-ID:

| Type (German) | English gloss | type-ID (from `<option value>`) |
|---|---|---|
| Erfolg | Achievement | 317456 |
| Händler/Handwerker | Vendor/Crafter | 40675 |
| Landmark | Landmark (sub-area, camp, dungeon/raid entrance, tower, cave, etc.) | 40680 |
| Monster | Monster/NPC-hostile/boss | 40679 |
| Ort / POI | Point of interest (e.g. graveyard/spirit healer) | 315497 |
| Quest | Quest (generic, rarely used directly — see below) | 41972 |
| Quest-Gegenstand | Quest item | 43227 |
| Quest NSC | Quest-related NPC | 40674 |
| Trainer | Class/profession trainer | 40684 |

**CONFIRMED — URL/ID structure.** Every entity (zone, quest, NPC, monster,
item, landmark…) is addressed as `/map_and_guide/{numericID}/{URL-encoded
Name}.html`, e.g. `40839/Brennende_Steppe.html` (the zone itself),
`333650/Meisselgriff...html` (a quest), `41973/Jalinda_Sprig.html` (an NPC),
`40887/Der_Schwarzfels.html` (a landmark/dungeon complex). Non-main tabs
append a suffixed path segment, e.g.
`/map_and_guide/40839-1/Brennende_Steppe-Umgebung.html` for the Surroundings
tab and `.../Brennende_Steppe-Bilder.html` for Images.

**STRONG INFERENCE — one flat, shared primary-key space for all entity
types.** Observed numeric IDs span overlapping ranges regardless of type
(zone 40839; Quest-NSC-type instances 41973–41979; a quest instance 333650;
a monster instance 41277; a quest item 98311; landmarks from 40747 up to
333609+; the *type* IDs themselves cluster at 40674–40684 and 315497/317456/
43227/41972). This pattern — one incrementing numeric ID reused across every
kind of record, including the 9 "type" taxonomy rows — is consistent with a
single flat "objects" table (a `type` foreign key plus a polymorphic field
set) rather than one table per entity type. Not directly confirmed (no
schema or API was ever exposed to inspect).

**CONFIRMED — pin/marker system, discovered via direct DOM query (not the
accessibility tree)** on the Burning Steppes map. Querying all elements with
a `title` attribute of the form `"{Type}: {Name}"` gave, for this single
zone:

| Pin type | Pins on this map | Unique entities |
|---|---|---|
| Monster | 737 | 108 |
| Quest-Gegenstand | 260 | 36 |
| Quest NSC | 69 | 57 |
| Landmark | 56 | 36 |
| Händler/Handwerker | 18 | 18 |
| Ort / POI | 2 | 1 |
| Zone (self-label) | 1 | 1 |
| Quest, Trainer, Erfolg | 0 | 0 |

**CONFIRMED, key insight:** map pins and canonical entity pages are
decoupled many-to-one — e.g. one Monster entity page can be pinned at
dozens of spawn coordinates on the same map (737 monster pins for only 108
distinct monster entities), and one Landmark can have multiple pins tracing
its extent/path (e.g. a mountain pass). Vendors, by contrast, had exactly
one pin per entity (18/18) — single fixed-position NPCs don't need repeat
pins. **This confirms the data model separates "canonical entity" from
"placement" as two different concerns** (one entity, N placements) — an
important pattern for our own schema.

**CONFIRMED — no client-facing API.** Network monitoring during page load
showed only static asset requests (HTML, CSS, JS, JPEG/PNG/GIF); no XHR/JSON
calls were observed. Map zoom/pan and the "vote on a comment" affordance are
implemented as `javascript:` pseudo-URLs (`zoom(1)`, `delta(0,-1)`,
`vote(321395)`) calling into a bundled `ajax.js`/`functions.js`, which were
not triggered/inspected further in this pass. **STRONG INFERENCE:** this is
a classic 2000s-era PHP server-rendered site (`index.php?pID=NN` for regular
content pages) with light AJAX bolted on, not an API-driven SPA — there is
no JSON data source to even consider reusing.

**CONFIRMED — reverse links from Achievements exist.** The Blackrock
Mountain Landmark page shows "Teil von 2 Erfolgen:" (part of 2 achievements)
listing two zone-exploration achievements that reference it. This is the
only Achievement-entity interaction observed and shows achievements are
linked as reverse-references from the things they involve, rather than
achievements owning a rich structured criteria model.

---

## 5. Coverage: What's Modeled vs. What's Missing or Shallow

**Present / well-modeled (CONFIRMED):**
- Zones, with level range and faction hostility.
- Quests, with level, giver, reward XP/money, kill-objective monster links,
  turn-in note, and a linear prerequisite chain.
- Quest NPCs, Vendors/Crafters, Monsters, Quest Items, Landmarks, POIs —
  each a first-class entity type with its own page.
- Gathering nodes — but **only as unstructured prose** in the zone's
  "Bemerkenswertes" field ("Kräuter: Sonnengras, Feuerblüte, Traumblatt / Erz:
  Mithrilvorkommen") — herb/ore *names* only, no node counts, density, or
  map placement as pins. This is much shallower than the pin-based
  NPC/monster/item model.
- Achievements — exist as an entity type and are cross-linked from things
  they reference (e.g. landmarks), but none appeared as pins in this zone at
  all (0 Erfolg pins), suggesting sparse/optional coverage.
- Dungeon/raid **entrances** are modeled as ordinary Landmark entities
  (e.g. "Der Schwarzfels" = Blackrock Mountain) whose "Bemerkenswertes" field
  contains **freeform prose** naming the instances inside
  (Schwarzfelstiefen/BRD, Ober-/Unterschwarzfelsspitze/UBRS+LBRS, Molten
  Core/MC, Blackwing Lair/BWL) and access notes. Quests can start at a
  Landmark directly (18 quests start at Blackrock Mountain).

**Notably absent or shallow (CONFIRMED absent on the pages checked):**
- **No structured per-dungeon or per-raid interior data.** No boss list with
  per-boss loot, no instance-internal map, no separate "instance zone" page —
  everything about what's inside Blackrock Mountain's four instances is a
  single prose blob on the outdoor Landmark page.
- **No flight paths / flight master network as structured data.** A flight
  master's *existence* only surfaced as a user comment giving raw
  coordinates ("Der Flugmeister für die Horde steht bei 65,24"), not as a
  Trainer/Vendor/Landmark pin or any structured field.
- **No Trainer pins in this zone** (Trainer is a defined entity type
  site-wide, 0 instances here).
- **No gathering-node coordinates/pins** — contrast with monsters/vendors,
  which get exact map pins; herbs/ore are zone-level flavor text only.
- **No fishing pool data** — a user comment asks "Where can you fish in
  Burning Steppes?", implying no structured answer exists anywhere on the
  page.
- **No quest reward *items*** were shown on the sampled quest page — only
  XP and a money/bonus figure ("Belohnung: 6810 XP, 40 50 Bonus auf Stufe
  85"); reward items may exist on other quests but were not observed here.
- **No explicit "quests that follow this one"** — chains only show
  backward/prerequisite direction.
- **No adjacency graph between zones** — the only zone-to-zone link found is
  incidental (via a shared dungeon), not a deliberate "neighboring zones"
  feature.

---

## Open Questions

1. Does the "Questfolge" (quest chain) ever show branching (multiple
   possible next quests), or is it strictly linear in all cases? Only one
   3-quest linear chain was sampled.
2. Are quest **item rewards** and **required items** (as opposed to kill
   objectives) modeled as structured item links anywhere, or always prose?
3. Is there a real per-instance/per-raid page anywhere on the site (the
   "Raids" nav item was seen in the sidebar but not opened), or is dungeon
   content always folded into the outdoor Landmark page as observed here?
4. Does the zoom/pan (`zoom()`/`delta()`) trigger any AJAX/JSON calls once
   actually invoked, or is it pure client-side image scaling? Not tested.
5. How are flight paths, fishing pools, and profession trainers actually
   surfaced elsewhere on the site (if at all) — is their total absence here
   specific to Burning Steppes, or true site-wide?
6. Is the "one flat entity/objects table with a shared numeric ID and a
   type discriminator" data-model inference correct, or do type-specific
   tables exist behind the scenes? No schema or API evidence either way.

---

## UX Patterns Worth Preserving (conceptually — not visually or verbatim)

- **A single "surroundings" view per zone that lists every entity type
  present, each with a count, fully cross-linked.** This is the direct
  answer to "what is relevant in this area?" and should be a first-class
  view in our own app (not just a filter side-effect of the map).
- **Decouple "canonical entity" from "map placement."** One monster/NPC/POI
  should be one record with N placements, not N duplicate records — this
  avoids the data-integrity mess visible in Freier Bund's own raw marker
  counts (737 monster pins vs. 108 unique monsters) while still supporting
  "show me every spot this thing appears."
- **Model location as a containment hierarchy (zone → sub-area/landmark →
  NPC/monster → quest), and reflect it as a breadcrumb on every entity
  page.** This gives users an immediate sense of "where am I in the world"
  without needing the map at all.
- **Separate quest-giver from turn-in NPC as first-class linked fields**
  (not prose), and **link quest objectives to the specific monsters/items
  they require** — Freier Bund does this NPC-to-quest link but only half
  (turn-in and kill-targets are prose, not clean relations); we should make
  both fully structured.
- **Show quest chains as an explicit ordered prerequisite list** on the
  quest page itself, and (unlike Freier Bund) also show what quests follow,
  since that's the more common "what do I do next" question.
- **Persistent, low-friction "report/add missing info" affordance** on every
  page — treat the map as continuously correctable, though for our project
  this should feed a moderation/import pipeline rather than being written
  directly like a public wiki.
- **Do not** copy the "everything as a hover-tooltip `title` attribute, not a
  real link" pattern for map pins — it actively hides content from
  accessibility tools and from any non-visual client, which our own
  Explore/Discovery UI should avoid.
- **Do not** copy "gathering nodes / flight paths / fishing as prose-only
  asides" — if we're already building pins for monsters and vendors, nodes
  and flight paths deserve the same first-class, pinned, countable treatment
  rather than being second-tier flavor text.
