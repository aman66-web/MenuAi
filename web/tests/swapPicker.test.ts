import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { englishT } from "../lib/mm/i18n";
import { planCandidates, styleCandidates, swapChoices, type PlanCandidate, type PlanIds } from "../lib/mm/mealPlan";
import { RECIPES } from "../lib/mm/recipeBook";
import { nicheOf } from "../lib/mm/recipeBook/niches";
import { cuisineOptions } from "../lib/mm/recipeNiche";
import { isMeatFree, isVegan, type MealType, type Recipe } from "../lib/mm/recipes";
import { matchesRecipeSearch, recipeSearchExtras } from "../lib/mm/recipeSearch";
import { decodeShopProducts } from "../lib/mm/shopProducts";
import { filterSwapRows, sortSwapRows, swapCuisines, swapPriceBounds, swapRows, swapSorts, usefulQuickFilters } from "../lib/mm/swapPicker";

// Meal plan's Swap sheet as a small Recipes screen (founder 2026-11-20: "they also should be able to search ... they can choose an item that they want to put in
// instead"): every recipe the plan priced for that meal, found, narrowed and sorted like the Recipes screen's.

const cand = (r: Recipe, o: Partial<PlanCandidate> = {}): PlanCandidate => ({
  shop: "sainsburys", recipe: r, base: r, meal: r.meal!, perServing: { kcal: 600, protein: 30, carbs: 60, fat: 20 }, cost: 2, picks: [], servings: r.servings, distance: 0.1, ...o,
});
const dinners = RECIPES.filter((r) => r.meal === "dinner");
const vegan = dinners.filter(isVegan).slice(0, 2);
const meat = dinners.filter((r) => !isMeatFree(r)).slice(0, 3);
const [v1, v2] = vegan as [Recipe, Recipe];
const [m1, m2, m3] = meat as [Recipe, Recipe, Recipe];
const slots: MealType[] = ["breakfast", "dinner"];
const breakfast = RECIPES.find((r) => r.meal === "breakfast")!;
const list = [
  cand(m1, { distance: 0.05, cost: 3, perServing: { kcal: 600, protein: 45, carbs: 30, fat: 20 } }),
  cand(v1, { distance: 0.1, cost: 1.2, perServing: { kcal: 600, protein: 15, carbs: 90, fat: 15 } }),
  cand(m2, { distance: 0.2, cost: 2.5, perServing: { kcal: 600, protein: 50, carbs: 20, fat: 25 } }),
  cand(v2, { distance: 0.3, cost: 1.8, perServing: { kcal: 600, protein: 20, carbs: 70, fat: 20 } }),
  cand(m3, { distance: 0.4, cost: 4.1, perServing: { kcal: 600, protein: 50, carbs: 50, fat: 10 } }),
];
const cands = new Map<MealType, PlanCandidate[]>([["breakfast", [cand(breakfast)]], ["dinner", list]]);
// three days: m1 tonight (day 0), m2 on day 1, v1 on day 2
const ids: PlanIds = [[breakfast.id, m1.id], [breakfast.id, m2.id], [breakfast.id, v1.id]];

describe("what the Swap sheet lists", () => {
  it("every recipe priced for that meal, not only the first few, except the one there now; the week's others marked In your plan and still listed", () => {
    const rows = swapRows(ids, 0, 1, cands, slots, "balanced");
    expect(rows.map((r) => r.candidate.recipe.id)).toEqual([v1.id, m2.id, v2.id, m3.id]);
    expect(rows.filter((r) => r.inPlan).map((r) => r.candidate.recipe.id)).toEqual([v1.id, m2.id]);
    expect(rows.every((r) => r.fitsStyle)).toBe(true);
  });
  it("never the recipe already in another slot that day: a second snack is never the first again (the 21 November meeting, Kemi)", () => {
    const [s1, s2, s3] = RECIPES.filter((r) => r.meal === "snack").slice(0, 3) as [Recipe, Recipe, Recipe];
    const snackSlots: MealType[] = ["breakfast", "snack", "snack"];
    const snackCands = new Map<MealType, PlanCandidate[]>([["breakfast", [cand(breakfast)]], ["snack", [cand(s1), cand(s2), cand(s3)]]]);
    const week: PlanIds = [[breakfast.id, s1.id, s2.id], [breakfast.id, s3.id, s1.id]];
    // the day's second snack: not s2 (there now), not s1 (the first snack that day); s3 is another day's, so still listed and marked
    const rows = swapRows(week, 0, 2, snackCands, snackSlots, "balanced");
    expect(rows.map((r) => r.candidate.recipe.id)).toEqual([s3.id]);
    expect(rows[0]!.inPlan).toBe(true);
    expect(swapRows(week, 1, 1, snackCands, snackSlots, "balanced").map((r) => r.candidate.recipe.id)).toEqual([s2.id]);
  });
  it("only that slot's meal (a dinner never lists breakfasts), and none the diet leaves out now", () => {
    const rows = swapRows(ids, 0, 1, cands, slots, "balanced", (id) => id !== m3.id);
    expect(rows.some((r) => r.candidate.recipe.id === m3.id)).toBe(false);
    expect(rows.some((r) => r.candidate.meal !== "dinner")).toBe(false);
    expect(swapRows(ids, 0, 5, cands, slots, "balanced")).toEqual([]);
  });
  it("says which are of the plan's style, and lists those first whatever the sort", () => {
    const rows = swapRows(ids, 0, 1, cands, slots, "highProtein");
    expect(rows.filter((r) => r.fitsStyle).map((r) => r.candidate.recipe.id)).toEqual([m2.id, m3.id]);
    expect(sortSwapRows(rows, "price").map((r) => r.candidate.recipe.id)).toEqual([m2.id, m3.id, v1.id, v2.id]);
  });
});

