# Source Deep Dive: hyjal.cc/map

Reference implementation review only. hyjal.cc is treated strictly as a UX/tech
quality benchmark. Nothing here was obtained by bypassing auth, rate limits,
or access controls — all observations came from normal browsing (rendered
HTML, response headers, publicly-loaded script/asset URLs, and network
requests the browser made on its own while using the page as a visitor would).
No proprietary source code was read; script contents were not inspected beyond
minified bundle *names* and console error text surfaced naturally by the
browser.

Labels: **CONFIRMED** (directly observed), **STRONG INFERENCE** (reasonable
inference from public signals), **SPECULATION** (a guess, flagged as such).

## 1. Frontend framework

- **CONFIRMED**: Built with **Astro**. The root `<html>` tag carries an
  `data-astro-cid-sckkx6r4` attribute, and all bundled JS/CSS assets are
  served from a `/_astro/` directory with Astro's characteristic
  content-hashed filenames (e.g. `_astro/_class_.CkClsXCc.css`,
  `_astro/client.LGetASx6.js`).
- **CONFIRMED**: At least one interactive "island" is hydrated with a JSX
  runtime — a `jsx-runtime.D_zvdyIk.js` chunk loads alongside
  `WorldMap.C5NK3x_Z.js` / `WorldMap.eohuPaga.js` and `ModelCanvas.5mA4OM6U.js`.
  This is Astro's standard pattern for embedding a React (or React-API-compatible)
  component inside an otherwise static/server-rendered page.
- **STRONG INFERENCE**: The rest of the site (nav, footer, marketing chrome)
  is server-rendered/static Astro output; only the map view and its controls
  are a client-hydrated island. `window.React` was not present as a global
  (as expected for a bundled, non-UMD build), so the exact React vs.
  React-compatible runtime could not be confirmed further without reading
  bundle internals, which was out of scope.
- **CONFIRMED** (response headers on `GET /map`): served via **Cloudflare**
  (`server: cloudflare`, `cf-ray`, `cf-cache-status: HIT`), with
  `content-encoding: zstd`, HSTS (`strict-transport-security`), `x-frame-options: DENY`,
  `x-content-type-options: nosniff`, a locked-down `permissions-policy`
  (camera/microphone/geolocation all disabled), and `referrer-policy:
  strict-origin-when-cross-origin`. This reads as a static build deployed
  behind Cloudflare (Pages, Workers, or a CDN in front of static storage),
  not a traditional server-rendered app process.
- **CONFIRMED**: Google Analytics (`gtag.js`, measurement ID `G-F0RZ3HLCQC`)
  is loaded on the page.

## 2. Map renderer technology

- **CONFIRMED**: The map is rendered into an actual `<canvas>` element with a
  live `webgl2` context (verified via `canvas.getContext('webgl2')` returning
  a non-null context object).
- **STRONG INFERENCE**: The renderer is a custom **three.js**-based 3D scene,
  not MapLibre/Mapbox GL. Evidence:
  - A bundle literally named `OrbitControls.DNEpWNcq.js` is loaded — this is
    the well-known filename of three.js's `OrbitControls` addon.
  - A `world-map-scene.6jjcyIx6.js` bundle and a `ModelCanvas` component
    (paired with a `jsx-runtime` chunk) match the common
    `@react-three/fiber`-style pattern of a React `<Canvas>` wrapper around a
    three.js scene graph.
  - No `maplibre-gl` or `mapbox-gl` bundle name appears anywhere in the
    ~20 requested script/style assets across two independent full page loads.
  - The UI explicitly offers a **"3D terrain"** vs **"Top down"** toggle,
    consistent with orbiting a real 3D terrain mesh/camera rather than
    swapping a 2D map style.
- **CONFIRMED**: A console error was thrown from inside
  `world-map-scene.6jjcyIx6.js` during our session:
  `TypeError: Cannot read properties of null (reading 'configure')`. This
  fired repeatedly and, in the desktop-sized viewport of our automated
  browser, correlated with the map getting stuck on a "Loading map…" state
  (see §6 limitations). This is most likely a WebGL feature/extension
  (texture compression negotiation, given "configure" and the terrain/imagery
  pipeline) that returned `null` in our headless environment — noted as an
  observation, not a claim about behavior in a normal user's browser.
