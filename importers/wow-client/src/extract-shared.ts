import type { DecodedImage } from "./blp.js";

/** A stitched composite at native tile resolution can run to 10000+px on a
 * side for a big zone, and tens of thousands for a whole continent — far
 * more detail than a browser needs in one image. Cap the longest side and
 * box-downsample (by a power-of-two factor, since TILE_PIXELS divides
 * evenly) rather than serving raw native resolution. */
export function downscaleFactor(width: number, height: number, maxDimension: number): number {
  let factor = 1;
  while (Math.max(width, height) / factor > maxDimension) factor *= 2;
  return factor;
}

/** Averages factor x factor blocks of RGBA pixels down to one — a simple box filter. */
export function boxDownsample(
  src: Buffer,
  width: number,
  height: number,
  factor: number
): { data: Buffer; width: number; height: number } {
  const newWidth = Math.floor(width / factor);
  const newHeight = Math.floor(height / factor);
  const out = Buffer.alloc(newWidth * newHeight * 4);
  const samples = factor * factor;

  for (let ny = 0; ny < newHeight; ny++) {
    for (let nx = 0; nx < newWidth; nx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < factor; dy++) {
        const srcY = ny * factor + dy;
        const rowStart = srcY * width * 4;
        for (let dx = 0; dx < factor; dx++) {
          const srcX = nx * factor + dx;
          const i = rowStart + srcX * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
        }
      }
      const outI = (ny * newWidth + nx) * 4;
      out[outI] = Math.round(r / samples);
      out[outI + 1] = Math.round(g / samples);
      out[outI + 2] = Math.round(b / samples);
      out[outI + 3] = Math.round(a / samples);
    }
  }

  return { data: out, width: newWidth, height: newHeight };
}

/**
 * Some tiles inside a WDT's own grid are never sculpted with real terrain —
 * they still get a minimap FileDataID, but it decodes to a flat, essentially
 * single-color filler texture (confirmed empirically: the exact same RGB
 * triplet, pixel-for-pixel, shows up across both continents at 10-19% of
 * total area — real terrain art, even plain grass, always has natural
 * texture noise and is never perfectly flat). Compositing these as opaque
 * blocks produces visible flat-colored rectangles with no relation to real
 * geography; treating them as "no data" (skip, leave transparent) instead
 * lets the real terrain and the dark ocean background show through cleanly.
 */
export function isBlankTile(tile: DecodedImage): boolean {
  const { rgba } = tile;
  const pixelCount = rgba.length / 4;
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    rSum += rgba[i];
    gSum += rgba[i + 1];
    bSum += rgba[i + 2];
  }
  const rMean = rSum / pixelCount;
  const gMean = gSum / pixelCount;
  const bMean = bSum / pixelCount;

  let variance = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    variance += (rgba[i] - rMean) ** 2 + (rgba[i + 1] - gMean) ** 2 + (rgba[i + 2] - bMean) ** 2;
  }
  variance /= pixelCount;

  return variance < 2;
}

export function blitTile(composite: Buffer, compositeWidth: number, tile: DecodedImage, destX: number, destY: number): void {
  for (let y = 0; y < tile.height; y++) {
    const srcStart = y * tile.width * 4;
    const destRowStart = ((destY + y) * compositeWidth + destX) * 4;
    tile.rgba.copy(composite, destRowStart, srcStart, srcStart + tile.width * 4);
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
