"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import { biomeSolidColor, getBiome } from "@/lib/biome";
import {
  rectToLngLatBounds,
  rectToLngLatCorners,
  toLngLat,
  type WorldContinent,
  type WorldPin,
  type WorldZone,
} from "@/lib/world-frame";
import type { CameraState } from "@/lib/url-state";

// MapLibre zoom is real Web Mercator zoom (256px tile at z0), an entirely
// different absolute scale than Leaflet's old CRS.Simple zoom — these were
// picked empirically for our fabricated ~4-degree world span (see
// world-frame.ts's DEGREES_SPAN): ~8.3 fits the whole world, ~11.6-12.6
// fits one zone.
const ZONE_DETAIL_MIN_ZOOM = 10; // below this, only the seamless continent image shows
const PIN_MIN_ZOOM = 11.5; // below this, individual quest/NPC pins are hidden to avoid clutter
// Zone name labels are always visible (never hidden); this just controls
// how their font size interpolates between the world/continent overview
// (largest, so a zone name reads clearly across its whole area) and a close
// zoom (smallest, so it doesn't dominate once the user is looking at detail).
const ZONE_LABEL_ZOOM_LOW = 8;
const ZONE_LABEL_ZOOM_HIGH = 14;
const ZONE_LABEL_MAX_FONT = 15;
const ZONE_LABEL_MIN_FONT = 10;

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
  flyToWorld: () => void;
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
/** The bounding box of every zone's worldRect, combined — used to fit the whole world in view. */
function computeWorldBounds(worldZones: WorldZone[]): [[number, number], [number, number]] {
  const xs = worldZones.flatMap((z) => [z.worldRect.x, z.worldRect.x + z.worldRect.width]);
  const ys = worldZones.flatMap((z) => [z.worldRect.y, z.worldRect.y + z.worldRect.height]);
  return [toLngLat(Math.min(...xs), Math.max(...ys)), toLngLat(Math.max(...xs), Math.min(...ys))];
}

