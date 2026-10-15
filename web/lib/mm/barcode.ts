// Reading a barcode from a camera picture, on the device (founder 2026-10-15: "for the scan barcode can it launch like a camera where you can scan
// it"). iPhone Safari and the iPhone app's web view have no BarcodeDetector, so the page reads the frames itself: EAN-13, EAN-8 and UPC-A (an
// EAN-13 that starts with 0), the codes printed on supermarket products. Plain scan lines across a grey picture and the standard bar-width
// tables, no library (CLAUDE.md rule 6). Nothing leaves the phone: a frame is looked at and dropped.
//
// How: a scan line (a row or a column of the picture) is turned into the widths of its dark and light stripes; a barcode is a start guard
// (three 1-module stripes), digits of four stripes each that add up to 7 modules, a centre guard, more digits and an end guard. Every digit is
// matched to its pattern by how far its stripes are from it, the last digit must agree with the others (the check digit), and the same code
// has to be read twice (on two lines, or in two frames) before the screen believes it.

/** One byte per pixel, 0 = black to 255 = white, row by row. */
export interface GrayImage {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

// ---- the standard tables (EAN-13 / UPC-A / EAN-8)

/** Left-hand "L" digits as modules, 0 = light, 1 = dark. Right-hand "R" is the opposite, "G" is R reversed. */
const L_BITS = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R_BITS = L_BITS.map((b) => [...b].map((x) => (x === "0" ? "1" : "0")).join(""));
const G_BITS = R_BITS.map((b) => [...b].reverse().join(""));
/** Which of L or G the six left digits use, by the number's first digit (the first digit itself is not printed as bars). */
const FIRST_DIGIT = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** The widths, in modules, of the four stripes of a 7-module digit. */
function stripes(bits: string): number[] {
  const out: number[] = [];
  let run = 1;
  for (let i = 1; i < bits.length; i++) {
    if (bits[i] === bits[i - 1]) run++;
    else {
      out.push(run);
      run = 1;
    }
  }
  out.push(run);
  return out;
}

const L_PAT = L_BITS.map(stripes);
const G_PAT = G_BITS.map(stripes);
const R_PAT = R_BITS.map(stripes);

/** The most a stripe may be off its pattern, and the most they may be off on average, both as a share of the module (the same limits ZXing uses). */
const MAX_INDIVIDUAL = 0.7;
const MAX_AVERAGE = 0.48;

/** How far these stripe widths are from a pattern (0 = exact), or Infinity when one of them is too far off. */
function variance(counters: readonly number[], pattern: readonly number[]): number {
  let total = 0;
  let size = 0;
  for (let i = 0; i < counters.length; i++) {
    total += counters[i]!;
    size += pattern[i]!;
  }
  if (total < size) return Infinity;
  const unit = total / size;
  const most = MAX_INDIVIDUAL * unit;
  let sum = 0;
  for (let i = 0; i < counters.length; i++) {
    const v = Math.abs(counters[i]! - pattern[i]! * unit);
    if (v > most) return Infinity;
    sum += v;
  }
  return sum / total;
}

/** The digit (and whether it was an L or G one) whose pattern the four stripes are closest to, or null. */
function matchDigit(c: readonly number[], kinds: "LG" | "L" | "R"): { digit: number; kind: "L" | "G" | "R" } | null {
  let best: { digit: number; kind: "L" | "G" | "R" } | null = null;
  let bestVar = MAX_AVERAGE;
  const tryTable = (table: number[][], kind: "L" | "G" | "R") => {
    for (let d = 0; d < 10; d++) {
      const v = variance(c, table[d]!);
      if (v < bestVar) {
        bestVar = v;
        best = { digit: d, kind };
      }
    }
  };
  if (kinds === "R") tryTable(R_PAT, "R");
  else {
    tryTable(L_PAT, "L");
    if (kinds === "LG") tryTable(G_PAT, "G");
  }
  return best;
}

const ONES3 = [1, 1, 1];
const ONES5 = [1, 1, 1, 1, 1];

/** A guard pattern of 3 or 5 one-module stripes at `at`. The last stripe of a line may be cut off by the picture's edge: then it only has to be there. */
function guardOk(w: readonly number[], at: number, n: 3 | 5, mayBeCut = false): boolean {
  if (at + n > w.length) return false;
  const c = w.slice(at, at + n);
  if (mayBeCut && at + n === w.length) {
    const unit = c.slice(0, n - 1).reduce((a, b) => a + b, 0) / (n - 1);
    return unit >= 1 && variance(c.slice(0, n - 1), n === 3 ? [1, 1] : [1, 1, 1, 1]) < MAX_AVERAGE + 0.1 && c[n - 1]! >= unit * 0.4;
  }
  return variance(c, n === 3 ? ONES3 : ONES5) < MAX_AVERAGE + 0.1;
}

// ---- check digits

function ean13Ok(d: readonly number[]): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i]! * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === d[12];
}

