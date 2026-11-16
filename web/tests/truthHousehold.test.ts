import { describe, expect, it } from "vitest";
import {
  BUTTER_FAT_FRACTION,
  butterEquivalent,
  countText,
  eggEquivalent,
  HOUSEHOLD_SOURCES,
  householdEquivalents,
  MAX_ICONS,
  sugarEquivalent,
} from "../lib/mm/truth/household";

describe("sugar cubes (NHS: 4 g a cube)", () => {
  it("matches the NHS's own pairings", () => {
    expect(sugarEquivalent({ sugar: 24 })?.amount).toBe(6);
    expect(sugarEquivalent({ sugar: 14 })?.amount).toBe(3.5);
    expect(sugarEquivalent({ sugar: 10 })?.amount).toBe(2.5);
    expect(sugarEquivalent({ sugar: 4 })?.text).toBe("about 1 sugar cube");
  });
  it("says 'about', in cubes, with 1/2 written the NHS way", () => {
    expect(sugarEquivalent({ sugar: 14 })?.text).toBe("about 3½ sugar cubes");
    expect(countText(0.5)).toBe("½");
    expect(countText(2)).toBe("2");
  });
  it("shows nothing for an unpublished, tiny or invalid figure", () => {
    expect(sugarEquivalent({})).toBeUndefined();
    expect(sugarEquivalent({ sugar: 2.9 })).toBeUndefined();
    expect(sugarEquivalent({ sugar: Number.NaN })).toBeUndefined();
    expect(sugarEquivalent({ sugar: -1 })).toBeUndefined();
  });
  it("caps the drawn icons", () => {
    expect(sugarEquivalent({ sugar: 200 })?.icons).toBe(MAX_ICONS);
  });
});

describe("butter (82 g of fat in 100 g)", () => {
  it("works out grams of butter to the nearest 5 g", () => {
    // 20.5 g of fat is 25 g of butter
    expect(butterEquivalent({ fat: 20.5 })?.amount).toBe(25);
    expect(butterEquivalent({ fat: 8 })?.amount).toBe(10);
    expect(butterEquivalent({ fat: 30 })?.text).toBe("about 35 g of butter");
  });
  it("is consistent with the published fat fraction", () => {
    expect(BUTTER_FAT_FRACTION).toBe(0.82);
    for (const fat of [6, 12, 25, 41, 60]) {
      const e = butterEquivalent({ fat });
      expect(Math.abs((e?.amount ?? 0) * BUTTER_FAT_FRACTION - fat)).toBeLessThanOrEqual(2.5 * BUTTER_FAT_FRACTION + 0.01);
    }
  });
  it("draws one block per 10 g", () => {
    expect(butterEquivalent({ fat: 41 })?.icons).toBe(5); // 50 g of butter
  });
  it("shows nothing for a small or unpublished fat figure", () => {
    expect(butterEquivalent({})).toBeUndefined();
    expect(butterEquivalent({ fat: 4.9 })).toBeUndefined();
  });
});

describe("eggs (a medium egg has 6.4 g of protein)", () => {
  it("works out medium eggs to the nearest half", () => {
    expect(eggEquivalent({ protein: 6.4 })?.text).toBe("about 1 medium egg's worth");
    expect(eggEquivalent({ protein: 32 })?.amount).toBe(5);
    expect(eggEquivalent({ protein: 32 })?.text).toBe("about 5 medium eggs' worth");
    expect(eggEquivalent({ protein: 25 })?.amount).toBe(4); // 3.9 eggs
    expect(eggEquivalent({ protein: 3.3 })?.amount).toBe(0.5);
  });
  it("shows nothing for an unpublished or tiny figure", () => {
    expect(eggEquivalent({})).toBeUndefined();
    expect(eggEquivalent({ protein: 3 })).toBeUndefined();
  });
});

describe("householdEquivalents", () => {
  it("returns only what the item publishes, in a fixed order", () => {
    expect(householdEquivalents({ calories: 500, protein: 30, fat: 20, sugar: 12 }).map((e) => e.kind)).toEqual(["sugar", "fat", "protein"]);
    expect(householdEquivalents({ calories: 500, protein: 30 }).map((e) => e.kind)).toEqual(["protein"]);
    expect(householdEquivalents({ calories: 500 })).toEqual([]);
  });
  it("every equivalent carries a basis and an https source we opened", () => {
    for (const e of householdEquivalents({ calories: 800, protein: 40, fat: 40, sugar: 30 })) {
      expect(e.basis.length).toBeGreaterThan(10);
      expect(e.text.startsWith("about ")).toBe(true);
      expect(e.source.url.startsWith("https://")).toBe(true);
      expect(e.source).toBe(HOUSEHOLD_SOURCES[e.kind]);
    }
  });
  it("uses neutral words: no brand, no good or bad (rules 2 and 3)", () => {
    for (const e of householdEquivalents({ calories: 800, protein: 40, fat: 40, sugar: 30 })) {
      expect(`${e.text} ${e.basis}`).not.toMatch(/\b(good|bad|healthy|junk|nando|mcdonald|kfc|big mac)\b/i);
    }
  });
});
