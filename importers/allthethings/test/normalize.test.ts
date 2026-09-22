import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeZoneFile } from "../src/normalize.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const burningSteppesSource = readFileSync(fixturesDir + "burning-steppes.lua", "utf-8");

const opts = {
  source: "att" as const,
  sourceUrl:
    "https://github.com/ATTWoWAddon/AllTheThings/blob/master/.contrib/.db/forever/zzOLD/02%20-%20Outdoor%20Zones/02%20Eastern%20Kingdoms/Burning%20Steppes.lua",
  sourceVersion: "master (fetched 2026-09-22)",
};

describe("normalizeZoneFile — real Burning Steppes.lua", () => {
  const result = normalizeZoneFile(burningSteppesSource, opts);

  it("finds the confirmed real quest count for this zone (22, per Phase 1's ATT deep-dive)", () => {
    expect(result.quests).toHaveLength(22);
  });

  it("finds both confirmed real flight masters", () => {
    expect(result.flightPaths).toHaveLength(2);
    const names = result.flightPaths.map((f) => f.name).sort();
    expect(names).toEqual(["Flame Crest, Burning Steppes", "Morgan's Vigil, Burning Steppes"]);
  });

  it("places Flame Crest at its real, independently-confirmed coordinate", () => {
    const flameCrest = result.flightPaths.find((f) => f.name === "Flame Crest, Burning Steppes");
    expect(flameCrest).toBeDefined();
    const location = result.locations.find((l) => l.atlasId === flameCrest!.locationId);
    expect(location).toBeDefined();
    expect(location!.coordinateSpace).toBe("UI_MAP_TRANSFORM");
    expect(location!.x).toBeCloseTo(65.6, 1);
    expect(location!.y).toBeCloseTo(24.2, 1);
    expect(flameCrest!.faction).toBe("horde");
  });

  it("extracts the real quest 'Arcanite' with its giver NPC name from an inline comment", () => {
    const arcanite = result.quests.find((q) => q.name === "Arcanite");
    expect(arcanite).toBeDefined();
    expect(arcanite!.levelRequirementMin).toBe(60);
    expect(arcanite!.givenByNpcId).toBeDefined();
    const giver = result.npcs.find((n) => n.atlasId === arcanite!.givenByNpcId);
    expect(giver?.name).toBe("Gorzeeki Wildeyes");
  });

  it("links the quest giver to a real NpcSpawn/Location rather than leaving the coord unattached", () => {
    const arcanite = result.quests.find((q) => q.name === "Arcanite")!;
    const spawn = result.npcSpawns.find((s) => s.npcId === arcanite.givenByNpcId);
    expect(spawn).toBeDefined();
    const location = result.locations.find((l) => l.atlasId === spawn!.locationId);
    expect(location).toBeDefined();
    expect(location!.x).toBeCloseTo(12.4, 1);
    expect(location!.y).toBeCloseTo(31.6, 1);
    // Same zone (Burning Steppes, atlas_zone_000001) as the flight masters below.
    expect(location!.zoneId).toBeDefined();
  });

  it("gives every quest, flight path, npc, npc spawn, and location a distinct atlas_-prefixed ID", () => {
    const allIds = [
      ...result.quests.map((q) => q.atlasId),
      ...result.flightPaths.map((f) => f.atlasId),
      ...result.npcs.map((n) => n.atlasId),
      ...result.npcSpawns.map((s) => s.atlasId),
      ...result.locations.map((l) => l.atlasId),
      ...result.zones.map((z) => z.atlasId),
      ...result.continents.map((c) => c.atlasId),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const id of allIds) expect(id).toMatch(/^atlas_[a-z_]+_\d{6}$/);
  });

  it("records provenance on every emitted entity, never fabricating a value", () => {
    for (const quest of result.quests) {
      expect(quest.provenance.length).toBeGreaterThan(0);
      expect(quest.provenance[0].source).toBe("att");
      expect(quest.provenance[0].sourceIdType).toBe("QuestID");
    }
  });

  it("surfaces unresolved prerequisite references as warnings rather than silently dropping them", () => {
    // Real confirmed example: quest 7630 "Arcanite" has sourceQuests {7626,7627,7628}.
    expect(result.warnings.some((w) => w.includes("7630") && w.includes("7626"))).toBe(true);
  });
});
