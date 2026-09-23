import type { DecodedImage } from "./blp.js";
import { type AdtTex, decodeMcalLayer } from "./adt-tex.js";

/**
 * Renders one ADT tile's real ground-texture layers (adt-tex.ts's parsed
 * output) into a single RGBA image — the same blended grass/dirt/rock
 * look the game itself draws, instead of the WDT's small abstracted
 * minimap icon. 16x16 chunks per tile, each rendered at `chunkPixels` and
 * composited into one `16*chunkPixels` square image.
 *
 * Ground textures tile several times across a chunk (33.333 yards) rather
 * than stretching once edge-to-edge; TEXTURE_REPEATS_PER_CHUNK is a fixed
 * approximation (not read from per-layer scale data, which this project
 * hasn't needed to parse elsewhere) tuned by visual comparison against
 * real in-game terrain density.
 */
const CHUNKS_PER_SIDE = 16;
const TEXTURE_REPEATS_PER_CHUNK = 4;
const ALPHA_MAP_SIZE = 64;

function sampleTiled(image: DecodedImage, u: number, v: number): { r: number; g: number; b: number } {
  const tx = Math.floor(u * TEXTURE_REPEATS_PER_CHUNK * image.width) % image.width;
  const ty = Math.floor(v * TEXTURE_REPEATS_PER_CHUNK * image.height) % image.height;
  const i = (ty * image.width + tx) * 4;
  return { r: image.rgba[i], g: image.rgba[i + 1], b: image.rgba[i + 2] };
}

export function renderAdtTile(
  tex: AdtTex,
  textureImages: Map<number, DecodedImage>,
  chunkPixels: number
): { width: number; height: number; rgba: Buffer } {
  const tileSize = CHUNKS_PER_SIDE * chunkPixels;
  const out = Buffer.alloc(tileSize * tileSize * 4);

  for (let cy = 0; cy < CHUNKS_PER_SIDE; cy++) {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      const chunk = tex.chunks[cy * CHUNKS_PER_SIDE + cx];
      if (!chunk) continue;

      const layerImages = chunk.layers.map((layer) => ({
        layer,
        image: textureImages.get(tex.textureFileDataIds[layer.textureIndex]),
        alpha: layer.hasAlpha && chunk.alphaData ? decodeMcalLayer(chunk.alphaData, layer.alphaOffset, layer.compressed) : undefined,
      }));

      for (let py = 0; py < chunkPixels; py++) {
        const v = py / chunkPixels;
        const ay = Math.floor((py * ALPHA_MAP_SIZE) / chunkPixels);
        for (let px = 0; px < chunkPixels; px++) {
          const u = px / chunkPixels;
          let r = 0, g = 0, b = 0;
          const base = layerImages[0]?.image;
          if (base) ({ r, g, b } = sampleTiled(base, u, v));

          const ax = Math.floor((px * ALPHA_MAP_SIZE) / chunkPixels);
          for (let li = 1; li < layerImages.length; li++) {
            const { image, alpha } = layerImages[li];
            if (!image || !alpha) continue;
            const a = alpha[ay * ALPHA_MAP_SIZE + ax] / 255;
            if (a <= 0) continue;
            const s = sampleTiled(image, u, v);
            r = r * (1 - a) + s.r * a;
            g = g * (1 - a) + s.g * a;
            b = b * (1 - a) + s.b * a;
          }

          const destX = cx * chunkPixels + px;
          const destY = cy * chunkPixels + py;
          const i = (destY * tileSize + destX) * 4;
          out[i] = Math.round(r);
          out[i + 1] = Math.round(g);
          out[i + 2] = Math.round(b);
          out[i + 3] = 255;
        }
      }
    }
  }

  return { width: tileSize, height: tileSize, rgba: out };
}
