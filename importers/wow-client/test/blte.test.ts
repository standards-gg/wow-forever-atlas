import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeBlte } from "../src/casc/blte.js";

function md5(buf: Buffer): Buffer {
  return createHash("md5").update(buf).digest();
}

/** Hand-builds a real, spec-correct multi-block BLTE buffer for testing. */
function buildSyntheticBlte(blocks: { flag: "N" | "Z"; payload: Buffer }[]): Buffer {
  const blockBufs = blocks.map((b) => {
    const compressedPayload = b.flag === "Z" ? deflateSync(b.payload) : b.payload;
    return Buffer.concat([Buffer.from([b.flag === "N" ? 0x4e : 0x5a]), compressedPayload]);
  });

  const numBlocks = blockBufs.length;
  const headerSize = 24 * numBlocks + 12;

  const header = Buffer.alloc(headerSize);
  header.writeUInt32LE(0x45544c42, 0); // "BLTE"
  header.writeInt32BE(headerSize, 4);
  header[8] = 0x0f;
  header[9] = (numBlocks >> 16) & 0xff;
  header[10] = (numBlocks >> 8) & 0xff;
  header[11] = numBlocks & 0xff;

  let offset = 12;
  for (let i = 0; i < numBlocks; i++) {
    const blockBuf = blockBufs[i];
    header.writeInt32BE(blockBuf.length, offset);
    header.writeInt32BE(blocks[i].payload.length, offset + 4);
    md5(blockBuf).copy(header, offset + 8);
    offset += 24;
  }

  return Buffer.concat([header, ...blockBufs]);
}

describe("decodeBlte", () => {
  it("decodes a multi-block file mixing stored and zlib-compressed blocks", () => {
    const part1 = Buffer.from("Hello, ", "utf-8");
    const part2 = Buffer.from("world!", "utf-8");
    const blte = buildSyntheticBlte([
      { flag: "N", payload: part1 },
      { flag: "Z", payload: part2 },
    ]);

    const decoded = decodeBlte(blte);
    expect(decoded.toString("utf-8")).toBe("Hello, world!");
  });

  it("rejects a non-BLTE buffer", () => {
    expect(() => decodeBlte(Buffer.from("not blte"))).toThrow(/bad magic/);
  });

  it("detects a corrupted block (hash mismatch)", () => {
    const blte = buildSyntheticBlte([{ flag: "N", payload: Buffer.from("original") }]);
    // Corrupt one byte of the block payload without updating its stored hash.
    blte[blte.length - 1] ^= 0xff;
    expect(() => decodeBlte(blte)).toThrow(/hash mismatch/);
  });
});
