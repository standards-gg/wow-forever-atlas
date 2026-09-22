import Link from "next/link";
import type { UiRect } from "@/lib/world-data";
import { getBiome } from "@/lib/biome";

/**
 * A labeled, clickable territory rectangle — a continent on the world map,
 * or a zone on a continent map. Filled with a generated biome gradient
 * (see lib/biome.ts) rather than a flat overlay, since we have no licensed
 * source for real terrain imagery yet.
 */
export function TerritoryRegion({
  rect,
  label,
  href,
  biomeName,
  hasData,
}: {
  rect: UiRect;
  label: string;
  href: string;
  /** Zone/continent name to classify into a biome gradient. Falls back to a generic look if omitted. */
  biomeName?: string;
  /** Visually distinguishes zones with real imported entity data from ones that are geography-only so far. */
  hasData?: boolean;
}) {
  const biome = getBiome(biomeName ?? label);
  return (
    <Link
      href={href}
      className={`group absolute flex items-center justify-center overflow-hidden rounded-sm border text-center shadow-inner transition hover:z-10 hover:scale-[1.03] hover:shadow-lg focus:z-10 focus:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-ember-400 ${
        hasData ? "border-ember-400 ring-1 ring-ember-400/70" : "border-black/40 hover:border-white/40"
      }`}
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
        backgroundImage: biome.gradient,
      }}
    >
      <span
        className={`px-1 text-[10px] font-semibold leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-xs ${biome.textClass}`}
      >
        {label}
      </span>
      {hasData && (
        <span
          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ember-400"
          title="Has imported quest/NPC data"
        />
      )}
    </Link>
  );
}
