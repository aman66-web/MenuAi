import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetRange, betterCandidate, DEFAULT_SHAPE, mergeCandidates, PER_MEAL_RECIPES, PLAN_DAYS, planCandidates, planForBudget, planSlots, sanitizePlan, slotTargets, type PlanCandidate } from "../lib/mm/mealPlan";
import type { DietPrefs } from "../lib/mm/pantry";
import {
  forgetPlanWork,
  mealTargets,
  NARROW_PREVIEW,
  pickShownDay,
  PREVIEW_CHUNK,
  previewShop,
  recipesFor,
  savedPlanFrom,
  SHOW_GAP,
  weekGap,
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

/** Meal plan's own steps for Just me with no saved plan, as app/app/plan/page.tsx runs them: the recipes for the one shop, then the first open's "Make my plan",
 *  which starts at "No budget: the best week for your goal" (planForBudget with none). Built here from the plan library directly, sharing nothing with the preview. */
function mealPlanFirstWeek(loaded: Loaded, diet: DietPrefs, targets: Targets) {
  const slots = planSlots(DEFAULT_SHAPE);
  const cands = mergeCandidates([planCandidates(recipesFor([], diet, []), loaded.products, diet, targets, [], loaded.id, false)]);
  const better = (c: PlanCandidate) => betterCandidate(c, loaded.products, targets[c.meal] ?? null);
  const plan = planForBudget(cands, null, better, slots, PER_MEAL_RECIPES);
  return plan && { plan, range: budgetRange(cands, better, slots, PER_MEAL_RECIPES) };
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
    expect(previewShop(m, ["lidl", "morrisons"])).toEqual({ shop: "morrisons", left: null, leftAll: [], picked: true });
  });
  it("is the default recipe shop, naming every ticked shop, when none ticked is in recipes yet (Tesco's coverage is under the line)", () => {
    expect(previewShop(m, ["tesco", "lidl"])).toEqual({ shop: "sainsburys", left: "tesco", leftAll: ["tesco", "lidl"], picked: true });
    expect(previewShop(m, ["lidl"])).toEqual({ shop: "sainsburys", left: "lidl", leftAll: ["lidl"], picked: true });
  });
  it("is the default recipe shop when nothing was ticked", () => {
    expect(previewShop(m, [])).toEqual({ shop: "sainsburys", left: null, leftAll: [], picked: false });
    expect(previewShop(m, undefined)).toEqual({ shop: "sainsburys", left: null, leftAll: [], picked: false });
  });
  it("is unknown while the shops' manifest hasn't loaded", () => {
    expect(previewShop(null, ["sainsburys"])).toEqual({ shop: null, left: null, leftAll: [], picked: true });
  });
});

