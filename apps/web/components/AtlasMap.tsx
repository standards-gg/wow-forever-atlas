"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { rectToLngLatBounds, toLngLat, type WorldContinent, type WorldPin, type WorldZone } from "@/lib/world-frame";
import type { CameraState } from "@/lib/url-state";

// Registered once at module scope (not per mount) — this is a global
// maplibregl.addProtocol registration, and hyjal.cc/map's own network
// requests confirmed this exact format (a PMTiles archive, one per
// continent) is the real technique behind its seamless, all-zoom-levels
// terrain; see importers/wow-client/src/build-tile-pyramid.ts for how ours
// are generated and importers/wow-client/README.md for the packing step.
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

// MapLibre zoom is real Web Mercator zoom (256px tile at z0), an entirely
// different absolute scale than Leaflet's old CRS.Simple zoom — these were
// picked empirically for our fabricated ~4-degree world span (see
// world-frame.ts's DEGREES_SPAN): ~8.3 fits the whole world, ~11.6-12.6
// fits one zone.
const ZONE_DETAIL_MIN_ZOOM = 10; // below this, zone border outlines (for zones with entity data) are hidden to avoid clutter
const PIN_MIN_ZOOM = 11.5; // below this, individual quest/NPC pins are hidden to avoid clutter
// Zone name labels are always visible (never hidden); this just controls how
// their font size interpolates between the continent overview (largest, so a
// name reads clearly across its whole area) and a close zoom (smallest, so it
// doesn't dominate once the user is looking at detail) — matches hyjal.cc/map's
// observed behavior (measured directly): its "Place names" layer shows more
// labels, progressively, the further in you zoom, rather than a hard show/hide
// toggle at one threshold.
const ZONE_LABEL_ZOOM_LOW = 8;
const ZONE_LABEL_ZOOM_HIGH = 14;
const ZONE_LABEL_MAX_FONT = 15;
const ZONE_LABEL_MIN_FONT = 10;
// MapLibre's symbol text-field needs SDF glyph PBFs from a `glyphs` URL
// template — this is MapLibre's own public demo glyph service (Noto Sans,
// open-licensed), not any hyjal.cc asset. It gives us the same real,
// zoom-continuous label collision/density behavior hyjal.cc uses (more
// labels fade in as you zoom, none of them ever hard-pop), instead of the
// character-count-estimate greedy hider a plain DOM marker approach would
// need.
const GLYPHS_URL = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const LABEL_FONT = "Noto Sans Regular";

export interface AtlasMapProps {
  worldContinents: WorldContinent[];
  worldZones: WorldZone[];
  pins: WorldPin[];
  focusSlug?: string;
  initialCamera?: CameraState;
  onSelectZone: (slug: string | null) => void;
  onSelectPin: (pin: WorldPin | null) => void;
  onCameraChange?: (camera: CameraState) => void;
  /** Fires once the map's style and all its sources (including the large continent/zone terrain images) have finished loading. */
  onReady?: () => void;
}

export interface AtlasMapHandle {
  flyToZone: (slug: string) => void;
  flyToPin: (pin: WorldPin) => void;
  flyToContinent: (slug: string) => void;
  resetTilt: () => void;
}

/**
 * The single, continuous, seamlessly zoomable map — Hyjal's core UX pattern
 * (one map you zoom/tilt/rotate into, not separate pages per level) — built
 * on MapLibre GL JS. Our world has no real geography, so coordinates are
 * fabricated lng/lat near the equator/prime meridian (see world-frame.ts) —
 * the same trick other fictional/game-world MapLibre projects use; Mercator
 * distortion over our small fabricated span is negligible. This is what
 * gets us real tilt/rotate (MapLibre's native pitch/bearing) and a top-down
 * mode, which a flat 2D renderer (Leaflet, this app's original renderer)
 * cannot do at all.
 */
