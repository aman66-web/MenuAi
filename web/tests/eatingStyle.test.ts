import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EATING_STYLES, HIGH_PROTEIN_MIN, LOWER_CARB_MAX, PER_MEAL_RECIPES, PLAN_DAYS, STYLE_PICTURES, STYLE_PROTEIN_FIT, fitsStyle, makePlan, planCandidates, planForBudget, planSlots, sanitizePlan,
  slotTargets, styleBetter, styleCandidates, styleShortfall, stylePicture, styleTargets, type EatingStyle, type PlanCandidate,
} from "../lib/mm/mealPlan";
import { RECIPES } from "../lib/mm/recipeBook";
import { CUISINES, nicheOf } from "../lib/mm/recipeBook/niches";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { RECIPE_THUMBS } from "../lib/mm/recipeThumbs";
import type { MealType } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";
import { macroTargets } from "../lib/mm/targets";

// How the person likes to eat (founder 2026-11-20, 12:48-12:50): Balanced, High protein (at least 30% of a serving's calories from protein), Lower carb (at
// most a quarter from carbs). Not keto, and Mediterranean only if our recipes' cuisine tags give enough for a week. Measured on Sainsbury's real list.

const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const byId = new Map(RECIPES.map((r) => [r.id, r]));
const share = (c: PlanCandidate, k: "protein" | "carbs") => (4 * c.perServing[k]) / c.perServing.kcal;

/** A typical person: 2,000 kcal, the suggested protein, breakfast, lunch, dinner and a snack. */
const SHAPE = { meals: ["breakfast", "lunch", "dinner"] as MealType[], snacks: 1 };
const SLOTS = planSlots(SHAPE);
const base = slotTargets(SHAPE, { kcal: 2000, protein: macroTargets({ dailyCalories: 2000 }).protein }, null);

/** Each meal's count of a style's recipes at Sainsbury's, fitted to the style's meal sizes (Just me) or as written (a household). */
function counts(style: EatingStyle, diet = {}, asWritten = false): Record<MealType, number> {
  const cands = planCandidates(RECIPES, products, diet, styleTargets(base, style), [], "sainsburys", asWritten);
  return Object.fromEntries([...cands].map(([m, list]) => [m, list.filter((c) => fitsStyle(c.perServing, style)).length])) as Record<MealType, number>;
}

const fake = (meal: MealType, id: string, kcal: number, protein: number, carbs: number): PlanCandidate => ({
  shop: "s", recipe: { ...byId.get(RECIPES[0]!.id)!, id, name: id }, base: byId.get(RECIPES[0]!.id)!, meal, perServing: { kcal, protein, carbs, fat: 10 }, cost: 1, picks: [], servings: 1, distance: 0,
});

