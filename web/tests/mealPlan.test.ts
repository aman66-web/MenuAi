import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWeek, leavesOut, makePlan, planCandidates, swapMeal, PLAN_DAYS, PLAN_MEALS } from "../lib/mm/mealPlan";
import { RECIPES } from "../lib/mm/recipeBook";
import { isVegan } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";

// A week's meal plan from our own recipes (founder 2026-11-18), worked out on Sainsbury's real list.
const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const target = { kcal: 600 };
const none = {};
const byId = new Map(RECIPES.map((r) => [r.id, r]));

describe("what can go in the plan", () => {
  const cands = planCandidates(RECIPES, products, none, target, []);
  it("has breakfasts, lunches and dinners, each fitted near the meal size and priced", () => {
    for (const m of PLAN_MEALS) {
      const list = cands.get(m)!;
      expect(list.length, m).toBeGreaterThan(8);
      for (const c of list) {
        expect(c.meal).toBe(m);
        expect(c.cost).toBeGreaterThan(0);
        expect(c.picks.length).toBe(c.recipe.ingredients.length);
      }
      expect(list.every((c, i) => i === 0 || list[i - 1]!.distance <= c.distance), `${m}: closest first`).toBe(true);
    }
  });

  it("leaves out what the diet, an allergy or a food left out rules out", () => {
    const vegan = planCandidates(RECIPES, products, { veganOnly: true }, target, []);
    for (const list of vegan.values()) for (const c of list) expect(isVegan(byId.get(c.recipe.id)!), c.recipe.id).toBe(true);
    const noFish = planCandidates(RECIPES, products, none, target, ["fish"]);
    for (const list of noFish.values()) for (const c of list) expect(/salmon|tuna|cod|prawn|fish/i.test(c.recipe.name), c.recipe.name).toBe(false);
    const noMilk = planCandidates(RECIPES, products, { avoidAllergens: ["milk"] }, target, []);
    expect([...noMilk.values()].flat().length).toBeLessThan([...cands.values()].flat().length);
  });

  it("matches a food left out by the recipe's own ingredients, never a seasoning ('black pepper' is not peppers)", () => {
    const chilli = byId.get("beef-chilli")!;
    expect(leavesOut(chilli, ["beans"])).toBe(true);
    expect(leavesOut(chilli, ["peppers"])).toBe(false); // it has chilli powder, no peppers
    expect(leavesOut(chilli, ["spicy"])).toBe(true);
    expect(leavesOut(chilli, ["sweetcorn"])).toBe(false);
    const eggs = byId.get("smoked-salmon-scrambled-eggs");
    if (eggs) expect(leavesOut(eggs, ["eggs"])).toBe(true);
    expect(leavesOut(chilli, [])).toBe(false);
  });
});

describe("the week", () => {
  const cands = planCandidates(RECIPES, products, none, target, []);
  const plan = makePlan(cands, null)!;

  it("is seven days of breakfast, lunch and dinner, each recipe at most twice in a meal, the day's totals added up", () => {
    expect(plan.ids).toHaveLength(PLAN_DAYS);
    for (const d of plan.ids) expect(d).toHaveLength(PLAN_MEALS.length);
    PLAN_MEALS.forEach((_, i) => {
      const counts = new Map<string, number>();
      for (const d of plan.ids) counts.set(d[i]!, (counts.get(d[i]!) ?? 0) + 1);
      for (const [id, n] of counts) expect(n, id).toBeLessThanOrEqual(2);
    });
    const day = plan.week.days[0]!;
    expect(day.kcal).toBe(Math.round(day.meals.reduce((s, m) => s + m.candidate.perServing.kcal, 0)));
    expect(plan.week.mealsCost).toBeCloseTo(plan.week.days.reduce((s, d) => s + d.cost, 0), 1);
  });

  it("buys whole packs for the whole week: one line a product, the bill at least what the meals use", () => {
    const ids = plan.week.shopping.map((l) => l.product.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.week.shoppingCost).toBeGreaterThanOrEqual(plan.week.mealsCost - 0.01);
    for (const l of plan.week.shopping) expect(l.packs).toBeGreaterThanOrEqual(1);
    // cupboard items (oil, salt, stock) come last
    const firstCupboard = plan.week.shopping.findIndex((l) => l.cupboard);
    if (firstCupboard >= 0) expect(plan.week.shopping.slice(firstCupboard).every((l) => l.cupboard)).toBe(true);
  });

  it("with a budget, never swaps in a meal far from the meal size", () => {
    const tight = makePlan(cands, 1)!;
    for (const d of tight.week.days) for (const m of d.meals) expect(m.candidate.distance, m.candidate.recipe.name).toBeLessThanOrEqual(Math.max(0.3, cands.get(m.meal)![3]!.distance));
  });

  it("with a budget, makes the bill cheaper, and says when even the cheapest plan is over it", () => {
    const free = plan.week.shoppingCost;
    const tight = makePlan(cands, Math.round(free * 0.7))!;
    expect(tight.week.shoppingCost).toBeLessThan(free);
    const impossible = makePlan(cands, 1)!;
    expect(impossible.week.overBudget).toBe(true);
    const easy = makePlan(cands, free + 100)!;
    expect(easy.week.overBudget).toBe(false);
    expect(easy.week.shoppingCost).toBe(free);
  });

  it("swaps one meal for the next recipe, keeping the rest", () => {
    const swapped = swapMeal(plan.ids, 2, 1, cands);
    expect(swapped[2]![1]).not.toBe(plan.ids[2]![1]);
    expect(swapped[2]![0]).toBe(plan.ids[2]![0]);
    expect(swapped[3]).toEqual(plan.ids[3]);
    expect(buildWeek(swapped, cands, null)).not.toBeNull();
  });

  it("is null when a meal has no recipe at all for the choices", () => {
    const nothing = planCandidates(RECIPES, products, none, target, ["eggs", "fish", "beans", "cheese", "rice", "pasta", "tomatoes", "onions", "mushrooms"]);
    const anyEmpty = PLAN_MEALS.some((m) => !nothing.get(m)!.length);
    expect(makePlan(nothing, null) === null).toBe(anyEmpty);
  });
});
