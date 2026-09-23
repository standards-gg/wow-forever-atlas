import { loadAtlasDataset } from "@/lib/atlas-data";
import { loadWorldGeography } from "@/lib/world-data";
import { loadTileManifestEntries } from "@/lib/tiles";
import { loadContinentTileEntries } from "@/lib/continents";
import { buildWorldContinents, buildWorldPins, buildWorldZones } from "@/lib/world-frame";
import { parseCameraFromParams } from "@/lib/url-state";
import { AtlasExperience } from "@/components/AtlasExperience";

interface HomeSearchParams {
  [key: string]: string | undefined;
  zone?: string;
  pin?: string;
  lng?: string;
  lat?: string;
  zoom?: string;
  pitch?: string;
  bearing?: string;
}

export default async function HomePage({ searchParams }: { searchParams: HomeSearchParams }) {
  const [world, dataset, tiles, continentTiles] = await Promise.all([
    loadWorldGeography(),
    loadAtlasDataset().catch(() => null),
    loadTileManifestEntries(),
    loadContinentTileEntries(),
  ]);

  const worldContinents = buildWorldContinents(world, continentTiles);
  const worldZones = buildWorldZones(world, dataset, tiles);
  const pins = buildWorldPins(worldZones, dataset);

  return (
    <AtlasExperience
      worldContinents={worldContinents}
      worldZones={worldZones}
      pins={pins}
      dataset={dataset}
      initialFocusSlug={searchParams.zone}
      initialPinId={searchParams.pin}
      initialCamera={parseCameraFromParams(searchParams)}
    />
  );
}
