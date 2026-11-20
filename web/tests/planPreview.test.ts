import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetRange, betterCandidate, DEFAULT_SHAPE, mergeCandidates, PER_MEAL_RECIPES, PLAN_DAYS, planCandidates, planForBudget, planSlots, sanitizePlan, slotTargets, type PlanCandidate } from "../lib/mm/mealPlan";
import type { DietPrefs } from "../lib/mm/pantry";
import {
  forgetPlanWork,
  mealTargets,
  PREVIEW_CHUNK,
  previewShop,
  recipesFor,
  savedPlanFrom,
  weekPreview,
  workKey,
  workOut,
  type Loaded,
  type PlanPerson,
  type ShopLoader,
  type Targets,
} from "../lib/mm/planPreview";
import { RECIPES } from "../lib/mm/recipeBook";
import { recipeForDiet } from "../lib/mm/recipes";
import { decodeShopProducts, recipeShops, type ShopFile, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";
import { macroTargets } from "../lib/mm/targets";
import type { AllergenKey } from "../lib/mm/types";

// Step 10's week and Meal plan's shared helpers (the onboarding redesign meeting of 20 November 2026, build list 3): the preview is exactly the week Meal plan's
// first open makes for the same answers, from one shop, worked out in chunks, never throwing, and cached for Meal plan to reuse.

const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
const files = new Map<string, { file: ShopFile; products: ShopProduct[] }>();
const load: ShopLoader = async (id) => {
  if (!files.has(id)) {
    const entry = manifest.retailers.find((r) => r.id === id);
    if (!entry) throw new Error(`no full list for ${id}`);
    const file = JSON.parse(readFileSync(`public/groceries/all/${entry.file}`, "utf8")) as ShopFile;
    files.set(id, { file, products: decodeShopProducts(file) });
  }
  return files.get(id)!;
};
const now = async () => undefined;
const MAINTAIN: PlanPerson = { goal: "maintain", dailyCalories: 2000 };

afterEach(() => forgetPlanWork());

/** Meal plan's own steps for Just me with no saved plan, as app/app/plan/page.tsx runs them: the recipes for the one shop, the slider's range and its starting
 *  point, then "Make my plan" (planForBudget with the one-person better-product step). Built here from the plan library directly, sharing nothing with the preview. */
function mealPlanFirstWeek(loaded: Loaded, diet: DietPrefs, targets: Targets) {
  const slots = planSlots(DEFAULT_SHAPE);
  const cands = mergeCandidates([planCandidates(recipesFor([], diet, []), loaded.products, diet, targets, [], loaded.id, false)]);
  const better = (c: PlanCandidate) => betterCandidate(c, loaded.products, targets[c.meal] ?? null);
  const range = budgetRange(cands, better, slots, PER_MEAL_RECIPES);
  if (!range) return null;
  const pick = Math.min(Math.ceil(range.max), Math.max(Math.floor(range.min), Math.round(range.best)));
  const plan = planForBudget(cands, pick, better, slots, PER_MEAL_RECIPES);
  return plan && { pick, plan };
}

describe("Meal plan's helpers", () => {
  it("sizes each meal from the person's own numbers, under a GLP-1 meal cap (as Meal plan does)", () => {
    expect(mealTargets(MAINTAIN)).toEqual(slotTargets(DEFAULT_SHAPE, { kcal: 2000, protein: macroTargets(MAINTAIN).protein }, null));
    const glp1: PlanPerson = { goal: "glp1", dailyCalories: 1800, dailyProtein: 120, glp1MealCap: 450 };
    const t = mealTargets(glp1);
    expect(t.breakfast?.kcal).toBe(450);
    expect(t).toEqual(slotTargets(DEFAULT_SHAPE, { kcal: 1800, protein: 120 }, 450));
    // a meal size set while the goal isn't GLP-1 changes nothing
    expect(mealTargets({ ...MAINTAIN, glp1MealCap: 300 })).toEqual(mealTargets(MAINTAIN));
  });

  it("keys the worked-out recipes by what the diet has on (false and absent are the same to the recipes)", () => {
    const t = mealTargets(MAINTAIN);
    expect(workKey(["sainsburys"], { veganOnly: true, noPork: false }, t, [])).toBe(workKey(["sainsburys"], { noBeef: false, veganOnly: true }, t, []));
    expect(workKey(["sainsburys"], { avoidAllergens: ["milk", "eggs"] }, t, [])).toBe(workKey(["sainsburys"], { avoidAllergens: ["eggs", "milk"] }, t, []));
    expect(workKey(["sainsburys"], { veganOnly: true }, t, [])).not.toBe(workKey(["sainsburys"], {}, t, []));
  });
});

describe("the shop the week comes from", () => {
  const m: ShopManifest = {
    v: 1,
    retailers: [
      { id: "sainsburys", name: "Sainsbury's", file: "s.json", count: 10, checkedOn: "2026-10-01", sha256: "", nutrition: 10 },
      { id: "morrisons", name: "Morrisons", file: "m.json", count: 10, checkedOn: "2026-10-01", sha256: "", nutrition: 10 },
      { id: "tesco", name: "Tesco", file: "t.json", count: 10, checkedOn: "2026-10-01", sha256: "", nutrition: 10 },
      { id: "lidl", name: "Lidl", file: "l.json", count: 10, checkedOn: "2026-10-01", sha256: "" },
    ],
  };
  it("is the first ticked shop that is in recipes", () => {
    expect(previewShop(m, ["lidl", "morrisons"])).toEqual({ shop: "morrisons", left: null, picked: true });
  });
  it("is the default recipe shop, named, when none ticked is in recipes yet (Tesco's coverage is under the line)", () => {
    expect(previewShop(m, ["tesco", "lidl"])).toEqual({ shop: "sainsburys", left: "tesco", picked: true });
  });
  it("is the default recipe shop when nothing was ticked", () => {
    expect(previewShop(m, [])).toEqual({ shop: "sainsburys", left: null, picked: false });
    expect(previewShop(m, undefined)).toEqual({ shop: "sainsburys", left: null, picked: false });
  });
  it("is unknown while the shops' manifest hasn't loaded", () => {
    expect(previewShop(null, ["sainsburys"])).toEqual({ shop: null, left: null, picked: true });
  });
});

describe("step 10's week", () => {
  it("is Meal plan's first week for the same answers: the same recipes, budget, better products and shopping", async () => {
    const cases: Array<[string, DietPrefs, PlanPerson]> = [
      ["sainsburys", {}, MAINTAIN],
      ["morrisons", { vegetarianOnly: true, avoidAllergens: ["milk"] }, { goal: "lose", dailyCalories: 1600 }],
      ["waitrose", { pescatarianOnly: true }, { goal: "glp1", dailyCalories: 1500, glp1MealCap: 450 }],
    ];
    for (const [shop, diet, person] of cases) {
      const preview = await weekPreview({ shop, diet, person }, { load, yieldToScreen: now });
      const want = mealPlanFirstWeek({ id: shop, ...(await load(shop)) }, diet, mealTargets(person));
      expect(preview.ok, shop).toBe(true);
      if (!preview.ok || !want) throw new Error(`${shop}: no week`);
      expect(preview.budget, shop).toBe(want.pick);
      expect(preview.ids, shop).toEqual(want.plan.ids);
      expect(preview.better, shop).toEqual(want.plan.better);
      expect(preview.total, shop).toBe(want.plan.week.shoppingCost);
      expect(preview.week.days.map((d) => [d.kcal, d.protein, d.cost]), shop).toEqual(want.plan.week.days.map((d) => [d.kcal, d.protein, d.cost]));
      expect(preview.firstDay.map((m) => m.recipeId), shop).toEqual(want.plan.ids[0]);
      expect(preview.firstDay.map((m) => m.meal), shop).toEqual(["breakfast", "lunch", "dinner"]);
    }
  }, 120000);

  it("gives Monday's three meals, the daily average from the recipes' own labels, and the week's shopping", async () => {
    const p = await weekPreview({ shop: "sainsburys", diet: {}, person: MAINTAIN }, { load, yieldToScreen: now });
    if (!p.ok) throw new Error(p.reason);
    expect(p.week.days).toHaveLength(PLAN_DAYS);
    expect(p.firstDay).toEqual(p.week.days[0]!.meals.map((m) => ({ meal: m.meal, recipeId: m.candidate.recipe.id, name: m.candidate.recipe.name })));
    expect(p.average.kcal).toBe(Math.round(p.week.days.reduce((s, d) => s + d.kcal, 0) / PLAN_DAYS));
    expect(p.average.protein).toBe(Math.round(p.week.days.reduce((s, d) => s + d.protein, 0) / PLAN_DAYS));
    expect(p.total).toBe(p.week.shoppingCost);
    expect(p.total).toBeGreaterThan(0);
    expect(p.week.shops).toEqual(["sainsburys"]);
  }, 120000);

  it("leaves Meal plan's cache ready: its first open finds the recipes already worked out", async () => {
    const diet: DietPrefs = { veganOnly: true };
    await weekPreview({ shop: "sainsburys", diet, person: MAINTAIN }, { load, yieldToScreen: now });
    const onShop = vi.fn();
    const loaded = { id: "sainsburys", ...(await load("sainsburys")) };
    // Meal plan's own diet object: the same answers, keys in another order and the "off" ones spelt out
    await workOut([loaded], { noPork: false, veganOnly: true, vegetarianOnly: false } as DietPrefs, mealTargets(MAINTAIN), [], [], onShop, false);
    expect(onShop).not.toHaveBeenCalled();
  }, 120000);

  it("loads only the one shop, and hands control back to the screen between chunks of recipes", async () => {
    const loads = vi.fn(load);
    const pause = vi.fn(now);
    await weekPreview({ shop: "iceland", diet: {}, person: MAINTAIN }, { load: loads, yieldToScreen: pause });
    expect(loads.mock.calls.map((c) => c[0])).toEqual(["iceland"]);
    expect(pause.mock.calls.length).toBeGreaterThanOrEqual(Math.ceil(RECIPES.length / PREVIEW_CHUNK));
  }, 120000);

  it("works nothing out for an age under 18 (the words-only form), and loads nothing", async () => {
    const loads = vi.fn(load);
    expect(await weekPreview({ shop: "sainsburys", diet: {}, person: MAINTAIN, under18: true }, { load: loads })).toEqual({ ok: false, reason: "under18" });
    expect(loads).not.toHaveBeenCalled();
  });

  it("never throws: a shop list that can't load is the words-only form", async () => {
    const offline: ShopLoader = async () => { throw new TypeError("Load failed"); };
    expect(await weekPreview({ shop: "sainsburys", diet: {}, person: MAINTAIN }, { load: offline })).toEqual({ ok: false, reason: "offline" });
  });

  it("stops when called off (a number changed, or the screen was left), and keeps nothing half done", async () => {
    const stop = new AbortController();
    let pauses = 0;
    const pause = async () => { if (++pauses === 3) stop.abort(); };
    expect(await weekPreview({ shop: "sainsburys", diet: {}, person: MAINTAIN }, { load, yieldToScreen: pause, signal: stop.signal })).toEqual({ ok: false, reason: "stopped" });
    const again = await weekPreview({ shop: "sainsburys", diet: {}, person: MAINTAIN }, { load, yieldToScreen: now });
    expect(again.ok).toBe(true);
  }, 120000);

  it("is the words-only form when our recipes can't fill every meal at that shop", async () => {
    const empty: ShopLoader = async () => ({ file: { ...(await load("sainsburys")).file, products: [] }, products: [] });
    expect(await weekPreview({ shop: "nowhere", diet: {}, person: MAINTAIN }, { load: empty, yieldToScreen: now })).toEqual({ ok: false, reason: "noRecipes" });
  });

  it("saves, when made the person's own, exactly what Meal plan saves (and reads back unchanged)", async () => {
    const p = await weekPreview({ shop: "sainsburys", diet: {}, person: MAINTAIN }, { load, yieldToScreen: now });
    if (!p.ok) throw new Error(p.reason);
    const saved = savedPlanFrom(p, "2026-11-20");
    expect(saved).toMatchObject({ shops: ["sainsburys"], ids: p.ids, slots: ["breakfast", "lunch", "dinner"], leaveOut: [], budget: p.budget, start: "2026-11-20", variety: PER_MEAL_RECIPES });
    expect(sanitizePlan(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  }, 120000);
});

// The data test: every goal × diet × common allergen × recipe shop gives a full seven-day week of recipes that suit the diet, or the words-only form.
describe("every goal, diet, allergen and recipe shop", () => {
  const PEOPLE: Record<string, PlanPerson> = {
    lose: { goal: "lose", dailyCalories: 1600 },
    maintain: MAINTAIN,
    buildMuscle: { goal: "buildMuscle", dailyCalories: 2600, dailyProtein: 160 },
    glp1: { goal: "glp1", dailyCalories: 1500, dailyProtein: 110, glp1MealCap: 450 },
    other: { goal: "other", dailyCalories: 2000 },
  };
  const DIETS: Record<string, DietPrefs> = { none: {}, vegan: { veganOnly: true }, vegetarian: { vegetarianOnly: true }, pescatarian: { pescatarianOnly: true }, halal: { halalOnly: true } };
  const ALLERGENS: Array<AllergenKey | null> = [null, "milk", "gluten", "eggs", "peanuts", "nuts"];
  const shops = recipeShops(manifest).map((r) => r.id);

  it("has the recipe shops the meeting counted on", () => {
    expect(shops.length).toBeGreaterThanOrEqual(5);
  });

  for (const shop of shops) {
    it(`${shop}: a full week or the words-only form, and always a full week with no diet`, async () => {
      for (const [goal, person] of Object.entries(PEOPLE)) {
        for (const [dietName, base] of Object.entries(DIETS)) {
          for (const allergen of ALLERGENS) {
            const diet: DietPrefs = allergen ? { ...base, avoidAllergens: [allergen] } : base;
            const label = `${shop}/${goal}/${dietName}/${allergen ?? "none"}`;
            const p = await weekPreview({ shop, diet, person }, { load, yieldToScreen: now });
            if (!p.ok) {
              expect(p.reason, label).toBe("noRecipes");
              expect(dietName === "none" && allergen === null, `${label}: no week with no diet at all`).toBe(false);
              continue;
            }
            expect(p.week.days, label).toHaveLength(PLAN_DAYS);
            expect(p.ids, label).toHaveLength(PLAN_DAYS);
            for (const day of p.week.days) {
              expect(day.meals.map((m) => m.meal), label).toEqual(["breakfast", "lunch", "dinner"]);
              for (const m of day.meals) {
                const recipe = RECIPES.find((r) => r.id === m.candidate.recipe.id);
                expect(recipe, `${label}: ${m.candidate.recipe.id}`).toBeDefined();
                expect(recipeForDiet(recipe!, diet), `${label}: ${recipe!.name} suits the diet`).not.toBeNull();
                expect(m.candidate.shop, label).toBe(shop);
              }
            }
            expect(p.total, label).toBeGreaterThan(0);
          }
        }
      }
    }, 300000);
  }
});
