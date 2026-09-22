# Coordinate System

How WoW Forever Atlas represents, stores, and converts between the multiple
coordinate systems confirmed to be in play across our sources. Every stored
coordinate **must** identify its coordinate space explicitly — silent mixing
is the single most likely source of a "why is this pin in the ocean" bug in
a project ingesting from this many independent sources.

## The coordinate spaces, confirmed present

### 1. `WORLD_SPACE` — raw client world coordinates

**CONFIRMED** (Phase 1 DB2 pass, direct field-level verification): Blizzard's
client DB2 tables that carry positions (`AreaPOI.Pos_0/1/2`,
`GameObjects.Pos_0/1/2` + `Rot_0..3`, `TaxiNodes.Pos_0/1/2`,
`AreaTrigger.Pos_0/1/2` + `Radius`/box dimensions) all use this space:
large-magnitude values (typically hundreds to tens of thousands), the
client's own internal 3D coordinate system, in yards, relative to a fixed
per-continent origin. Example, confirmed real: Burning Steppes' two flight
points sit at `(-7504.03, -2187.54, 165.53)` and `(-8364.61, -2738.35,
185.46)`.

This is also confirmed to be what Hyjal.cc itself uses internally
(`SOURCE_HYJAL.md` §5, reinforced by this phase's Hyjal supplement finding
the archive's own public metadata literally states its coordinate system is
the "WoW local 64x64 ADT grid," not a geographic projection) — i.e. the
reference implementation we're benchmarking against also treats world-space
as its source of truth, not a percentage system. **This is a strong signal
we're choosing the right canonical representation.**

**Decision: `WORLD_SPACE` is the canonical stored representation.** Every
coordinate we ingest should be normalized into this space at import time if
it isn't already there, and every other representation (percentage, tile
index) is a derived/computed view, not separately stored as a source of
truth (except where we cannot yet compute the conversion — see the
Burning Steppes worked example below).

Schema: `(x: float, y: float, z: float|null, continent_id: FK)`. `z` is
nullable because several confirmed sources (e.g. `UiMapAssignment.Region_2`
and `Region_5`, which bound the Z axis at literal placeholder values of
`±1,000,000`) do not meaningfully constrain elevation — treat an unbounded Z
range as "no Z data," not as a real physical constraint.

### 2. `UI_MAP_TRANSFORM` — world-space ↔ 0–1 (or 0–100) UI-map fraction

**CONFIRMED**, from DB2's `UiMapAssignment` table, field-checked directly
this session: each row gives `MapID`, `AreaID`, `UiMapID`, a UI-space
bounding box (`UiMin_0/1`, `UiMax_0/1` — confirmed `[0,0]`–`[1,1]` for
Burning Steppes, meaning it owns a whole dedicated UI-map tile rather than
being a sub-rectangle of a parent), and a **world-space bounding box**
(`Region_0..5` — confirmed real for Burning Steppes: X ∈
`[-8983.33, -7031.25]`, Y ∈ `[-3195.83, -266.67]`). This is the actual,
literal conversion table between world-space and the 0–1 (equivalently
0–100%) UI-map fraction system used by the in-game world map and by most
community Classic-era tooling.

**Conversion formulas (both directions, as the brief requires):**

```
# world → UI fraction (0..1), for a point known to be in this AreaID's zone
ui_x = (world_x - region_min_x) / (region_max_x - region_min_x)
ui_y = (world_y - region_min_y) / (region_max_y - region_min_y)
# multiply by 100 for the 0-100 percentage convention ATT/QuestieDB use

# UI fraction → world (fully invertible, since this is a linear bounding-box map)
world_x = region_min_x + ui_x * (region_max_x - region_min_x)
world_y = region_min_y + ui_y * (region_max_y - region_min_y)
```

This conversion is **exact and lossless in both directions** — it's a
simple affine bounding-box map, not an approximation. This is also,
confirmed this session, the exact mechanism QuestieDB's own Era→Forever
coordinate-migration tool uses internally (`derive_transform()`, comparing
`UiMapAssignment`-equivalent bounds between two client builds) — an
independent third party arrived at the same design, which is a good
validation of this approach.

**Important nuance confirmed this session**: most zones (45 of QuestieDB's
61 tracked UiMaps, including Burning Steppes and Searing Gorge) have an
**identity transform** between the Era client build and the current Forever
beta build — i.e. for those zones, world-space coordinates recorded against
old Classic-era data are still valid today, with zero conversion needed.
Only 4 zones (Mulgore, Eastern Plaguelands, Redridge Mountains, Stormwind
City) actually moved between builds. **This means: do not assume every
imported legacy coordinate needs conversion — check per-zone, and only
apply a transform where the source/target bounding boxes actually differ.**

### 3. `ATT_PERCENT` — ATT/QuestieDB's `{x, y, MapID}` convention