function ean8Ok(d: readonly number[]): boolean {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += d[i]! * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === d[7];
}

/** True when these digits are a valid EAN-13 / UPC-A (13 digits) or EAN-8 (8 digits), check digit included. */
export function validBarcode(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  const d = [...code].map(Number);
  return (d.length === 13 && ean13Ok(d)) || (d.length === 8 && ean8Ok(d));
}

// ---- stripes to digits

function readEan13(w: readonly number[], p: number): string | null {
  const digits: number[] = [];
  let parity = "";
  for (let k = 0; k < 6; k++) {
    const m = matchDigit(w.slice(p + 4 * k, p + 4 * k + 4), "LG");
    if (!m) return null;
    digits.push(m.digit);
    parity += m.kind;
  }
  const first = FIRST_DIGIT.indexOf(parity);
  if (first < 0) return null;
  if (!guardOk(w, p + 24, 5)) return null;
  for (let k = 0; k < 6; k++) {
    const q = p + 29 + 4 * k;
    const m = matchDigit(w.slice(q, q + 4), "R");
    if (!m) return null;
    digits.push(m.digit);
  }
  if (!guardOk(w, p + 53, 3, true)) return null;
  const all = [first, ...digits];
  return ean13Ok(all) ? all.join("") : null;
}

function readEan8(w: readonly number[], p: number): string | null {
  const digits: number[] = [];
  for (let k = 0; k < 4; k++) {
    const m = matchDigit(w.slice(p + 4 * k, p + 4 * k + 4), "L");
    if (!m) return null;
    digits.push(m.digit);
  }
  if (!guardOk(w, p + 16, 5)) return null;
  for (let k = 0; k < 4; k++) {
    const q = p + 21 + 4 * k;
    const m = matchDigit(w.slice(q, q + 4), "R");
    if (!m) return null;
    digits.push(m.digit);
  }
  if (!guardOk(w, p + 37, 3, true)) return null;
  return ean8Ok(digits) ? digits.join("") : null;
}

/**
 * Read a barcode from the widths of the stripes along one scan line. `firstDark` says whether the first stripe is dark. Returns the digits of a
 * valid EAN-13 (UPC-A comes as 13 digits starting 0) or EAN-8, or null.
 */
export function decodeStripes(w: readonly number[], firstDark: boolean): string | null {
  // the first stripe is cut off by the edge of the picture: never trust its width
  for (let i = firstDark ? 2 : 1; i + 3 <= w.length; i += 2) {
    const g = [w[i]!, w[i + 1]!, w[i + 2]!];
    const unit = (g[0] + g[1] + g[2]) / 3;
    if (unit < 1 || variance(g, ONES3) >= MAX_AVERAGE) continue;
    // some quiet space before the code; when the picture's edge cuts it short (the first stripe), a code filling the picture is still read
    if (i - 1 > 0 && w[i - 1]! < unit * 2.5) continue;
    const found = readEan13(w, i + 3) ?? readEan8(w, i + 3);
    if (found) return found;
  }
  return null;
}

// ---- scan lines

/** Window (in pixels) over which the dark and light levels are judged, for a line this long. */
const windowFor = (n: number) => Math.max(12, Math.min(160, Math.round(n / 10)));
/** A pixel is dark or light only when it is this far (in grey levels, or a tenth of the local range) from the middle: keeps flat areas from flickering. */
const MIN_HYSTERESIS = 4;

let dequeMax = new Int32Array(1024);
let dequeMin = new Int32Array(1024);
// working space for one scan line, kept between lines and pictures (a picture is read many times a second: nothing is allocated per line)
let scratch = { lo: new Float32Array(1024), hi: new Float32Array(1024), d: new Float32Array(1024), hyst: new Float32Array(1024) };