describe("sorting", () => {
  const rows = swapRows(ids, 0, 1, cands, slots, "balanced");
  it("closest to the meal, cheapest, or most protein first", () => {
    expect(sortSwapRows(rows, "fit").map((r) => r.candidate.recipe.id)).toEqual([v1.id, m2.id, v2.id, m3.id]);
    expect(sortSwapRows(rows, "price").map((r) => r.candidate.recipe.id)).toEqual([v1.id, v2.id, m2.id, m3.id]);
    expect(sortSwapRows(rows, "protein").map((r) => r.candidate.recipe.id)).toEqual([m2.id, m3.id, v2.id, v1.id]);
  });
  it("offers Closest fit only when the recipes were fitted to the meal", () => {
    expect(swapSorts(rows)).toEqual(["fit", "price", "protein"]);
    expect(swapSorts(rows.map((r) => ({ ...r, candidate: { ...r.candidate, distance: 0 } })))).toEqual(["price", "protein"]);
  });
});

describe("narrowing", () => {
  const rows = swapRows(ids, 0, 1, cands, slots, "balanced");
  it("by the quick filters, the cuisines, the price range and the search, all together", () => {
    expect(filterSwapRows(rows, { quick: ["vegan"] }).map((r) => r.candidate.recipe.id)).toEqual([v1.id, v2.id]);
    expect(filterSwapRows(rows, { price: { min: 1.5, max: 2.5 } }).map((r) => r.candidate.recipe.id)).toEqual([m2.id, v2.id]);
    expect(filterSwapRows(rows, { quick: ["vegan"], price: { min: 1.5, max: 2.5 } }).map((r) => r.candidate.recipe.id)).toEqual([v2.id]);
    expect(filterSwapRows(rows, { matches: (c) => c.recipe.id === m3.id }).map((r) => r.candidate.recipe.id)).toEqual([m3.id]);
    const cuisine = nicheOf(m2.id).cuisine;
    if (cuisine) expect(filterSwapRows(rows, { cuisines: [cuisine] }).every((r) => nicheOf(r.candidate.recipe.id).cuisine === cuisine)).toBe(true);
    expect(filterSwapRows(rows, {})).toEqual(rows);
  });
  it("offers a quick filter only when it keeps some but not all; a cuisine field only for two cuisines or more", () => {
    expect(usefulQuickFilters(rows, ["vegan", "meatFree"])).toEqual(["vegan", "meatFree"]);
    expect(usefulQuickFilters(rows.filter((r) => isVegan(r.candidate.recipe)), ["vegan", "meatFree"])).toEqual([]);
    const options = cuisineOptions(RECIPES.map((r) => r.id));
    const one = rows.filter((r) => nicheOf(r.candidate.recipe.id).cuisine === nicheOf(rows[0]!.candidate.recipe.id).cuisine).slice(0, 1);
    expect(swapCuisines(one, options)).toEqual([]);
  });
  it("the Serving price field's default range is the rows' cheapest and dearest, to the 10p", () => {
    expect(swapPriceBounds(rows)).toEqual({ min: 1.2, max: 4.1 });
    expect(swapPriceBounds([])).toBeNull();
  });
});

