#!/usr/bin/env node
/**
 * Importer CLI: fetches AllTheThings' Burning Steppes + Searing Gorge zone
 * files (live from GitHub by default, falling back to the local fixtures/
 * snapshot if offline), normalizes them into canonical entities, and writes
 * a combined JSON dataset.
 *
 * There is no live Postgres in this dev environment (see
 * docs/INGESTION_ARCHITECTURE.md) — this writes to a JSON file instead of
 * calling a DB layer, both as a real, inspectable artifact of the vertical
 * slice and as the data source the web app's dev build reads from. A real
 * deployment would insert into Postgres here instead; the normalize.ts
 * logic this calls is unaffected either way (Fetch/Normalize are already
 * decoupled from Store, per the pipeline design in
 * docs/INGESTION_ARCHITECTURE.md).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLatestCommitSha, fetchRawFile, ZONE_FILE_PATHS } from "./fetch.js";
import { NormalizeSession, normalizeZoneFile, type NormalizeResult } from "./normalize.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");
const outputPath = join(here, "..", "..", "..", "apps", "web", "public", "data", "burning-steppes.json");

async function loadZoneSource(key: keyof typeof ZONE_FILE_PATHS, fixtureFile: string): Promise<string> {
  try {
    console.error(`Fetching live: ${ZONE_FILE_PATHS[key]}`);
    return await fetchRawFile(ZONE_FILE_PATHS[key]);
  } catch (err) {
    console.error(`Live fetch failed (${(err as Error).message}); falling back to local fixture ${fixtureFile}`);
    return readFileSync(join(fixturesDir, fixtureFile), "utf-8");
  }
}

function mergeResults(a: NormalizeResult, b: NormalizeResult): NormalizeResult {
  return {
    continents: [...a.continents, ...b.continents],
    zones: [...a.zones, ...b.zones],
    quests: [...a.quests, ...b.quests],
    flightPaths: [...a.flightPaths, ...b.flightPaths],
    npcs: [...a.npcs, ...b.npcs],
    npcSpawns: [...a.npcSpawns, ...b.npcSpawns],
    locations: [...a.locations, ...b.locations],
    warnings: [...a.warnings, ...b.warnings],
  };
}

async function main() {
  let sourceVersion: string;
  try {
    sourceVersion = await fetchLatestCommitSha();
  } catch {
    sourceVersion = "unknown (offline fallback — see fixtures/ snapshot date)";
  }

  const burningSteppesSource = await loadZoneSource("burningSteppes", "burning-steppes.lua");
  const searingGorgeSource = await loadZoneSource("searingGorge", "searing-gorge.lua");

  // Shared across both files so atlas IDs never collide, and so a zone or
  // NPC referenced from both files (e.g. Blackrock Mountain straddles both
  // Burning Steppes and Searing Gorge) resolves to one canonical record.
  const session = new NormalizeSession();

  const burningSteppes = normalizeZoneFile(burningSteppesSource, {
    source: "att",
    sourceUrl: `https://github.com/ATTWoWAddon/AllTheThings/blob/master/${ZONE_FILE_PATHS.burningSteppes}`,
    sourceVersion,
    session,
  });
  const searingGorge = normalizeZoneFile(searingGorgeSource, {
    source: "att",
    sourceUrl: `https://github.com/ATTWoWAddon/AllTheThings/blob/master/${ZONE_FILE_PATHS.searingGorge}`,
    sourceVersion,
    session,
  });

  const merged = mergeResults(burningSteppes, searingGorge);

  console.error(
    `Normalized: ${merged.continents.length} continents, ${merged.zones.length} zones, ${merged.quests.length} quests, ${merged.flightPaths.length} flight paths, ${merged.npcs.length} NPCs, ${merged.npcSpawns.length} NPC spawns, ${merged.locations.length} locations, ${merged.warnings.length} warnings.`
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceVersion,
        zoneFilesImported: ["Burning Steppes", "Searing Gorge"],
        ...merged,
      },
      null,
      2
    )
  );
  console.error(`Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