/** The darkest and lightest grey in a window around every pixel (a sliding window, so a long line costs no more per pixel than a short one). */
function localExtremes(g: ArrayLike<number>, n: number, hw: number, lo: Float32Array, hi: Float32Array): void {
  if (dequeMax.length < n) {
    dequeMax = new Int32Array(n);
    dequeMin = new Int32Array(n);
  }
  let hMax = 0, tMax = 0, hMin = 0, tMin = 0, next = 0;
  for (let i = 0; i < n; i++) {
    const upto = Math.min(n - 1, i + hw);
    while (next <= upto) {
      const v = g[next]!;
      while (tMax > hMax && g[dequeMax[tMax - 1]!]! <= v) tMax--;
      dequeMax[tMax++] = next;
      while (tMin > hMin && g[dequeMin[tMin - 1]!]! >= v) tMin--;
      dequeMin[tMin++] = next;
      next++;
    }
    while (dequeMax[hMax]! < i - hw) hMax++;
    while (dequeMin[hMin]! < i - hw) hMin++;
    hi[i] = g[dequeMax[hMax]!]!;
    lo[i] = g[dequeMin[hMin]!]!;
  }
}

/**
 * The widths of the dark and light stripes along a line of grey values (edges placed to a fraction of a pixel), and whether the first is dark.
 * A pixel is dark when it is below the middle of the darkest and lightest grey around it: the middle, not the average, so that a soft
 * (out of focus) picture keeps its dark and light stripes the same width.
 */
export function lineStripes(g: ArrayLike<number>, n: number): { widths: number[]; firstDark: boolean } | null {
  if (n < 40) return null;
  const hw = windowFor(n);
  if (scratch.lo.length < n) scratch = { lo: new Float32Array(n), hi: new Float32Array(n), d: new Float32Array(n), hyst: new Float32Array(n) };
  const { lo, hi, d, hyst } = scratch;
  localExtremes(g, n, hw, lo, hi);
  for (let i = 0; i < n; i++) {
    d[i] = g[i]! - (lo[i]! + hi[i]!) / 2;
    hyst[i] = Math.max(MIN_HYSTERESIS, (hi[i]! - lo[i]!) * 0.1);
  }
  let dark = d[0]! < 0;
  const firstDark = dark;
  const widths: number[] = [];
  let edge = 0;
  let lastIdx = 0;
  for (let x = 1; x < n; x++) {
    const flips = dark ? d[x]! > hyst[x]! : d[x]! < -hyst[x]!;
    if (!flips) continue;
    // walk back to where the line crossed the middle, then place the edge between the two pixels either side of it
    let k = x;
    while (k > lastIdx + 1 && (dark ? d[k - 1]! > 0 : d[k - 1]! < 0)) k--;
    const a = d[k - 1]!;
    const b = d[k]!;
    const at = a === b ? k - 0.5 : k - 1 + a / (a - b);
    const pos = Math.min(Math.max(at, edge), x);
    widths.push(pos - edge);
    edge = pos;
    lastIdx = x;
    dark = !dark;
  }
  widths.push(n - edge);
  return widths.length >= 30 ? { widths, firstDark } : null;
}

/** Read a barcode from one line of the picture, trying it both ways round (the code may be upside down). */
export function decodeLine(g: ArrayLike<number>, n: number): string | null {
  const s = lineStripes(g, n);
  if (!s) return null;
  const forward = decodeStripes(s.widths, s.firstDark);
  if (forward) return forward;
  const count = s.widths.length;
  const lastDark = s.firstDark ? count % 2 === 1 : count % 2 === 0;
  return decodeStripes([...s.widths].reverse(), lastDark);
}

/** The directions to scan in, in degrees from along the picture, with how many lines each: straight across and down, and tilted either way (a code held a bit crooked). */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 26], [90, 26],
  [-12, 12], [12, 12], [-24, 8], [24, 8],
  [78, 12], [102, 12], [66, 8], [114, 8],
];

/** Pixel of a grey picture at a fractional position (bilinear). */
function at(data: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  const x0 = Math.min(w - 2, Math.max(0, Math.floor(x)));
  const y0 = Math.min(h - 2, Math.max(0, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));
  const i = y0 * w + x0;
  return data[i]! * (1 - fx) * (1 - fy) + data[i + 1]! * fx * (1 - fy) + data[i + w]! * (1 - fx) * fy + data[i + w + 1]! * fx * fy;
}

