import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mealTargetFor } from "../lib/mm/mealTarget";
import { slotTargets } from "../lib/mm/mealPlan";
import { RECIPES } from "../lib/mm/recipeBook";
import { PORTION_REASONS, USUAL_PORTION, USUAL_PORTION_KCAL, portionReason, samePortion } from "../lib/mm/recipePortion";
import { fitOutcome, recipeView, type IngredientPick } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";

// A recipe page says what size a serving is cooked to and why, right under its calories, with a switch to a usual portion (founder 2026-11-20). The reason is
// said only when it is exactly how the size was worked out; both sizes are the app's own fitting on the products' labels.

const base = { dailyCalories: 2000, goal: "maintain" as const, glp1MealCap: 450, recipeMeal: undefined };

describe("why a recipe is the size it is", () => {
  it("a normal meal on Recipes is 30% of the day", () => {
    const s = { ...base, dailyCalories: 3480 };
    const target = mealTargetFor(s)!;
    expect(target.kcal).toBe(1050);
    expect(portionReason(s, target, false)).toEqual({ text: PORTION_REASONS.share, day: 3480 });
  });
  it("a small or big meal says so", () => {
    const small = { ...base, recipeMeal: { size: "small" as const, moreProtein: false } };
    expect(portionReason(small, mealTargetFor(small)!, false)).toEqual({ text: PORTION_REASONS.small, day: 2000 });
    const big = { ...base, recipeMeal: { size: "big" as const, moreProtein: true } };
    expect(portionReason(big, mealTargetFor(big)!, false)).toEqual({ text: PORTION_REASONS.big, day: 2000 });
  });
  it("on a GLP-1 medicine, the comfortable meal size from Settings when that is what sized it", () => {
    const s = { ...base, goal: "glp1" as const, dailyCalories: 3480, glp1MealCap: 450 };
    const target = mealTargetFor(s)!;
    expect(target.kcal).toBe(450);
    expect(portionReason(s, target, false)).toEqual({ text: PORTION_REASONS.cap });
  });
  it("says nothing for the person's own numbers, or a meal held at a limit", () => {
    const own = { ...base, recipeMeal: { size: "custom" as const, moreProtein: false, kcal: 700 } };
    expect(portionReason(own, mealTargetFor(own)!, false)).toBeNull();
    const huge = { ...base, dailyCalories: 5000 };
    expect(mealTargetFor(huge)!.kcal).toBe(1200);
    expect(portionReason(huge, mealTargetFor(huge)!, false)).toBeNull();
  });
  it("a meal of the meal plan is the day over its meals, said only when it is that share", () => {
    const three = slotTargets({ meals: ["breakfast", "lunch", "dinner"], snacks: 0 }, { kcal: 3400, protein: 150 });
    expect(portionReason({ ...base, dailyCalories: 3400 }, three.dinner!, true)).toEqual({ text: PORTION_REASONS.overMeals, day: 3400, meals: 3 });
    const two = slotTargets({ meals: ["lunch", "dinner"], snacks: 0 }, { kcal: 2000, protein: 100 });
    expect(portionReason(base, two.dinner!, true)).toEqual({ text: PORTION_REASONS.overMeals, day: 2000, meals: 2 });
    // with snacks the meals aren't the day over the meals, so no reason
    const snacks = slotTargets({ meals: ["breakfast", "lunch", "dinner"], snacks: 2 }, { kcal: 2000, protein: 100 });
    expect(portionReason(base, snacks.dinner!, true)).toBeNull();
  });
});

describe("the usual portion", () => {
  const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
  it("is about 600 kcal", () => {
    expect(USUAL_PORTION).toEqual({ kcal: USUAL_PORTION_KCAL });
    expect(USUAL_PORTION_KCAL).toBe(600);
  });
  it("refits the same recipe from the labels, and differs from a big day's meal", () => {
    const recipe = RECIPES.find((r) => r.id === "chicken-curry")!;
    const mine = recipeView(recipe, products, { servings: 1, target: { kcal: 1050 } });
    const usual = recipeView(recipe, products, { servings: 1, target: USUAL_PORTION });
    expect(mine.totals && usual.totals).toBeTruthy();
    expect(samePortion(mine.totals!.perServing, usual.totals!.perServing)).toBe(false);
    expect(fitOutcome(usual.fitted, usual.totals!.perServing.kcal, USUAL_PORTION)).not.toBe("cannot");
    // every figure is the labels' arithmetic for the amounts shown: same products, amounts moved
    // (a serving's figures come from the recipe as written's servings, fitted: the basis behind Serves 1)
    const basis = usual.resolved.basis ?? usual.resolved;
    const sum = (basis.picks as IngredientPick[]).reduce((a, p) => a + ((p.product.nutrition?.kcal ?? 0) * p.spec.amount) / 100, 0) / basis.recipe.servings;
    expect(Math.abs(usual.totals!.perServing.kcal - sum)).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(usual.resolved.picks.map((p) => p?.product.id)).toEqual(mine.resolved.picks.map((p) => p?.product.id));
  });
  it("the switch is left out when both sizes give the same serving", () => {
    expect(samePortion({ kcal: 600.2, protein: 30.1 }, { kcal: 599.8, protein: 29.9 })).toBe(true);
    expect(samePortion({ kcal: 600, protein: 30 }, { kcal: 700, protein: 30 })).toBe(false);
  });
});