// Padding used to lock panning/zooming to "inside the current continent" —
// confirmed directly against hyjal.cc/map: it has no view showing more than
// one continent at once. Each continent (or Dalaran City, or any other
// top-level place) is fully isolated; zooming out is capped at "whole
// continent visible", never revealing a neighbor. 15% of the continent's
// own width/height gives comfortable room to pan around inside it — checked
// against the real gap between Eastern Kingdoms and Kalimdor's placement
// rects (world-frame.ts) so the padded box can't reach far enough to reveal
// the other continent.
const CONTINENT_BOUNDS_PADDING = 0.15;

function boundsForContinent(wc: WorldContinent): [[number, number], [number, number]] {
  const { x, y, width, height } = wc.worldRect;
  const padded = {
    x: x - width * CONTINENT_BOUNDS_PADDING,
    y: y - height * CONTINENT_BOUNDS_PADDING,
    width: width * (1 + 2 * CONTINENT_BOUNDS_PADDING),
    height: height * (1 + 2 * CONTINENT_BOUNDS_PADDING),
  };
  return rectToLngLatBounds(padded);
}

export const AtlasMap = forwardRef<AtlasMapHandle, AtlasMapProps>(function AtlasMap(
  { worldContinents, worldZones, pins, focusSlug, initialCamera, onSelectZone, onSelectPin, onCameraChange, onReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      flyToZone(slug: string) {
        const map = mapRef.current;
        const wz = worldZones.find((z) => z.slug === slug);
        if (!map || !wz) return;
        const wc = worldContinents.find((c) => c.continent.mapId === wz.continent.mapId);
        if (wc) map.setMaxBounds(boundsForContinent(wc));
        map.fitBounds(rectToLngLatBounds(wz.worldRect), { padding: 40 });
      },
      flyToPin(pin: WorldPin) {
        const map = mapRef.current;
        if (!map) return;
        const wz = worldZones.find((z) => z.slug === pin.zoneSlug);
        const wc = wz && worldContinents.find((c) => c.continent.mapId === wz.continent.mapId);
        if (wc) map.setMaxBounds(boundsForContinent(wc));
        map.flyTo({ center: toLngLat(pin.worldX, pin.worldY), zoom: Math.max(map.getZoom(), PIN_MIN_ZOOM + 1) });
      },
      flyToContinent(slug: string) {
        const map = mapRef.current;
        const wc = worldContinents.find((c) => c.slug === slug);
        if (!map || !wc) return;
        map.setMaxBounds(boundsForContinent(wc));
        map.fitBounds(rectToLngLatBounds(wc.worldRect), { padding: 20 });
      },
      resetTilt() {
        mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 300 });
      },
    }),
    [worldZones, worldContinents]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        glyphs: GLYPHS_URL,
        // Missing tiles inside the real continent data (unmapped ADT grid
        // cells) render as this dark, ocean-like color instead of a flat
        // gray "hole".
        layers: [{ id: "background", type: "background", paint: { "background-color": "#0a1520" } }],
      },
      center: [0, 0],
      zoom: 0,
      minZoom: 6,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: true, // right-drag tilt/rotate, and two-finger on touch — native, no extra wiring
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    const continentLabelEls: HTMLElement[] = [];

    map.on("load", () => {
      // Base layer: one seamless, real-coastline-shaped tile pyramid per
      // continent — real terrain at every zoom level, with no zone-rectangle
      // image in the rendering layer at all (so no overlap problem, unlike
      // a per-zone image ever could: real zones are irregular shapes whose
      // rectangular bounds heavily overlap their neighbors).
      for (const wc of worldContinents) {
        map.addSource(`continent-${wc.slug}`, {
          type: "raster",
          url: `pmtiles:///data/tile-pyramids/${wc.slug}.pmtiles`,
          tileSize: 256,
        });
        map.addLayer({ id: `continent-${wc.slug}`, type: "raster", source: `continent-${wc.slug}` });

        const [lng, lat] = toLngLat(wc.worldRect.x + wc.worldRect.width / 2, wc.worldRect.y + wc.worldRect.height / 2);
        const el = document.createElement("div");
        el.style.cssText =
          "font-size:18px;font-weight:700;letter-spacing:0.04em;color:#f2e9e4;text-shadow:0 2px 6px rgba(0,0,0,0.9);white-space:nowrap;pointer-events:none;text-transform:uppercase;";
        el.textContent = wc.continent.name;
        new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
        continentLabelEls.push(el);
      }

      // One shared GeoJSON source for every zone's click region (an
      // invisible fill covering the whole zone) — a single GPU layer
      // instead of one DOM layer per zone, and clickable at every zoom
      // level even while the zone's own detail layer (below) is hidden.
      const zoneFeatures = worldZones.map((wz) => {
        const [w, s, e, n] = [
          ...toLngLat(wz.worldRect.x, wz.worldRect.y + wz.worldRect.height),
          ...toLngLat(wz.worldRect.x + wz.worldRect.width, wz.worldRect.y),
        ];
        return {
          type: "Feature" as const,
          properties: { slug: wz.slug, hasEntityData: wz.hasEntityData },
          geometry: {
            type: "Polygon" as const,
            coordinates: [
              [
                [w, n],
                [e, n],
                [e, s],
                [w, s],
                [w, n],
              ],
            ],
          },
        };
      });
      map.addSource("zone-click-regions", { type: "geojson", data: { type: "FeatureCollection", features: zoneFeatures } });
      map.addLayer({
        id: "zone-click-regions",
        type: "fill",
        source: "zone-click-regions",
        paint: { "fill-opacity": 0 },
      });
      map.addLayer({
        id: "zone-borders",
        type: "line",
        source: "zone-click-regions",
        minzoom: ZONE_DETAIL_MIN_ZOOM,
        filter: ["==", ["get", "hasEntityData"], true],
        paint: { "line-color": "#e8863a", "line-width": 2 },
      });
      map.on("click", "zone-click-regions", (e) => {
        const slug = e.features?.[0]?.properties?.slug;
        if (slug) onSelectZone(slug);
      });
      map.on("mouseenter", "zone-click-regions", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "zone-click-regions", () => (map.getCanvas().style.cursor = ""));

      // Zone names, as a real GL symbol layer — matches hyjal.cc/map's
      // observed "Place names" behavior (measured directly): one unified,
      // zoom-continuous label layer with native collision detection, where
      // more labels progressively fade in as you zoom in rather than all
      // toggling on/off at one hard threshold. `symbol-sort-key` gives
      // bigger zones priority to stay visible when space is tight; `text-size`
      // interpolates by zoom so labels shrink smoothly once you're in close
      // rather than dominating the view.
      const zoneLabelFeatures = worldZones.map((wz) => ({
        type: "Feature" as const,
        properties: { name: wz.zone.name, sortKey: -(wz.worldRect.width * wz.worldRect.height) },
        geometry: {
          type: "Point" as const,
          coordinates: toLngLat(wz.worldRect.x + wz.worldRect.width / 2, wz.worldRect.y + wz.worldRect.height / 2),
        },
      }));
      map.addSource("zone-labels", { type: "geojson", data: { type: "FeatureCollection", features: zoneLabelFeatures } });
      map.addLayer({
        id: "zone-labels",
        type: "symbol",
        source: "zone-labels",
        layout: {
          "text-field": ["get", "name"],
          "text-font": [LABEL_FONT],
          "text-size": ["interpolate", ["linear"], ["zoom"], ZONE_LABEL_ZOOM_LOW, ZONE_LABEL_MAX_FONT, ZONE_LABEL_ZOOM_HIGH, ZONE_LABEL_MIN_FONT],
          "symbol-sort-key": ["get", "sortKey"],
          "text-padding": 4,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.85)",
          "text-halo-width": 1.2,
        },
      });

      // Entity pins (quest givers, flight paths) — a GPU circle layer
      // (not per-pin DOM elements/React components), so this scales to
      // hundreds/thousands of POIs without per-frame layout cost. Visible
      // only once zoomed in enough that clutter isn't an issue.
      const pinFeatures = pins.map((pin) => ({
        type: "Feature" as const,
        properties: { id: pin.id, kind: pin.kind, label: pin.label, sublabel: pin.sublabel ?? "" },
        geometry: { type: "Point" as const, coordinates: toLngLat(pin.worldX, pin.worldY) },
      }));
      map.addSource("pins", { type: "geojson", data: { type: "FeatureCollection", features: pinFeatures } });
      map.addLayer({
        id: "pins",
        type: "circle",
        source: "pins",
        minzoom: PIN_MIN_ZOOM,
        paint: {
          "circle-radius": 6,
          "circle-color": ["match", ["get", "kind"], "flight_path", "#38bdf8", "#facc15"],
          "circle-stroke-color": "#111",
          "circle-stroke-width": 1,
        },
      });
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      map.on("mouseenter", "pins", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const { label, sublabel } = f.properties as { label: string; sublabel: string };
        popup
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(sublabel ? `${label} (${sublabel})` : label)
          .addTo(map);
      });
      map.on("mouseleave", "pins", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "pins", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const pin = pins.find((p) => p.id === (f.properties as { id: string }).id);
        if (pin) onSelectPin(pin);
      });

      const reportCamera = () => {
        const center = map.getCenter();
        onCameraChange?.({ lng: center.lng, lat: center.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
      };
      // Registered before the initial fit below so that fit's own moveend
      // (fired synchronously for an unanimated jump/fitBounds) is caught —
      // otherwise the very first view never makes it into the URL until
      // the user pans.
      map.on("moveend", reportCamera);

      // A shared URL (with exact camera params) restores precisely what was
      // shared; otherwise fall back to a focused zone (a plainer `?zone=`
      // link); otherwise, since there's no combined "world" view (confirmed
      // against hyjal.cc/map — every top-level place is isolated, none show
      // more than one continent), land on the first continent, same as
      // hyjal.cc/map's own default landing.
      const focusZone = focusSlug ? worldZones.find((z) => z.slug === focusSlug) : undefined;
      const focusContinent = focusZone
        ? worldContinents.find((c) => c.continent.mapId === focusZone.continent.mapId)
        : worldContinents[0];
      // Lock panning/zooming to the focused continent immediately (not just
      // after the initial fit) so a reload never briefly — or permanently —
      // exposes a neighboring continent.
      if (focusContinent) map.setMaxBounds(boundsForContinent(focusContinent));
      if (initialCamera) {
        map.jumpTo({
          center: [initialCamera.lng, initialCamera.lat],
          zoom: initialCamera.zoom,
          pitch: initialCamera.pitch,
          bearing: initialCamera.bearing,
        });
      } else if (focusZone) {
        map.fitBounds(rectToLngLatBounds(focusZone.worldRect), { padding: 40, animate: false });
      } else if (focusContinent) {
        map.fitBounds(rectToLngLatBounds(focusContinent.worldRect), { padding: 20, animate: false });
      }
      reportCamera();
      // A handful of individual PMTiles tile requests have been observed to
      // never resolve (neither load nor error) — a concurrency edge case in
      // the pmtiles JS library's request-dedup logic when multiple tiles
      // need the same directory fetch, not a data or network problem (every
      // underlying HTTP request completes 200/206; confirmed via MapLibre's
      // own sourcedata events). That can leave `idle` waiting forever for
      // those specific tiles. A couple of missing 256px patches that
      // self-heal on the next pan/zoom is a much smaller problem than the
      // whole map being stuck behind a loading screen — fire onReady on
      // whichever comes first.
      let ready = false;
      const fireReady = () => {
        if (ready) return;
        ready = true;
        onReady?.();
      };
      map.once("idle", fireReady);
      setTimeout(fireReady, 4000);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
});
