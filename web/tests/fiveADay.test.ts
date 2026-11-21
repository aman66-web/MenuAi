// Fruit and veg portions the way the NHS counts its 5 A Day (founder 2026-11-21: "5 a day, 7 a day is also a thing that matters too"): 80 g of fruit or veg is
// a portion, 30 g of dried fruit, beans and pulses once a day at most, potatoes never; counted from each recipe's own amounts. The plan aims for the person's
// 5 or 7 when they choose one.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanFruitVegAim, dayPortions, FRUIT_VEG, fivePortions, NOT_FRUIT_VEG, shownPortions } from "../lib/mm/fiveADay";
import { balanceReport } from "../lib/mm/mealBalance";
import { DEFAULT_SHAPE, makePlan, planCandidates, PLAN_MEALS, slotTargets, weekBalance } from "../lib/mm/mealPlan";
import { PANTRY_KEYS } from "../lib/mm/pantry";
import { ing, type Recipe } from "../lib/mm/recipes";
import { RECIPES } from "../lib/mm/recipeBook";
import { decodeShopProducts } from "../lib/mm/shopProducts";

const recipe = (servings: number, ...ingredients: Recipe["ingredients"]): Recipe => ({ id: "t", name: "Test", blurb: "", servings, minutes: 10, ingredients, method: [] });

describe("a serving's portions", () => {
  it("sorts every pantry kind: counted or not (a new kind fails here until it is sorted)", () => {
    const unsorted = PANTRY_KEYS.filter((k) => !(k in FRUIT_VEG) && !NOT_FRUIT_VEG.has(k));
    expect(unsorted).toEqual([]);
    expect(Object.keys(FRUIT_VEG).filter((k) => NOT_FRUIT_VEG.has(k))).toEqual([]);
  });
  it("counts 80 g of fruit or veg as a portion, per serving", () => {
    expect(fivePortions(recipe(2, ing("broccoli", 320), ing("chicken", 300))).fruitVeg).toBeCloseTo(2);
    expect(fivePortions(recipe(1, ing("chopped-tomatoes", 400))).fruitVeg).toBeCloseTo(5);
  });
  it("counts 30 g of dried fruit as a portion", () => {
    expect(fivePortions(recipe(1, ing("raisins", 30))).fruitVeg).toBeCloseTo(1);
  });
  it("never counts potatoes, herbs, garlic or tomato purée", () => {
    expect(fivePortions(recipe(1, ing("new-potatoes", 400), ing("fresh-coriander", 20), ing("garlic", 10), ing("chopped-tomato-puree", 30))).fruitVeg).toBe(0);
  });
  it("counts beans and pulses once a day at most, however much there is", () => {
    const beans = fivePortions(recipe(1, ing("chickpeas", 240)));
    expect(beans.pulses).toBeCloseTo(3);
    expect(dayPortions([beans])).toBeCloseTo(1);
    expect(dayPortions([beans, fivePortions(recipe(1, ing("kidney-beans", 160), ing("peppers", 160)))])).toBeCloseTo(3);
  });
  it("shows portions down to the half, never rounded up", () => {
    expect(shownPortions(4.9)).toBe(4.5);
    expect(shownPortions(5)).toBe(5);
    expect(shownPortions(0.4)).toBe(0);
  });
  it("keeps only the aims the app offers", () => {
    expect([cleanFruitVegAim(5), cleanFruitVegAim(7), cleanFruitVegAim(6), cleanFruitVegAim("5")]).toEqual([5, 7, undefined, undefined]);
  });
});

describe("a week against the person's aim", () => {
  const veg = (n: number) => ({ main: null, cheesy: false, featured: [], bread: false, five: { fruitVeg: n, pulses: 0 } });
  it("counts whole portions short, day by day, only when there is an aim", () => {
    const week = [[veg(1), veg(2), veg(1)], [veg(2), veg(2), veg(2)]];
    expect(balanceReport(week, PLAN_MEALS).fruitVegShort).toBe(0);
    expect(balanceReport(week, PLAN_MEALS, { fruitVeg: 5 }).fruitVegShort).toBe(1);
    expect(balanceReport(week, PLAN_MEALS, { fruitVeg: 7 }).fruitVegShort).toBe(3 + 1);
  });
  const targets = slotTargets(DEFAULT_SHAPE, { kcal: 2000, protein: 130 });
  const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
  for (const aim of [5, 7]) {
    it(`at Sainsbury's, aiming for ${aim} a day: every day gets there, and the week stays balanced`, () => {
      const cands = planCandidates(RECIPES, products, {}, targets, [], "sainsburys");
      const plan = makePlan(cands, null, PLAN_MEALS, undefined, { fruitVeg: aim })!;
      const week = weekBalance(plan.ids, cands);
      const r = balanceReport(week, PLAN_MEALS, { fruitVeg: aim });
      expect(r.fruitVegShort).toBe(0);
      expect({ sameDay: r.sameDay, dayAfter: r.dayAfter, sharedDay: r.sharedDay, cheesyDay: r.cheesyDay }).toEqual({ sameDay: 0, dayAfter: 0, sharedDay: 0, cheesyDay: 0 });
    });
  }
});
