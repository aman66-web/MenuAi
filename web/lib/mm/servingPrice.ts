// The Recipes screen's "Serving price" filter (founder 2026-11-20, in place of the Occasion field: "it'll say serving price, and then under serving price ...
// £1.80 to £5.60, and then next to it brackets default ... they can adjust for the range of per serving cost that they want"). Pure, so it is unit-tested.
// The default range is the cheapest and dearest serving among the shop's recipes, to the 10p below and above; a chosen range is kept in the address in pence.

export interface PriceRange {
  /** Pounds, to 10p. */
  min: number;
  max: number;
}

/** The slider moves in 10p steps. */
export const PRICE_STEP = 0.1;

const tenths = (n: number) => Math.round(n * 10) / 10;

/** The cheapest and dearest serving among these, to the 10p below and the 10p above; null when none has a serving price. */
export function servingPriceBounds(costs: ReadonlyArray<number | null | undefined>): PriceRange | null {
  const xs = costs.filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0);
  if (!xs.length) return null;
  const min = Math.floor(Math.min(...xs) * 10 + 1e-9) / 10;
  const max = Math.ceil(Math.max(...xs) * 10 - 1e-9) / 10;
  return { min: tenths(min), max: tenths(Math.max(max, min + PRICE_STEP)) };
}

/** A serving price inside the range (both ends count); a recipe with no serving price is never inside a chosen range. */
export function inPriceRange(cost: number | null | undefined, range: PriceRange): boolean {
  return typeof cost === "number" && Number.isFinite(cost) && cost >= range.min - 1e-9 && cost <= range.max + 1e-9;
}

/** A chosen range kept inside the bounds, low never above high; null when it is the whole default range (no filter). */
export function settleRange(chosen: PriceRange, bounds: PriceRange): PriceRange | null {
  const min = tenths(Math.min(Math.max(chosen.min, bounds.min), bounds.max));
  const max = tenths(Math.max(Math.min(chosen.max, bounds.max), min));
  return min <= bounds.min && max >= bounds.max ? null : { min, max };
}

/** The range from the address (?pmin=180&pmax=560, in pence); null when missing or not numbers. */
export function rangeFromAddress(pmin: string | null, pmax: string | null): PriceRange | null {
  const a = pmin === null ? NaN : Number(pmin);
  const b = pmax === null ? NaN : Number(pmax);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b > 100_000) return null;
  return { min: a / 100, max: b / 100 };
}

/** The range for the address, in pence. */
export const rangeToAddress = (r: PriceRange): { pmin: string; pmax: string } => ({ pmin: String(Math.round(r.min * 100)), pmax: String(Math.round(r.max * 100)) });

/** "£1.80". */
export const pounds = (n: number): string => `£${n.toFixed(2)}`;