- **CONFIRMED**: Terrain/imagery texture data is **not** baked into the JS
  bundles — it streams from a separate tiled asset (§4).

## 3. Public network requests observed while browsing

No calls to any `/api/...`-shaped endpoint, GraphQL endpoint, or other
dynamic backend were observed at any point — not on initial load, not while
typing into the search box, not while selecting a search result, not while
toggling layer checkboxes, and not while resizing the viewport. Every request
seen was one of:

| Request | Method/Status | Purpose (inferred) |
|---|---|---|
| `/map` | GET 200 (HTML) | Astro page shell |
| `/_astro/*.css`, `/_astro/*.js` | GET 200 | Bundled styles/scripts (content-hashed filenames) |
| `/fonts/marcellus.woff2` | GET 200 | Custom display font |
| `/favicon.svg` | GET 200 | Favicon |
| `/maps/{build}/{mapId}/overview.webp` | GET 200 | Low-res raster preview image shown while the 3D/tile layer streams in |
| `/maps/{build}/{mapId}/manifest.json` | GET 200 | **The** data payload — see §4 |
| `/images/map/dungeon.png`, `/images/map/raid.png` | GET 200 | Marker icon sprites for dungeon/raid pins |
| `/map-archives/{build}/imagery-<hash>.pmtiles` | GET 206 (repeated, multiple times) | Tiled imagery archive, fetched via HTTP **range requests** — see §4 |

**CONFIRMED**: This is a fully static-asset architecture from the browser's
point of view — every megabyte of map data is a versioned static file, not a
live API response. That has direct implications for our own architecture: a
comparable "serve pre-baked, versioned static payloads" approach would let us
skip building/hosting a runtime API for the map itself.

## 4. Map data / asset formats

- **CONFIRMED**: The full place index for a continent is delivered as one
  large static **`manifest.json`** file (observed size ≈ **3.1 MB** for the
  Eastern Kingdoms map) fetched once, up front, in full — not paginated, not
  queried incrementally. Client-side search (§6) filters this in-memory list;
  no network request fired while typing a search query.
- **CONFIRMED** manifest shape (field names and one representative entry,
  reproduced only as a structural excerpt, not the full proprietary dataset):
  ```json
  {
    "version": 3,
    "id": "azeroth",
    "name": "Eastern Kingdoms",
    "description": "...",
    "build": "1.60.1.69876",
    "mapId": 0,
    "mapName": "Eastern Kingdoms",
    "bounds": [23, 20, 45, 61],
    "tileSize": 533.3333333333334,
    "overview": "/maps/1.60.1.69876/azeroth/overview.webp",
    "focus": [4750, 56.94, 15850],
    "places": [
      { "id": 536, "name": "Addle's Stead", "parentId": 10,
        "position": [4583.33, 28.18, 17383.33], "chunks": 127 },
      "... (thousands more entries)"
    ]
  }
  ```
- **STRONG INFERENCE**: `tileSize: 533.33` matches the real WoW client's ADT
  terrain-tile edge length (533.33 yards), and `bounds: [23,20,45,61]`
  reads as an ADT column/row bounding box (WoW terrain is gridded 64×64 per
  continent) rather than a lat/long-style bound. `chunks` on each place is
  most likely a per-place **weight/size hint** (count of terrain chunks the
  named area covers), plausibly used for label prioritization or hit-testing
  radius — not confirmed from behavior, flagged as inference only.
- **STRONG INFERENCE**: `parentId` encodes a **zone hierarchy** (subzone →
  zone → continent), letting the UI show "Eastern Kingdoms · Area 809" style
  breadcrumbs for a selected place (observed in the UI, §6) by walking `parentId`
  chains — this is a data-modeling pattern worth mirroring in our own schema.