describe("step 10's week", () => {
  it("is Meal plan's first week for the same answers: the same recipes, no budget, the same shopping", async () => {
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
      expect(preview.budget, shop).toBeNull();
      expect(preview.ids, shop).toEqual(want.plan.ids);
      expect(preview.better, shop).toEqual(want.plan.better);
      expect(preview.total, shop).toBe(want.plan.week.shoppingCost);
      expect(preview.week.days.map((d) => [d.kcal, d.protein, d.cost]), shop).toEqual(want.plan.week.days.map((d) => [d.kcal, d.protein, d.cost]));
      expect(preview.firstDay.map((m) => m.recipeId), shop).toEqual(want.plan.ids[preview.day]);
      expect(preview.firstDay.map((m) => m.meal), shop).toEqual(["breakfast", "lunch", "dinner"]);
    }
  }, 120000);

  it("is the same week even when the best week's bill has under 50p in it (rounding the bill down once made a cheaper, different week: 'not bait')", async () => {
    // Sainsbury's at 900 kcal and at 4,000 kcal were the meeting's cases; the shelf prices change as the shop's list is read again, so the calories are
    // stepped until a week's bill has under 50p in it, checking that the preview and the plan agree at every step on the way
    let checked = 0;
    const loaded = { id: "sainsburys", ...(await load("sainsburys")) };
    for (let dailyCalories = 900; dailyCalories <= 4000 && checked < 2; dailyCalories += 150) {
      const person: PlanPerson = { goal: "lose", dailyCalories };
      const want = mealPlanFirstWeek(loaded, {}, mealTargets(person));
      if (!want) continue;
      const pence = Math.round((want.plan.week.shoppingCost % 1) * 100);
      const preview = await weekPreview({ shop: "sainsburys", diet: {}, person }, { load, yieldToScreen: now });
      if (!preview.ok) { expect(preview.reason).toBe("narrow"); continue; }
      expect(preview.ids, `${dailyCalories} kcal`).toEqual(want.plan.ids);
      expect(preview.total, `${dailyCalories} kcal`).toBe(want.plan.week.shoppingCost);
      if (pence < 50) checked++;
    }
    expect(checked, "at least one case with a bill whose pence are under 50").toBeGreaterThan(0);
  }, 240000);

  it("gives one day's three meals, the daily average from the recipes' own labels, the week's shopping and the day its prices were read", async () => {
    const p = await weekPreview({ shop: "sainsburys", diet: {}, person: MAINTAIN }, { load, yieldToScreen: now });
    if (!p.ok) throw new Error(p.reason);
    expect(p.week.days).toHaveLength(PLAN_DAYS);
    expect(p.day).toBe(pickShownDay(p.week.days));
    expect(p.firstDay).toEqual(p.week.days[p.day]!.meals.map((m) => ({ meal: m.meal, recipeId: m.candidate.recipe.id, name: m.candidate.recipe.name })));
    expect(p.checkedOn).toBe((await load("sainsburys")).file.checkedOn);
    expect(p.average.kcal).toBe(Math.round(p.week.days.reduce((s, d) => s + d.kcal, 0) / PLAN_DAYS));
    expect(p.average.protein).toBe(Math.round(p.week.days.reduce((s, d) => s + d.protein, 0) / PLAN_DAYS));
    expect(p.total).toBe(p.week.shoppingCost);
    expect(p.total).toBeGreaterThan(0);
    expect(p.week.shops).toEqual(["sainsburys"]);
    // all seven days for the welcome screens' picture timetable, each with its own calories and protein
    expect(p.days).toHaveLength(PLAN_DAYS);
    expect(p.days.map((d) => d.kcal)).toEqual(p.week.days.map((d) => Math.round(d.kcal)));
    expect(p.days.map((d) => d.meals.map((m) => m.recipeId))).toEqual(p.week.days.map((d) => d.meals.map((m) => m.candidate.recipe.id)));
    expect(p.days[p.day]!.meals).toEqual(p.firstDay);
    expect(p.sizedTo).toBe(planSlots(DEFAULT_SHAPE).reduce((t, m) => t + (mealTargets(MAINTAIN)[m]?.kcal ?? 0), 0));
    expect(p.narrow).toBeUndefined();
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

  it("saves, when made the person's own, exactly what Meal plan saves (no budget, the diet it was made for), and reads back unchanged", async () => {
    const p = await weekPreview({ shop: "sainsburys", diet: { vegetarianOnly: true, noPork: false, avoidAllergens: ["milk"] }, person: MAINTAIN }, { load, yieldToScreen: now });
    if (!p.ok) throw new Error(p.reason);
    const saved = savedPlanFrom(p, "2026-11-20");
    expect(saved).toMatchObject({ shops: ["sainsburys"], ids: p.ids, slots: ["breakfast", "lunch", "dinner"], leaveOut: [], budget: null, start: "2026-11-20", variety: PER_MEAL_RECIPES, diet: { vegetarianOnly: true, avoidAllergens: ["milk"] } });
    expect(sanitizePlan(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  }, 120000);

  it("isn't shown as sized to your numbers when its days come out far from them (the words-only form)", async () => {
    // a goal far above what our recipes reach: the days come in well under, so the preview says so rather than showing a week that isn't sized to it
    const p = await weekPreview({ shop: "sainsburys", diet: {}, person: { goal: "buildMuscle", dailyCalories: 6000 } }, { load, yieldToScreen: now });
    expect(p).toEqual({ ok: false, reason: "narrow" });
    // asked again, it answers at once from what it found
    const again = await weekPreview({ shop: "sainsburys", diet: {}, person: { goal: "buildMuscle", dailyCalories: 6000 } }, { load: async () => { throw new Error("not loaded again"); }, yieldToScreen: now });
    expect(again).toEqual({ ok: false, reason: "narrow" });
    expect(NARROW_PREVIEW).toBeGreaterThan(0);
  }, 120000);

  it("comes back anyway, marked and with its real numbers, for the welcome screens (keepNarrow: founder, 20 November 2026, \"never hide it\")", async () => {
    const person: PlanPerson = { goal: "buildMuscle", dailyCalories: 6000 };
    const p = await weekPreview({ shop: "sainsburys", diet: {}, person }, { load, yieldToScreen: now, keepNarrow: true });
    if (!p.ok) throw new Error(p.reason);
    expect(p.narrow).toBe(true);
    expect(p.average.kcal).toBeLessThan(6000 * (1 - NARROW_PREVIEW));
    expect(weekGap(p)).toEqual({ kind: "short", kcal: p.average.kcal });
    // Meal plan's first open, asked next, still hears "narrow" (its words-only form is unchanged)
    expect(await weekPreview({ shop: "sainsburys", diet: {}, person }, { load, yieldToScreen: now })).toEqual({ ok: false, reason: "narrow" });
    // and the welcome screens, asked again, get the same week at once
    expect(await weekPreview({ shop: "sainsburys", diet: {}, person }, { load: async () => { throw new Error("not loaded again"); }, yieldToScreen: now, keepNarrow: true })).toEqual(p);
  }, 120000);

  it("falls short on a big day because each recipe stretches only so far (the founder's 3,480 kcal day: about 2,830)", async () => {
    // a third of the day a meal (equal meals), and a recipe's protein and carb ingredients move at most to double (lib/mm/recipes.ts fitRecipe): no breakfast
    // reaches 1,160 kcal, so the day can't add up to 3,480; the welcome screens show the week with one line saying so
    const person: PlanPerson = { goal: "buildMuscle", dailyCalories: 3480, dailyProtein: 175 };
    const targets = mealTargets(person);
    expect(targets.breakfast?.kcal).toBe(1160);
    const { products } = await load("sainsburys");
    const cands = planCandidates(recipesFor([], {}, []), products, {}, targets, [], "sainsburys", false);
    const biggest = Math.max(...(cands.get("breakfast") ?? []).map((c) => c.perServing.kcal));
    expect(biggest).toBeLessThan(1160);
    const p = await weekPreview({ shop: "sainsburys", diet: {}, person }, { load, yieldToScreen: now, keepNarrow: true });
    if (!p.ok) throw new Error(p.reason);
    expect(p.average.kcal).toBeLessThan(3480 * 0.9);
    expect(weekGap(p)?.kind).toBe("short");
  }, 120000);
});

describe("how far the week is from the numbers (weekGap)", () => {
  it("says nothing within SHOW_GAP of the day the meals are sized to, and short or over beyond it", () => {
    expect(SHOW_GAP).toBe(0.05);
    expect(weekGap({ average: { kcal: 2000 }, sizedTo: 2000 })).toBeNull();
    expect(weekGap({ average: { kcal: 1900 }, sizedTo: 2000 })).toBeNull();
    expect(weekGap({ average: { kcal: 2100 }, sizedTo: 2000 })).toBeNull();
    expect(weekGap({ average: { kcal: 1899 }, sizedTo: 2000 })).toEqual({ kind: "short", kcal: 1899 });
    expect(weekGap({ average: { kcal: 2825 }, sizedTo: 3480 })).toEqual({ kind: "short", kcal: 2825 });
    expect(weekGap({ average: { kcal: 1400 }, sizedTo: 1200 })).toEqual({ kind: "over", kcal: 1400 });
    expect(weekGap({ average: { kcal: 1400 }, sizedTo: 0 })).toBeNull();
  });
});

describe("the day the preview shows", () => {
  const day = (lunch: string, dinner: string) => ({ meals: [{ meal: "breakfast" as const, candidate: { recipe: { name: "Porridge" } } }, { meal: "lunch" as const, candidate: { recipe: { name: lunch } } }, { meal: "dinner" as const, candidate: { recipe: { name: dinner } } }] });
  it("is the first whose lunch and dinner aren't the same dish (by the first two words of their names)", () => {
    expect(pickShownDay([day("Tuna and sweetcorn pasta", "Tuna and sweetcorn pasta bake"), day("Chicken wrap", "Beef chilli")])).toBe(1);
    expect(pickShownDay([day("Chicken wrap", "Chicken curry")])).toBe(0);
    expect(pickShownDay([day("Chicken wrap", "Chicken, wrap style")])).toBe(0);
  });
  it("is the first day when every day has the same dish twice", () => {
    expect(pickShownDay([day("Tuna pasta", "Tuna pasta bake"), day("Tuna pasta", "Tuna pasta")])).toBe(0);
  });
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
              expect(["noRecipes", "narrow"], label).toContain(p.reason);
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
