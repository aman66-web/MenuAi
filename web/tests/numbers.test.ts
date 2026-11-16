import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildNumbersIndex, findRestaurants, finderEmptyHint, fitsLimits, hasLimits, hasMacroLimits, limitsFromParams, limitsToParams, limitWords, macrosLookup, toAsciiDigits, type CompactNumbersChain } from "../lib/mm/numbers";
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

describe("the example dish at a restaurant whose dishes have no protein figure", () => {
  // Gamma publishes calories only: water, a cracker, a soup, a pie and a roast. Picking "the most protein, then the fewest calories" would always show the water.
  const gamma: CompactSearchChain = { id: "gamma", name: "Gamma Inn", cuisine: "Pub", aliases: [], sample: false, items: [
    ["water", "Still water", 0], ["cracker", "Cracker", 40], ["soup", "Tomato soup", 230], ["pie", "Steak pie", 610], ["roast", "Sunday roast", 900],
  ] };
  const gIndex = buildSearchIndexFromCompact([gamma]);
  const gNumbers = buildNumbersIndex([{ id: "gamma", k: [0, 40, 230, 610, 900], p: [null, null, null, null, null], c: [null, null, null, null, null], f: [null, null, null, null, null] }], gIndex);
  const example = (limits: object, opts?: { mealKcal?: number | null }, numbers: typeof gNumbers | null = gNumbers) =>
    findRestaurants(gIndex, numbers, limits, NO_PREFERENCES, opts).hits[0]?.example.name;
  it("is the dish closest to the calorie limit typed in", () => {
    expect(example({ maxCalories: 650 })).toBe("Steak pie");
    expect(example({ maxCalories: 300 })).toBe("Tomato soup");
    expect(example({ maxCalories: 650 }, { mealKcal: 200 })).toBe("Steak pie"); // the typed limit wins over the meal size
  });
  it("with no calorie limit, is the dish closest to the person's meal size", () => {
    expect(example({}, { mealKcal: 600 })).toBe("Steak pie");
    expect(example({}, { mealKcal: 250 })).toBe("Tomato soup");
    expect(example({}, { mealKcal: 1000 })).toBe("Sunday roast");
  });
  it("on a tie, is the one with fewer calories", () => {
    expect(example({}, { mealKcal: 420 })).toBe("Tomato soup"); // 230 and 610 are both 190 away
  });
  it("with nothing to aim at, is the dish with the fewest calories, as before", () => {
    expect(example({})).toBe("Still water");
    expect(example({}, { mealKcal: null })).toBe("Still water");
  });
  it("also before the numbers file has arrived (calories alone need none), and it changes no count", () => {
    expect(example({ maxCalories: 650 }, undefined, null)).toBe("Steak pie");
    expect(findRestaurants(gIndex, null, { maxCalories: 650 }, NO_PREFERENCES).hits[0]?.count).toBe(4);
  });
  it("leaves the protein rule alone wherever a dish has a protein figure", () => {
    // the first findRestaurants test above: the salmon (41 g) is still the example with a meal size given
    expect(findRestaurants(index, numbers, { maxCalories: 450, minProtein: 30 }, NO_PREFERENCES, { mealKcal: 300 }).hits[0]!.example).toEqual({ name: "Salmon fillet", calories: 450, protein: 41 });
    // a dish with a protein figure beats one without, wherever its calories are
    const mixed = buildSearchIndexFromCompact([{ ...gamma, items: [["water", "Still water", 0], ["pie", "Steak pie", 610], ["tea", "Tea", 5]] }]);
    const cols = buildNumbersIndex([{ id: "gamma", k: [0, 610, 5], p: [null, null, 0.2], c: [null, null, 0.4], f: [null, null, 0.1] }], mixed);
    expect(findRestaurants(mixed, cols, { maxCalories: 650 }, NO_PREFERENCES, { mealKcal: 600 }).hits[0]?.example).toEqual({ name: "Tea", calories: 5, protein: 0.2 });
  });
});

