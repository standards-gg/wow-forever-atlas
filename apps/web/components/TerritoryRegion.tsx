import Link from "next/link";
import type { UiRect } from "@/lib/world-data";

/** A labeled, clickable territory rectangle — a continent on the world map, or a zone on a continent map. */
export function TerritoryRegion({
  rect,
  label,
  href,
  hasData,
}: {
  rect: UiRect;
  label: string;
  href: string;
  /** Visually distinguishes zones with real imported entity data from ones that are geography-only so far. */
  hasData?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group absolute flex items-center justify-center overflow-hidden rounded-sm border text-center transition hover:z-10 hover:scale-[1.03] hover:shadow-lg focus:z-10 focus:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-ember-400 ${
        hasData
          ? "border-ember-400/60 bg-ember-600/30 hover:bg-ember-600/50"
          : "border-white/15 bg-white/[0.06] hover:bg-white/10"
      }`}
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
      }}
    >
      <span className="px-1 text-[10px] font-medium leading-tight text-[#e6dcd4] group-hover:text-white sm:text-xs">
        {label}
      </span>
    </Link>
  );
}
