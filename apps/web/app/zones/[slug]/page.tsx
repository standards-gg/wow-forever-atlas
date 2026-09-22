import Link from "next/link";
import { notFound } from "next/navigation";
import { findZoneByName, getZoneContents, loadAtlasDataset } from "@/lib/atlas-data";
import { findZoneBySlug, loadWorldGeography } from "@/lib/world-data";
import { slugify } from "@/lib/slug";
import { findRealTileImage } from "@/lib/tiles";
import { DiscoveryPanel } from "@/components/DiscoveryPanel";
import { ZoneMap } from "@/components/ZoneMap";

export default async function ZonePage({ params }: { params: { slug: string } }) {
  const world = await loadWorldGeography();
  const geography = findZoneBySlug(world, params.slug);
  if (!geography) notFound();

  const continent = world.continents.find((c) => c.mapId === geography.continentMapId);
  const dataset = await loadAtlasDataset().catch(() => null);
  const entityZone = dataset ? findZoneByName(dataset, geography.name) : undefined;
  const realTileImage = await findRealTileImage(params.slug);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href={continent ? `/continents/${slugify(continent.name)}` : "/"}
        className="text-xs text-[#8a7267] hover:text-ember-400"
      >
        &larr; {continent?.name ?? "Azeroth"}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-ember-400">{geography.name}</h1>

      {!dataset || !entityZone ? (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
          <ZoneMap pins={[]} zoneName={geography.name} realTileImage={realTileImage} />
          <div className="rounded-md border border-white/10 bg-white/5 p-4 text-sm text-[#c9b8ae]">
            <p className="font-medium text-ember-400">No entity data imported for this zone yet.</p>
            <p className="mt-2 text-xs text-[#8a7267]">
              Its geography (boundaries, position on {continent?.name ?? "its continent"}) is real,
              pulled from Blizzard&apos;s own DB2 data &mdash; but quests/NPCs/flight paths for this
              specific zone haven&apos;t been imported yet. Only Burning Steppes and Searing Gorge
              have been run through the AllTheThings importer so far (the Phase 1 vertical slice).
              This is an honest &ldquo;not yet imported&rdquo; state, not a broken page &mdash; see{" "}
              <a
                href="https://github.com/standards-gg/wow-forever-atlas/blob/master/docs/PHASE_1_REPORT.md"
                className="underline hover:text-ember-400"
              >
                docs/PHASE_1_REPORT.md
              </a>
              .
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-[#8a7267]">
            Data source: AllTheThings @ {dataset.sourceVersion.slice(0, 12)} &middot; imported{" "}
            {new Date(dataset.generatedAt).toLocaleString()}
          </p>
          {(() => {
            const { quests, npcs, flightPaths, pins } = getZoneContents(dataset, entityZone);
            return (
              <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
                <ZoneMap pins={pins} zoneName={geography.name} realTileImage={realTileImage} />
                <DiscoveryPanel quests={quests} flightPaths={flightPaths} npcs={npcs} />
              </div>
            );
          })()}
        </>
      )}
    </main>
  );
}
