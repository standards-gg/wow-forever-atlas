import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { ByteReader } from "./byte-reader.js";

/**
 * BLTE decompression — the block-based compression wrapper every CASC
 * file is stored in. Ported from wow.export's `blte-reader.js` (MIT
 * licensed; see importers/wow-client/README.md for full attribution),
 * simplified for our narrow use case: this project only extracts minimap
 * textures, which are never Salsa20-encrypted in practice, so encrypted
 * blocks throw a clear error here rather than porting the encryption path.
 */

const BLTE_MAGIC = 0x45544c42; // "BLTE" (LE)

interface BlockInfo {
  compSize: number;
  decompSize: number;
  hash: string;
  fileOffset: number;
}

function md5hex(buf: Buffer): string {
  return createHash("md5").update(buf).digest("hex");
}

export function decodeBlte(raw: Buffer): Buffer {
  const reader = new ByteReader(raw);
  const magic = reader.readUInt32LE();
  if (magic !== BLTE_MAGIC) throw new Error(`Not a BLTE file (bad magic 0x${magic.toString(16)})`);

  const headerSize = reader.readInt32BE();
  let numBlocks = 1;
  let dataStart = 8;
  const blocks: BlockInfo[] = [];

  if (headerSize > 0) {
    const flag = reader.readUInt8();
    const b1 = reader.readUInt8();
    const b2 = reader.readUInt8();
    const b3 = reader.readUInt8();
    numBlocks = (b1 << 16) | (b2 << 8) | b3;
    if (flag !== 0x0f || numBlocks === 0) throw new Error("BLTE: invalid block table flag");

    const frameHeaderSize = 24 * numBlocks + 12;
    if (headerSize !== frameHeaderSize) throw new Error("BLTE: unexpected header size");
    dataStart = headerSize;

    let fileOffset = 0;
    for (let i = 0; i < numBlocks; i++) {
      const compSize = reader.readInt32BE();
      const decompSize = reader.readInt32BE();
      const hash = reader.readHexString(16);
      blocks.push({ compSize, decompSize, hash, fileOffset });
      fileOffset += compSize;
    }
  } else {
    blocks.push({ compSize: raw.byteLength - 8, decompSize: raw.byteLength - 9, hash: "", fileOffset: 0 });
  }

  const totalDecompSize = blocks.reduce((sum, b) => sum + b.decompSize, 0);
  const out = Buffer.alloc(totalDecompSize);
  let outPos = 0;

  let blockStart = dataStart;
  for (const block of blocks) {
    const blockBuf = raw.subarray(blockStart, blockStart + block.compSize);
    if (block.hash && md5hex(blockBuf) !== block.hash) {
      throw new Error(`BLTE: block hash mismatch (expected ${block.hash})`);
    }

    const flag = blockBuf[0];
    const payload = blockBuf.subarray(1);
    let decoded: Buffer;
    switch (flag) {
      case 0x4e: // 'N' — stored, no compression
        decoded = Buffer.from(payload);
        break;
      case 0x5a: // 'Z' — zlib
        decoded = inflateSync(payload);
        break;
      case 0x45: // 'E' — encrypted
        throw new Error("BLTE: encrypted blocks are not supported by this extractor (unexpected for minimap textures)");
      case 0x46: // 'F' — recursive frame, vanishingly rare, not implemented by wow.export either
        throw new Error("BLTE: recursive frame blocks are not supported");
      default:
        throw new Error(`BLTE: unknown block flag 0x${flag.toString(16)}`);
    }

    decoded.copy(out, outPos);
    outPos += decoded.byteLength;
    blockStart += block.compSize;
  }

  return out;
}
