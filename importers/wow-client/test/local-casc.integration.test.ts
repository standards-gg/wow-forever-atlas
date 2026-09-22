import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalCasc } from "../src/casc/local-casc.js";
import { parseWdtMaid } from "../src/wdt.js";
import { decodeBlp } from "../src/blp.js";

/**
 * Real end-to-end test against an actual local WoW: Forever install. This
 * is intentionally NOT a fixture-based test — see importers/wow-client/README.md
 * for why real client data (and its derived images) are never committed to
 * this repo. On a machine without the install (e.g. CI), these tests are
 * skipped rather than failed, so the rest of the suite stays green.
 */
const INSTALL_DIR = process.env.WOW_INSTALL_DIR ?? "C:\\Program Files (x86)\\World of Warcraft";
const PRODUCT = "wow_classic_beta";
const EASTERN_KINGDOMS_WDT_FILEDATAID = 775971;

const installAvailable = existsSync(join(INSTALL_DIR, ".build.info"));

describe.skipIf(!installAvailable)("LocalCasc — real install integration", () => {
  it("opens local storage and reads the Eastern Kingdoms WDT by FileDataID", async () => {
    const casc = await LocalCasc.open(INSTALL_DIR, PRODUCT);
    const wdt = casc.getFileByFileDataId(EASTERN_KINGDOMS_WDT_FILEDATAID);
    expect(wdt.subarray(0, 4).toString("ascii")).toBe("REVM"); // "MVER" reversed, first WDT chunk
  });

  it("parses the MAID chunk and resolves a real minimap tile to a valid BLP2 image", async () => {
    const casc = await LocalCasc.open(INSTALL_DIR, PRODUCT);
    const wdt = casc.getFileByFileDataId(EASTERN_KINGDOMS_WDT_FILEDATAID);
    const { minimapFileDataIdByTile } = parseWdtMaid(wdt);

    // Confirmed real, populated tile (Burning Steppes, col=34 row=46).
    const minimapId = minimapFileDataIdByTile.get(46 * 64 + 34);
    expect(minimapId).toBeTypeOf("number");

    const blp = casc.getFileByFileDataId(minimapId!);
    const decoded = decodeBlp(blp);
    expect(decoded.width).toBeGreaterThan(0);
    expect(decoded.height).toBeGreaterThan(0);
    expect(decoded.rgba.length).toBe(decoded.width * decoded.height * 4);
  });
});

if (!installAvailable) {
  console.warn(
    `[local-casc.integration.test.ts] Skipped: no WoW: Forever install found at ${INSTALL_DIR}. ` +
      "Set WOW_INSTALL_DIR to test against a real install."
  );
}
