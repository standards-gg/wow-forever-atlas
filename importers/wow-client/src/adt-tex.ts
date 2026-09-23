import { ByteReader } from "./casc/byte-reader.js";

/**
 * Parses a "tex0" split ADT file — the real ground-texture layer data the
 * game actually draws (grass/dirt/rock blended together), a fundamentally
 * richer source than the WDT's minimap tile (wdt.ts), which is a small,
 * abstracted icon meant only for the in-game minimap UI. Binary layout is
 * long-established public reverse-engineering documentation (mirrored
 * across many independent hobbyist wikis for over a decade, the same
 * category of interoperability information already relied on for this
 * project's BLP/BLTE/WDT parsers), not proprietary or creative content.
 *
 * A tex0 ADT's MCNK sub-chunk has NO positional header (unlike the root
 * ADT's MCNK) — confirmed empirically (src/mcnk-probe.ts): the chunk's
 * first bytes are already a nested MCLY tag. Each of the 256 MCNK entries
 * (16x16 grid) carries 1-4 texture layers; layer 0 is the base (full
 * coverage, no alpha), layers 1-3 blend in via an MCAL alpha map.
 */

export interface AdtLayer {
  textureIndex: number;
  /** Bit 0x200: this layer's MCAL alpha map is RLE-compressed. */
  compressed: boolean;
  hasAlpha: boolean;
  alphaOffset: number;
}

export interface AdtChunkTex {
  layers: AdtLayer[];
  /** Raw MCAL bytes for this chunk (all layers' alpha maps concatenated); undefined if no layers have alpha. */
  alphaData?: Buffer;
}

export interface AdtTex {
  /** Real ground texture FileDataIDs (BLP), indexed by AdtLayer.textureIndex. */
  textureFileDataIds: number[];
  /** 256 entries, row-major 16x16 (chunk (cx,cy) -> index cy*16+cx). */
  chunks: AdtChunkTex[];
}

const ALPHA_COMPRESSED_FLAG = 0x200;
const ALPHA_PRESENT_FLAG = 0x100;

export function parseAdtTex(data: Buffer): AdtTex {
  const reader = new ByteReader(data);
  let textureFileDataIds: number[] = [];
  const chunks: AdtChunkTex[] = [];

  while (reader.remainingBytes >= 8) {
    const tag = reader.readFourCC();
    const size = reader.readUInt32LE();
    const chunkStart = reader.offset;
    const chunkEnd = chunkStart + size;

    if (tag === "MDID") {
      const count = Math.floor(size / 4);
      textureFileDataIds = Array.from({ length: count }, (_, i) => data.readUInt32LE(chunkStart + i * 4));
    } else if (tag === "MCNK") {
      const sub = new ByteReader(data.subarray(chunkStart, chunkEnd));
      const layers: AdtLayer[] = [];
      let alphaData: Buffer | undefined;
      while (sub.remainingBytes >= 8) {
        const subTag = sub.readFourCC();
        const subSize = sub.readUInt32LE();
        const subStart = sub.offset;
        if (subTag === "MCLY") {
          const entryCount = Math.floor(subSize / 16);
          for (let i = 0; i < entryCount; i++) {
            const base = chunkStart + subStart + i * 16;
            const textureIndex = data.readUInt32LE(base);
            const flags = data.readUInt32LE(base + 4);
            const alphaOffset = data.readUInt32LE(base + 8);
            layers.push({
              textureIndex,
              compressed: (flags & ALPHA_COMPRESSED_FLAG) !== 0,
              hasAlpha: (flags & ALPHA_PRESENT_FLAG) !== 0,
              alphaOffset,
            });
          }
        } else if (subTag === "MCAL") {
          alphaData = data.subarray(chunkStart + subStart, chunkStart + subStart + subSize);
        }
        sub.seek(subStart + subSize);
      }
      chunks.push({ layers, alphaData });
      reader.seek(chunkEnd);
      continue;
    }

    reader.seek(chunkEnd);
  }

  return { textureFileDataIds, chunks };
}

/**
 * Decodes one layer's alpha map to a flat 64x64 (4096-byte) coverage mask.
 * Uncompressed maps are already exactly this shape (4-bit packed variant
 * not handled — not observed on this client/build; falls back to 0).
 * Compressed maps use a simple run-length scheme: a control byte's top bit
 * selects fill (repeat the next single byte N times) vs literal (copy the
 * next N bytes as-is), N = the remaining 7 bits.
 */
export function decodeMcalLayer(alphaData: Buffer, offset: number, compressed: boolean): Uint8Array {
  const out = new Uint8Array(64 * 64);
  if (!compressed) {
    const available = Math.min(4096, alphaData.length - offset);
    if (available > 0) alphaData.copy(Buffer.from(out.buffer), 0, offset, offset + available);
    return out;
  }

  let inPos = offset;
  let outPos = 0;
  while (outPos < 4096 && inPos < alphaData.length) {
    const control = alphaData[inPos++];
    const count = control & 0x7f;
    const fill = (control & 0x80) !== 0;
    if (fill) {
      const value = alphaData[inPos++] ?? 0;
      for (let i = 0; i < count && outPos < 4096; i++) out[outPos++] = value;
    } else {
      for (let i = 0; i < count && outPos < 4096 && inPos < alphaData.length; i++) out[outPos++] = alphaData[inPos++];
    }
  }
  return out;
}
