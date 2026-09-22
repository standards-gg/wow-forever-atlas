import { ByteReader } from "./casc/byte-reader.js";

/**
 * BLP2 texture decoder (the format WoW has used since Wrath). Ported from
 * wow.export's `blp.js` (MIT licensed — see importers/wow-client/README.md
 * for attribution), stripped of its canvas/WebP/mipmap-selection UI
 * concerns since we only need "decode mip 0 to RGBA", and adapted from
 * its BufferWrapper/ImageData-oriented API to plain Buffers.
 */

const BLP_MAGIC = 0x32504c42; // "BLP2"

const DXT1 = 0x1;
const DXT3 = 0x2;
const DXT5 = 0x4;

function unpackColor565(value: number): [number, number, number] {
  const r5 = (value >> 11) & 0x1f;
  const g6 = (value >> 5) & 0x3f;
  const b5 = value & 0x1f;
  return [(r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)];
}

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA8888, row-major, top-to-bottom */
  rgba: Buffer;
}

export function decodeBlp(data: Buffer): DecodedImage {
  const reader = new ByteReader(data);
  const magic = reader.readUInt32LE();
  if (magic !== BLP_MAGIC) throw new Error(`Not a BLP2 file (bad magic 0x${magic.toString(16)})`);

  const type = reader.readUInt32LE();
  if (type !== 1) throw new Error(`Unsupported BLP type: ${type}`);

  const encoding = reader.readUInt8();
  const alphaDepth = reader.readUInt8();
  const alphaEncoding = reader.readUInt8();
  reader.readUInt8(); // containsMipmaps, unused (we only decode mip 0)

  const width = reader.readUInt32LE();
  const height = reader.readUInt32LE();

  const mapOffsets: number[] = [];
  for (let i = 0; i < 16; i++) mapOffsets.push(reader.readUInt32LE());
  const mapSizes: number[] = [];
  for (let i = 0; i < 16; i++) mapSizes.push(reader.readUInt32LE());

  let palette: [number, number, number, number][] = [];
  if (encoding === 1) {
    for (let i = 0; i < 256; i++) {
      const b = reader.readUInt8();
      const g = reader.readUInt8();
      const r = reader.readUInt8();
      const a = reader.readUInt8();
      palette.push([r, g, b, a]);
    }
  }

  reader.seek(mapOffsets[0]);
  const rawData = reader.readBytes(mapSizes[0]);
  const rgba = Buffer.alloc(width * height * 4);

  if (encoding === 1) {
    decodeUncompressed(rawData, palette, alphaDepth, width, height, rgba);
  } else if (encoding === 2) {
    decodeCompressed(rawData, alphaDepth, alphaEncoding, width, height, rgba);
  } else if (encoding === 3) {
    // Raw BGRA
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = rawData[i * 4 + 2];
      rgba[i * 4 + 1] = rawData[i * 4 + 1];
      rgba[i * 4 + 2] = rawData[i * 4];
      rgba[i * 4 + 3] = rawData[i * 4 + 3];
    }
  } else {
    throw new Error(`Unsupported BLP encoding: ${encoding}`);
  }

  return { width, height, rgba };
}

function decodeUncompressed(
  rawData: Buffer,
  palette: [number, number, number, number][],
  alphaDepth: number,
  width: number,
  height: number,
  out: Buffer
): void {
  const length = width * height;
  for (let i = 0; i < length; i++) {
    const [r, g, b] = palette[rawData[i]];
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;

    let a = 255;
    if (alphaDepth === 8) {
      a = rawData[length + i];
    } else if (alphaDepth === 1) {
      const byte = rawData[length + Math.floor(i / 8)];
      a = (byte & (0x01 << i % 8)) === 0 ? 0 : 255;
    } else if (alphaDepth === 4) {
      const byte = rawData[length + Math.floor(i / 2)];
      a = i % 2 === 0 ? (byte & 0x0f) << 4 : byte & 0xf0;
    }
    out[i * 4 + 3] = a;
  }
}

function decodeCompressed(
  rawData: Buffer,
  alphaDepth: number,
  alphaEncoding: number,
  width: number,
  height: number,
  out: Buffer
): void {
  const flags = alphaDepth > 1 ? (alphaEncoding === 7 ? DXT5 : DXT3) : DXT1;
  const blockBytes = (flags & DXT1) !== 0 ? 8 : 16;
  const target = new Array(4 * 16).fill(0);

  let pos = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      if (pos >= rawData.length) continue;

      const colorIndex = pos + ((flags & (DXT3 | DXT5)) !== 0 ? 8 : 0);
      const c0 = rawData.readUInt16LE(colorIndex);
      const c1 = rawData.readUInt16LE(colorIndex + 2);
      const [r0, g0, b0] = unpackColor565(c0);
      const [r1, g1, b1] = unpackColor565(c1);

      const colors: number[][] = [
        [r0, g0, b0, 255],
        [r1, g1, b1, 255],
      ];
      const isDxt1 = (flags & DXT1) !== 0;
      if (isDxt1 && c0 <= c1) {
        colors.push([(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2, 255]);
        colors.push([0, 0, 0, 0]);
      } else {
        colors.push([(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3, 255]);
        colors.push([(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3, 255]);
      }

      const indices: number[] = [];
      for (let i = 0; i < 4; i++) {
        const packed = rawData[colorIndex + 4 + i];
        indices.push(packed & 0x3, (packed >> 2) & 0x3, (packed >> 4) & 0x3, (packed >> 6) & 0x3);
      }

      for (let i = 0; i < 16; i++) {
        const c = colors[indices[i]];
        target[4 * i] = c[0];
        target[4 * i + 1] = c[1];
        target[4 * i + 2] = c[2];
        target[4 * i + 3] = c[3];
      }

      if ((flags & DXT3) !== 0) {
        for (let i = 0; i < 8; i++) {
          const quant = rawData[pos + i];
          const low = quant & 0x0f;
          const high = quant & 0xf0;
          target[8 * i + 3] = low | (low << 4);
          target[8 * i + 7] = high | (high >> 4);
        }
      } else if ((flags & DXT5) !== 0) {
        const a0 = rawData[pos];
        const a1 = rawData[pos + 1];
        const alphaTable: number[] = [a0, a1];
        if (a0 <= a1) {
          for (let i = 1; i < 5; i++) alphaTable.push(Math.floor(((5 - i) * a0 + i * a1) / 5));
          alphaTable.push(0, 255);
        } else {
          for (let i = 1; i < 7; i++) alphaTable.push(Math.floor(((7 - i) * a0 + i * a1) / 7));
        }

        const alphaIndices: number[] = [];
        let blockPos = 2;
        for (let i = 0; i < 2; i++) {
          let value = 0;
          for (let j = 0; j < 3; j++) value |= rawData[pos + blockPos++] << (8 * j);
          for (let j = 0; j < 8; j++) alphaIndices.push((value >> (3 * j)) & 0x07);
        }

        for (let i = 0; i < 16; i++) target[4 * i + 3] = alphaTable[alphaIndices[i]];
      }

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const sx = x + px;
          const sy = y + py;
          if (sx < width && sy < height) {
            const dst = (width * sy + sx) * 4;
            const src = (py * 4 + px) * 4;
            out[dst] = target[src];
            out[dst + 1] = target[src + 1];
            out[dst + 2] = target[src + 2];
            out[dst + 3] = target[src + 3];
          }
        }
      }

      pos += blockBytes;
    }
  }
}
