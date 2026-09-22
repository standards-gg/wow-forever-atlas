# Geographic / Entity Graph

The graph structure `DATA_MODEL.md`'s entities form — this is the actual
product substance per `PROJECT_RECON.md`'s founding framing ("the
geographic/entity graph is the core product; the map is one visualization
of that graph"). This doc describes the graph's shape and how "what is
around me?" gets answered by traversing it, informed directly by Freier
Bund's confirmed information architecture.

## Containment hierarchy (the backbone)

```
Continent
  └─ Zone
       └─ Subzone (may itself be a "Landmark" — see DATA_MODEL.md)
            └─ Location  ← everything placeable attaches here
```

**Confirmed real example** (this phase's data pulls): `Continent` Eastern
Kingdoms (`Map.ID = 0`) → `Zone` Burning Steppes (`AreaTable.ID = 46`,
world bounds confirmed) → `Subzone` Blackrock Mountain (`AreaTable.ID =
254`) → the entrance `Location`s for Blackrock Depths (`Map.ID = 230`) and
Blackrock Spire (`Map.ID = 229`), whose own `Boss` lists are confirmed
accurate via `DungeonEncounter`.

This mirrors Freier Bund's confirmed breadcrumb pattern exactly
(`SOURCE_FREIERBUND.md` §1: `Zone » Landmark » NPC » Quest`) — we're not
inventing this hierarchy, we're formalizing an information architecture
that's already been validated by a working reference implementation.

## The "what is around me?" query

This is the direct implementation of Freier Bund's "Umgebung" (surroundings)
tab — confirmed to be, in its own words from the research, "the single most
valuable page pattern for this project's 'what is around me' goal." Given a
`Zone` or `Subzone`, the query is:

```
SELECT all NPCSpawn, GameObjectSpawn, ResourceNodeSpawn, POI, FlightPath,
       InstanceEntrance, Quest (via given_by/turned_in_at NPC location)
WHERE  Location.zone_id = :zone  (or subzone_id = :subzone)
GROUP BY entity_type
COUNT  distinct canonical entities per type (not per spawn point —
       Freier Bund's own confirmed pin/entity decoupling: 737 monster pins,
       108 unique monsters, must not be conflated)
```

This is a single, fast, pre-aggregatable query **if** every placeable
entity resolves its `zone_id`/`subzone_id` at ingestion time (from its
`WORLD_SPACE` coordinates via the `UiMapAssignment` bounding boxes,
per `COORDINATE_SYSTEM.md`) rather than computing containment live on every
request. **Decision: `zone_id`/`subzone_id` are denormalized onto
`Location` at write time**, not derived at query time — this is a
deliberate departure from strict normalization, justified because "what's
in this zone" is the single most frequent query this whole product exists
to answer.

## Cross-zone relationships

Freier Bund's confirmed finding (`SOURCE_FREIERBUND.md` §3): it has **no**
explicit zone-adjacency graph. Its only zone-to-zone link is incidental — a
shared `Landmark` (Blackrock Mountain) pulls Searing Gorge into Burning
Steppes' page as a "related zone." **Decision: reproduce this as a derived
relationship, not a hand-maintained adjacency table**:

```
Zone A ~ Zone B  IFF  they share a Subzone/Landmark (e.g. Blackrock
Mountain's two AreaTable rows, 254 under Burning Steppes and 1445 under
Searing Gorge, both reference "Blackrock Mountain" by name)
```

This is confirmed cheap to compute (a self-join on `Subzone.name` or an
explicit `Landmark.shared_with_zone_id` field) and avoids the maintenance
burden of a real adjacency graph that Freier Bund itself apparently never
built. **Improvement over Freier Bund, not just a copy**: unlike Freier
Bund (which has zero true adjacency data — Redridge Mountains and Badlands
genuinely border Burning Steppes but aren't listed, per user comments cited
in `SOURCE_FREIERBUND.md`), we should treat this derived relationship as a
*supplement* to, not a replacement for, real adjacency data once we have a
source for it (e.g. computable directly from ADT tile-grid adjacency once
`MAP_ARCHITECTURE.md`'s tile pipeline exists — bordering zones will share
adjacent ADT tile ranges, which is a real, computable geographic fact, not
a curated list).

## Quest graph (a graph within the graph)

Confirmed structure, directly from ATT's real fields:

```
Quest --sourceQuests(N)--> Quest        (prerequisite, confirmed real:
                                          q(7630).sourceQuests = {7626,7627,7628})
Quest --altQuests(N)--> Quest           (faction-mirrored equivalents)
Quest --member of--> QuestChain          (named, ordered — confirmed via
                                          DB2's QuestLine/QuestLineXQuest)
Quest --given_by--> NPC
Quest --turned_in_at--> NPC              (distinct FK — do not assume equal
                                          to given_by; Freier Bund confirms
                                          these differ often enough to need
                                          separate structured fields)
Quest --has--> QuestObjective --targets--> NPC | GameObject | Item
```

Freier Bund's confirmed gap (`SOURCE_FREIERBUND.md` §2, "UX Patterns Worth
Preserving"): it only shows the *backward* prerequisite chain, never "what
follows this quest." **Our graph should support both directions** — walking
`sourceQuests` forward is just as valid a query as walking it backward, and
costs nothing extra once the edges are stored as a normal directed graph
rather than Freier Bund's presentation-only linear list.

## Instance graph

```
Zone/Subzone --contains--> InstanceEntrance --entrance_for--> Instance --has--> Boss(N, ordered)
```

Confirmed real, cross-validated: Blackrock Mountain (Subzone, shared across
two Zones) contains entrances for at least Blackrock Depths and Blackrock
Spire (both confirmed real `Map.ID`s with confirmed-accurate `Boss` lists
via `DungeonEncounter`). The entrance `Location` itself is an open item
(tracked in `DATA_MODEL.md`/`OPEN_QUESTIONS.md` — likely sourced from
`AreaTrigger`, not yet pulled for this specific case).

## Flight network graph

```
FlightPath --located_at--> Location (Zone-resolved)
FlightPath --route_to--> FlightPath   (NOT YET SOURCED — see OPEN_QUESTIONS.md)
```

Confirmed real nodes exist (Burning Steppes' two, per `COORDINATE_SYSTEM.md`'s
worked example) but no source investigated this phase supplies route
legality/cost between nodes. This is a real gap, not an oversight — flagged
for Phase 2 sourcing (possibly derivable from `TaxiPath`/`TaxiPathNode` DB2
tables, which exist per general WoW DB2 schema knowledge but were not
queried this session — a concrete, closable follow-up).

## Why a graph database was *not* chosen (a note for future readers)

Nothing here requires a graph database engine — every relationship above is
expressible as ordinary foreign keys and join tables in PostgreSQL (the
project's already-preferred stack per the original brief), with PostGIS
handling the spatial side (`Location.x/y` as a proper geometry column once
`COORDINATE_SYSTEM.md`'s `WORLD_SPACE` is the stored form). "The graph is
the product" is a conceptual/product framing, not a mandate to adopt
graph-database technology — a relational schema is simpler to operate, and
every query pattern described above (containment rollups, prerequisite
walks, adjacency-via-shared-subzone) is a standard recursive-CTE/join
pattern in Postgres, not something that needs a specialized graph engine.
