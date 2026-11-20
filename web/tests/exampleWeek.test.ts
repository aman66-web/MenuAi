import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { EXAMPLE_DAYS, EXAMPLE_MEALS, exampleWeek, forgetExamples, knownExample, pricedExampleWeek, shopExample } from "../lib/mm/exampleWeek";
import { PER_MEAL_RECIPES, PLAN_MEALS, planCandidates, weekCosts } from "../lib/mm/mealPlan";
import { forgetPlanWork, type ShopLoader } from "../lib/mm/planPreview";
import { RECIPES } from "../lib/mm/recipeBook";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { recipeForDiet } from "../lib/mm/recipes";
import { decodeShopProducts, type ShopFile, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";

const byId = new Map(RECIPES.map((r) => [r.id, r]));

describe("Your plan's example week (never worked out: founder 2026-11-20)", () => {
  it("is seven days of breakfast, lunch and dinner, each one of our recipes with a picture, and the days differ", () => {
    const week = exampleWeek({});
    expect(week).toHaveLength(EXAMPLE_DAYS);
    for (const day of week) {
      expect(day.meals.map((m) => m.meal)).toEqual(["breakfast", "lunch", "dinner"]);
      for (const m of day.meals) {
        expect(RECIPE_IMAGES[m.recipeId], m.recipeId).toBeTruthy();
        expect(byId.get(m.recipeId)!.meal).toBe(m.meal);
      }
    }
    // like a real plan: each meal from PER_MEAL_RECIPES dishes, each at most twice in the week
    for (const meal of ["breakfast", "lunch", "dinner"] as const) {
      const ids = week.map((d) => d.meals.find((m) => m.meal === meal)!.recipeId);
      expect(new Set(ids).size, meal).toBe(PER_MEAL_RECIPES);
      for (const id of new Set(ids)) expect(ids.filter((x) => x === id).length, id).toBeLessThanOrEqual(2);
    }
  });

  it("only shows recipes that suit the diet and allergies as written", () => {
    for (const diet of [{ veganOnly: true }, { vegetarianOnly: true }, { pescatarianOnly: true }, { avoidAllergens: ["milk", "gluten"] as const }, { noPork: true, avoidAllergens: ["eggs"] as const }]) {
      for (const day of exampleWeek(diet)) {
        for (const m of day.meals) expect(recipeForDiet(byId.get(m.recipeId)!, diet), `${JSON.stringify(diet)} ${m.recipeId}`).not.toBeNull();
      }
    }
  });

  it("is the same week every time for the same diet (nothing random, nothing from the person's numbers)", () => {
    expect(exampleWeek({ veganOnly: true })).toEqual(exampleWeek({ veganOnly: true }));
  });
});

// Its price (founder 2026-11-20, "week one cost and then the week afterwards costs"): the same example chosen from only what the person's shop can make, its
// shopping added up as Meal plan adds it up.
const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
const files = new Map<string, { file: ShopFile; products: ShopProduct[] }>();
let loads = 0;
const load: ShopLoader = async (id) => {
  loads++;
  if (!files.has(id)) {
    const entry = manifest.retailers.find((r) => r.id === id);
    if (!entry) throw new Error(`no full list for ${id}`);
    const file = JSON.parse(readFileSync(`public/groceries/all/${entry.file}`, "utf8")) as ShopFile;
    files.set(id, { file, products: decodeShopProducts(file) });
  }
  return files.get(id)!;
};
const now = async () => undefined;

describe("the example week priced at the person's shop", () => {
  afterEach(() => { forgetExamples(); forgetPlanWork(); });

  it("chooses only from the recipes a shop can make, with the same spread, in the book's order", () => {
    const canMake = new Set(RECIPES.filter((_, i) => i % 3 !== 0).map((r) => r.id));
    const week = exampleWeek({}, RECIPES, RECIPE_IMAGES, (_, id) => canMake.has(id));
    for (const d of week) for (const m of d.meals) expect(canMake.has(m.recipeId), m.recipeId).toBe(true);
    // every recipe the shop can make: the book's own example
    expect(exampleWeek({}, RECIPES, RECIPE_IMAGES, () => true)).toEqual(exampleWeek({}));
  });

  it("at Sainsbury's: seven days of three meals it can make, its shopping as Meal plan builds it, and later weeks cost less", async () => {
    const sainsburys = await load("sainsburys");
    for (const diet of [{}, { veganOnly: true }, { avoidAllergens: ["peanuts"] as const }]) {
      const cands = planCandidates(RECIPES, sainsburys.products, diet, Object.fromEntries(PLAN_MEALS.map((m) => [m, { kcal: 0 }])), [], "sainsburys", true);
      const p = pricedExampleWeek(diet, cands)!;
      expect(p, JSON.stringify(diet)).not.toBeNull();
      expect(p.days).toHaveLength(EXAMPLE_DAYS);
      p.days.forEach((d, i) => {
        expect(d.meals.map((m) => m.meal)).toEqual([...EXAMPLE_MEALS]);
        expect(p.ids[i]).toEqual(d.meals.map((m) => m.recipeId));
        for (const m of d.meals) {
          expect(cands.get(m.meal)!.some((c) => c.recipe.id === m.recipeId), m.recipeId).toBe(true);
          expect(recipeForDiet(byId.get(m.recipeId)!, diet)).not.toBeNull();
        }
      });
      // one serving of each meal, as written: the shopping is the week's whole packs at the shop's prices
      expect(p.week.days).toHaveLength(EXAMPLE_DAYS);
      expect(p.costs).toEqual(weekCosts(p.week));
      expect(p.costs.first).toBe(p.week.shoppingCost);
      expect(p.costs.first - p.costs.after, JSON.stringify(p.costs)).toBeGreaterThanOrEqual(1);
    }
  });

  it("is null when the shop can't make one of the meals (the screen shows the book's example, no price)", async () => {
    const sainsburys = await load("sainsburys");
    const cands = planCandidates(RECIPES, sainsburys.products, {}, Object.fromEntries(PLAN_MEALS.map((m) => [m, { kcal: 0 }])), [], "sainsburys", true);
    cands.set("breakfast", []);
    expect(pricedExampleWeek({}, cands)).toBeNull();
  });

  it("is worked out once per shop and diet, never throws, and offline is tried again next time", async () => {
    expect(knownExample("sainsburys", {})).toBeUndefined();
    const a = await shopExample("sainsburys", {}, { load, yieldToScreen: now });
    expect(a?.shop).toBe("sainsburys");
    expect(a?.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(knownExample("sainsburys", {})).toBe(a);
    const before = loads;
    expect(await shopExample("sainsburys", { vegetarianOnly: false }, { load, yieldToScreen: now })).toBe(a); // false and absent are the same diet
    expect(loads).toBe(before);
    const offline: ShopLoader = async () => { throw new Error("offline"); };
    expect(await shopExample("morrisons", {}, { load: offline, yieldToScreen: now })).toBeNull();
    expect(knownExample("morrisons", {})).toBeUndefined();
  });
});
