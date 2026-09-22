"use client";

import { useMemo, useRef, useState } from "react";
import { getZoneContents, type AtlasDataset } from "@/lib/atlas-data-core";
import type { WorldContinent, WorldPin, WorldZone } from "@/lib/world-frame";
import { AtlasMap, type AtlasMapHandle } from "./AtlasMap";
import { DiscoveryPanel } from "./DiscoveryPanel";

export interface AtlasExperienceProps {
  worldContinents: WorldContinent[];
  worldZones: WorldZone[];
  pins: WorldPin[];
  dataset: AtlasDataset | null;
  initialFocusSlug?: string;
}

/**
 * The full Hyjal-style experience: one continuous map (AtlasMap) plus a
 * persistent Freier Bund-style "what is around me?" side panel that
 * updates live as you click around the map — no page navigation, matching
 * the direct feedback that separate static pages weren't good enough.
 */
export function AtlasExperience({ worldContinents, worldZones, pins, dataset, initialFocusSlug }: AtlasExperienceProps) {
  const mapRef = useRef<AtlasMapHandle>(null);
  const [selectedZoneSlug, setSelectedZoneSlug] = useState<string | null>(initialFocusSlug ?? null);
  const [selectedPin, setSelectedPin] = useState<WorldPin | null>(null);
  const [query, setQuery] = useState("");

  const selectedZone = worldZones.find((z) => z.slug === selectedZoneSlug) ?? null;

  const zoneContents = useMemo(() => {
    if (!selectedZone || !dataset) return null;
    const entityZone = dataset.zones.find((z) => z.name === selectedZone.zone.name);
    if (!entityZone) return null;
    return getZoneContents(dataset, entityZone);
  }, [selectedZone, dataset]);

  const zoneResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return worldZones.filter((z) => z.zone.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, worldZones]);

  const pinResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pins.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, pins]);

  function handleSelectZone(slug: string | null) {
    setSelectedZoneSlug(slug);
    setSelectedPin(null);
  }

  function handleSelectPin(pin: WorldPin | null) {
    setSelectedPin(pin);
    if (pin) setSelectedZoneSlug(pin.zoneSlug);
  }

  function handlePickZoneResult(zone: WorldZone) {
    setQuery("");
    setSelectedZoneSlug(zone.slug);
    setSelectedPin(null);
    mapRef.current?.flyToZone(zone.slug);
  }

  function handlePickPinResult(pin: WorldPin) {
    setQuery("");
    setSelectedPin(pin);
    setSelectedZoneSlug(pin.zoneSlug);
    mapRef.current?.flyToPin(pin);
  }

  return (
    <div className="grid h-dvh grid-cols-1 lg:grid-cols-[1fr_380px]">
      <div className="relative h-[60vh] lg:h-full">
        <AtlasMap
          ref={mapRef}
          worldContinents={worldContinents}
          worldZones={worldZones}
          pins={pins}
          focusSlug={initialFocusSlug}
          onSelectZone={handleSelectZone}
          onSelectPin={handleSelectPin}
        />

        <div className="pointer-events-none absolute left-3 top-3 z-[1000] w-72 max-w-[calc(100vw-1.5rem)]">
          <div className="pointer-events-auto">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a place..."
              className="w-full rounded-md border border-white/15 bg-[#150b06]/95 px-3 py-2 text-sm text-[#f2e9e4] shadow-lg placeholder:text-[#8a7267] focus:border-ember-400 focus:outline-none"
            />
            {(zoneResults.length > 0 || pinResults.length > 0) && (
              <ul className="mt-1 max-h-72 overflow-y-auto rounded-md border border-white/15 bg-[#150b06]/95 text-sm shadow-lg">
                {zoneResults.map((z) => (
                  <li key={z.slug}>
                    <button
                      type="button"
                      onClick={() => handlePickZoneResult(z)}
                      className="block w-full px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span className="text-ember-400">{z.zone.name}</span>
                      <span className="ml-2 text-xs text-[#8a7267]">zone</span>
                    </button>
                  </li>
                ))}
                {pinResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handlePickPinResult(p)}
                      className="block w-full px-3 py-2 text-left hover:bg-white/10"
                    >
                      {p.label}
                      <span className="ml-2 text-xs text-[#8a7267]">{p.kind === "flight_path" ? "flight path" : "quest giver"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex gap-4 rounded-md bg-[#150b06]/80 px-3 py-1.5 text-xs text-[#c9b8ae] shadow">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" /> Quest givers
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> Flight paths
          </span>
        </div>
      </div>

      <aside className="flex flex-col gap-4 overflow-y-auto border-l border-white/10 bg-[#150b06] p-4">
        {!selectedZone ? (
          <div className="text-sm text-[#8a7267]">
            <p className="text-ember-400">WoW Forever Atlas</p>
            <p className="mt-2">
              Click a zone on the map, or search above, to see what&apos;s there &mdash; quests, NPCs,
              flight paths, and more, in one continuous world you can zoom into freely.
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs text-[#8a7267]">{selectedZone.continent.name}</p>
              <h2 className="text-2xl font-semibold text-ember-400">{selectedZone.zone.name}</h2>
            </div>
            {selectedPin && (
              <div className="rounded-md bg-white/5 px-3 py-2 text-sm">
                <span className="font-medium text-ember-400">{selectedPin.label}</span>
                {selectedPin.sublabel && <span className="ml-2 text-xs text-[#8a7267]">{selectedPin.sublabel}</span>}
              </div>
            )}
            {zoneContents ? (
              <DiscoveryPanel quests={zoneContents.quests} npcs={zoneContents.npcs} flightPaths={zoneContents.flightPaths} />
            ) : (
              <p className="text-xs text-[#8a7267]">
                No quest/NPC data imported for this zone yet &mdash; its position on the map is real, pulled
                from Blizzard&apos;s own DB2 data, but only Burning Steppes and Searing Gorge have full
                entity data so far (the Phase 1 vertical slice).
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
