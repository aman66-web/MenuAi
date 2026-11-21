// Measures for "How much?" after a scan or a product pick (founder 2026-11-21: "make sure ... they can [set] the portion they're having easily if the drink or
// food ... Allow them to choose measurements too"). The label is per 100 g or per 100 ml; a measure is only ever a fixed amount of that same unit, so nothing is
// guessed (no density: spoons and drinks measures for a drink labelled per ml, ounces for a food labelled per g):
// - from the pack itself: one serving as the label prints it, one item of a multipack, the whole pack (lib/mm/addFood.ts printedAmount, packAmounts);
// - UK kitchen measures: a glass 250 ml, a can 330 ml, a pint 568 ml, a tablespoon 15 ml, a teaspoon 5 ml; an ounce 28.35 g.

import { packAmounts, printedAmount, type LoggableProduct } from "./addFood";
import { tk } from "./i18n";

export type MeasureKey = "unit" | "portion" | "item" | "pack" | "glass" | "can" | "pint" | "tbsp" | "tsp" | "oz";

/** A measure: how many g or ml one of it is. */
export interface Measure {
  key: MeasureKey;
  one: number;
}

export const GLASS_ML = 250;
export const CAN_ML = 330;
export const PINT_ML = 568;
export const TBSP_ML = 15;
export const TSP_ML = 5;
export const OZ_G = 28.35;

/** One-tap counts of a measure other than g or ml: a half, one, two. */
export const QUICK_COUNTS = [0.5, 1, 2] as const;

/** One-tap counts of the whole pack (founder 2026-11-21: "if this is a whole carton of milk, they can do about 1/5 of a carton"): a fifth, a quarter, a third, a half, all of it. */
export const PACK_COUNTS = [0.2, 0.25, 1 / 3, 0.5, 1] as const;

/** The one-tap counts for a measure. */
export const quickCounts = (m: Measure): readonly number[] => (m.key === "pack" ? PACK_COUNTS : QUICK_COUNTS);

/** The smallest count the box takes (a tenth of a measure); anything from it up to MAX_AMOUNT g or ml is fine ("They're able to put anything they want down"). */
export const MIN_COUNT = 0.1;

/** The fractions people say, and the glyphs the box shows for them. */
const FRACTIONS: ReadonlyArray<readonly [number, string]> = [[0.2, "⅕"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"]];
const GLYPH_VALUE: Readonly<Record<string, number>> = Object.fromEntries(FRACTIONS.map(([v, g]) => [g, v]));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

/** The measures this product can be counted in: g or ml first, then the pack's own, then the fixed kitchen measures for its unit (one of each amount). */
export function measuresFor(p: Pick<LoggableProduct, "per" | "size" | "portion"> & { state?: string }): Measure[] {
  const out: Measure[] = [{ key: "unit", one: 1 }];
  const portion = p.portion ? printedAmount(p.portion) : null;
  if (portion && portion.unit === p.per && portion.amount > 0) out.push({ key: "portion", one: portion.amount });
  // never the pack for a label that is for the food cooked, prepared or drained: the pack weight is as sold (amountChoices does the same; the meeting, Yusuf)
  const pack = p.size && !p.state ? packAmounts(p.size) : null;
  // one item of a multipack, or the whole pack; not when it is the same amount as the serving (a pot of four that the label serves one at a time)
  if (pack && pack.unit === p.per && pack.each > 0 && !out.some((x) => x.one === pack.each)) out.push(pack.count > 1 ? { key: "item", one: pack.each } : { key: "pack", one: pack.each });
  const fixed: Measure[] = p.per === "ml"
    ? [{ key: "glass", one: GLASS_ML }, { key: "can", one: CAN_ML }, { key: "pint", one: PINT_ML }, { key: "tbsp", one: TBSP_ML }, { key: "tsp", one: TSP_ML }]
    : [{ key: "oz", one: OZ_G }];
  for (const m of fixed) if (!out.some((x) => x.one === m.one)) out.push(m);
  return out;
}

/** The g or ml in `count` of a measure, to a tenth. */
export const amountIn = (m: Measure, count: number): number => Math.round(m.one * count * 10) / 10;

/** How many of a measure an amount in g or ml is (for showing the box when the measure changes), to a hundredth. */
export const countIn = (m: Measure, amount: number): number => Math.round((amount / m.one) * 100) / 100;

/** "⅕", "½", "1", "1½", "2", "0.3": a count as people say it. */
export function countText(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const part = FRACTIONS.find(([v]) => near(n - whole, v));
  if (part) return whole === 0 ? part[1] : `${whole}${part[1]}`;
  return String(Math.round(n * 100) / 100);
}

/** True when a count is one of the one-tap counts (a third typed as 0.3333 is a third). */
export const sameCount = (a: number | null, b: number): boolean => a !== null && near(a, b);

/** The words for a measure, singular and plural (looked up for translation by the screen); g, ml and oz say just the unit. */
export const MEASURE_WORDS: Readonly<Record<Exclude<MeasureKey, "unit">, readonly [string, string]>> = {
  portion: [tk("serving"), tk("servings")],
  item: [tk("item"), tk("items")],
  pack: [tk("pack"), tk("packs")],
  glass: [tk("glass"), tk("glasses")],
  can: [tk("can"), tk("cans")],
  pint: [tk("pint"), tk("pints")],
  tbsp: [tk("tablespoon"), tk("tablespoons")],
  tsp: [tk("teaspoon"), tk("teaspoons")],
  oz: ["oz", "oz"],
};

/** A number as typed: "2", "0.2", "0,2", "1/5", "1 1/2", "½", "1½"; NaN when it isn't one. */
export function readCount(raw: string): number {
  const v = String(raw ?? "").trim().replace(",", ".");
  const glyph = /^(\d+)?\s*([⅕¼⅓½⅔¾])$/.exec(v);
  if (glyph) return Number(glyph[1] ?? 0) + GLYPH_VALUE[glyph[2]!]!;
  const frac = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(v);
  if (frac) return Number(frac[3]) > 0 ? Number(frac[1] ?? 0) + Number(frac[2]) / Number(frac[3]) : NaN;
  return /^\d*\.?\d+$|^\d+\.$/.test(v) ? Number(v) : NaN;
}

/** A count typed in a measure's box: at least MIN_COUNT and at most what MAX_AMOUNT g or ml allows of it; null when it isn't one. */
export function parseCount(raw: string, m: Measure, maxAmount: number): number | null {
  const v = readCount(raw);
  return Number.isFinite(v) && v >= MIN_COUNT - 1e-9 && v * m.one <= maxAmount ? Math.round(v * 10000) / 10000 : null;
}

/** The counts − and + move through: the fractions below one, then halves. */
const LADDER = [0.2, 0.25, 1 / 3, 0.5, 0.75, 1];
export function stepCount(count: number | null, direction: 1 | -1): number {
  const c = count ?? 1;
  if (direction > 0) return c < 1 - 1e-9 ? LADDER.find((x) => x > c + 1e-9) ?? 1 : Math.floor(c * 2 + 1e-9) / 2 + 0.5;
  if (c > 1 + 1e-9) return Math.max(1, Math.ceil(c * 2 - 1e-9) / 2 - 0.5);
  return [...LADDER].reverse().find((x) => x < c - 1e-9) ?? LADDER[0]!;
}
