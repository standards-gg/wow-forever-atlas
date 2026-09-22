# Map Architecture

How WoW Forever Atlas should render the map layer, informed directly by
Hyjal.cc's confirmed architecture (a reference implementation, not a data
source — nothing here implies importing Hyjal's own data or assets; see
`DATA_PROVENANCE.md`'s license posture for Hyjal).

## Update: real terrain extraction is now implemented

This document originally treated real map imagery as designed-but-unbuilt,
blocked on a licensed client install. That block is resolved: the project
owner confirmed a local WoW: Forever install, and `importers/wow-client`
(added in a later Phase 2 session) reads that install's CASC storage
directly — no `wow.export` GUI involved, since it turned out to have no
CLI/headless mode — and extracts real minimap textures for Burning
Steppes/Searing Gorge. See `importers/wow-client/README.md` for the full
technical account (CASC/BLTE/BLP format details, empirically-verified WDT
`MAID` chunk layout, and MIT attribution to wow.export, whose source
informed this implementation). Real terrain PNGs are deliberately
gitignored (copyrighted Blizzard art, never committed to this public repo)
— the rest of this document's static-manifest/tile-pyramid design remains
the target architecture for scaling this to the full world.

## The reference pattern, confirmed

Hyjal.cc (`SOURCE_HYJAL.md` + this phase's supplement) is a **fully static
architecture**: Astro + a three.js/WebGL2 scene, zero backend API observed
across an entire browsing session. Its data shape:

- One shared imagery archive per client build (**confirmed this phase, a
  correction to Phase 0's guess of one-per-map**: all four of Hyjal's maps
  — Eastern Kingdoms, Kalimdor, Dalaran City, Zephras Isle — share a single
  PMTiles archive, addressed by a `slot` index 0-3, per the archive's own
  public metadata block, confirmed read directly this phase).
- One `manifest.json` per continent (~3.1 MB for Eastern Kingdoms) holding
  the full place index (`places[]`: id/name/parentId/position/chunks) —
  fetched once, filtered client-side for search, no pagination.
- Imagery delivered via PMTiles, fetched with HTTP range requests.

**Recommendation: adopt this pattern, adapted to our own data model.** It's
low-cost (no map-serving backend needed), proven at real scale, and
directly reproducible with open tooling (below) — there's no reason to
build something more complex for the map-rendering layer specifically,
even though our *entity/graph* layer (quests, NPCs, provenance) does need a
real backend/database that Hyjal's own architecture doesn't have to deal
with (it's not solving "what is around me," per `PROJECT_RECON.md`'s core
distinction).

## Confirmed technical specifics worth matching or deliberately diverging from

- **PMTiles structure, confirmed via direct public-format header decode**
  (a legitimate byte-range read of an openly-specified container format,
  not proprietary-code inspection): `min_zoom=1`, `max_zoom=7`, WebP tiles,
  sparse (only ~11.7% of a full pyramid's tile slots addressed — landmass-
  cropped, not a dense square grid). This is a reasonable target zoom range
  for our own archive too — no need to exceed z7 to match Hyjal's own
  apparent fidelity bar.
- **Coordinate system, confirmed directly from Hyjal's own public
  metadata**: `"coordinate_system":"WoW local 64x64 ADT grid; quadrant
  addresses are storage coordinates, not geographic locations"` — this is
  the exact same `ADT_TILE` system `COORDINATE_SYSTEM.md` already defines
  independently from public wowdev.wiki documentation. **We do not need to
  reverse-engineer this — Hyjal's own container metadata confirms it
  directly**, which is a strong validation that our independently-derived
  coordinate design is correct.
- **Exact ADT-tile-to-PMTiles-(z,x,y) ratio: unconfirmed, not required.**
  A candidate 2:1 relationship (128-wide z7 pyramid vs. 64-wide ADT grid)
  was proposed but not empirically verified this phase. **We do not need
  to match Hyjal's internal tiling scheme** — our own pipeline can define
  its own z/x/y convention (e.g. the simpler, common "one PMTiles tile per
  ADT tile at native zoom" convention) as long as it's internally
  consistent and documented.

## Our own reproducible pipeline

A mature, actively-maintained open-source toolchain exists end-to-end,
confirmed this phase:

```
Legal Forever client install
        │
        ▼
  wow.export (MIT, actively maintained — "Export Minimap Tiles" feature
              confirmed present)
        │  raw per-ADT minimap imagery
        ▼
  WoWTools.Minimaps-style tiling (confirmed real prior art: cuts compiled
              minimap images into a Leaflet-style z/x/y tile set;
              World-of-MapCraft is an older, equivalent prior-art project)
        │  z/x/y raster tile set
        ▼
  pmtiles CLI / GDAL (3.8+) / rio-pmtiles (all confirmed real, open-source,
              actively maintained)
        │
        ▼
  our own .pmtiles archive + manifest.json (Hyjal-equivalent shape,
              generated from our own canonical DATA_MODEL.md entities,
              not scraped from Hyjal)
```

**Feasibility judgment (confirmed this phase): realistic, not novel R&D.**
Every stage has a real, maintained open-source tool. The standard per-ADT
minimap resolution long used by the WoW-modding community is more than
adequate to match Hyjal's confirmed `max_zoom=7` bar — no need for a
full 3D terrain-rendering pipeline just to produce comparable 2D map
imagery.

**Genuine, confirmed blockers — not glossed over:**

1. **Forever's two custom continents (Dalaran City, Zephras Isle,
   confirmed via Hyjal's own metadata `mapId` values 2980/2991) require
   the Forever client's own files** — a stock Classic client install
   won't have this content. `wow.export` can only extract what's in the
   client data pointed at it.
2. **Legal/ToS gray area, not a technical blocker** — extracting and
   republishing client-derived map imagery sits in the same longstanding,
   Blizzard-tolerated gray area every WoW fan-mapping tool has operated in
   (Wowhead's map viewer, `wow.export` itself, `WoWTools.Minimaps`). Not a
   novel legal question to resolve here; worth flagging to stakeholders as
   a known, precedented risk category (see `DATA_PROVENANCE.md`'s license
   review).
3. **Unverified fidelity assumption** — whether stock per-ADT minimap
   resolution is visually adequate at our target max zoom hasn't been
   empirically checked (render a mosaic, compare against a known
   reference) — a quick Phase 2 validation step before committing fully to
   a minimap-only (vs. full terrain-render) pipeline.

## Rendering layer — recommendation, distinct from Hyjal's choice

Hyjal uses a custom three.js 3D scene (confirmed: `OrbitControls` bundle,
a "3D terrain"/"Top down" toggle). **We do not need to match this choice.**
Given our core product differentiator is the *entity/discovery graph*
(per `PROJECT_RECON.md`), not 3D visual fidelity, a 2D-first approach using
MapLibre GL JS (per the original brief's own preferred-stack list) over the
same PMTiles archive is a defensible, simpler starting point — MapLibre
has native PMTiles protocol support, avoiding a custom three.js scene
entirely for v1. A 3D terrain mode (matching Hyjal's polish bar) can be a
later enhancement layered on the same static-asset data, not a Phase 2
requirement. This is a recommendation, not yet a decision — record in
`OPEN_QUESTIONS.md` for explicit confirmation before Phase 2 locks it in.

## UX patterns to adopt directly (from Hyjal, confirmed real and cheap)

- **Progressive loading**: low-res static overview image shown immediately
  while PMTiles/vector data streams in (confirmed Hyjal pattern).
- **DOM-overlay place labels** projected from 3D/2D position each frame,
  rather than canvas-drawn text — confirmed better for
  accessibility/SEO (place names showed up as real text nodes in
  accessibility-tree reads).
- **Explicit "location unavailable" state** for an entity with no
  resolvable pin yet (confirmed real Hyjal pattern, e.g. "The Drowned
  City") — directly useful given our own confirmed data gaps (Blackrock
  instance entrances, most NPC spawns) will need exactly this degrade-
  gracefully treatment at launch.
- **Client-side instant search** over a pre-loaded manifest — no backend
  query needed for basic place/entity-name search, confirmed to perform
  well even at ~3.1 MB of JSON.