describe("what each style lets in", () => {
  it("measures a serving's own figures: protein and carbs at 4 kcal a gram against its calories", () => {
    expect(fitsStyle({ kcal: 400, protein: 30, carbs: 50 }, "highProtein")).toBe(true); // 120 of 400 kcal: 30%
    expect(fitsStyle({ kcal: 400, protein: 29.9, carbs: 50 }, "highProtein")).toBe(false);
    expect(fitsStyle({ kcal: 400, protein: 30, carbs: 25 }, "lowerCarb")).toBe(true); // 100 of 400 kcal: 25%
    expect(fitsStyle({ kcal: 400, protein: 30, carbs: 25.1 }, "lowerCarb")).toBe(false);
    expect(fitsStyle({ kcal: 400, protein: 0, carbs: 100 }, "balanced")).toBe(true);
    expect(fitsStyle({ kcal: 0, protein: 10, carbs: 0 }, "highProtein")).toBe(false);
    expect([HIGH_PROTEIN_MIN, LOWER_CARB_MAX]).toEqual([0.3, 0.25]);
  });

  it("fits High protein and Lower carb meals to more protein (the same calories), and leaves Balanced exactly as it was", () => {
    expect(styleTargets(base, "balanced")).toBe(base);
    for (const style of ["highProtein", "lowerCarb"] as const) {
      const t = styleTargets(base, style);
      for (const m of SLOTS) {
        expect(t[m]!.kcal).toBe(base[m]!.kcal);
        expect(t[m]!.protein!).toBeGreaterThanOrEqual(base[m]!.protein!);
        expect(t[m]!.protein!).toBe(Math.max(base[m]!.protein!, Math.round((base[m]!.kcal * STYLE_PROTEIN_FIT) / 4)));
      }
    }
    // a person whose own protein is already higher keeps it
    expect(styleTargets({ dinner: { kcal: 600, protein: 70 } }, "highProtein").dinner).toEqual({ kcal: 600, protein: 70 });
  });

  it("keeps each meal's recipes of the style in order, and a meal with none keeps all of its own; the same map comes back each time", () => {
    const cands = new Map<MealType, PlanCandidate[]>([
      ["breakfast", [fake("breakfast", "a", 400, 10, 60), fake("breakfast", "b", 400, 35, 20), fake("breakfast", "c", 400, 32, 50)]],
      ["lunch", [fake("lunch", "d", 500, 10, 70)]],
    ]);
    expect(styleCandidates(cands, "balanced")).toBe(cands);
    const hp = styleCandidates(cands, "highProtein");
    expect(hp.get("breakfast")!.map((c) => c.recipe.id)).toEqual(["b", "c"]);
    expect(hp.get("lunch")!.map((c) => c.recipe.id)).toEqual(["d"]); // none: any
    expect(styleCandidates(cands, "highProtein")).toBe(hp);
    expect(styleCandidates(cands, "lowerCarb").get("breakfast")!.map((c) => c.recipe.id)).toEqual(["b"]);
  });

  it("names the meals with none of the style and those with too few for the week's variety (each time a day counted)", () => {
    const cands = new Map<MealType, PlanCandidate[]>([
      ["breakfast", [fake("breakfast", "a", 400, 35, 20), fake("breakfast", "b", 400, 35, 20), fake("breakfast", "c", 400, 10, 60)]],
      ["lunch", [fake("lunch", "d", 500, 10, 70)]],
      ["snack", Array.from({ length: 5 }, (_, i) => fake("snack", `s${i}`, 150, 15, 5))],
      ["dinner", []],
    ]);
    expect(styleShortfall(cands, "balanced", ["breakfast", "lunch"])).toEqual({ none: [], few: [] });
    expect(styleShortfall(cands, "highProtein", ["breakfast", "lunch", "dinner", "snack"], 4)).toEqual({ none: ["lunch"], few: [{ meal: "breakfast", n: 2 }] });
    // two snacks a day at "Some repeats" want 8: five are too few
    expect(styleShortfall(cands, "highProtein", ["snack", "snack"], 4)).toEqual({ none: [], few: [{ meal: "snack", n: 5 }] });
    expect(styleShortfall(cands, "highProtein", ["snack"], 4)).toEqual({ none: [], few: [] });
    // meal prep (two recipes a meal): two breakfasts are enough
    expect(styleShortfall(cands, "highProtein", ["breakfast"], 2)).toEqual({ none: [], few: [] });
  });

  it("never makes a meal of the style with products that take it out of the style", () => {
    const plain = fake("dinner", "p", 600, 46, 40); // 30.7% protein
    const off = { ...plain, perServing: { ...plain.perServing, protein: 40 }, better: true }; // 26.7%
    const on = { ...plain, perServing: { ...plain.perServing, protein: 50 }, better: true };
    expect(styleBetter(() => off, "highProtein")(plain)).toBeNull();
    expect(styleBetter(() => on, "highProtein")(plain)).toBe(on);
    expect(styleBetter(() => off, "balanced")(plain)).toBe(off);
    // a meal that took any recipe (none of the style) may still be made with pricier products
    const widened = fake("dinner", "w", 600, 20, 80);
    expect(styleBetter(() => off, "highProtein")(widened)).toBe(off);
  });

  it("is kept with the saved plan: a known style other than Balanced, nothing else", () => {
    const raw = { shops: ["sainsburys"], ids: Array.from({ length: PLAN_DAYS }, () => ["a", "b", "c"]), leaveOut: [], budget: null, start: "2026-11-20" };
    expect(sanitizePlan({ ...raw, style: "highProtein" })!.style).toBe("highProtein");
    expect(sanitizePlan({ ...raw, style: "lowerCarb" })!.style).toBe("lowerCarb");
    expect("style" in sanitizePlan({ ...raw, style: "balanced" })!).toBe(false);
    expect("style" in sanitizePlan({ ...raw, style: "keto" })!).toBe(false);
    expect("style" in sanitizePlan(raw)!).toBe(false);
  });
});