- **CONFIRMED**: Imagery is delivered as a **PMTiles** archive
  (`imagery-<sha256-like-hash>.pmtiles`), fetched with HTTP **range requests**
  (status `206 Partial Content`), and re-requested with additional ranges as
  the camera moves/streams in more coverage — the canonical PMTiles usage
  pattern (single flat archive file, byte-range tile lookups, no tile server
  required). This is a strong architectural signal: hyjal.cc does not run a
  live vector/raster tile server; it serves one static archive per map build
  from object storage/CDN.
- **SPECULATION**: Terrain elevation/mesh data (for the 3D terrain mode)
  likely comes from a second, separate static asset (e.g. a heightmap image
  or a second PMTiles/quantized-mesh archive) not distinctly identified in
  our session — no separately-named "heightmap"/"terrain" request was
  captured distinct from the `imagery-*.pmtiles` archive, so it's possible
  elevation is baked into vertex data derived from the same archive, or
  requested lazily only once full 3D rendering succeeds (which did not
  complete in our automated session — see §6 limitations).
- **CONFIRMED**: Asset paths are versioned by game client build string
  (`1.60.1.69876`), which also appears in the map's footer UI as
  "Forever 1.60.1.69876" — content is keyed to a specific server/client patch,
  which is a clean cache/versioning strategy worth adopting.

## 5. Coordinate system behavior

- **CONFIRMED**: Place coordinates in `manifest.json` are 3-element arrays
  `[x, y, z]` in **large-magnitude values (hundreds to tens of thousands)**,
  not the 0–100 normalized percentage system common to Classic WoW's 2D map
  API. Cross-referencing values (e.g. "Alterac Mountains" `y = 102.54` vs.
  "Aerie Peak" `y = 206.27`, a genuinely higher/more elevated zone) strongly
  suggests the middle component is **elevation** and the outer two are
  ground-plane coordinates — i.e., these look like real in-game 3D world
  coordinates (or a straightforward affine transform of them), not a custom
  map-specific projection.
- **CONFIRMED**: The page's own `focus` field (`[4750, 56.94, 15850]`) is in
  the same coordinate space as `places[].position` and is almost certainly
  the default camera-target position for the continent view.
- **CONFIRMED (negative result)**: Selecting a place via search, panning, and
  toggling layers did **not** change `location.href` — the URL stayed exactly
  `https://hyjal.cc/map` throughout. There is **no live URL/hash sync** as you
  interact with the map.
- **CONFIRMED**: There is a dedicated **"Copy a link to this view"** button
  (labeled "Share view ↗" in the UI) separate from the address bar, implying
  shareable-link generation is an explicit, on-demand user action (client-side
  clipboard write) rather than continuous `history.replaceState`/hash
  updates. We could not read the generated link's contents directly — the
  sandboxed browser's clipboard read was permission-denied, and a
  `navigator.clipboard.writeText` monkey-patch we injected before clicking
  was not invoked in a way we could observe (see §6, this is a tooling
  limitation, not a finding about the site). **Open question**, not resolved.

## 6. UX patterns

- **CONFIRMED — Search**: The "Find a place" box performs **instant,
  client-side filtering** against the already-downloaded manifest — typing
  "Ironforge" produced a "Gates of Ironforge" suggestion with **no new
  network request** fired. Selecting a result shows a small result card with
  a breadcrumb: `Gates of Ironforge / Eastern Kingdoms · Area 809`.
- **CONFIRMED — Instances panel**: A collapsible "Instances" section (count
  badge "21") lists dungeons/raids with a category tag ("Dungeon"/"Raid").
  Custom Forever-server instances are visually flagged with a **"New ·
  Dungeon"** badge and are sorted first, ahead of stock Classic instances
  (which show just "Dungeon"/"Raid" with no "New" tag). Observed custom
  ("New") entries: *City of Dalaran, Excavation Site: Wetlands, Krol'dok
  Stronghold, Ruins of Lordaeron, The Drowned City, The Hall of Thanes*.
  Observed stock entries: *Blackrock Depths, Blackrock Spire, Blackwing
  Lair, Deadmines, Gnomeregan, Molten Core, Naxxramas, Scarlet Monastery,
  Scholomance, Shadowfang Keep, Stormwind Stockade, Stratholme, Sunken
  Temple, Uldaman, Zul'Gurub*.