describe("on Sainsbury's real list", () => {
  const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
  const real = styleCandidates(planCandidates(RECIPES, products, {}, { breakfast: { kcal: 500 }, lunch: { kcal: 600 }, dinner: { kcal: 700 } }, []), "balanced");
  const dinnerIds = real.get("dinner")!.map((c) => c.recipe.id);
  const week: PlanIds = Array.from({ length: 7 }, (_, d) => ["breakfast", "lunch", "dinner"].map((m) => real.get(m as MealType)![d % 4]!.recipe.id));
  const rows = swapRows(week, 0, 2, real, ["breakfast", "lunch", "dinner"], "balanced");
  it("lists every dinner but tonight's, many more than the ten the sheet showed before", () => {
    expect(rows.length).toBe(dinnerIds.length - 1);
    expect(rows.length).toBeGreaterThan(swapChoices(week, 0, 2, real, 10, ["breakfast", "lunch", "dinner"]).length);
    expect(rows.filter((r) => r.inPlan).length).toBe(3);
  });
  it("a word typed narrows the list to recipes with it; the cuisines come in several kinds", () => {
    const offered = { cuisines: cuisineOptions(RECIPES.map((r) => r.id)), occasions: [] };
    const found = filterSwapRows(rows, { matches: (c) => matchesRecipeSearch(c.recipe, "chicken", englishT, offered, recipeSearchExtras(c.recipe, c.perServing, englishT)) });
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThan(rows.length);
    expect(found.every((r) => /chicken/i.test(r.candidate.recipe.name + r.candidate.recipe.ingredients.map((i) => i.label).join(" ")))).toBe(true);
    expect(swapCuisines(rows, offered.cuisines).length).toBeGreaterThan(1);
  });
});

// The Swap sheet as full as Recipes (founder 2026-11-21: "when they swap the meal, it should be the same customization as the recipe screen ... you can
// completely filter exactly what you want"): the meal's numbers, its main, what to leave out, and what the week has already.
import { hasAvoid, swapMainCounts, swapMainOf, usefulAvoids, usefulExtras } from "../lib/mm/swapPicker";
describe("the swap sheet's other filters", () => {
  const byId = (id: string) => RECIPES.find((r) => r.id === id)!;
  const korma = cand(byId("chicken-korma-style-curry"), { perServing: { kcal: 600, protein: 50, carbs: 40, fat: 20 } });
  const noodles = cand(byId("salmon-noodles"), { perServing: { kcal: 600, protein: 25, carbs: 80, fat: 10 } });
  const mac = cand(byId("easy-macaroni-cheese"), { perServing: { kcal: 600, protein: 25, carbs: 70, fat: 28 } });
  const wraps = cand(byId("egg-mayonnaise-wraps"), { perServing: { kcal: 600, protein: 30, carbs: 50, fat: 30 } });
  const rows = [korma, noodles, mac, wraps].map((c, i) => ({ candidate: c, inPlan: i === 0, fitsStyle: true }));
  it("narrows by what it is mainly made of, and counts each", () => {
    expect(swapMainOf(korma)).toBe("chicken");
    expect(swapMainOf(noodles)).toBe("fish");
    expect(filterSwapRows(rows, { mains: ["fish", "chicken"] }).map((r) => r.candidate.recipe.id)).toEqual(["chicken-korma-style-curry", "salmon-noodles"]);
    expect(swapMainCounts(rows).get("chicken")).toBe(1);
  });
  it("leaves out eggs, cheese or bread, and offers only what some have", () => {
    expect(hasAvoid(wraps, "bread")).toBe(true);
    expect(hasAvoid(wraps, "eggs")).toBe(true);
    expect(hasAvoid(mac, "cheese")).toBe(true);
    expect(filterSwapRows(rows, { avoid: ["bread", "cheese"] }).map((r) => r.candidate.recipe.id)).toEqual(["chicken-korma-style-curry", "salmon-noodles"]);
    expect(usefulAvoids(rows)).toEqual(expect.arrayContaining(["eggs", "cheese", "bread"]));
  });
  it("shows high protein (a third of the calories from protein) or not in the plan yet", () => {
    expect(filterSwapRows(rows, { extras: ["highProtein"] }).map((r) => r.candidate.recipe.id)).toContain("chicken-korma-style-curry");
    expect(filterSwapRows(rows, { extras: ["highProtein"] }).map((r) => r.candidate.recipe.id)).not.toContain("salmon-noodles");
    expect(filterSwapRows(rows, { extras: ["notInPlan"] }).map((r) => r.candidate.recipe.id)).not.toContain("chicken-korma-style-curry");
    expect(usefulExtras(rows)).toContain("notInPlan");
  });
});
