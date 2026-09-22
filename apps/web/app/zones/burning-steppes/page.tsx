import Link from "next/link";
import { findZoneByName, getZoneContents, loadAtlasDataset } from "@/lib/atlas-data";
import { DiscoveryPanel } from "@/components/DiscoveryPanel";
import { ZoneMap } from "@/components/ZoneMap";

export default async function BurningSteppesPage() {
  const dataset = await loadAtlasDataset();
  const zone = findZoneByName(dataset, "Burning Steppes");

  if (!zone) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-[#c9b8ae]">
        Burning Steppes not found in the current dataset. Run{" "}
        <code className="rounded bg-white/10 px-1">npm run import:att:burning-steppes</code> first.
      </main>
    );
  }

  const { quests, npcs, flightPaths, pins } = getZoneContents(dataset, zone);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/" className="text-xs text-[#8a7267] hover:text-ember-400">
        &larr; Atlas
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-ember-400">{zone.name}</h1>
      <p className="mt-1 text-xs text-[#8a7267]">
        Data source: AllTheThings @ {dataset.sourceVersion.slice(0, 12)} &middot; imported{" "}
        {new Date(dataset.generatedAt).toLocaleString()}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
        <ZoneMap pins={pins} zoneName={zone.name} />
        <DiscoveryPanel quests={quests} flightPaths={flightPaths} npcs={npcs} />
      </div>

      <details className="mt-10 rounded-md bg-white/5 p-4 text-xs text-[#8a7267]">
        <summary className="cursor-pointer text-ember-400">
          Import warnings ({dataset.warnings.length}) &mdash; documented gaps, not silent failures
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {dataset.warnings.slice(0, 15).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
          {dataset.warnings.length > 15 && <li>&hellip; and {dataset.warnings.length - 15} more</li>}
        </ul>
      </details>
    </main>
  );
}