- **CONFIRMED — Entrance representation (§7 topic)**: One custom instance,
  **"The Drowned City,"** is explicitly annotated **"Location unavailable"**
  in the Instances list — i.e., the UI has a defined empty/fallback state for
  an instance entry that has no plotted map pin yet. This is a useful pattern
  to copy: instance metadata and map-pin placement are decoupled, and the UI
  degrades gracefully when a pin is missing.
- **CONFIRMED — Layer toggles**: Three checkboxes — "Place names," "Dungeons,"
  "Raids" — each with a small colored status dot (dungeons = blue circular
  icon, raids = green), all on by default, controlling label/marker layer
  visibility.
- **CONFIRMED — Zone/continent switcher**: A dropdown offers **Eastern
  Kingdoms, Kalimdor, Dalaran City, Zephras Isle**. "Dalaran City" and
  "Zephras Isle" are not stock WoW continents — **STRONG INFERENCE** these
  are Forever-server-specific custom zones/hubs promoted to top-level
  "maps," each presumably with their own manifest.json/pmtiles pair
  (consistent with the per-map path structure `/maps/{build}/{mapId}/...`).
- **CONFIRMED — 2D/3D toggle**: A "3D terrain" / "Top down" segmented toggle
  exists in the toolbar. We could not confirm its visual effect in our
  session (see limitations below) but its presence, combined with the
  three.js/OrbitControls evidence, strongly implies "Top down" re-poses the
  same 3D camera to a straight-overhead orthographic-like view rather than
  swapping to a genuinely different 2D renderer.
- **CONFIRMED — Progressive loading UX**: On first load, a blurred/low-res
  static `overview.webp` raster is shown immediately, with a "Preparing the
  landscape…" / "Loading map…" status message, while the PMTiles imagery and
  3D scene stream in — a deliberate low-res-to-high-res progressive reveal.
  Individual dungeon/raid map pins also show a small per-marker spinner
  (observed on "Stormwind Stockade") while their icon/state loads in,
  suggesting per-marker lazy hydration rather than one atomic marker layer.
- **CONFIRMED — Mobile responsiveness**: At a 375×812 viewport, the layout
  reflows to a full-width overlay control panel stacked above the map (rather
  than a fixed sidebar), map labels and markers continue to render as
  overlaid elements on the terrain, and the zoom/compass/reset controls
  collapse into a vertical stack on the right edge. The map canvas itself
  actually rendered visible terrain/imagery at this viewport size in our
  session, whereas the default desktop-sized viewport got stuck on
  "Loading map…" (see limitations) — this is very likely a quirk of our
  automated browser/WebGL environment, not a real responsive-design issue on
  hyjal.cc's part.
- **CONFIRMED — Place-name labels are DOM overlays, not canvas-drawn text**:
  Accessibility-tree reads (`read_page`) picked up zone/place names as real
  text nodes (e.g. "Elwynn Forest," "Burning Steppes") positioned over the
  map. **STRONG INFERENCE**: labels are absolutely-positioned HTML elements
  whose `left/top` are recomputed each frame by projecting each place's 3D
  `position` through the current camera — a common technique for mixing
  crisp, accessible text with a WebGL scene, and one we should consider
  adopting for our own map for accessibility/SEO reasons.

## 7. Instance/dungeon/raid entrance representation

- **CONFIRMED**: Dungeons and raids appear as **map pins** using two distinct
  icon sprites (`/images/map/dungeon.png`, `/images/map/raid.png`) — i.e., a
  single shared icon per category rather than a unique icon per instance.
  Pins are additionally listed in the searchable/browsable "Instances" side
  panel (with "Dungeon"/"Raid" and "New" category tags, per §6).