/**
 * The grey values along the line through (cx, cy) in direction `deg`, as far as it stays inside the picture, each the average of three
 * neighbours across the line (so that a speck in one row doesn't matter). Returns the number of samples.
 */
function sampleLine(img: GrayImage, cx: number, cy: number, deg: number, out: Float32Array): number {
  const { width: w, height: h, data } = img;
  const dx = Math.cos((deg * Math.PI) / 180);
  const dy = Math.sin((deg * Math.PI) / 180);
  let t0 = -Infinity;
  let t1 = Infinity;
  const clip = (c: number, d: number, size: number) => {
    if (Math.abs(d) < 1e-9) {
      if (c < 1 || c > size - 2) { t0 = Infinity; t1 = -Infinity; }
      return;
    }
    const a = (1 - c) / d;
    const b = (size - 2 - c) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  };
  clip(cx, dx, w);
  clip(cy, dy, h);
  // one step in from the edge, so that the neighbours across the line are inside the picture too
  t0 = Math.ceil(t0) + 1;
  t1 = Math.floor(t1) - 1;
  const count = Math.min(out.length, Math.floor(t1 - t0) + 1);
  if (count < 40) return 0;
  for (let i = 0; i < count; i++) {
    const t = t0 + i;
    const x = cx + t * dx;
    const y = cy + t * dy;
    out[i] = (at(data, w, h, x, y) + at(data, w, h, x - dy, y + dx) + at(data, w, h, x + dy, y - dx)) / 3;
  }
  return count;
}

/**
 * Read a barcode from a picture: scan lines across and down it (a code may be sideways) and a little tilted either way (a code held crooked).
 * Returns the digits and how many lines read the same code, or null.
 */
export function decodeImage(img: GrayImage): { code: string; hits: number } | null {
  const { width: w, height: h } = img;
  if (w < 40 || h < 40) return null;
  const tally = new Map<string, number>();
  const buf = new Float32Array(Math.ceil(Math.hypot(w, h)) + 4);
  const reach = 0.7;
  for (const [deg, lines] of DIRECTIONS) {
    const rad = (deg * Math.PI) / 180;
    // lines run side by side across the middle of the picture, spread along the direction at right angles to them
    const nx = -Math.sin(rad);
    const ny = Math.cos(rad);
    const span = Math.abs(nx) * w + Math.abs(ny) * h; // the picture's extent along that direction
    for (let k = 0; k < lines; k++) {
      const off = ((k / (lines - 1)) - 0.5) * reach * span;
      const n = sampleLine(img, w / 2 + nx * off, h / 2 + ny * off, deg, buf);
      if (n === 0) continue;
      const code = decodeLine(buf, n);
      if (code) tally.set(code, (tally.get(code) ?? 0) + 1);
    }
  }
  let best: { code: string; hits: number } | null = null;
  for (const [code, hits] of tally) if (!best || hits > best.hits) best = { code, hits };
  return best;
}

// ---- believing a reading

/** The same code read this many times (lines or frames) within `WINDOW_MS` is believed. */
const NEEDED = 2;
const WINDOW_MS = 2500;

/** Collects readings from successive pictures; `add` returns the code once it has been read enough times. */
export function createVoter(): { add(code: string, hits: number, now: number): string | null; reset(): void } {
  let seen = new Map<string, { count: number; first: number }>();
  return {
    add(code, hits, now) {
      for (const [c, v] of seen) if (now - v.first > WINDOW_MS) seen.delete(c);
      const v = seen.get(code) ?? { count: 0, first: now };
      v.count += hits;
      seen.set(code, v);
      return v.count >= NEEDED ? code : null;
    },
    reset() {
      seen = new Map();
    },
  };
}

/** The colour picture the camera gives (RGBA, 4 bytes a pixel) as grey, one byte a pixel. Pass `into` to reuse a buffer from the last picture. */
export function toGray(rgba: ArrayLike<number>, width: number, height: number, into?: Uint8Array): Uint8Array {
  const out = into && into.length >= width * height ? into : new Uint8Array(width * height);
  for (let i = 0, j = 0, n = width * height; i < n; i++, j += 4) out[i] = (rgba[j]! * 77 + rgba[j + 1]! * 150 + rgba[j + 2]! * 29) >> 8;
  return out;
}
