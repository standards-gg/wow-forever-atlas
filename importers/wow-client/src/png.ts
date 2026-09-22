import { deflateSync, constants as zlibConstants } from "node:zlib";

/**
 * A minimal, from-scratch PNG encoder — just enough to write an RGBA
 * buffer as a valid PNG (8-bit). No external dependency needed since
 * Node's built-in zlib does the actual compression; CRC32 is a small,
 * standard, public algorithm.
 *
 * Tries two whole-image strategies — "None" filtering on every scanline,
 * and adaptive per-scanline filtering (the standard "minimum sum of
 * absolute differences" heuristic) — and keeps whichever compresses
 * smaller. Measured on real extracted minimap textures, no single
 * strategy wins consistently: some zones (large flat/DXT-block-artifact
 * terrain) compress much better with no filtering since it preserves the
 * long identical-byte runs deflate's LZ77 stage matches well; others
 * compress better with adaptive filtering. Trying both and comparing
 * actual output size is the only way to not leave size on the table
 * either way — the heuristic alone is not a reliable predictor here.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function buildNoneFiltered(rgba: Buffer, width: number, height: number): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return raw;
}

/** Applies all 5 PNG filter types to one scanline and keeps whichever has the smallest sum-of-abs-differences (the standard heuristic). */
function filterScanline(cur: Buffer, prev: Buffer | null, bpp: number, stride: number, out: Buffer, outOffset: number): void {
  const candidates: Buffer[] = [];

  const none = Buffer.alloc(stride);
  cur.copy(none, 0, 0, stride);
  candidates.push(none);

  const sub = Buffer.alloc(stride);
  for (let i = 0; i < stride; i++) sub[i] = (cur[i] - (i >= bpp ? cur[i - bpp] : 0)) & 0xff;
  candidates.push(sub);

  const up = Buffer.alloc(stride);
  for (let i = 0; i < stride; i++) up[i] = (cur[i] - (prev ? prev[i] : 0)) & 0xff;
  candidates.push(up);

  const average = Buffer.alloc(stride);
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? cur[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    average[i] = (cur[i] - ((a + b) >> 1)) & 0xff;
  }
  candidates.push(average);

  const paeth = Buffer.alloc(stride);
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? cur[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= bpp ? prev[i - bpp] : 0;
    paeth[i] = (cur[i] - paethPredictor(a, b, c)) & 0xff;
  }
  candidates.push(paeth);

  let bestIdx = 0;
  let bestScore = Infinity;
  for (let f = 0; f < candidates.length; f++) {
    let score = 0;
    const buf = candidates[f];
    for (let i = 0; i < stride; i++) {
      const v = buf[i];
      score += v < 128 ? v : 256 - v;
    }
    if (score < bestScore) {
      bestScore = score;
      bestIdx = f;
    }
  }

  out[outOffset] = bestIdx;
  candidates[bestIdx].copy(out, outOffset + 1);
}

function buildAdaptiveFiltered(rgba: Buffer, width: number, height: number): Buffer {
  const bpp = 4;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let prevRow: Buffer | null = null;
  for (let y = 0; y < height; y++) {
    const row = rgba.subarray(y * stride, y * stride + stride);
    filterScanline(row, prevRow, bpp, stride, raw, y * (stride + 1));
    prevRow = row;
  }
  return raw;
}

function ihdrChunk(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method
  return ihdr;
}

/** Encodes an RGBA8888 pixel buffer (width*height*4 bytes) as a PNG file. */
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = ihdrChunk(width, height);

  const noneIdat = deflateSync(buildNoneFiltered(rgba, width, height), { level: zlibConstants.Z_BEST_COMPRESSION });
  const adaptiveIdat = deflateSync(buildAdaptiveFiltered(rgba, width, height), { level: zlibConstants.Z_BEST_COMPRESSION });
  const idat = adaptiveIdat.length < noneIdat.length ? adaptiveIdat : noneIdat;

  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