**CONFIRMED** (Phase 1 ATT deep-dive, direct code-behavior verification):
ATT's `coord = {x, y, MAP.ZONE}` fields, and Forever Quest Pins' derived
output, are **already** in the 0–100 percentage space described above — the
conversion pipeline does zero rescaling on these numbers (confirmed
directly: no arithmetic is applied to ATT's x/y values anywhere in
`forever-quest-markers`' conversion code). So `ATT_PERCENT` is not a fourth
independent system — it **is** `UI_MAP_TRANSFORM`'s 0–100 form, just tagged
by a `MAP.*` constant that is confirmed (via the `MAP.KALIMDOR = 1414`
example in `SOURCE_ATT.md` §2, cross-referenced against this phase's
confirmed `UiMapID = 1428` for Burning Steppes) to be a **`UiMapID`**, not
an `AreaID`. Store ingested ATT/QuestieDB coordinates tagged with
`coordinate_space = UI_MAP_TRANSFORM`, `reference_id_type = UiMapID`,
convert to `WORLD_SPACE` via the formula above using the matching
`UiMapAssignment` row, and store both (see "storage policy" below).

### 4. `ADT_TILE` — the terrain-tile grid Hyjal's imagery is keyed to

**CONFIRMED this phase** (Hyjal supplement, cross-referencing Hyjal's own
public PMTiles metadata plus public wowdev.wiki documentation of WoW's ADT
format — general public knowledge, not proprietary to Hyjal): WoW terrain
per continent is a 64×64 grid of ADT tiles, each exactly `533.333...` yards
per side (confirmed matching Hyjal's own `tileSize: 533.333333333334`
field). The public, documented conversion:

```
adt_col = floor(32 - world_y / 533.33333)
adt_row = floor(32 - world_x / 533.33333)
```

(Note the axis swap-and-negate — a well-known wowdev.wiki convention: WoW's
world X points north, Y points west, and the ADT grid origin (0,0) is the
grid's center, tile index (32,32).)

**This conversion is one-directional in practice for our purposes**:
`world → ADT tile` is exact (floor of a linear formula). `ADT tile → world`
can only recover the tile's bounding rectangle (or its center), **not** the
original sub-tile point that produced it — this is expected and matches
what the brief asks for ("tile → map," i.e. which map/zone a tile belongs
to, not point-perfect recovery).

**PMTiles-specific tile-pyramid indexing** (Hyjal's own archive, confirmed
this session via direct public-format header decode): `min_zoom=1`,
`max_zoom=7`, sparse (2,553 of a possible 21,844 tiles at full pyramid
density). The exact ADT-tile-to-PMTiles-(z,x,y) mapping used by Hyjal's own
archive is **STRONG INFERENCE, not confirmed** (a candidate 2:1 ratio at
z=7 vs. the 64×64 ADT grid was proposed but explicitly not empirically
verified — see `MAP_ARCHITECTURE.md`). **We do not need to match Hyjal's own
internal tile-pyramid indexing exactly** — we only need our own, internally
consistent `world ↔ ADT tile` math (confirmed above, public formula) plus
whatever tile-pyramid scheme our own map-rendering pipeline adopts in
`MAP_ARCHITECTURE.md`, which can define its own z/x/y convention
independent of Hyjal's.

## Storage policy — every coordinate record tags its space, no silent mixing

Every `Location` row (see `DATA_MODEL.md`) stores:

```
coordinate_space: enum { WORLD_SPACE, UI_MAP_TRANSFORM, ADT_TILE }
x, y, z: float
reference_id_type: enum { AreaTableID, UiMapID, MapID, ADT_col_row } | null
reference_id: string | null
source_build: string | null   -- the build this was valid against, if known
```

**Policy**: at ingestion time, always attempt to convert into
`WORLD_SPACE` immediately (using the confirmed-exact `UI_MAP_TRANSFORM`
formula above) and store the `WORLD_SPACE` value as the canonical one. If
the needed `UiMapAssignment` row for that zone/build isn't available (e.g.
an unresolved synthetic AreaID, mirroring QuestieDB's own confirmed "6
unresolved points" case — see `SOURCE_QUESTIEDB.md`), **store the original
un-converted coordinate with its original `coordinate_space` tag rather than
guessing** — an explicitly-tagged, unconverted point is infinitely more
useful than a silently-wrong converted one. This directly matches
QuestieDB's own confirmed practice (leaving genuinely unresolvable points
untouched rather than forcing a bad transform).

## Worked example: Burning Steppes, using real Phase 1 data

- Zone: `AreaTable.ID = 46` (confirmed, both DB2 and QuestieDB's
  `zoneIds.lua` agree), `UiMapID = 1428` (confirmed, both DB2's
  `UiMapAssignment` and QuestieDB's `areaIdToUiMapId.lua` agree — a genuine,
  independently-corroborated cross-source match).
- World-space bounding box (confirmed, `UiMapAssignment` row for
  `AreaID=46`): X ∈ `[-8983.33, -7031.25]`, Y ∈ `[-3195.83, -266.67]`.
- A real point in this zone, "Flame Crest" flight master, confirmed at
  world-space `(-7504.03, -2187.54, 165.53)`. Converting to UI fraction:
  `ui_x = (-7504.03 - (-8983.33)) / (-7031.25 - (-8983.33)) = 1479.3 / 1952.08
  ≈ 0.758`, `ui_y = (-2187.54 - (-3195.83)) / (-266.67 - (-3195.83)) = 1008.29
  / 2929.16 ≈ 0.344` — i.e. roughly 76% across, 34% down the zone's map
  tile, which is directionally consistent with Flame Crest's known
  in-game position (northeastern portion of Burning Steppes). This
  worked example should become a Phase 2 unit-test fixture.

## Open items (tracked in `OPEN_QUESTIONS.md`)

- The exact Hyjal-internal ADT-tile↔PMTiles(z,x,y) ratio is unverified —
  irrelevant to our own canonical model, but relevant to `MAP_ARCHITECTURE.md`
  if we want tile-serving parity.
- `Z` (elevation) is unconstrained/unreliable in every confirmed source so
  far — treat as optional/cosmetic (e.g. for 3D rendering) until a better
  source is found, never as load-bearing for zone/subzone resolution.
