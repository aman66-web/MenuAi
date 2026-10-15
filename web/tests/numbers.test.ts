import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildNumbersIndex, findRestaurants, fitsLimits, hasLimits, hasMacroLimits, limitsFromParams, limitsToParams, limitWords, type CompactNumbersChain } from "../lib/mm/numbers";
import { buildSearchIndexFromCompact, type CompactSearchChain } from "../lib/mm/search";
import { ALLERGEN_KEYS, NO_PREFERENCES } from "../lib/mm/types";
import { englishT } from "../lib/mm/i18n";

// The search file's allergen letters: "a" + a base-36 bit mask (bit i = ALLERGEN_KEYS[i]).
const mask = (...keys: Array<(typeof ALLERGEN_KEYS)[number]>) => "a" + keys.reduce((m, k) => m | (1 << ALLERGEN_KEYS.indexOf(k)), 0).toString(36);
// Two small restaurants: Alpha publishes everything and an allergen guide (diet letters carry it), Beta publishes calories only.
const alpha: CompactSearchChain = { id: "alpha", name: "Alpha Grill", cuisine: "Grill", aliases: [], sample: false, items: [
  ["wrap", "Chicken wrap", 420, mask("milk")],
  ["salad", "Chicken salad", 310, "a0"],     // a guide that lists no allergens
  ["burger", "Beef burger", 780, "ba0"],
  ["fries", "Fries", 300, "va0"],
  ["salmon", "Salmon fillet", 450],          // no allergen information
] };
const beta: CompactSearchChain = { id: "beta", name: "Beta Cafe", cuisine: "Cafe", aliases: [], sample: false, items: [["cake", "Cake", 350], ["tea", "Tea", 5]] };
const index = buildSearchIndexFromCompact([alpha, beta]);
const nums: CompactNumbersChain[] = [
  { id: "alpha", k: [420, 310, 780, 300, 450], p: [38, 33, 40, 4, 41], c: [30, 12, 50, 40, 5], f: [12, 10, 35, 15, 22] },
  { id: "beta", k: [350, 5], p: [null, null], c: [null, null], f: [null, null] },
];
const numbers = buildNumbersIndex(nums, index);

describe("pairing the numbers file with the search file", () => {
  it("uses a chain's columns only when the item count and every calorie figure agree", () => {
    expect([...numbers.keys()].sort()).toEqual(["alpha", "beta"]);
    expect(buildNumbersIndex([{ ...nums[0]!, k: [420, 310, 780, 300, 451] }], index).size).toBe(0); // one calorie figure differs
    expect(buildNumbersIndex([{ ...nums[0]!, k: [420, 310, 780, 300], p: [1, 2, 3, 4], c: [1, 2, 3, 4], f: [1, 2, 3, 4] }], index).size).toBe(0); // one item short
    expect(buildNumbersIndex([{ id: "gamma", k: [1], p: [1], c: [1], f: [1] }], index).size).toBe(0); // not in the search file
  });
});

describe("findRestaurants", () => {
  it("counts the dishes that fit every number, most first, with the highest-protein dish as the example", () => {
    const r = findRestaurants(index, numbers, { maxCalories: 450, minProtein: 30 }, NO_PREFERENCES);
    expect(r.hits.map((h) => [h.chainId, h.count])).toEqual([["alpha", 3]]); // wrap, salad, salmon
    expect(r.hits[0]!.example).toEqual({ name: "Salmon fillet", calories: 450, protein: 41 });
    expect(r.caloriesOnly).toBe(1); // Beta publishes calories only, so it can't be checked for protein
  });
  it("every number must hold: carbs and fat limits narrow it further", () => {
    expect(findRestaurants(index, numbers, { maxCalories: 450, minProtein: 30, maxFat: 11 }, NO_PREFERENCES).hits[0]!.count).toBe(1); // the salad
    expect(findRestaurants(index, numbers, { minProtein: 30, maxCarbs: 6 }, NO_PREFERENCES).hits[0]!.count).toBe(1); // the salmon
    expect(findRestaurants(index, numbers, { minProtein: 60 }, NO_PREFERENCES).hits).toEqual([]);
  });
  it("calories alone need no numbers file, and calories-only restaurants take part", () => {
    const r = findRestaurants(index, null, { maxCalories: 400 }, NO_PREFERENCES);
    expect(r.hits.map((h) => [h.chainId, h.count])).toEqual([["alpha", 2], ["beta", 2]]); // salad+fries, cake+tea
    expect(r.unchecked).toBe(0);
  });
  it("without the numbers file, asking about protein, carbs or fat checks nothing", () => {
    const r = findRestaurants(index, null, { minProtein: 30 }, NO_PREFERENCES);
    expect(r.hits).toEqual([]);
    expect(r.unchecked).toBe(2);
  });
  it("applies allergies: a dish counts only when its guide lists none of them, and a restaurant without a guide is left out and counted", () => {
    const r = findRestaurants(index, numbers, { maxCalories: 450 }, { ...NO_PREFERENCES, avoidAllergens: ["milk"] });
    expect(r.hits.map((h) => [h.chainId, h.count])).toEqual([["alpha", 2]]); // salad and fries; the wrap contains milk, the salmon has no guide row
    expect(r.noAllergenGuide).toBe(1); // Beta
  });
  it("add-ons are never counted as dishes", () => {
    const withAddOn = buildSearchIndexFromCompact([{ ...alpha, items: [...alpha.items, ["add", "Add chicken", 150]] }]);
    const cols = buildNumbersIndex([{ id: "alpha", k: [420, 310, 780, 300, 450, 150], p: [38, 33, 40, 4, 41, 30], c: [30, 12, 50, 40, 5, 0], f: [12, 10, 35, 15, 22, 3] }], withAddOn);
    expect(findRestaurants(withAddOn, cols, { maxCalories: 200 }, NO_PREFERENCES).hits).toEqual([]);
  });
  it("applies the diet settings too", () => {
    const r = findRestaurants(index, numbers, { minProtein: 30 }, { ...NO_PREFERENCES, vegetarianOnly: true });
    expect(r.hits).toEqual([]); // the only vegetarian dish, the fries, has 4 g
    expect(findRestaurants(index, numbers, { minProtein: 30 }, { ...NO_PREFERENCES, pescatarianOnly: true }).hits[0]!.count).toBe(1); // the salmon
    expect(findRestaurants(index, numbers, { minProtein: 30 }, { ...NO_PREFERENCES, noBeef: true }).hits[0]!.count).toBe(3);
  });
});