- **CONFIRMED**: At least one instance ("The Drowned City") exists in the
  data with **no resolvable map position**, and the UI explicitly labels
  that state ("Location unavailable") rather than silently omitting the pin
  or crashing — worth mirroring as an explicit data/UI contract in our own
  entity model (an instance can exist without a placed entrance pin).
- Deeper interior-of-instance representation (e.g., whether hyjal.cc shows a
  separate interior floor plan/sub-map when you open an instance) was **not
  observed** — clicking through into a specific instance page was out of
  scope for this pass, which focused on the world map view itself.

## Limitations encountered (things we stopped short of / could not verify)

- **Tooling instability, not access-gating**: Early in the session, the
  shared browser tab intermittently showed content from completely
  unrelated origins (github.com, raw.githubusercontent.com,
  wow.freierbund.de) between calls — this was a browser-tab-sharing artifact
  of our own tooling (a shared/reused tab across concurrent agent sessions),
  not anything served by hyjal.cc. We opened a dedicated tab and verified its
  origin before every subsequent observation to eliminate this.
- **3D scene did not finish loading at default desktop viewport size** in our
  automated session — it stayed on "Loading map…"/"Preparing the
  landscape…" and threw a repeated console `TypeError` from
  `world-map-scene.6jjcyIx6.js` (`Cannot read properties of null (reading
  'configure')`), most likely a WebGL feature-negotiation call failing under
  our headless browser. This blocked direct verification of: live pan/zoom
  tile-loading behavior at desktop size, the exact visual difference between
  "3D terrain" and "Top down" modes, and clicking a marker to open a detail
  panel. At a mobile (375×812) emulated viewport the terrain/imagery
  rendered successfully and we could confirm labels, pins, and progressive
  loading — so this looks like an environment quirk rather than a broken
  feature.
- **Clipboard content of "Copy a link to this view" was not verified.** The
  browser denied `navigator.clipboard.readText()` (expected sandbox
  permission behavior), and a `writeText` monkey-patch injected before
  clicking did not appear to intercept the site's own copy call (likely
  because the button uses a different underlying copy mechanism, e.g.
  `document.execCommand('copy')` on a hidden text node, or the click
  happened before our override was in the right execution context). We did
  not attempt any further workaround. **This is the biggest open gap**: we
  could not confirm the actual query-param/hash format (if any) hyjal.cc
  uses for a shareable deep link into a specific camera position/place.
- No login-gated or otherwise access-controlled area was encountered or
  attempted. Everything documented above came from the public `/map` page
  and its naturally-loaded assets/requests.
- We did not inspect bundle *source* beyond filenames/console error text —
  no minified proprietary code was read or reproduced, per scope.

## Open Questions

1. What is the exact format of the "Copy a link to this view" shareable URL
   (query params vs. hash vs. path segment; does it encode camera
   position/rotation, a selected place id, or both)?
2. Does "Top down" switch to a genuinely different (orthographic/2D)
   rendering path, or just re-pose the same three.js camera? (Strongly
   suspected to be the latter, unconfirmed.)
3. What does the terrain/elevation data source look like — a second static
   archive, or derived from the same `imagery-*.pmtiles` file? Is there a
   distinct heightmap format we should plan to reproduce/replace?
4. What does clicking directly on a map pin (rather than the search
   sidebar) show — an inline popup, a side panel, or full navigation to a
   detail page? Not observed this pass.
5. Is there an interior/sub-level map for instances (dungeon floor plans),
   or does hyjal.cc only plot instance *entrances* on the world map?
6. Does the `chunks` field on each `places[]` entry actually drive label
   priority/LOD (our inference), or does it serve another purpose (e.g.
   hit-testing radius, area-size display)?
7. Is the same "one big manifest.json per continent" approach used for all
   four maps (Eastern Kingdoms, Kalimdor, Dalaran City, Zephras Isle), and do
   Dalaran City / Zephras Isle (custom, non-stock zones) have proportionally
   smaller manifests, or a different schema entirely?
