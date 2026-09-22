import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAtlasDataset } from "@/lib/atlas-data";
import { findContinentBySlug, loadWorldGeography, zoneRectInContinent } from "@/lib/world-data";
import { slugify } from "@/lib/slug";
import { loadTileManifestEntries } from "@/lib/tiles";
import { PanZoomCanvas } from "@/components/PanZoomCanvas";
import { TerritoryRegion } from "@/components/TerritoryRegion";

export default async function ContinentPage({ params }: { params: { slug: string } }) {
  const world = await loadWorldGeography();
  const continent = findContinentBySlug(world, params.slug);
  if (!continent) notFound();

  const zones = world.zones.filter((z) => z.continentMapId === continent.mapId);

  // Which zones have real imported entity data (currently just the
  // AllTheThings vertical slice) vs. geography-only — see docs/PHASE_1_REPORT.md's
  // vertical-slice classification for why most zones are geography-only today.
  const entityDataset = await loadAtlasDataset().catch(() => null);
  const zoneNamesWithData = new Set(entityDataset?.zones.map((z) => z.name) ?? []);

  // Real in-game terrain extracted directly from the client (see
  // importers/wow-client/README.md) — only Burning Steppes/Searing Gorge so far.
  const tileEntries = await loadTileManifestEntries();
  const realTileUrlBySlug = new Map(tileEntries.map((t) => [t.slug, `/data/tiles/${t.slug}.png`]));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/" className="text-xs text-[#8a7267] hover:text-ember-400">
        &larr; Azeroth
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-ember-400">{continent.name}</h1>
      <p className="mt-1 text-xs text-[#8a7267]">
        {zones.length} zones/cities &middot; real boundaries from build {world.build}
      </p>

      <div className="mt-6">
        <PanZoomCanvas ariaLabel={`Map of ${continent.name}`}>
          {zones.map((zone) => {
            const slug = slugify(zone.name);
            return (
              <TerritoryRegion
                key={zone.areaId}
                rect={zoneRectInContinent(zone, continent)}
                label={zone.name}
                href={`/zones/${slug}`}
                hasData={zoneNamesWithData.has(zone.name)}
                realTileUrl={realTileUrlBySlug.get(slug)}
              />
            );
          })}
        </PanZoomCanvas>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-[#8a7267]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm border border-ember-400/60 bg-ember-600/40" /> Has
          imported quest/NPC data
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm border border-white/20 bg-white/10" /> Geography only
          so far
        </span>
      </div>
    </main>
  );
}
