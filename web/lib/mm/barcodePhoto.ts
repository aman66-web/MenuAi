// A barcode read from a photo the person picks (founder 2026-11-21: "allow people to upload a photo ... of the barcode if the food they want to note the calories
// for"), on the phone with the same reader the camera uses (lib/mm/barcode.ts): the photo is never sent anywhere. A phone photo is big and the barcode may be
// small and off-centre, so the photo is read whole, then its middle, then nine overlapping parts (a code held small in a corner), each scaled to at most
// PHOTO_SIDE; a code is believed once two scan lines have read it (on one view or across views), as the camera's voter believes two readings.

import { decodeImage, type GrayImage } from "./barcode";

/** A part of the photo, as fractions of its width and height. */
export interface PhotoRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The largest side a view of the photo is read at (the reader works best at camera-picture sizes). */
export const PHOTO_SIDE = 1280;

/** Where to look, in order: all of it, the middle, then a 3 x 3 grid of half-size parts that overlap by half. */
export const PHOTO_REGIONS: readonly PhotoRegion[] = [
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
  ...[0, 0.25, 0.5].flatMap((y) => [0, 0.25, 0.5].map((x) => ({ x, y, w: 0.5, h: 0.5 }))),
];

/** One region of a grey picture, scaled (nearest pixel) so its larger side is at most `maxSide`; the canvas does the same on the phone. */
export function cropGray(img: GrayImage, r: PhotoRegion, maxSide = PHOTO_SIDE): GrayImage {
  const x0 = Math.round(r.x * img.width);
  const y0 = Math.round(r.y * img.height);
  const cw = Math.max(1, Math.round(r.w * img.width));
  const ch = Math.max(1, Math.round(r.h * img.height));
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const width = Math.max(1, Math.round(cw * scale));
  const height = Math.max(1, Math.round(ch * scale));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, y0 + Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, x0 + Math.floor(x / scale));
      data[y * width + x] = img.data[sy * img.width + sx]!;
    }
  }
  return { data, width, height };
}

/** The code in a still photo, from its views in order (PHOTO_REGIONS); null when no code is read by two scan lines. */
export function readStill(views: Iterable<GrayImage>): string | null {
  const tally = new Map<string, number>();
  for (const v of views) {
    const read = decodeImage(v);
    if (!read) continue;
    const hits = (tally.get(read.code) ?? 0) + read.hits;
    if (hits >= 2) return read.code;
    tally.set(read.code, hits);
  }
  return null;
}

/** The code in a grey photo: its views made here (tests; the phone makes them with a canvas, drawing each region at PHOTO_SIDE). */
export const readPhotoGray = (img: GrayImage): string | null => readStill((function* () { for (const r of PHOTO_REGIONS) yield cropGray(img, r); })());
