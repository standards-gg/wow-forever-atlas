/**
 * Original, generated visual styling per zone biome — NOT scraped or
 * derived from any Blizzard/Hyjal/Wowhead artwork. This exists because we
 * have no legal source for real WoW terrain imagery yet (see
 * docs/MAP_ARCHITECTURE.md — that pipeline needs a licensed client
 * install, which this dev environment doesn't have). Biome classification
 * here is real-world knowledge of these zones' actual in-game environment
 * (forest, swamp, volcanic, etc.) — a factual category, not artistic
 * expression — used to generate simple CSS gradients so the map has visual
 * texture instead of flat gray boxes while real imagery remains unsourced.
 */
export type BiomeKey =
  | "forest"
  | "dark_forest"
  | "swamp"
  | "mountain"
  | "snow"
  | "desert"
  | "savanna"
  | "jungle"
  | "volcanic"
  | "corrupted"
  | "coastal"
  | "city";

export interface Biome {
  key: BiomeKey;
  label: string;
  gradient: string; // CSS background-image value
  textClass: string;
}

const BIOMES: Record<BiomeKey, Biome> = {
  forest: { key: "forest", label: "Forest", gradient: "linear-gradient(160deg, #2d4a2b, #1a2e18)", textClass: "text-[#e8f0e6]" },
  dark_forest: { key: "dark_forest", label: "Dark Forest", gradient: "linear-gradient(160deg, #26302a, #14181a)", textClass: "text-[#dde6e0]" },
  swamp: { key: "swamp", label: "Swamp", gradient: "linear-gradient(160deg, #454a2e, #23261a)", textClass: "text-[#eceadd]" },
  mountain: { key: "mountain", label: "Mountain", gradient: "linear-gradient(160deg, #4a5560, #262d33)", textClass: "text-[#e8edf0]" },
  snow: { key: "snow", label: "Snow", gradient: "linear-gradient(160deg, #6f8ba3, #2e3d47)", textClass: "text-white" },
  desert: { key: "desert", label: "Desert", gradient: "linear-gradient(160deg, #a67c3f, #5a4322)", textClass: "text-[#fff3e0]" },
  savanna: { key: "savanna", label: "Savanna", gradient: "linear-gradient(160deg, #8a7a3a, #4a4020)", textClass: "text-[#fbf6e3]" },
  jungle: { key: "jungle", label: "Jungle", gradient: "linear-gradient(160deg, #1f5c4a, #123028)", textClass: "text-[#e0f5ec]" },
  volcanic: { key: "volcanic", label: "Volcanic", gradient: "linear-gradient(160deg, #7a2c1d, #2e1109)", textClass: "text-[#ffe8de]" },
  corrupted: { key: "corrupted", label: "Corrupted", gradient: "linear-gradient(160deg, #4a3f5c, #211c2e)", textClass: "text-[#ece6f5]" },
  coastal: { key: "coastal", label: "Coastal", gradient: "linear-gradient(160deg, #2c5c68, #16292e)", textClass: "text-[#e0f2f5]" },
  city: { key: "city", label: "City", gradient: "linear-gradient(160deg, #6b5d45, #332c1f)", textClass: "text-[#f5efe3]" },
};

/** Real-world classification of every zone this project currently has geography for. */
const ZONE_BIOME: Record<string, BiomeKey> = {
  "Dun Morogh": "snow",
  Badlands: "desert",
  "Blasted Lands": "corrupted",
  "Swamp of Sorrows": "swamp",
  Duskwood: "dark_forest",
  Wetlands: "swamp",
  "Elwynn Forest": "forest",
  Durotar: "desert",
  "Dustwallow Marsh": "swamp",
  Azshara: "coastal",
  "The Barrens": "savanna",
  "Western Plaguelands": "corrupted",
  "Stranglethorn Vale": "jungle",
  "Alterac Mountains": "mountain",
  "Loch Modan": "mountain",
  Westfall: "savanna",
  "Deadwind Pass": "dark_forest",
  "Redridge Mountains": "mountain",
  "Arathi Highlands": "savanna",
  "Burning Steppes": "volcanic",
  "The Hinterlands": "jungle",
  "Searing Gorge": "volcanic",
  "Tirisfal Glades": "corrupted",
  "Silverpine Forest": "dark_forest",
  "Eastern Plaguelands": "corrupted",
  Teldrassil: "forest",
  Darkshore: "coastal",
  Mulgore: "savanna",
  "Hillsbrad Foothills": "savanna",
  Ashenvale: "forest",
  Feralas: "jungle",
  Felwood: "corrupted",
  "Thousand Needles": "desert",
  Desolace: "desert",
  "Stonetalon Mountains": "mountain",
  Tanaris: "desert",
  "Un'Goro Crater": "jungle",
  Moonglade: "forest",
  "Mount Hyjal": "mountain",
  Winterspring: "snow",
  Silithus: "desert",
  Undercity: "city",
  "Stormwind City": "city",
  Ironforge: "city",
  Orgrimmar: "city",
  "Thunder Bluff": "city",
  Darnassus: "city",
  Riverglades: "swamp",
  "Shen'dralas": "forest",
};

const DEFAULT_BIOME: BiomeKey = "forest";

export function getBiome(zoneName: string): Biome {
  return BIOMES[ZONE_BIOME[zoneName] ?? DEFAULT_BIOME];
}

/** A single flat CSS color for contexts (e.g. Leaflet layer styling) that can't render a gradient. */
export function biomeSolidColor(biome: Biome): string {
  return biome.gradient.match(/#[0-9a-f]{6}/i)?.[0] ?? "#333333";
}
