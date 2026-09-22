import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng } from "../src/png.js";

describe("encodePng", () => {
  it("produces a valid PNG signature, IHDR, and round-trippable pixel data", () => {
    const width = 2;
    const height = 2;
    // Red, green, blue, white — 2x2 RGBA.
    const rgba = Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const png = encodePng(width, height, rgba);

    // PNG signature.
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    // IHDR chunk: length(4) + "IHDR"(4) + width(4) + height(4) + ...
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // color type RGBA

    // Locate and inflate the IDAT chunk, confirm it decompresses back to
    // the original pixel data (each scanline prefixed with a filter-type byte).
    const idatLengthOffset = 8 + (8 + 13 + 4); // signature + IHDR chunk
    const idatLength = png.readUInt32BE(idatLengthOffset);
    const idatDataStart = idatLengthOffset + 8;
    const idatData = png.subarray(idatDataStart, idatDataStart + idatLength);
    const raw = inflateSync(idatData);

    const stride = width * 4;
    for (let y = 0; y < height; y++) {
      expect(raw[y * (stride + 1)]).toBe(0); // "None" filter byte
      const scanline = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
      expect(scanline).toEqual(rgba.subarray(y * stride, y * stride + stride));
    }
  });
});
