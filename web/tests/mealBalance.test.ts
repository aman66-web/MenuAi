// A balanced week (founder 2026-11-21, on Meal plan: "everything on it is cheesy stuff ... salmon every day, or chicken every day, or beef every day ...
// balanced diets"): each lunch and dinner's main is worked out from its own ingredients, and the plan keeps the same main off two meals a day, off the same meal
// two days running and to three times a week, and cheese-heavy dishes to one a day and two a week, as far as the recipes (and a budget) allow.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { balanceReport, breadLimit, mealBalance, MAX_BREAD_A_WEEK, MAX_SAME_MAIN_A_WEEK, type MealBalance } from "../lib/mm/mealBalance";
import { DEFAULT_SHAPE, forHousehold, householdReference, makePlan, planCandidates, planForBudget, PLAN_MEALS, slotTargets, weekBalance } from "../lib/mm/mealPlan";
import { RECIPES } from "../lib/mm/recipeBook";
import { decodeShopProducts } from "../lib/mm/shopProducts";

const byId = new Map(RECIPES.map((r) => [r.id, r]));
const bal = (id: string) => mealBalance(byId.get(id)!);

describe("a recipe's main and its cheese", () => {
  it("names the main by what most of its protein comes from", () => {
    expect(bal("chicken-korma-style-curry").main).toBe("chicken");
    expect(bal("salmon-noodles").main).toBe("salmon");
    expect(bal("tuna-pea-spinach-lemon-spaghetti").main).toBe("tuna");
  });
  it("calls a dish cheese-heavy by its cheese, and its name only when there is cheese in it", () => {
    expect(bal("easy-macaroni-cheese").cheesy).toBe(true);
    expect(bal("welsh-rarebit-tomatoes").cheesy).toBe(true);
    expect(bal("salmon-noodles").cheesy).toBe(false);
  });
});

describe("how balanced a week is", () => {
  const slots = PLAN_MEALS;
  const day = (lunch: Partial<MealBalance>, dinner: Partial<MealBalance>, breakfast: Partial<MealBalance> = {}): MealBalance[] => [{ main: "eggs", cheesy: false, featured: [], bread: false, ...breakfast }, { main: null, cheesy: false, featured: [], bread: false, ...lunch }, { main: null, cheesy: false, featured: [], bread: false, ...dinner }];
  it("counts the same main twice in a day, in a meal two days running, too often in a week, and too much cheese", () => {
    expect(balanceReport([day({ main: "chicken" }, { main: "chicken" })], slots)).toMatchObject({ sameDay: 1 });
    expect(balanceReport([day({ main: "beef" }, {}), day({ main: "beef" }, {})], slots)).toMatchObject({ dayAfter: 1 });
    const fourChicken = [day({ main: "chicken" }, {}), day({}, { main: "chicken" }), day({ main: "chicken" }, {}), day({}, { main: "chicken" })];
    expect(balanceReport(fourChicken, slots).overWeek).toBe(4 - MAX_SAME_MAIN_A_WEEK);
    expect(balanceReport([day({ cheesy: true }, { cheesy: true }), day({ cheesy: true }, {})], slots)).toMatchObject({ cheesyDay: 1, cheesyWeek: 1 });
    // a breakfast's eggs every day are not a main
    expect(balanceReport([day({}, {}), day({}, {}), day({}, {}), day({}, {})], slots).overWeek).toBe(0);
  });
  it("counts a leading ingredient in two of the day's meals, breakfast too (founder: egg mayonnaise wraps, then egg foo young: \"Too much egg\")", () => {
    expect(balanceReport([day({ featured: ["eggs"] }, { featured: ["eggs"] })], slots).sharedDay).toBe(1);
    expect(balanceReport([day({ featured: ["eggs"] }, {}, { featured: ["eggs"] })], slots).sharedDay).toBe(1);
    expect(balanceReport([day({ featured: ["chicken"] }, { featured: ["beef", "cheese"] }, { featured: ["eggs"] })], slots).sharedDay).toBe(0);
  });
  it("keeps bread to one meal a day and the week's limit, which the person's answer sets (founder: \"who wants to have bread every single day\")", () => {
    const toastDay = day({ bread: true }, {}, { bread: true });
    expect(balanceReport([toastDay], slots).breadDay).toBe(1);
    const fiveDays = Array.from({ length: 5 }, () => day({ bread: true }, {}));
    expect(balanceReport(fiveDays, slots).breadWeek).toBe(5 - MAX_BREAD_A_WEEK);
    expect(balanceReport(fiveDays, slots, { breadWeek: breadLimit("mostDays") }).breadWeek).toBe(0);
    expect(balanceReport(fiveDays, slots, { breadWeek: breadLimit("rarely") }).breadWeek).toBe(3);
    expect(bal("egg-mayonnaise-wraps").bread).toBe(true);
    expect(bal("salmon-noodles").bread).toBe(false);
  });
  it("finds the eggs in both: egg mayonnaise wraps and egg foo young", () => {
    expect(bal("egg-mayonnaise-wraps").featured).toContain("eggs");
    expect(bal("egg-foo-young-rice").featured).toContain("eggs");
  });
});

describe("real weeks are balanced", () => {
  const targets = slotTargets(DEFAULT_SHAPE, { kcal: 2000, protein: 130 });
  for (const shop of ["sainsburys", "asda", "morrisons"]) {
    const products = decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${shop}.json`, "utf8")));
    it(`at ${shop}, alone: no main twice a day or two days running, none over three times, no more than two cheese-heavy dishes`, () => {
      const cands = planCandidates(RECIPES, products, {}, targets, [], shop);
      const plan = makePlan(cands, null)!;
      const r = balanceReport(weekBalance(plan.ids, cands), PLAN_MEALS);
      // never within a day: the same main, a key ingredient twice, two bread meals, two cheese-heavy ones; nor the same main two days running
      expect({ sameDay: r.sameDay, dayAfter: r.dayAfter, sharedDay: r.sharedDay, breadDay: r.breadDay, cheesyDay: r.cheesyDay }).toEqual({ sameDay: 0, dayAfter: 0, sharedDay: 0, breadDay: 0, cheesyDay: 0 });
      // over the week, at most one meal over each limit (a main more than three times, bread more than four, cheese more than twice)
      expect(Math.max(r.overWeek, r.breadWeek, r.cheesyWeek)).toBeLessThanOrEqual(1);
    });
    it(`at ${shop}, for two on a tight £40: the same main twice a day at most once, never cheese twice a day, only a few repeats`, () => {
      const raw = planCandidates(RECIPES, products, {}, targets, [], shop, true);
      const cands = forHousehold(raw, { targets, yourDailyKcal: 2000, others: [{ group: "adult", portion: "normal" }] as never, referenceTargets: householdReference(DEFAULT_SHAPE) });
      const plan = planForBudget(cands, 40, () => null, PLAN_MEALS)!;
      const r = balanceReport(weekBalance(plan.ids, cands), PLAN_MEALS);
      // a budget far under the week's cost picks the cheapest recipes; the same main is still kept off two meals a day almost always
      expect(r.sameDay).toBeLessThanOrEqual(1);
      expect(r.cheesyDay).toBe(0);
      // a budget well under what the week costs (£70-90 for two at these shops) leaves a few repeats; never more than a handful
      expect(r.overWeek + r.cheesyWeek).toBeLessThanOrEqual(6);
      // and never toast and a sandwich day after day: bread at two meals of a day twice at most (21 November evening: it was 8 days at Sainsbury's)
      expect(r.breadDay).toBeLessThanOrEqual(2);
    });
  }
});