describe("measured at Sainsbury's", () => {
  // Measured 20 November 2026, a 2,000 kcal day (breakfast, lunch, dinner, a snack). Recipes fitted to the style's meal sizes (Just me):
  //   High protein: breakfasts 10, lunches 12, dinners 44, snacks 5 (fitted to the person's own protein instead: 6, 2, 7, 5)
  //   Lower carb:   breakfasts 9, lunches 4, dinners 9, snacks 4 (fitted to the person's own protein instead: 7, 2, 1, 4)
  // As written (a household's plan): High protein 9, 11, 36, 5; Lower carb 7, 2, 4, 4. Vegetarian High protein: no lunches or dinners.
  const hp = counts("highProtein");
  const lc = counts("lowerCarb");

  it("High protein has enough of every meal for a week with some repeats", () => {
    for (const m of SLOTS) expect(hp[m], m).toBeGreaterThanOrEqual(PER_MEAL_RECIPES);
    expect(hp.dinner).toBeGreaterThanOrEqual(30);
  });

  it("Lower carb has some of every meal (a few lunches, so they repeat)", () => {
    for (const m of SLOTS) expect(lc[m], m).toBeGreaterThanOrEqual(2);
  });

  it("fitting to the style's protein is what gives the styles enough recipes", () => {
    const own = (style: EatingStyle) => Object.fromEntries([...planCandidates(RECIPES, products, {}, base, [], "sainsburys")].map(([m, l]) => [m, l.filter((c) => fitsStyle(c.perServing, style)).length])) as Record<MealType, number>;
    expect(hp.dinner).toBeGreaterThan(2 * own("highProtein").dinner);
    expect(lc.dinner).toBeGreaterThan(own("lowerCarb").dinner);
  });

  it("a household's plan (recipes as written) has every meal of both styles", () => {
    const hpWritten = counts("highProtein", {}, true);
    const lcWritten = counts("lowerCarb", {}, true);
    for (const m of SLOTS) {
      expect(hpWritten[m], m).toBeGreaterThan(0);
      expect(lcWritten[m], m).toBeGreaterThan(0);
    }
  });

  it("a High protein week uses only high-protein recipes, every day filled", () => {
    const cands = styleCandidates(planCandidates(RECIPES, products, {}, styleTargets(base, "highProtein"), [], "sainsburys"), "highProtein");
    const plan = makePlan(cands, null, SLOTS)!;
    expect(plan.week.days).toHaveLength(PLAN_DAYS);
    for (const d of plan.week.days) {
      expect(d.meals).toHaveLength(SLOTS.length);
      for (const m of d.meals) expect(share(m.candidate, "protein"), m.candidate.recipe.id).toBeGreaterThanOrEqual(HIGH_PROTEIN_MIN);
    }
    expect(styleShortfall(cands, "highProtein", SLOTS)).toEqual({ none: [], few: [] });
  });

  it("a Lower carb week fills every day, repeating its few lunches, and says so", () => {
    const all = planCandidates(RECIPES, products, {}, styleTargets(base, "lowerCarb"), [], "sainsburys");
    const cands = styleCandidates(all, "lowerCarb");
    const plan = planForBudget(cands, null, styleBetter(() => null, "lowerCarb"), SLOTS, PER_MEAL_RECIPES)!;
    for (const d of plan.week.days) for (const m of d.meals) expect(share(m.candidate, "carbs"), m.candidate.recipe.id).toBeLessThanOrEqual(LOWER_CARB_MAX);
    const short = styleShortfall(all, "lowerCarb", SLOTS);
    expect(short.none).toEqual([]);
    for (const f of short.few) expect(f.n).toBe(lc[f.meal]);
    const lunches = new Set(plan.ids.map((d) => d[SLOTS.indexOf("lunch")]));
    expect(lunches.size).toBeLessThanOrEqual(Math.max(lc.lunch, 1));
  });

  it("a vegetarian High protein week has no high-protein lunches or dinners, so those take any recipe and the week is still whole", () => {
    const veg = { vegetarianOnly: true };
    const all = planCandidates(RECIPES, products, veg, styleTargets(base, "highProtein"), [], "sainsburys");
    const short = styleShortfall(all, "highProtein", SLOTS);
    const v = counts("highProtein", veg);
    for (const m of SLOTS) expect(short.none.includes(m)).toBe(v[m] === 0);
    const plan = makePlan(styleCandidates(all, "highProtein"), null, SLOTS)!;
    expect(plan.week.days).toHaveLength(PLAN_DAYS);
    for (const d of plan.week.days) expect(d.meals).toHaveLength(SLOTS.length);
  });

  it("keto isn't offered: a tenth of the calories or less from carbs is 9 recipes at most, not one lunch or dinner", () => {
    const written = planCandidates(RECIPES, products, {}, base, [], "sainsburys", true);
    const keto = [...written.values()].flat().filter((c) => share(c, "carbs") <= 0.1);
    expect(keto.length).toBeLessThanOrEqual(9);
    expect(keto.filter((c) => c.meal === "lunch" || c.meal === "dinner")).toEqual([]);
    expect(EATING_STYLES as readonly string[]).not.toContain("keto");
  });

  it("Mediterranean isn't offered: no recipe is tagged Mediterranean, and Italian and Middle Eastern together have too few breakfasts for a week", () => {
    expect(CUISINES.map((c) => c.id) as string[]).not.toContain("mediterranean");
    const breakfasts = RECIPES.filter((r) => r.meal === "breakfast" && ["italian", "middle-eastern"].includes(nicheOf(r.id).cuisine ?? ""));
    expect(breakfasts.length).toBeLessThan(PER_MEAL_RECIPES);
    expect(EATING_STYLES as readonly string[]).not.toContain("mediterranean");
  });
});

