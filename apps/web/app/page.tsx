import { continentRectInWorld, loadWorldGeography } from "@/lib/world-data";
import { slugify } from "@/lib/slug";
import { PanZoomCanvas } from "@/components/PanZoomCanvas";
import { TerritoryRegion } from "@/components/TerritoryRegion";

export default async function HomePage() {
  const world = await loadWorldGeography();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-ember-400">WoW Forever Atlas</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#c9b8ae]">
        The world of Azeroth &mdash; positions and boundaries below are real, pulled directly from
        the Forever client&apos;s own DB2 data (build {world.build}), not placeholders. Click a
        continent to explore its zones. Drag to pan, scroll to zoom.
      </p>

      <div className="mt-8">
        <PanZoomCanvas ariaLabel="World map of Azeroth">
          {world.continents.map((continent) => (
            <TerritoryRegion
              key={continent.mapId}
              rect={continentRectInWorld(continent)}
              label={continent.name}
              href={`/continents/${slugify(continent.name)}`}
            />
          ))}
        </PanZoomCanvas>
      </div>

      <p className="mt-4 text-xs text-[#6b584e]">
        {world.zones.length} zones and cities mapped across {world.continents.length} continents.
        Territory shapes are real-position bounding boxes from Blizzard&apos;s own zone data, not
        terrain artwork yet &mdash; see{" "}
        <a
          href="https://github.com/standards-gg/wow-forever-atlas/blob/master/docs/MAP_ARCHITECTURE.md"
          className="underline hover:text-ember-400"
        >
          docs/MAP_ARCHITECTURE.md
        </a>{" "}
        for the real-imagery pipeline.
      </p>
    </main>
  );
}