// Padding used to lock panning/zooming to "inside the current continent"
// (Hyjal's model: World shows both continents; clicking into one shows only
// that one until you explicitly go back to World). 15% of the continent's
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
      flyToWorld() {
        const map = mapRef.current;
        if (!map || worldZones.length === 0) return;
        map.setMaxBounds(undefined);
        map.fitBounds(computeWorldBounds(worldZones), { padding: 20 });
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
    const zoneLabelMarkers: { marker: maplibregl.Marker; el: HTMLElement; text: string }[] = [];

    map.on("load", () => {
      // Base layer: one seamless real-terrain image per continent — what
      // makes the whole map read as one continuous landmass instead of
      // disconnected zone boxes. Higher-detail per-zone tiles sit on top,
      // gated to appear only once zoomed in (minzoom below).
      for (const wc of worldContinents) {
        if (!wc.tile) continue;
        map.addSource(`continent-${wc.slug}`, {
          type: "image",
          url: `/data/continents/${wc.slug}.png`,
          coordinates: rectToLngLatCorners(wc.worldRect),
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

      // Zone detail: real terrain image where extracted, or a solid
      // generated biome color where a zone has no continent image behind
      // it to fall back on. Gated by minzoom so the whole-continent view
      // shows only the single seamless continent image with no per-zone
      // seams or label clutter.
      const fallbackFeatures = worldZones
        .filter((wz) => {
          const continentHasImage = worldContinents.find((c) => c.continent.mapId === wz.continent.mapId)?.tile;
          return !wz.tile && !continentHasImage;
        })
        .map((wz) => {
          const [w, s, e, n] = [
            ...toLngLat(wz.worldRect.x, wz.worldRect.y + wz.worldRect.height),
            ...toLngLat(wz.worldRect.x + wz.worldRect.width, wz.worldRect.y),
          ];
          return {
            type: "Feature" as const,
            properties: { color: biomeSolidColor(getBiome(wz.zone.name)) },
            geometry: { type: "Polygon" as const, coordinates: [[[w, n], [e, n], [e, s], [w, s], [w, n]]] },
          };
        });
      if (fallbackFeatures.length > 0) {
        map.addSource("zone-fallback-fill", { type: "geojson", data: { type: "FeatureCollection", features: fallbackFeatures } });
        map.addLayer({
          id: "zone-fallback-fill",
          type: "fill",
          source: "zone-fallback-fill",
          minzoom: ZONE_DETAIL_MIN_ZOOM,
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.85 },
        });
      }

      // Real zones are irregular shapes, not rectangles — their axis-aligned
      // worldRects (all we have; no vector zone-boundary data) frequently
      // overlap a neighbor's heavily (confirmed empirically: 121 overlapping
      // pairs across 49 zones, some 100% — e.g. Moonglade's whole rect sits
      // inside Winterspring's). MapLibre draws layers in add-order, so
      // without this, whichever zone happened to load last would randomly
      // paint over its neighbors. Adding smaller (more specific/nested)
      // zones LAST — on top — means the more-specific zone always wins the
      // area it actually owns, instead of an arbitrary one flickering over
      // the other.
      const zonesByAreaDesc = [...worldZones].sort((a, b) => b.worldRect.width * b.worldRect.height - a.worldRect.width * a.worldRect.height);
      for (const wz of zonesByAreaDesc) {
        if (!wz.tile) continue;
        map.addSource(`zone-${wz.slug}`, {
          type: "image",
          url: `/data/tiles/${wz.slug}.png`,
          coordinates: rectToLngLatCorners(wz.worldRect),
        });
        map.addLayer({ id: `zone-${wz.slug}`, type: "raster", source: `zone-${wz.slug}`, minzoom: ZONE_DETAIL_MIN_ZOOM });
      }

      // Bigger zones get priority to stay labeled when space is tight (see
      // updateZoneLabelLayout below) — creating markers in area-desc order
      // means the greedy collision pass naturally favors them.
      for (const wz of zonesByAreaDesc) {
        const [lng, lat] = toLngLat(wz.worldRect.x + wz.worldRect.width / 2, wz.worldRect.y + wz.worldRect.height / 2);
        const el = document.createElement("div");
        el.style.cssText =
          "font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;pointer-events:none;";
        el.textContent = wz.zone.name;
        const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
        zoneLabelMarkers.push({ marker, el, text: wz.zone.name });
      }

      // Zone names stay visible at every zoom level (never hidden outright)
      // and shrink as you zoom in — at that point you're focused on detail
      // within the zone (terrain, and eventually sub-area/POI names) rather
      // than the zone as a whole. Largest at the world/continent overview,
      // where a name has to label its whole area at a glance.
      //
      // At the overview, 49 zone names would overlap into an unreadable
      // mess if all shown at once — real zones are irregular shapes packed
      // tightly together, so their label points are often close together.
      // These are plain DOM markers (not a GL symbol layer, which would need
      // a glyph-server dependency we don't have), so there's no built-in
      // label collision detection; this does a cheap greedy pass every
      // frame instead — project each label to screen space, estimate its
      // box from character count (avoids a DOM reflow per label per frame),
      // and hide any label that overlaps one already placed. Bigger zones
      // are checked first (creation order), so they win when space is tight.
      const updateZoneLabelLayout = () => {
        const t = Math.min(1, Math.max(0, (map.getZoom() - ZONE_LABEL_ZOOM_LOW) / (ZONE_LABEL_ZOOM_HIGH - ZONE_LABEL_ZOOM_LOW)));
        const fontSize = ZONE_LABEL_MAX_FONT - t * (ZONE_LABEL_MAX_FONT - ZONE_LABEL_MIN_FONT);
        const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
        for (const { marker, el, text } of zoneLabelMarkers) {
          el.style.fontSize = `${fontSize}px`;
          const { x, y } = map.project(marker.getLngLat());
          const halfW = text.length * fontSize * 0.3;
          const halfH = fontSize * 0.75;
          const box = { x0: x - halfW, y0: y - halfH, x1: x + halfW, y1: y + halfH };
          const overlaps = placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
          if (overlaps) {
            el.style.display = "none";
          } else {
            el.style.display = "";
            placed.push(box);
          }
        }
      };
      map.on("zoom", updateZoneLabelLayout);
      map.on("move", updateZoneLabelLayout);
      updateZoneLabelLayout();

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
      // link), then the whole world.
      const focusZone = focusSlug ? worldZones.find((z) => z.slug === focusSlug) : undefined;
      // A `?zone=` (or a shared camera alongside one) means we're "inside"
      // that zone's continent — lock panning/zooming to it immediately so
      // a reload doesn't briefly (or permanently) expose the other
      // continent before the user explicitly asks for World.
      if (focusZone) {
        const focusContinent = worldContinents.find((c) => c.continent.mapId === focusZone.continent.mapId);
        if (focusContinent) map.setMaxBounds(boundsForContinent(focusContinent));
      }
      if (initialCamera) {
        map.jumpTo({
          center: [initialCamera.lng, initialCamera.lat],
          zoom: initialCamera.zoom,
          pitch: initialCamera.pitch,
          bearing: initialCamera.bearing,
        });
      } else if (focusZone) {
        map.fitBounds(rectToLngLatBounds(focusZone.worldRect), { padding: 40, animate: false });
      } else if (worldZones.length > 0) {
        map.fitBounds(computeWorldBounds(worldZones), { padding: 20, animate: false });
      }
      reportCamera();
      map.once("idle", () => onReady?.());
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      for (const { marker } of zoneLabelMarkers) marker.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
});
