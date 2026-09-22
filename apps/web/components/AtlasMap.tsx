"use client";

import "leaflet/dist/leaflet.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type * as LeafletTypes from "leaflet";
import { biomeSolidColor, getBiome } from "@/lib/biome";
import { rectToLatLngBounds, toLatLng, WORLD_SIZE, type WorldContinent, type WorldPin, type WorldZone } from "@/lib/world-frame";

const PIN_MIN_ZOOM = 2; // below this zoom, individual quest/NPC pins are hidden to avoid clutter

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
}

/**
 * The single, continuous, seamlessly zoomable map — Hyjal's core UX
 * pattern (one map you zoom into, not separate pages per level) — built
 * on Leaflet with CRS.Simple (a flat, non-geographic coordinate plane).
 * MapLibre GL JS was considered per docs/MAP_ARCHITECTURE.md's original
 * recommendation, but it's hard-wired to real-world Web Mercator
 * projection; Leaflet + CRS.Simple is the standard, proven approach for a
 * flat custom-coordinate game map (the same pattern most WoW/Minecraft fan
 * map projects use), and is what's used here.
 */
export const AtlasMap = forwardRef<AtlasMapHandle, AtlasMapProps>(function AtlasMap(
  { worldContinents, worldZones, pins, focusSlug, onSelectZone, onSelectPin },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const pinLayerRef = useRef<LeafletTypes.LayerGroup | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      flyToZone(slug: string) {
        const map = mapRef.current;
        const wz = worldZones.find((z) => z.slug === slug);
        if (map && wz) map.flyToBounds(rectToLatLngBounds(wz.worldRect), { padding: [40, 40] });
      },
      flyToPin(pin: WorldPin) {
        const map = mapRef.current;
        if (map) map.flyTo(toLatLng(pin.worldX, pin.worldY), Math.max(map.getZoom(), PIN_MIN_ZOOM + 1));
      },
    }),
    [worldZones]
  );

  useEffect(() => {
    let cancelled = false;
    let map: LeafletTypes.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      // CRS.Simple scale is 2^zoom px per world-unit. WORLD_SIZE is 10000
      // units and the viewport is typically well under 1000px, so fitting
      // the whole world needs zoom around -4 (2^-4 * 10000 = 625px) — a
      // minZoom that doesn't go low enough clamps fitBounds and leaves most
      // of the map clipped outside Leaflet's render bounds.
      map = L.map(containerRef.current, {
        crs: L.CRS.Simple,
        minZoom: -8,
        maxZoom: 6,
        zoomSnap: 0.25,
        attributionControl: false,
      });
      mapRef.current = map;

      const worldBounds: LeafletTypes.LatLngBoundsExpression = [toLatLng(0, WORLD_SIZE), toLatLng(WORLD_SIZE, 0)];
      map.setMaxBounds(L.latLngBounds(worldBounds).pad(0.15));

      // Base layer: one seamless real-terrain image per continent — what
      // makes the whole map read as one continuous landmass instead of
      // disconnected zone boxes. Higher-detail per-zone tiles (below) sit
      // on top of this within their own bounds.
      for (const wc of worldContinents) {
        if (!wc.tile) continue;
        L.imageOverlay(`/data/continents/${wc.slug}.png`, rectToLatLngBounds(wc.worldRect), {
          interactive: false,
        }).addTo(map!);
      }

      // Zone layer: real terrain image where extracted (highest detail), a
      // faint outline over the continent base layer where a continent
      // image exists, or a solid generated biome color as a last resort.
      for (const wz of worldZones) {
        const bounds = rectToLatLngBounds(wz.worldRect);
        const continentHasImage = worldContinents.find((c) => c.continent.mapId === wz.continent.mapId)?.tile;
        let layer: LeafletTypes.Layer;
        if (wz.tile) {
          layer = L.imageOverlay(`/data/tiles/${wz.slug}.png`, bounds, { interactive: true });
        } else {
          const biome = getBiome(wz.zone.name);
          layer = L.rectangle(bounds, {
            color: wz.hasEntityData ? "#e8863a" : "#00000055",
            weight: wz.hasEntityData ? 2 : 1,
            fillColor: biomeSolidColor(biome),
            fillOpacity: continentHasImage ? 0.08 : 0.85,
          });
        }
        layer.addTo(map!);
        layer.on("click", () => onSelectZone(wz.slug));

        const center = L.latLngBounds(bounds).getCenter();
        L.marker(center, {
          icon: L.divIcon({
            className: "",
            html: `<div style="font-size:11px;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;pointer-events:none;">${wz.zone.name}</div>`,
          }),
          interactive: false,
        }).addTo(map!);
      }

      // Entity pins (quest givers, flight paths) — visibility gated by zoom, like Hyjal's own layer toggles.
      const pinLayer = L.layerGroup();
      pinLayerRef.current = pinLayer;
      for (const pin of pins) {
        const color = pin.kind === "flight_path" ? "#38bdf8" : "#facc15";
        const marker = L.circleMarker(toLatLng(pin.worldX, pin.worldY), {
          radius: 6,
          color: "#111",
          weight: 1,
          fillColor: color,
          fillOpacity: 1,
        });
        marker.bindTooltip(pin.sublabel ? `${pin.label} (${pin.sublabel})` : pin.label);
        marker.on("click", () => onSelectPin(pin));
        pinLayer.addLayer(marker);
      }

      const updatePinVisibility = () => {
        if (!map) return;
        if (map.getZoom() >= PIN_MIN_ZOOM) {
          if (!map.hasLayer(pinLayer)) pinLayer.addTo(map);
        } else if (map.hasLayer(pinLayer)) {
          map.removeLayer(pinLayer);
        }
      };
      map.on("zoomend", updatePinVisibility);

      // Leaflet computes fitBounds() against the container's CURRENT size —
      // if that's called before the CSS grid/flex layout has actually sized
      // the container (a real gotcha with Leaflet inside React), the view
      // ends up projected against a stale/zero size and looks correct to
      // Leaflet but wrong on screen. invalidateSize() forces a remeasure
      // first; a ResizeObserver keeps it correct if the layout ever changes
      // later (e.g. viewport resize).
      const fit = () => {
        if (!map) return;
        map.invalidateSize();
        const focusZone = focusSlug ? worldZones.find((z) => z.slug === focusSlug) : undefined;
        if (focusZone) {
          map.fitBounds(rectToLatLngBounds(focusZone.worldRect), { padding: [40, 40] });
        } else {
          map.fitBounds(worldBounds, { padding: [20, 20] });
        }
      };
      fit();
      updatePinVisibility();

      resizeObserver = new ResizeObserver(() => map?.invalidateSize());
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
});
