import { ByteReader } from "./casc/byte-reader.js";

/**
 * Minimal WDT (World Data Table) chunk parser. WDT files use WoW's common
 * chunked format: a 4-byte reversed FourCC + 4-byte LE size, repeated.
 * We only care about `MAID` — the modern (post-Legion, FileDataID-based)
 * chunk that lists, per potential 64x64 map tile, the FileDataIDs of that
 * tile's various assets. Forever's client is confirmed modern-engine
 * (docs/PROJECT_RECON.md), so MAID is expected to be present.
 *
 * MAID layout, empirically confirmed against this project's real local
 * install (build 1.60.1.69913): one fixed-size 8-field record per tile
 * index (row-major, 64x64 = 4096 possible tiles), each field a uint32
 * FileDataID. A tile with no data is all zeros. Verified real record for
 * a Burning Steppes tile (col=34, row=46): fields 0-4 are ADT-family
 * files (each starting with an "MVER" chunk); fields 5-7 are all real
 * BLP2 textures. Field 5 is the largest (175,948 bytes) and matches
 * public documentation's "mapTexture" (the primary minimap tile) — fields
 * 6/7 are smaller companion textures (likely a normal/light map and a
 * legacy-compatible alternate), not used here.
 */

const MAID_TAG = "MAID";
const RECORD_FIELD_COUNT = 8;
const TEX0_ADT_FIELD_INDEX = 3;
const MINIMAP_FIELD_INDEX = 5;

export interface WdtMaid {
  /** tileIndex = row * 64 + col */
  minimapFileDataIdByTile: Map<number, number>;
  /** tileIndex = row * 64 + col. The tile's real ground-texture-layer ADT (see adt-tex.ts). */
  tex0AdtFileDataIdByTile: Map<number, number>;
}

export function parseWdtMaid(data: Buffer): WdtMaid {
  const reader = new ByteReader(data);
  const minimapFileDataIdByTile = new Map<number, number>();
  const tex0AdtFileDataIdByTile = new Map<number, number>();

  while (reader.remainingBytes >= 8) {
    const tag = reader.readFourCC();
    const size = reader.readUInt32LE();
    const chunkEnd = reader.offset + size;

    if (tag === MAID_TAG) {
      const recordSize = RECORD_FIELD_COUNT * 4;
      const numRecords = Math.floor(size / recordSize);
      for (let tileIndex = 0; tileIndex < numRecords; tileIndex++) {
        const recordStart = reader.offset + tileIndex * recordSize;
        const minimapId = data.readUInt32LE(recordStart + MINIMAP_FIELD_INDEX * 4);
        if (minimapId !== 0) minimapFileDataIdByTile.set(tileIndex, minimapId);
        const tex0Id = data.readUInt32LE(recordStart + TEX0_ADT_FIELD_INDEX * 4);
        if (tex0Id !== 0) tex0AdtFileDataIdByTile.set(tileIndex, tex0Id);
      }
    }

    reader.seek(chunkEnd);
  }

  return { minimapFileDataIdByTile, tex0AdtFileDataIdByTile };
}

export function tileIndex(col: number, row: number): number {
  return row * 64 + col;
}