describe("each tile's picture", () => {
  const written = [...planCandidates(RECIPES, products, {}, base, [], "sainsburys", true).values()].flat();

  it("is one of our recipes of that style at Sainsbury's (as written), with its own picture on disk", () => {
    for (const style of EATING_STYLES) {
      for (const id of STYLE_PICTURES[style]) {
        expect(byId.has(id), id).toBe(true);
        const c = written.find((x) => x.recipe.id === id);
        expect(c, `${id} at Sainsbury's`).toBeTruthy();
        expect(fitsStyle(c!.perServing, style), `${id} is ${style}`).toBe(true);
        for (const src of [RECIPE_IMAGES[id], RECIPE_THUMBS[id]]) {
          expect(src, id).toBeTruthy();
          expect(existsSync(`public${src}`), src).toBe(true);
        }
      }
    }
  });

  it("suits the person's diet as it is, or there is none", () => {
    const get = (id: string) => byId.get(id);
    expect(stylePicture("balanced", {}, get)).toBe("salmon-new-potatoes-peas");
    expect(stylePicture("balanced", { vegetarianOnly: true }, get)).toBe("mexican-bean-rice-bowl");
    expect(stylePicture("balanced", { veganOnly: true }, get)).toBe("chickpea-rice-bowl");
    expect(stylePicture("highProtein", { vegetarianOnly: true }, get)).toBe("mushroom-cheddar-omelette");
    expect(stylePicture("highProtein", { veganOnly: true }, get)).toBeNull();
    expect(stylePicture("lowerCarb", { avoidAllergens: ["eggs"] }, get)).toBe("paprika-roasted-almonds");
  });
});