describe("the hint when nothing fits", () => {
  it("names only what was set, in the boxes' order, then the allergies", () => {
    expect(finderEmptyHint({ maxCalories: 5 }, false, englishT)).toBe("Try a higher calorie limit.");
    expect(finderEmptyHint({ minProtein: 60 }, false, englishT)).toBe("Try a lower protein.");
    expect(finderEmptyHint({ maxCalories: 5, minProtein: 60 }, false, englishT)).toBe("Try a higher calorie limit or a lower protein.");
    expect(finderEmptyHint({ maxCarbs: 2 }, true, englishT)).toBe("Try a higher carbs limit or fewer allergies.");
    expect(finderEmptyHint({ maxCalories: 5, minProtein: 60 }, true, englishT)).toBe("Try a higher calorie limit, a lower protein or fewer allergies.");
    expect(finderEmptyHint({ maxCalories: 5, minProtein: 60, maxFat: 1 }, true, englishT)).toBe("Try a higher calorie limit, a lower protein, a higher fat limit or fewer allergies.");
    expect(finderEmptyHint({ maxCalories: 5, minProtein: 60, maxCarbs: 2, maxFat: 1 }, true, englishT)).toBe("Try a higher calorie limit, a lower protein, a higher carbs limit, a higher fat limit or fewer allergies.");
    expect(finderEmptyHint({}, true, englishT)).toBe("Try fewer allergies.");
    expect(finderEmptyHint({ maxFat: 0 }, false, englishT)).toBe("Try a higher fat limit."); // 0 is a limit too
  });
  it("with nothing typed and no allergies, points to the type of restaurant and the diet", () => {
    expect(finderEmptyHint({}, false, englishT)).toBe("Try another type of restaurant, or change your diet in Settings.");
  });
  it("hands each piece and the sentence to the translator as whole keys", () => {
    const seen: string[] = [];
    const spy = (english: string, vars?: Record<string, string | number>) => { seen.push(english); return englishT(english, vars); };
    finderEmptyHint({ maxCalories: 5, minProtein: 60 }, true, spy);
    expect(seen).toEqual(["a higher calorie limit", "a lower protein", "fewer allergies", "Try {a}, {b} or {c}."]);
  });
});

describe("which dishes publish protein, carbs and fat (the numbers file, item by item)", () => {
  it("says yes, no, or doesn't know", () => {
    const has = macrosLookup(index, numbers);
    expect(has("alpha", "wrap")).toBe(true);
    expect(has("beta", "cake")).toBe(false);
    expect(has("alpha", "nope")).toBe(null); // not on the menu
    expect(has("gamma", "x")).toBe(null); // no such restaurant
    expect(macrosLookup(index, null)("alpha", "wrap")).toBe(null); // the numbers file hasn't arrived
  });
  it("is no for a dish missing any one of the three, at a restaurant that publishes everything else", () => {
    const mixed = buildNumbersIndex([{ id: "alpha", k: [420, 310, 780, 300, 450], p: [38, null, 40, 4, 41], c: [30, 12, null, 40, 5], f: [12, 10, 35, null, 22] }, nums[1]!], index);
    const has = macrosLookup(index, mixed);
    expect(["wrap", "salad", "burger", "fries", "salmon"].map((id) => has("alpha", id))).toEqual([true, false, false, false, true]);
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

describe("digits in other numeral systems", () => {
  it("become plain 0-9, so a number pad or keyboard set to Arabic, Urdu, Bengali, Punjabi or Gujarati still works", () => {
    for (const typed of ["٦٠٠", "۶۰۰", "৬০০", "੬੦੦", "૬૦૦", "600"]) expect(toAsciiDigits(typed), typed).toBe("600");
    expect(toAsciiDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toAsciiDigits("৯৮৭")).toBe("987");
    expect(toAsciiDigits("1٢3")).toBe("123"); // mixed
  });
  it("leave letters and signs alone (the box drops them afterwards)", () => {
    expect(toAsciiDigits("a-5 g")).toBe("a-5 g");
    expect(toAsciiDigits("")).toBe("");
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
  it("holds, for every chain, exactly the calories, protein, carbs and fat of its published file, item for item", () => {
    for (const nc of file.chains) {
      const chain = JSON.parse(readFileSync(new URL(`chain-${nc.id}.json`, dir), "utf8")) as { items: Array<{ nutrients: { calories: number; protein?: number; carbs?: number; fat?: number } }> };
      expect(nc.k, `${nc.id} calories`).toEqual(chain.items.map((i) => i.nutrients.calories));
      expect(nc.p, `${nc.id} protein`).toEqual(chain.items.map((i) => i.nutrients.protein ?? null));
      expect(nc.c, `${nc.id} carbs`).toEqual(chain.items.map((i) => i.nutrients.carbs ?? null));
      expect(nc.f, `${nc.id} fat`).toEqual(chain.items.map((i) => i.nutrients.fat ?? null));
    }
  });
  it("knows the dishes of a full-nutrition restaurant that publish calories only (Tenpin), and only those", () => {
    const idx = buildNumbersIndex(file.chains, real);
    const has = macrosLookup(real, idx);
    for (const id of ["tenpin", "chozen", "social-pub-and-kitchen"]) {
      const chain = JSON.parse(readFileSync(new URL(`chain-${id}.json`, dir), "utf8")) as { items: Array<{ id: string; nutrients: { protein?: number; carbs?: number; fat?: number } }> };
      for (const it of chain.items) expect(has(id, it.id), `${id}/${it.id}`).toBe(it.nutrients.protein !== undefined && it.nutrients.carbs !== undefined && it.nutrients.fat !== undefined);
      expect(chain.items.some((it) => has(id, it.id) === false), `${id} has a calories-only dish`).toBe(true);
    }
  });
  it("finds restaurants, and every example it names really fits", () => {
    const idx = buildNumbersIndex(file.chains, real);
    const limits = { maxCalories: 500, minProtein: 35, maxCarbs: 60, maxFat: 20 };
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
