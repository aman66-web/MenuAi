// Measures for "How much?" after a scan or a product pick (founder 2026-11-21: "make sure ... they can [set] the portion they're having easily if the drink or
// food ... Allow them to choose measurements too"). The label is per 100 g or per 100 ml; a measure is only ever a fixed amount of that same unit, so nothing is
// guessed (no density: spoons and drinks measures for a drink labelled per ml, ounces for a food labelled per g):
// - from the pack itself: one serving as the label prints it, one item of a multipack, the whole pack (lib/mm/addFood.ts printedAmount, packAmounts);
// - UK kitchen measures: a glass 250 ml, a can 330 ml, a pint 568 ml, a tablespoon 15 ml, a teaspoon 5 ml; an ounce 28.35 g.

import { packAmounts, printedAmount, type LoggableProduct } from "./addFood";

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

/** The measures this product can be counted in: g or ml first, then the pack's own, then the fixed kitchen measures for its unit (one of each amount). */
export function measuresFor(p: Pick<LoggableProduct, "per" | "size" | "portion">): Measure[] {
  const out: Measure[] = [{ key: "unit", one: 1 }];
  const portion = p.portion ? printedAmount(p.portion) : null;
  if (portion && portion.unit === p.per && portion.amount > 0) out.push({ key: "portion", one: portion.amount });
  const pack = p.size ? packAmounts(p.size) : null;
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

/** The step of the − and + for a measure: half a measure, or the g/ml steps the box always had (addFood stepAmount) for g or ml. */
export const measureStep = (m: Measure): number | null => (m.key === "unit" ? null : 0.5);

/** "½", "1", "1½", "2", "0.3": a count as people say it. */
export function countText(n: number): string {
  const whole = Math.floor(n);
  const half = Math.abs(n - whole - 0.5) < 1e-9;
  if (half) return whole === 0 ? "½" : `${whole}½`;
  return String(Math.round(n * 100) / 100);
}

/** The words for a measure, singular and plural (looked up for translation by the screen); g, ml and oz say just the unit. */
export const MEASURE_WORDS: Readonly<Record<Exclude<MeasureKey, "unit">, readonly [string, string]>> = {
  portion: ["serving", "servings"],
  item: ["item", "items"],
  pack: ["pack", "packs"],
  glass: ["glass", "glasses"],
  can: ["can", "cans"],
  pint: ["pint", "pints"],
  tbsp: ["tablespoon", "tablespoons"],
  tsp: ["teaspoon", "teaspoons"],
  oz: ["oz", "oz"],
};
