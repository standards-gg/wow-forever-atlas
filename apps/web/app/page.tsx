import { loadAtlasDataset } from "@/lib/atlas-data";
import { loadWorldGeography } from "@/lib/world-data";
import { loadTileManifestEntries } from "@/lib/tiles";
import { buildWorldPins, buildWorldZones } from "@/lib/world-frame";
import { AtlasExperience } from "@/components/AtlasExperience";

export default async function HomePage({ searchParams }: { searchParams: { zone?: string } }) {
  const [world, dataset, tiles] = await Promise.all([
    loadWorldGeography(),
    loadAtlasDataset().catch(() => null),
    loadTileManifestEntries(),
  ]);

  const worldZones = buildWorldZones(world, dataset, tiles);
  const pins = buildWorldPins(worldZones, dataset);

  return (
    <AtlasExperience worldZones={worldZones} pins={pins} dataset={dataset} initialFocusSlug={searchParams.zone} />
  );
}
