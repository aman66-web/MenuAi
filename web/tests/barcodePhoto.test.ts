// A barcode read from a photo the person picks (lib/mm/barcodePhoto.ts; founder 2026-11-21), against the reader's own test pictures (tests/fixtures/barcodes,
// drawn by python-barcode and checked with zxing-cpp) and those pictures put small in a corner of a big photo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { GrayImage } from "../lib/mm/barcode";
import { cropGray, PHOTO_REGIONS, readPhotoGray } from "../lib/mm/barcodePhoto";

const DIR = join(__dirname, "fixtures", "barcodes");
interface Entry { file: string; expect: string | null; note: string; must_decode: boolean }
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")) as Entry[];
function pgm(file: string): GrayImage {
  const raw = gunzipSync(readFileSync(join(DIR, file)));
  const head = /^P5\n(\d+) (\d+)\n255\n/.exec(raw.subarray(0, 40).toString("latin1"))!;
  return { data: raw.subarray(head[0].length), width: Number(head[1]), height: Number(head[2]) };
}

/** The picture pasted into a big grey photo at (fx, fy) of its free room, as a phone photo of a pack would hold it. */
function inPhoto(img: GrayImage, W: number, H: number, fx: number, fy: number): GrayImage {
  const data = new Uint8Array(W * H).fill(200);
  const ox = Math.round(fx * (W - img.width));
  const oy = Math.round(fy * (H - img.height));
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) data[(oy + y) * W + ox + x] = img.data[y * img.width + x]!;
  return { data, width: W, height: H };
}

describe("reading a barcode from a photo", () => {
  const clean = manifest.filter((m) => m.expect && m.must_decode);
  const none = manifest.filter((m) => !m.expect);

  it("has pictures to test with", () => {
    expect(clean.length).toBeGreaterThan(3);
    expect(none.length).toBeGreaterThan(0);
  });

  for (const m of clean) {
    it(`${m.file}: ${m.note}`, () => {
      expect(readPhotoGray(pgm(m.file))).toBe(m.expect);
    });
  }

  for (const m of none) {
    it(`${m.file}: ${m.note} reads as no code`, () => {
      expect(readPhotoGray(pgm(m.file))).toBeNull();
    });
  }

  it("finds a code held small in a corner of a big photo, and in the middle", () => {
    const m = clean[0]!;
    const img = pgm(m.file);
    const W = Math.max(2400, img.width * 3), H = Math.max(1800, img.height * 3);
    for (const [fx, fy] of [[0.5, 0.5], [0.05, 0.05], [0.95, 0.1], [0.1, 0.95], [0.9, 0.9]] as const) {
      expect(readPhotoGray(inPhoto(img, W, H, fx, fy)), `${fx},${fy}`).toBe(m.expect);
    }
  });

  it("a blank photo holds no code", () => {
    expect(readPhotoGray({ data: new Uint8Array(1600 * 1200).fill(230), width: 1600, height: 1200 })).toBeNull();
  });

  it("looks at the whole photo first, then the middle, then nine overlapping parts, each at most 1280 px", () => {
    expect(PHOTO_REGIONS).toHaveLength(11);
    expect(PHOTO_REGIONS[0]).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const big: GrayImage = { data: new Uint8Array(4000 * 3000), width: 4000, height: 3000 };
    for (const r of PHOTO_REGIONS) {
      const v = cropGray(big, r);
      expect(Math.max(v.width, v.height)).toBeLessThanOrEqual(1280);
      expect(r.x + r.w).toBeLessThanOrEqual(1);
      expect(r.y + r.h).toBeLessThanOrEqual(1);
    }
  });
});