describe("a full menu item against the numbers", () => {
  const item = (n: object) => ({ nutrients: { calories: 400, protein: 30, carbs: 40, fat: 10, ...n } });
  it("limits are inclusive and a missing figure never fits a limit on it", () => {
    expect(fitsLimits(item({}), { maxCalories: 400, minProtein: 30, maxCarbs: 40, maxFat: 10 })).toBe(true);
    expect(fitsLimits(item({}), { maxCalories: 399 })).toBe(false);
    expect(fitsLimits(item({ protein: undefined }), { minProtein: 1 })).toBe(false);
    expect(fitsLimits(item({ fat: undefined }), { maxCalories: 500 })).toBe(true);
  });
});

describe("the numbers in a link", () => {
  it("round-trips and ignores nonsense", () => {
    const l = { maxCalories: 600, minProtein: 30, maxFat: 20 };
    const q = limitsToParams(l, ["milk", "eggs"]);
    expect(q).toBe("kcal=600&protein=30&fat=20&avoid=milk%2Ceggs");
    expect(limitsFromParams(new URLSearchParams(q))).toEqual(l);
    expect(limitsFromParams(new URLSearchParams("kcal=abc&protein=-5&carbs=&fat=99999"))).toEqual({});
    expect(limitsToParams({})).toBe("");
  });
  it("says them in a few words", () => {
    expect(limitWords({ maxCalories: 600, minProtein: 30 }, englishT)).toEqual(["up to 600 kcal", "30 g+ protein"]);
    expect(hasLimits({})).toBe(false);
    expect(hasLimits({ maxFat: 0 })).toBe(true);
    expect(hasMacroLimits({ maxCalories: 500 })).toBe(false);
  });
});

describe("the published numbers file (real data)", () => {
  const dir = new URL("../public/menus/", import.meta.url);
  const search = JSON.parse(readFileSync(new URL("menus-search.json", dir), "utf8")) as { chains: CompactSearchChain[] };
  const file = JSON.parse(readFileSync(new URL("menus-numbers.json", dir), "utf8")) as { chains: CompactNumbersChain[] };
  const real = buildSearchIndexFromCompact(search.chains);
  it("lines up with the search file for every chain", () => {
    expect(buildNumbersIndex(file.chains, real).size).toBe(search.chains.length);
  });
  it("finds restaurants, and every example it names really fits", () => {
    const idx = buildNumbersIndex(file.chains, real);
    const limits = { maxCalories: 500, minProtein: 35, maxFat: 20 };
    const r = findRestaurants(real, idx, limits, NO_PREFERENCES);
    expect(r.hits.length).toBeGreaterThan(20);
    for (const h of r.hits.slice(0, 15)) {
      const chain = JSON.parse(readFileSync(new URL(`chain-${h.chainId}.json`, dir), "utf8")) as { items: Array<{ name: string; nutrients: { calories: number; protein?: number; carbs?: number; fat?: number } }> };
      const dish = chain.items.find((i) => i.name === h.example.name && i.nutrients.calories === h.example.calories)!;
      expect(dish, `${h.chainId}: ${h.example.name}`).toBeTruthy();
      expect(fitsLimits(dish, limits)).toBe(true);
      expect(chain.items.filter((i) => fitsLimits(i, limits)).length).toBeGreaterThanOrEqual(h.count); // the file never counts a dish the menu doesn't have
    }
  });
});
