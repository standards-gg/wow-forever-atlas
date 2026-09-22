import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng } from "../src/png.js";

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Reverses PNG's per-scanline filtering (whichever adaptive type the encoder picked) back to raw pixels. */
function unfilter(raw: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const dst = out.subarray(y * stride, y * stride + stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? dst[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = src[i];
          break;
        case 1:
          value = src[i] + a;
          break;
        case 2:
          value = src[i] + b;
          break;
        case 3:
          value = src[i] + ((a + b) >> 1);
          break;
        case 4:
          value = src[i] + paethPredictor(a, b, c);
          break;
        default:
          throw new Error(`unknown PNG filter type ${filterType}`);
      }
      dst[i] = value & 0xff;
    }
  }
  return out;
}

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

    // Locate and inflate the IDAT chunk, then reverse whichever adaptive
    // per-scanline filter the encoder chose, and confirm the pixels match.
    const idatLengthOffset = 8 + (8 + 13 + 4); // signature + IHDR chunk
    const idatLength = png.readUInt32BE(idatLengthOffset);
    const idatDataStart = idatLengthOffset + 8;
    const idatData = png.subarray(idatDataStart, idatDataStart + idatLength);
    const raw = inflateSync(idatData);

    const reconstructed = unfilter(raw, width, height, 4);
    expect(reconstructed).toEqual(rgba);
  });
});
