import { describe, expect, it } from "vitest";
import { decodeBlp } from "../src/blp.js";

/**
 * Hand-builds a minimal, spec-correct BLP2 file for testing. Deliberately
 * synthetic (not a real Blizzard texture) — see importers/wow-client/README.md
 * for why real game art is never committed to this repo.
 */
function buildUncompressedBlp(width: number, height: number, paletteIndex: Buffer, palette: [number, number, number, number][]): Buffer {
  const headerSize = 4 + 4 + 1 + 1 + 1 + 1 + 4 + 4 + 16 * 4 + 16 * 4;
  const paletteSize = 256 * 4;
  const indexOffset = headerSize + paletteSize;
  const buf = Buffer.alloc(indexOffset + paletteIndex.length);

  let o = 0;
  buf.writeUInt32LE(0x32504c42, o); o += 4; // "BLP2"
  buf.writeUInt32LE(1, o); o += 4; // type
  buf[o++] = 1; // encoding: uncompressed/paletted
  buf[o++] = 0; // alphaDepth: none
  buf[o++] = 0; // alphaEncoding
  buf[o++] = 0; // containsMipmaps
  buf.writeUInt32LE(width, o); o += 4;
  buf.writeUInt32LE(height, o); o += 4;

  buf.writeUInt32LE(indexOffset, o); o += 4; // mapOffsets[0]
  o += 15 * 4; // mapOffsets[1..15] left as 0
  buf.writeUInt32LE(paletteIndex.length, o); o += 4; // mapSizes[0]
  o += 15 * 4; // mapSizes[1..15] left as 0

  // Palette is stored on-disk as B,G,R,A per entry.
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = palette[i] ?? [0, 0, 0, 0];
    buf[o++] = b;
    buf[o++] = g;
    buf[o++] = r;
    buf[o++] = a;
  }

  paletteIndex.copy(buf, indexOffset);
  return buf;
}

describe("decodeBlp — uncompressed/paletted (mode 1)", () => {
  it("decodes a 2x2 solid-green image via its palette", () => {
    const palette: [number, number, number, number][] = new Array(256).fill([0, 0, 0, 0]);
    palette[5] = [0, 255, 0, 255]; // green
    const blp = buildUncompressedBlp(2, 2, Buffer.from([5, 5, 5, 5]), palette);

    const decoded = decodeBlp(blp);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    for (let i = 0; i < 4; i++) {
      expect([...decoded.rgba.subarray(i * 4, i * 4 + 4)]).toEqual([0, 255, 0, 255]);
    }
  });

  it("rejects a non-BLP2 buffer", () => {
    expect(() => decodeBlp(Buffer.alloc(16))).toThrow(/bad magic/);
  });
});
