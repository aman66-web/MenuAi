import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createVoter, decodeImage, decodeLine, decodeStripes, toGray, validBarcode, type GrayImage } from "../lib/mm/barcode";

// The page reads barcodes from the camera itself (lib/mm/barcode.ts: no library, nothing sent anywhere). The pictures are drawn by python-barcode
// and checked with zxing-cpp (tools/barcode/make_fixtures.py), so the reader is tested against something that did not share its tables: clean
// codes of every kind, and the ways a phone makes them harder (turned, upside down, sideways, soft, grainy, small, washed out, unevenly lit),
// plus pictures that hold no code and must read as none.

const DIR = join(__dirname, "fixtures", "barcodes");
interface Entry { file: string; expect: string | null; note: string; width: number; height: number; must_decode: boolean }
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")) as Entry[];

function pgm(file: string): GrayImage {
  const raw = gunzipSync(readFileSync(join(DIR, file)));
  // "P5\n<w> <h>\n255\n" then one byte a pixel
  const head = /^P5\n(\d+) (\d+)\n255\n/.exec(raw.subarray(0, 40).toString("latin1"))!;
  const [width, height] = [Number(head[1]), Number(head[2])];
  return { data: raw.subarray(head[0].length), width, height };
}

describe("reading a barcode from a picture", () => {
  for (const m of manifest.filter((x) => x.expect)) {
    it(`${m.file}: ${m.note}`, () => {
      const read = decodeImage(pgm(m.file));
      expect(read?.code).toBe(m.expect);
    });
  }
  for (const m of manifest.filter((x) => !x.expect)) {
    it(`${m.file}: ${m.note} reads as no code`, () => {
      expect(decodeImage(pgm(m.file))).toBeNull();
    });
  }
});

// ---- the check digit and the stripes, with codes built here from the printed tables

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R = L.map((b) => [...b].map((x) => (x === "0" ? "1" : "0")).join(""));
const G = R.map((b) => [...b].reverse().join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function modules(code: string): string {
  const d = [...code].map(Number);
  if (d.length === 8) return "101" + d.slice(0, 4).map((x) => L[x]).join("") + "01010" + d.slice(4).map((x) => R[x]).join("") + "101";
  const left = PARITY[d[0]!]!;
  return "101" + d.slice(1, 7).map((x, i) => (left[i] === "L" ? L[x] : G[x])).join("") + "01010" + d.slice(7).map((x) => R[x]).join("") + "101";
}

/** Stripe widths for a code at `px` pixels a module, with a quiet zone before it and after it. */
function stripes(code: string, px = 4): { widths: number[]; firstDark: boolean } {
  const bits = "0".repeat(10) + modules(code) + "0".repeat(10);
  const widths: number[] = [];
  let run = 1;
  for (let i = 1; i < bits.length; i++) {
    if (bits[i] === bits[i - 1]) run++;
    else { widths.push(run * px); run = 1; }
  }
  widths.push(run * px);
  return { widths, firstDark: false };
}

describe("check digits", () => {
  it("accepts real EAN-13, UPC-A (as 13 digits starting 0) and EAN-8 numbers", () => {
    for (const c of ["5000157024671", "4006381333931", "0036000291452", "96385074", "73513537"]) expect(validBarcode(c)).toBe(true);
  });
  it("refuses a wrong check digit, a wrong length and anything that isn't digits", () => {
    for (const c of ["5000157024672", "500015702467", "9638507", "96385075", "50001570246ab", ""]) expect(validBarcode(c)).toBe(false);
  });
});

describe("stripes to digits", () => {
  it("reads the printed pattern of an EAN-13 and an EAN-8, at any size", () => {
    for (const px of [1.6, 3, 4, 7.5]) {
      for (const c of ["5000157024671", "4006381333931", "0012345678905"]) {
        const s = stripes(c, px);
        expect(decodeStripes(s.widths, s.firstDark)).toBe(c);
      }
      const e8 = stripes("96385074", px);
      expect(decodeStripes(e8.widths, e8.firstDark)).toBe("96385074");
    }
  });
  it("reads it with every stripe a little too wide or narrow (what a blurred picture does)", () => {
    const s = stripes("5000157024671", 5);
    const wobble = s.widths.map((w, i) => w + (i % 2 === 0 ? 0.9 : -0.9));
    expect(decodeStripes(wobble, s.firstDark)).toBe("5000157024671");
  });
  it("reads a code that comes the wrong way round (a picture of it upside down) through decodeLine", () => {
    // a line of pixels: dark where the module is 1
    const px = 4;
    const line = (code: string, flip: boolean) => {
      const bits = ("0".repeat(12) + modules(code) + "0".repeat(12)).split("");
      if (flip) bits.reverse();
      const out: number[] = [];
      for (const b of bits) for (let i = 0; i < px; i++) out.push(b === "1" ? 20 : 235);
      return Float32Array.from(out);
    };
    for (const flip of [false, true]) {
      const g = line("5000157024671", flip);
      expect(decodeLine(g, g.length)).toBe("5000157024671");
    }
  });
  it("never reads a digit that is not there: a changed digit, or a swapped pair, fails the check digit", () => {
    const code = "5000157024671";
    for (const bad of ["5000157024681", "5000157204671", "5000158024671"]) {
      const s = stripes(bad, 4);
      expect(decodeStripes(s.widths, s.firstDark)).toBeNull();
    }
    expect(code.length).toBe(13);
  });
  it("needs a quiet space before the code and its end guard, and reads nothing from too few stripes", () => {
    const s = stripes("5000157024671", 4);
    expect(decodeStripes(s.widths.slice(0, 40), s.firstDark)).toBeNull();
    expect(decodeStripes([], false)).toBeNull();
    // no quiet zone: the first stripe is cut off
    const noQuiet = s.widths.slice(1);
    expect(decodeStripes(noQuiet, true)).toBeNull();
  });
});

describe("believing a reading", () => {
  it("wants the same code twice, from lines or from pictures, before it says so", () => {
    const v = createVoter();
    expect(v.add("5000157024671", 1, 0)).toBeNull();
    expect(v.add("5000157024671", 1, 300)).toBe("5000157024671");
  });
  it("counts the lines of one picture, so a picture that reads twice is enough", () => {
    expect(createVoter().add("5000157024671", 4, 0)).toBe("5000157024671");
  });
  it("does not add up two different codes, or readings far apart in time", () => {
    const v = createVoter();
    expect(v.add("5000157024671", 1, 0)).toBeNull();
    expect(v.add("5010477348630", 1, 200)).toBeNull();
    expect(v.add("5000157024671", 1, 5000)).toBeNull();
  });
});

describe("colour pictures", () => {
  it("turn to grey with the usual weights", () => {
    const rgba = [255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255];
    const g = toGray(rgba, 3, 1);
    expect(g[0]).toBeGreaterThanOrEqual(254);
    expect(g[1]).toBe(0);
    expect(g[2]).toBeGreaterThan(50);
    expect(g[2]).toBeLessThan(80);
  });
});
