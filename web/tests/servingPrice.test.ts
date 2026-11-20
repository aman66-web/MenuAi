import { describe, expect, it } from "vitest";
import { inPriceRange, pounds, rangeFromAddress, rangeToAddress, servingPriceBounds, settleRange } from "../lib/mm/servingPrice";

describe("the Recipes screen's serving price filter", () => {
  it("the default range runs from the cheapest to the dearest serving, to the 10p", () => {
    expect(servingPriceBounds([1.84, 5.53, 2.4, null, undefined])).toEqual({ min: 1.8, max: 5.6 });
    expect(servingPriceBounds([2, 2])).toEqual({ min: 2, max: 2.1 });
    expect(servingPriceBounds([null, 0, Number.NaN])).toBeNull();
  });

  it("keeps a recipe inside the range, both ends included, and leaves out one with no serving price", () => {
    const r = { min: 1.8, max: 3 };
    expect(inPriceRange(1.8, r)).toBe(true);
    expect(inPriceRange(3, r)).toBe(true);
    expect(inPriceRange(3.01, r)).toBe(false);
    expect(inPriceRange(null, r)).toBe(false);
  });

  it("settles a chosen range inside the bounds, and the whole range means no filter", () => {
    const b = { min: 1.8, max: 5.6 };
    expect(settleRange({ min: 1.8, max: 5.6 }, b)).toBeNull();
    expect(settleRange({ min: 1, max: 9 }, b)).toBeNull();
    expect(settleRange({ min: 2, max: 3.5 }, b)).toEqual({ min: 2, max: 3.5 });
    expect(settleRange({ min: 4, max: 3 }, b)).toEqual({ min: 4, max: 4 });
  });

  it("round-trips the address in pence and refuses nonsense", () => {
    expect(rangeToAddress({ min: 1.8, max: 3.5 })).toEqual({ pmin: "180", pmax: "350" });
    expect(rangeFromAddress("180", "350")).toEqual({ min: 1.8, max: 3.5 });
    for (const [a, b] of [["x", "350"], ["400", "300"], [null, "300"], ["1.5", "3"]] as const) expect(rangeFromAddress(a, b)).toBeNull();
    expect(pounds(1.8)).toBe("£1.80");
  });
});
