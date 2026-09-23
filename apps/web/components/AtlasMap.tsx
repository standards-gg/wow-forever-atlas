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

// MapLibre zoom is real Web Mercator zoom (256px tile at z0), an entirely
// different absolute scale than Leaflet's old CRS.Simple zoom — these were
// picked empirically for our fabricated ~4-degree world span (see
// world-frame.ts's DEGREES_SPAN): ~8.3 fits the whole world, ~11.6-12.6
// fits one zone.
const ZONE_DETAIL_MIN_ZOOM = 10; // below this, only the seamless continent image shows
const PIN_MIN_ZOOM = 11.5; // below this, individual quest/NPC pins are hidden to avoid clutter

export interface AtlasMapProps {
  worldContinents: WorldContinent[];
  worldZones: WorldZone[];
  pins: WorldPin[];
  focusSlug?: string;
  onSelectZone: (slug: string | null) => void;
  onSelectPin: (pin: WorldPin | null) => void;
}

export interface AtlasMapHandle {
  flyToZone: (slug: string) => void;
  flyToPin: (pin: WorldPin) => void;
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
export const AtlasMap = forwardRef<AtlasMapHandle, AtlasMapProps>(function AtlasMap(
  { worldContinents, worldZones, pins, focusSlug, onSelectZone, onSelectPin },
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
        if (map && wz) map.fitBounds(rectToLngLatBounds(wz.worldRect), { padding: 40 });
      },
      flyToPin(pin: WorldPin) {
        const map = mapRef.current;
        if (map) map.flyTo({ center: toLngLat(pin.worldX, pin.worldY), zoom: Math.max(map.getZoom(), PIN_MIN_ZOOM + 1) });
      },
      resetTilt() {
        mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 300 });
      },
    }),
    [worldZones]
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
        // gray "hole" — see globals.css's .leaflet-container override,
        // carried over to MapLibre's own canvas background here.
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

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

    const continentLabelEls: HTMLElement[] = [];
    const zoneLabelMarkers: { marker: maplibregl.Marker; el: HTMLElement }[] = [];

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

      for (const wz of worldZones) {
        if (!wz.tile) continue;
        map.addSource(`zone-${wz.slug}`, {
          type: "image",
          url: `/data/tiles/${wz.slug}.png`,
          coordinates: rectToLngLatCorners(wz.worldRect),
        });
        map.addLayer({ id: `zone-${wz.slug}`, type: "raster", source: `zone-${wz.slug}`, minzoom: ZONE_DETAIL_MIN_ZOOM });
      }

      for (const wz of worldZones) {
        const [lng, lat] = toLngLat(wz.worldRect.x + wz.worldRect.width / 2, wz.worldRect.y + wz.worldRect.height / 2);
        const el = document.createElement("div");
        el.style.cssText =
          "font-size:11px;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;pointer-events:none;display:none;";
        el.textContent = wz.zone.name;
        const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
        zoneLabelMarkers.push({ marker, el });
      }

      const updateZoneLabelVisibility = () => {
        const show = map.getZoom() >= ZONE_DETAIL_MIN_ZOOM;
        for (const { el } of zoneLabelMarkers) el.style.display = show ? "" : "none";
      };
      map.on("zoom", updateZoneLabelVisibility);
      updateZoneLabelVisibility();

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

      const focusZone = focusSlug ? worldZones.find((z) => z.slug === focusSlug) : undefined;
      if (focusZone) {
        map.fitBounds(rectToLngLatBounds(focusZone.worldRect), { padding: 40, animate: false });
      } else if (worldZones.length > 0) {
        const xs = worldZones.flatMap((z) => [z.worldRect.x, z.worldRect.x + z.worldRect.width]);
        const ys = worldZones.flatMap((z) => [z.worldRect.y, z.worldRect.y + z.worldRect.height]);
        const worldBounds: [[number, number], [number, number]] = [
          toLngLat(Math.min(...xs), Math.max(...ys)),
          toLngLat(Math.max(...xs), Math.min(...ys)),
        ];
        map.fitBounds(worldBounds, { padding: 20, animate: false });
      }
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
