import { describe, expect, it } from "vitest";
import {
  BURNING_STEPPES_TRANSFORM,
  adtTileToWorldBounds,
  uiFractionToWorld,
  uiPercentToWorld,
  worldToAdtTile,
  worldToUiFraction,
  worldToUiPercent,
  type WorldPoint,
} from "../src/coordinates.js";

/**
 * Confirmed real Phase 1 data points: Burning Steppes' two flight masters,
 * pulled live from wago.tools' TaxiNodes table (build 1.60.1.69913), and
 * independently cross-validated in Phase 2 against AllTheThings' own
 * `fp()` records for the *same* entities (matched by TaxiNodes.ID / ATT's
 * `fp` argument: both 70 and 71) fetched live from
 * ATTWoWAddon/AllTheThings' zzOLD Burning Steppes.lua. ATT's coord values
 * are rounded to 1 decimal in the source; these expected values allow for that.
 */
const FLAME_CREST_WORLD: WorldPoint = { x: -7504.03, y: -2187.54, z: 165.53 };
const FLAME_CREST_ATT_PERCENT = { x: 65.6, y: 24.2 }; // fp(70), ATT's Burning Steppes.lua

const MORGANS_VIGIL_WORLD: WorldPoint = { x: -8364.61, y: -2738.35, z: 185.46 };
const MORGANS_VIGIL_ATT_PERCENT = { x: 84.4, y: 68.2 }; // fp(71), ATT's Burning Steppes.lua

describe("worldToUiFraction / worldToUiPercent", () => {
  it("matches AllTheThings' independently-sourced percentage for Flame Crest (fp 70)", () => {
    const pct = worldToUiPercent(FLAME_CREST_WORLD, BURNING_STEPPES_TRANSFORM);
    expect(pct.x).toBeCloseTo(FLAME_CREST_ATT_PERCENT.x, 0);
    expect(pct.y).toBeCloseTo(FLAME_CREST_ATT_PERCENT.y, 0);
  });

  it("matches AllTheThings' independently-sourced percentage for Morgan's Vigil (fp 71)", () => {
    const pct = worldToUiPercent(MORGANS_VIGIL_WORLD, BURNING_STEPPES_TRANSFORM);
    expect(pct.x).toBeCloseTo(MORGANS_VIGIL_ATT_PERCENT.x, 0);
    expect(pct.y).toBeCloseTo(MORGANS_VIGIL_ATT_PERCENT.y, 0);
  });

  it("throws on a zero-width span rather than dividing by zero silently", () => {
    const degenerate = { ...BURNING_STEPPES_TRANSFORM, regionMaxX: BURNING_STEPPES_TRANSFORM.regionMinX };
    expect(() => worldToUiFraction(FLAME_CREST_WORLD, degenerate)).toThrow();
  });
});

describe("uiFractionToWorld / uiPercentToWorld — exact round trip", () => {
  it("recovers the original world point from its own UI fraction", () => {
    const frac = worldToUiFraction(FLAME_CREST_WORLD, BURNING_STEPPES_TRANSFORM);
    const roundTripped = uiFractionToWorld(frac, BURNING_STEPPES_TRANSFORM);
    expect(roundTripped.x).toBeCloseTo(FLAME_CREST_WORLD.x, 6);
    expect(roundTripped.y).toBeCloseTo(FLAME_CREST_WORLD.y, 6);
  });

  it("recovers the original world point from its own UI percentage", () => {
    const pct = worldToUiPercent(FLAME_CREST_WORLD, BURNING_STEPPES_TRANSFORM);
    const roundTripped = uiPercentToWorld(pct, BURNING_STEPPES_TRANSFORM);
    expect(roundTripped.x).toBeCloseTo(FLAME_CREST_WORLD.x, 6);
    expect(roundTripped.y).toBeCloseTo(FLAME_CREST_WORLD.y, 6);
  });
});

describe("worldToAdtTile", () => {
  it("places Flame Crest in the expected ADT tile (col=36, row=46)", () => {
    const tile = worldToAdtTile(FLAME_CREST_WORLD);
    expect(tile).toEqual({ col: 36, row: 46 });
  });

  it("is one-directional: adtTileToWorldBounds recovers the tile's bounding box, not the exact point", () => {
    const tile = worldToAdtTile(FLAME_CREST_WORLD);
    const bounds = adtTileToWorldBounds(tile);
    expect(FLAME_CREST_WORLD.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(FLAME_CREST_WORLD.x).toBeLessThanOrEqual(bounds.maxX);
    expect(FLAME_CREST_WORLD.y).toBeGreaterThanOrEqual(bounds.minY);
    expect(FLAME_CREST_WORLD.y).toBeLessThanOrEqual(bounds.maxY);
    // The bounds are the tile rectangle (533.33 yards wide), not the point itself.
    expect(bounds.maxX - bounds.minX).toBeCloseTo(533.3333, 3);
    expect(bounds.maxY - bounds.minY).toBeCloseTo(533.3333, 3);
  });
});
