#!/usr/bin/env node
/**
 * Fetches AreaTable + UiMapAssignment from wago.tools for the current
 * wow_classic_beta build and writes real, Blizzard-sourced world/continent/
 * zone geography (bounding boxes, not artwork) to apps/web/public/data/world.json.
 *
 * This is licensing-cautious per docs/DATA_PROVENANCE.md — wago.tools'
 * redistribution terms are UNKNOWN/unconfirmed. This writes geometric
 * facts (zone boundaries, positions) for local development use, not a
 * public redistribution decision; revisit before shipping this file
 * publicly in a production build.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDb2Csv, fetchLatestBuild } from "./client.js";
import { buildWorldGeography } from "./zones.js";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, "..", "..", "..", "apps", "web", "public", "data", "world.json");

async function main() {
  const build = await fetchLatestBuild();
  console.error(`Fetching AreaTable + UiMapAssignment + Map @ build ${build}`);
  const [areaTableCsv, uiMapAssignmentCsv, mapCsv] = await Promise.all([
    fetchDb2Csv("AreaTable", build),
    fetchDb2Csv("UiMapAssignment", build),
    fetchDb2Csv("Map", build),
  ]);
  const world = buildWorldGeography(areaTableCsv, uiMapAssignmentCsv, mapCsv, build);
  console.error(`Built geography: ${world.continents.length} continents, ${world.zones.length} zones.`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(world, null, 2));
  console.error(`Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
