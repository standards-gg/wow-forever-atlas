import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWorldGeography } from "../src/zones.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const areaTableCsv = readFileSync(fixturesDir + "AreaTable.csv", "utf-8");
const uiMapAssignmentCsv = readFileSync(fixturesDir + "UiMapAssignment.csv", "utf-8");
const mapCsv = readFileSync(fixturesDir + "Map.csv", "utf-8");

describe("buildWorldGeography — real wago.tools DB2 data (build 1.60.1.69913)", () => {
  const world = buildWorldGeography(areaTableCsv, uiMapAssignmentCsv, mapCsv, "1.60.1.69913");

  it("finds both continents with real, distinct world bounds", () => {
    expect(world.continents).toHaveLength(2);
    const ek = world.continents.find((c) => c.name === "Eastern Kingdoms")!;
    const kalimdor = world.continents.find((c) => c.name === "Kalimdor")!;
    expect(ek.uiMapId).toBe(1415);
    expect(kalimdor.uiMapId).toBe(1414);
    expect(ek.worldBounds.minX).toBeLessThan(ek.worldBounds.maxX);
    expect(kalimdor.worldBounds.minX).toBeLessThan(kalimdor.worldBounds.maxX);
  });

  it("includes each continent's real WdtFileDataID from Map.db2, for terrain-tile extraction", () => {
    const ek = world.continents.find((c) => c.name === "Eastern Kingdoms")!;
    const kalimdor = world.continents.find((c) => c.name === "Kalimdor")!;
    expect(ek.wdtFileDataId).toBe(775971);
    expect(kalimdor.wdtFileDataId).toBe(782779);
  });

  it("places Kalimdor to the west of Eastern Kingdoms on the shared Azeroth world map (real Blizzard layout)", () => {
    const ek = world.continents.find((c) => c.name === "Eastern Kingdoms")!;
    const kalimdor = world.continents.find((c) => c.name === "Kalimdor")!;
    // Confirmed real values: Kalimdor's UiMin_0 (~0.04) is well left of Eastern
    // Kingdoms' UiMin_0 (~0.55) within the shared 947 "Azeroth" map.
    expect(kalimdor.worldMapPlacement.uiMinX).toBeLessThan(ek.worldMapPlacement.uiMinX);
  });

  it("finds the confirmed real 49 outdoor zones/cities across both continents", () => {
    expect(world.zones).toHaveLength(49);
  });

  it("includes Burning Steppes and Searing Gorge with their confirmed real bounds", () => {
    const burningSteppes = world.zones.find((z) => z.areaId === 46)!;
    expect(burningSteppes).toBeDefined();
    expect(burningSteppes.uiMapId).toBe(1428);
    expect(burningSteppes.continentMapId).toBe(0);
    expect(burningSteppes.worldBounds).toEqual({
      minX: -8983.3330078125,
      minY: -3195.8332519531,
      maxX: -7031.2495117188,
      maxY: -266.66665649414,
    });

    const searingGorge = world.zones.find((z) => z.areaId === 51)!;
    expect(searingGorge.uiMapId).toBe(1427);
  });

  it("includes capital cities placed on the outdoor map, and excludes dungeon-interior AreaIDs", () => {
    const stormwind = world.zones.find((z) => z.name === "Stormwind City");
    expect(stormwind).toBeDefined();
    // Blackrock Depths/Spire have AreaTable rows but no outdoor world-map
    // placement (confirmed: they're separate instance Maps) — must be excluded.
    expect(world.zones.some((z) => z.name === "Blackrock Depths")).toBe(false);
    expect(world.zones.some((z) => z.name === "Blackrock Spire")).toBe(false);
  });

  it("includes the two new Forever-original outdoor zones ATT's active tree also confirmed", () => {
    // Cross-check against docs/RECOMMENDED_DATA_SOURCES.md / the ATT importer's
    // own confirmed active zone list (Riverglades is a real, currently-maintained
    // Eastern Kingdoms zone file in ATT's Forever tree).
    expect(world.zones.some((z) => z.name === "Riverglades")).toBe(true);
  });
});
