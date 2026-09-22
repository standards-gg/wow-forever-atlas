"use client";

import { useState } from "react";
import { getBiome } from "@/lib/biome";

export interface MapPin {
  id: string;
  /** 0-100, UI_MAP_TRANSFORM space (see docs/COORDINATE_SYSTEM.md) */
  x: number;
  y: number;
  kind: "quest_giver" | "flight_path";
  label: string;
  sublabel?: string;
}

const KIND_STYLE: Record<MapPin["kind"], string> = {
  quest_giver: "bg-yellow-400 border-yellow-200",
  flight_path: "bg-sky-400 border-sky-200",
};

/**
 * A placeholder 2D map surface: real terrain/imagery tiles are not part of
 * this vertical slice (see docs/MAP_ARCHITECTURE.md — that pipeline,
 * wow.export -> tiling -> PMTiles, is real but unbuilt work, not something
 * to fake here). Pins are plotted at their real coordinates so the
 * entity/graph/coordinate pipeline is genuinely demonstrated; the
 * background is an honest placeholder, not a fabricated map image.
 *
 * Pins are real, focusable <button> elements with visible accessible
 * names — deliberately not Freier Bund's confirmed anti-pattern of
 * hover-only `title`-attribute tooltips on non-semantic elements
 * (docs/SOURCE_FREIERBUND.md's "UX Patterns Worth Preserving" section
 * calls this out explicitly as something to avoid).
 */
export function ZoneMap({ pins, zoneName }: { pins: MapPin[]; zoneName: string }) {
  const [selected, setSelected] = useState<MapPin | null>(null);
  const biome = getBiome(zoneName);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-white/10"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.05) 0%, transparent 35%), radial-gradient(circle at 75% 65%, rgba(255,255,255,0.04) 0%, transparent 40%), ${biome.gradient}`,
        }}
        role="group"
        aria-label={`Map of ${zoneName} (${biome.label} biome, generated visual — real terrain imagery not yet implemented)`}
      >
        <div className="absolute bottom-1 right-2 text-[9px] text-white/25">
          {biome.label} &middot; generated visual, not real terrain &mdash; see docs/MAP_ARCHITECTURE.md
        </div>
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            aria-label={`${pin.label}${pin.sublabel ? ` (${pin.sublabel})` : ""}`}
            onClick={() => setSelected(pin)}
            onFocus={() => setSelected(pin)}
            className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow ring-offset-2 ring-offset-[#241109] transition hover:scale-150 focus:scale-150 focus:outline-none focus:ring-2 focus:ring-ember-400 ${KIND_STYLE[pin.kind]}`}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          />
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-[#8a7267]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full border border-yellow-200 bg-yellow-400" /> Quest givers
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full border border-sky-200 bg-sky-400" /> Flight paths
        </span>
      </div>
      <div className="min-h-[2.5rem] rounded-md bg-white/5 px-3 py-2 text-sm">
        {selected ? (
          <>
            <span className="font-medium text-ember-400">{selected.label}</span>
            {selected.sublabel && <span className="ml-2 text-xs text-[#8a7267]">{selected.sublabel}</span>}
          </>
        ) : (
          <span className="text-xs text-[#6b584e]">Select a pin to see details.</span>
        )}
      </div>
    </div>
  );
}
