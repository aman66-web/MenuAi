import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BETTER, DEFAULT_SHAPE, SHOP_FIT_SLACK, fitsDietNow, planSlots, shapeOf, slotTargets, betterCandidate, budgetRange, planForBudget, buildWeek, leavesOut, makePlan, planCandidates, planCandidatesAcross, sanitizePlan, setMeal, swapChoices, swapMeal, PLAN_DAYS, PLAN_MEALS, KEEPS_WELL, capShortfall, keepsWell, VARIETIES, MAX_EARLIER_PLANS, keepEarlier, openEarlier, sanitizePlans, forPeople, betterForPeople, PLAN_PEOPLE, cleanDiet, sameDiet, planListKey, planDayIndex, planShortfall, SHORTFALL_NOTE, LEAVE_OUT, weekCosts, showsWeekAfter, lastingThings, WEEK_AFTER_SAVING, PER_MEAL_RECIPES, weekForms, type SavedPlan, type ShopLine } from "../lib/mm/mealPlan";
import { MAX_WRAPS_A_WEEK, dishForm, varietyReport } from "../lib/mm/dishForm";
import { RECIPES } from "../lib/mm/recipeBook";
import { ALLERGEN_KEYS } from "../lib/mm/types";
import { PANTRY } from "../lib/mm/pantry";
import { isVegan, type MealType } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";

// A week's meal plan from our own recipes (founder 2026-11-18), worked out on Sainsbury's real list.
const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const morrisons = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/morrisons.json", "utf8")));
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

describe("several shops (founder 2026-11-18: \"they're able to select multiple supermarkets ... choose the best meal plan overall\")", () => {
  const shops = [{ id: "sainsburys", products }, { id: "morrisons", products: morrisons }];
  const across = planCandidatesAcross(RECIPES, shops, none, target, []);
  const one = { sainsburys: planCandidates(RECIPES, products, none, target, [], "sainsburys"), morrisons: planCandidates(RECIPES, morrisons, none, target, [], "morrisons") };

  it("fits each recipe at every shop and keeps the closest fit, or a cheaper one as close", () => {
    for (const m of PLAN_MEALS) {
      const list = across.get(m)!;
      expect(list.length).toBeGreaterThanOrEqual(Math.max(one.sainsburys.get(m)!.length, one.morrisons.get(m)!.length));
      expect(new Set(list.map((c) => c.recipe.id)).size).toBe(list.length); // each recipe once
      for (const c of list) {
        expect(["sainsburys", "morrisons"]).toContain(c.shop);
        const options = [one.sainsburys, one.morrisons].map((x) => x.get(m)!.find((o) => o.recipe.id === c.recipe.id)).filter((o) => !!o);
        const closest = Math.min(...options.map((o) => o!.distance));
        expect(c.distance).toBeLessThanOrEqual(closest + SHOP_FIT_SLACK + 1e-9);
        for (const o of options) if (o!.distance <= closest + SHOP_FIT_SLACK) expect(c.cost).toBeLessThanOrEqual(o!.cost + 1e-9);
      }
    }
  });

  it("buys each product at its own shop and lists the shops, the one with the most to buy first", () => {
    const plan = makePlan(across, null)!;
    const used = new Set(plan.week.days.flatMap((d) => d.meals.map((x) => x.candidate.shop)));
    expect(new Set(plan.week.shopping.map((l) => l.shop))).toEqual(used);
    expect([...plan.week.shops].sort()).toEqual([...used].sort());
    const keys = plan.week.shopping.map((l) => `${l.shop}|${l.product.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    const spend = (sh: string) => plan.week.shopping.filter((l) => l.shop === sh).reduce((t, l) => t + l.cost, 0);
    for (let i = 1; i < plan.week.shops.length; i++) expect(spend(plan.week.shops[i - 1]!)).toBeGreaterThanOrEqual(spend(plan.week.shops[i]!));
  });

  it("offers the other recipes for a meal to swap to, and sets the one chosen", () => {
    const plan = makePlan(across, null)!;
    const choices = swapChoices(plan.ids, 0, 2, across);
    expect(choices.length).toBeGreaterThan(3);
    expect(choices.some((c) => c.recipe.id === plan.ids[0]![2])).toBe(false);
    for (const c of choices) expect(plan.ids.filter((d) => d[2] === c.recipe.id).length).toBeLessThan(2);
    const ids = setMeal(plan.ids, 0, 2, choices[0]!.recipe.id);
    expect(ids[0]![2]).toBe(choices[0]!.recipe.id);
    expect(ids[1]).toEqual(plan.ids[1]);
    expect(buildWeek(ids, across, null)).not.toBeNull();
  });

  it("keeps a plan saved before several shops (one shop) and a plan with several", () => {
    const ids = Array.from({ length: PLAN_DAYS }, () => ["a", "b", "c"]);
    expect(sanitizePlan({ shop: "sainsburys", ids, leaveOut: [], budget: null, start: "2026-11-18" })?.shops).toEqual(["sainsburys"]);
    expect(sanitizePlan({ shops: ["sainsburys", "morrisons", "sainsburys", "BAD!"], ids, leaveOut: [], budget: 40, start: "2026-11-18" })?.shops).toEqual(["sainsburys", "morrisons"]);
    expect(sanitizePlan({ shops: [], ids, start: "2026-11-18" })).toBeNull();
  });
});

describe("the budget slider (founder 2026-11-18: lowest fits the goal, the green spot is the best fit, higher buys better produce)", () => {
  const cands = planCandidates(RECIPES, products, none, target, [], "sainsburys");
  const betterOf = (c: Parameters<typeof betterCandidate>[0]) => betterCandidate(c, products, target);

  it("makes a recipe with the shop's better products where it has them, dearer, still a fitted meal", () => {
    const some = [...cands.values()].flat().map(betterOf).filter((b) => !!b);
    expect(some.length).toBeGreaterThan(5);
    for (const b of some.slice(0, 20)) {
      expect(b!.better).toBe(true);
      expect(b!.picks.some((p) => BETTER.test(p.product.name))).toBe(true);
      const plain = [...cands.values()].flat().find((c) => c.recipe.id === b!.recipe.id && c.meal === b!.meal)!;
      expect(b!.cost).toBeGreaterThan(plain.cost);
      expect(b!.picks.length).toBe(plain.picks.length);
    }
  });

  it("has a range: the cheapest week, the best fit, and the best fit with better products", () => {
    const r = budgetRange(cands, betterOf)!;
    expect(r.min).toBeLessThanOrEqual(r.best);
    expect(r.max).toBeGreaterThan(r.best);
    expect(planForBudget(cands, null, betterOf)!.week.shoppingCost).toBeCloseTo(r.best, 2);
  });

  it("under the best fit: cheaper recipes; at or over it: better products while the bill fits; never under what the goal needs", () => {
    const r = budgetRange(cands, betterOf)!;
    const low = planForBudget(cands, Math.round((r.min + r.best) / 2), betterOf)!;
    expect(low.better).toEqual([]);
    expect(low.week.shoppingCost).toBeLessThan(r.best + 0.01);
    const high = planForBudget(cands, Math.round((r.best + r.max) / 2), betterOf)!;
    expect(high.better.length).toBeGreaterThan(0);
    expect(high.week.shoppingCost).toBeLessThanOrEqual(Math.round((r.best + r.max) / 2) + 0.01);
    expect(high.week.shoppingCost).toBeGreaterThanOrEqual(r.best - 0.01);
    const top = planForBudget(cands, r.max, betterOf)!;
    expect(top.better.length).toBeGreaterThanOrEqual(high.better.length);
    // the meals still fit the meal size: upgrades change products, not recipes
    for (const d of top.week.days) for (const m of d.meals) expect(m.candidate.distance).toBeLessThan(0.6);
  });

  it("its points in whole pounds rounded up (the 21 November meeting, Kemi): the green spot makes the best week itself, and Cheapest a week within it", () => {
    const r = budgetRange(cands, betterOf)!;
    const best = planForBudget(cands, null, betterOf)!;
    const spot = planForBudget(cands, Math.ceil(r.best), betterOf)!;
    expect(spot.ids).toEqual(best.ids);
    expect(spot.week.overBudget).toBe(false);
    const cheapest = planForBudget(cands, Math.ceil(r.min), betterOf)!;
    expect(cheapest.week.overBudget).toBe(false);
    expect(cheapest.week.shoppingCost).toBeLessThanOrEqual(Math.ceil(r.min) + 0.005);
  });

  it("keeps which recipes use better products when the plan is saved", () => {
    const ids = Array.from({ length: PLAN_DAYS }, () => ["a", "b", "c"]);
    expect(sanitizePlan({ shops: ["sainsburys"], ids, start: "2026-11-18", better: ["dinner:beef-chilli", "nope", 3] })?.better).toEqual(["dinner:beef-chilli"]);
  });
});

describe("meals and snacks a day (founder 2026-11-18: \"how many meals and how many snacks they want a day ... full personalization\")", () => {
  const daily = { kcal: 2000, protein: 120 };

  it("sizes each slot from the day's numbers: snacks a tenth, the meals sharing the rest equally, the day adding up", () => {
    const shape = { meals: ["breakfast", "lunch", "dinner"] as const, snacks: 2 };
    const t = slotTargets({ meals: [...shape.meals], snacks: 2 }, daily);
    expect(t.snack!.kcal).toBe(200);
    expect(t.breakfast!.kcal).toBe(t.lunch!.kcal);
    expect(t.lunch!.kcal).toBe(t.dinner!.kcal);
    const total = t.breakfast!.kcal + t.lunch!.kcal + t.dinner!.kcal + 2 * t.snack!.kcal;
    expect(Math.abs(total - 2000)).toBeLessThanOrEqual(30);
    expect(t.dinner!.protein! + t.lunch!.protein! + t.breakfast!.protein! + 2 * t.snack!.protein!).toBeGreaterThan(110);
    // two meals: each bigger; a GLP-1 cap keeps them smaller, and the plan says how far the day falls short
    const two = slotTargets({ meals: ["lunch", "dinner"], snacks: 0 }, daily);
    expect(two.lunch!.kcal).toBeGreaterThan(t.lunch!.kcal);
    expect(two.breakfast).toBeUndefined();
    const capped = slotTargets({ meals: ["lunch", "dinner"], snacks: 1 }, daily, 450);
    expect(capped.dinner!.kcal).toBe(450);
    expect(capShortfall({ meals: ["lunch", "dinner"], snacks: 1 }, capped, 2000)).toBe(2000 - 450 * 2 - 200);
    expect(capShortfall(shape as unknown as { meals: ("breakfast" | "lunch" | "dinner")[]; snacks: number }, t, 2000)).toBe(0);
  });

  it("adds up for a big day too (founder 2026-11-20: \"3,400 divided by 3\"): no 1,200 kcal ceiling on a meal", () => {
    const big = slotTargets({ meals: ["breakfast", "lunch", "dinner"], snacks: 0 }, { kcal: 3400, protein: 180 });
    expect([big.breakfast!.kcal, big.lunch!.kcal, big.dinner!.kcal]).toEqual([1130, 1130, 1130]);
    expect(big.dinner!.protein).toBe(60);
    // the GLP-1 cap of 450: each meal 450, and the day 2,050 kcal short
    const glp = slotTargets({ meals: ["breakfast", "lunch", "dinner"], snacks: 0 }, { kcal: 3400, protein: 180 }, 450);
    expect(glp.lunch!.kcal).toBe(450);
    expect(capShortfall({ meals: ["breakfast", "lunch", "dinner"], snacks: 0 }, glp, 3400)).toBe(2050);
  });

  it("puts the slots in order: the meals, then the snacks", () => {
    expect(planSlots({ meals: ["dinner", "breakfast"], snacks: 2 })).toEqual(["breakfast", "dinner", "snack", "snack"]);
    expect(planSlots(DEFAULT_SHAPE)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(shapeOf(["breakfast", "dinner", "snack", "snack"])).toEqual({ meals: ["breakfast", "dinner"], snacks: 2 });
  });

  it("plans a week of breakfast, dinner and two snacks: the day's two snacks differ, each slot fitted to its own size", () => {
    const shape = { meals: ["breakfast", "dinner"] as ("breakfast" | "dinner")[], snacks: 2 };
    const slots = planSlots(shape);
    const t = slotTargets(shape, daily);
    const cands = planCandidates(RECIPES, products, none, t, [], "sainsburys");
    expect(cands.get("lunch")).toBeUndefined();
    expect(cands.get("snack")!.length).toBeGreaterThan(3);
    const plan = makePlan(cands, null, slots)!;
    expect(plan.ids.every((d) => d.length === 4)).toBe(true);
    for (const d of plan.ids) expect(d[2]).not.toBe(d[3]);
    for (const day of plan.week.days) {
      expect(day.meals.map((m) => m.meal)).toEqual(slots);
      const snack = day.meals[2]!.candidate;
      expect(Math.abs(snack.perServing.kcal - t.snack!.kcal)).toBeLessThan(t.snack!.kcal * 0.6);
    }
    // swapping a snack never offers the day's other snack
    const choices = swapChoices(plan.ids, 0, 2, cands, 10, slots);
    expect(choices.some((c) => c.recipe.id === plan.ids[0]![3])).toBe(false);
    // and the plan is kept with its slots
    const saved = sanitizePlan({ shops: ["sainsburys"], ids: plan.ids, slots, start: "2026-11-18" })!;
    expect(saved.slots).toEqual(slots);
    expect(sanitizePlan({ shops: ["sainsburys"], ids: plan.ids, slots: ["snack", "breakfast", "dinner", "snack"], start: "2026-11-18" })).toBeNull();
  });
});

describe("using up the packs (founder 2026-11-18: \"by the end of the week, all the ingredients shall be basically almost complete\")", () => {
  const shape = { ...DEFAULT_SHAPE, snacks: 0 };
  const slots = planSlots(shape);
  const cands = planCandidates(RECIPES, products, none, slotTargets(shape, { kcal: 2000, protein: 120 }), []);

  it("counts oil, spices, dry goods, jars and frozen food as keeping past the week, and fresh food as not", () => {
    const spec = (key: string, cupboard = false) => ({ key, label: key, amount: 100, unit: "g" as const, match: { all: [] }, ...(cupboard ? { cupboard } : {}) });
    expect(keepsWell(spec("rice"), { name: "Basmati Rice 1kg" })).toBe(true);
    expect(keepsWell(spec("salt", true), { name: "Table Salt 750g" })).toBe(true);
    expect(keepsWell(spec("chicken"), { name: "Chicken Breast Fillets 320g" })).toBe(false);
    expect(keepsWell(spec("spinach"), { name: "Baby Leaf Spinach 120g" })).toBe(false);
    expect(keepsWell(spec("sweetcorn"), { name: "Frozen Sweetcorn 1kg" })).toBe(true);
    expect(KEEPS_WELL.has("milk")).toBe(false);
  });

  it("says what of the fresh food the week eats, from the lines' own sums", () => {
    const week = makePlan(cands, null, slots)!.week;
    const fresh = week.shopping.filter((l) => !l.keeps);
    expect(week.fresh.bought).toBeCloseTo(fresh.reduce((s, l) => s + l.cost, 0), 1);
    expect(week.fresh.eaten).toBeCloseTo(fresh.reduce((s, l) => s + l.used, 0), 1);
    for (const l of week.shopping) expect(l.used).toBeLessThanOrEqual(l.cost + 1e-9);
    expect(week.fresh.eaten).toBeLessThanOrEqual(week.fresh.bought);
  });

  it("leaves much less fresh food in the packs than the closest recipes in turn would, with every meal still close to its size", () => {
    // the plan as it was before 19 November: the four closest recipes for each meal in turn
    const plain = Array.from({ length: PLAN_DAYS }, (_, d) => slots.map((m) => cands.get(m)![d % 4]!.recipe.id));
    const before = buildWeek(plain, cands, null, slots)!;
    const after = makePlan(cands, null, slots)!.week;
    const share = (w: typeof after) => w.fresh.eaten / w.fresh.bought;
    expect(share(after)).toBeGreaterThan(share(before) + 0.1);
    expect(share(after)).toBeGreaterThan(0.75);
    expect(after.shoppingCost).toBeLessThanOrEqual(before.shoppingCost + 0.01);
    for (const d of after.days) for (const m of d.meals) expect(m.candidate.distance, m.candidate.recipe.id).toBeLessThanOrEqual(0.1);
  });

  it("keeps to the budget while it uses up packs", () => {
    const range = budgetRange(cands, () => null, slots)!;
    const budget = Math.round((range.min + range.best) / 2);
    const plan = planForBudget(cands, budget, () => null, slots)!;
    expect(plan.week.shoppingCost).toBeLessThanOrEqual(budget + 0.01);
  });

  it("rotates through as many recipes as the variety asks: a different one every day, some repeats, or meal prep", () => {
    const distinct = (v: number) => {
      const ids = makePlan(cands, null, slots, v)!.ids;
      return slots.map((_, i) => new Set(ids.map((d) => d[i])).size);
    };
    expect(distinct(7)).toEqual([7, 7, 7]);
    expect(distinct(4)).toEqual([4, 4, 4]);
    expect(distinct(2)).toEqual([2, 2, 2]);
    expect([...VARIETIES]).toEqual([7, 4, 2]);
    // meal prep leaves the least in the packs
    const share = (v: number) => { const w = makePlan(cands, null, slots, v)!.week; return w.fresh.eaten / w.fresh.bought; };
    expect(share(2)).toBeGreaterThan(share(7));
  });

  it("keeps the variety in the saved plan, and plans from before it open as some repeats", () => {
    const plan = makePlan(cands, null, slots, 2)!;
    expect(sanitizePlan({ shops: ["sainsburys"], ids: plan.ids, start: "2026-11-19", variety: 2 })!.variety).toBe(2);
    expect(sanitizePlan({ shops: ["sainsburys"], ids: plan.ids, start: "2026-11-19", variety: 5 })!.variety).toBeUndefined();
    expect(sanitizePlan({ shops: ["sainsburys"], ids: plan.ids, start: "2026-11-19" })!.variety).toBeUndefined();
  });
});

describe("earlier plans (founder 2026-11-19: \"they can start another meal plan\")", () => {
  const cands = planCandidates(RECIPES, products, none, target, []);
  const ids = makePlan(cands, null)!.ids;
  const plan = (start: string) => sanitizePlan({ shops: ["sainsburys"], ids, start })!;

  it("keeps the plan set aside first, without a copy, and only the last few", () => {
    let earlier = keepEarlier([], plan("2026-11-01"));
    earlier = keepEarlier(earlier, plan("2026-11-08"));
    expect(earlier.map((p) => p.start)).toEqual(["2026-11-08", "2026-11-01"]);
    expect(keepEarlier(earlier, plan("2026-11-08")).map((p) => p.start)).toEqual(["2026-11-08", "2026-11-01"]);
    for (let d = 10; d < 20; d++) earlier = keepEarlier(earlier, plan(`2026-11-${d}`));
    expect(earlier).toHaveLength(MAX_EARLIER_PLANS);
    expect(earlier[0]!.start).toBe("2026-11-19");
    expect(keepEarlier(earlier, null)).toHaveLength(MAX_EARLIER_PLANS);
  });

  it("opening an earlier plan makes it the plan and puts the one it replaces first", () => {
    const now = plan("2026-11-19");
    const earlier = [plan("2026-11-12"), plan("2026-11-05")];
    const opened = openEarlier(now, earlier, 1);
    expect(opened.current!.start).toBe("2026-11-05");
    expect(opened.earlier.map((p) => p.start)).toEqual(["2026-11-19", "2026-11-12"]);
    expect(openEarlier(now, earlier, 9).current).toBe(now);
  });

  it("reads back only good plans from the phone", () => {
    expect(sanitizePlans([plan("2026-11-12"), { nonsense: true }, null]).map((p) => p.start)).toEqual(["2026-11-12"]);
    expect(sanitizePlans("x")).toEqual([]);
  });
});

describe("cuisines for lunch and dinner (founder 2026-11-19: \"choose the cuisine or have the option to do any cuisine\")", () => {
  it("keeps the cuisines chosen with the plan, only known ones; none means any", () => {
    const ids = makePlan(planCandidates(RECIPES, products, none, target, []), null)!.ids;
    expect(sanitizePlan({ shops: ["sainsburys"], ids, start: "2026-11-19", cuisines: ["italian", "indian", "klingon"] })!.cuisines).toEqual(["italian", "indian"]);
    expect(sanitizePlan({ shops: ["sainsburys"], ids, start: "2026-11-19" })!.cuisines).toBeUndefined();
  });
});

// Usability test 2026-11-19 (Raj, Irene): a kind of food with too few lunches for the diet no longer stops the plan, and "Spicy food" catches hot dishes by name.
describe("kinds of food and spicy food", () => {
  const veg = { vegetarianOnly: true };
  it("keeps only the chosen kind where there are enough, and lets a meal with too few take any kind", async () => {
    const { cuisineRecipes, CUISINE_MIN } = await import("../lib/mm/mealPlan");
    const { matchesNiche } = await import("../lib/mm/recipeNiche");
    const { recipeForDiet } = await import("../lib/mm/recipes");
    expect(cuisineRecipes(RECIPES, [], veg, []).widened).toEqual([]);
    for (const cuisine of ["indian", "italian", "chinese", "mexican", "british", "middle-eastern"] as const) {
      const { recipes, widened } = cuisineRecipes(RECIPES, [cuisine], veg, []);
      for (const meal of ["lunch", "dinner"] as const) {
        const ofKind = RECIPES.filter((r) => r.meal === meal && matchesNiche(r.id, [cuisine], []) && recipeForDiet(r, veg)).length;
        const kept = recipes.filter((r) => r.meal === meal);
        expect(widened.includes(meal), `${cuisine} ${meal}: ${ofKind}`).toBe(ofKind < CUISINE_MIN);
        if (ofKind < CUISINE_MIN) expect(kept.length).toBe(RECIPES.filter((r) => r.meal === meal).length);
        else expect(kept.every((r) => matchesNiche(r.id, [cuisine], []))).toBe(true);
      }
      expect(recipes.filter((r) => r.meal === "breakfast").length).toBe(RECIPES.filter((r) => r.meal === "breakfast").length);
    }
  });
  it("leaves out dishes named spiced or devilled, and ones made hot with a dried spice", () => {
    const named = RECIPES.filter((r) => /\b(spiced|devilled|spicy|harissa|peri peri|cajun|jerk)\b/i.test(r.name));
    expect(named.length).toBeGreaterThan(0);
    for (const r of named) expect(leavesOut(r, ["spicy"]), r.name).toBe(true);
    const hotSpice = RECIPES.filter((r) => r.ingredients.some((i) => /chilli flakes|cayenne|chilli powder/i.test(i.label)));
    for (const r of hotSpice) expect(leavesOut(r, ["spicy"]), r.name).toBe(true);
    // a seasoning still never counts for other foods: black pepper is not peppers
    const blackPepper = RECIPES.find((r) => r.ingredients.some((i) => /black pepper/i.test(i.label)) && !/pepper/i.test(r.name) && !r.ingredients.some((i) => /\b(red|green|yellow) pepper|peppers\b/i.test(i.label)));
    if (blackPepper) expect(leavesOut(blackPepper, ["peppers"])).toBe(false);
  });
  it("keeps the mark that a meal was swapped", () => {
    const plan = sanitizePlan({ shops: ["sainsburys"], ids: Array.from({ length: PLAN_DAYS }, () => ["a", "b", "c"]), leaveOut: [], budget: 40, start: "2026-11-19", swapped: true });
    expect(plan?.swapped).toBe(true);
    expect(sanitizePlan({ shops: ["sainsburys"], ids: Array.from({ length: PLAN_DAYS }, () => ["a", "b", "c"]), leaveOut: [], budget: 40, start: "2026-11-19", swapped: "yes" })?.swapped).toBeUndefined();
  });
});

describe("a plan for several people (usability test 2026-11-19: Raj, 'a plan for two')", () => {
  const cands = planCandidates(RECIPES, products, none, target, [], "sainsburys");
  const betterOf = (c: Parameters<typeof betterCandidate>[0]) => betterCandidate(c, products, target);
  const one = makePlan(cands, null)!;

  it("buys enough for everyone: the same meals, each meal's price times the people, the day's calories still one person's", () => {
    const two = forPeople(cands, 2);
    const w1 = buildWeek(one.ids, cands, null)!;
    const w2 = buildWeek(one.ids, two, null)!;
    w1.days.forEach((d, i) => {
      expect(w2.days[i]!.kcal).toBe(d.kcal);
      expect(w2.days[i]!.protein).toBe(d.protein);
      expect(w2.days[i]!.cost).toBeCloseTo(d.cost * 2, 1);
    });
    expect(w2.mealsCost).toBeCloseTo(w1.mealsCost * 2, 0);
    // more is bought, never less, and never more than twice the packs
    expect(w2.shoppingCost).toBeGreaterThan(w1.shoppingCost);
    expect(w2.shoppingCost).toBeLessThanOrEqual(w1.shoppingCost * 2 + 0.01);
    for (const l of w2.shopping) {
      const before = w1.shopping.find((x) => x.product.id === l.product.id)!;
      expect(l.packs).toBeGreaterThanOrEqual(before.packs);
    }
  });

  it("is one person's candidates for one, and the same map each time (makePlan's memo)", () => {
    expect(forPeople(cands, 1)).toBe(cands);
    expect(forPeople(cands, 3)).toBe(forPeople(cands, 3));
    expect(PLAN_PEOPLE[0]).toBe(1);
  });

  it("finds better products from one person's recipe and prices them for everyone", () => {
    const c = [...cands.values()].flat().find((x) => betterOf(x))!;
    const b1 = betterOf(c)!;
    const c3 = forPeople(cands, 3).get(c.meal)!.find((x) => x.recipe.id === c.recipe.id)!;
    const b3 = betterForPeople(betterOf, 3)(c3)!;
    expect(b3.cost).toBeCloseTo(b1.cost * 3, 6);
    expect(b3.servings).toBeCloseTo(b1.servings / 3, 6);
    const r1 = budgetRange(cands, betterOf)!;
    const r2 = budgetRange(forPeople(cands, 2), betterForPeople(betterOf, 2))!;
    expect(r2.best).toBeGreaterThan(r1.best);
    expect(r2.max).toBeGreaterThan(r2.best);
  });

  it("keeps how many people when the plan is saved, two to six", () => {
    const base = { shops: ["sainsburys"], ids: Array.from({ length: PLAN_DAYS }, () => ["a", "b", "c"]), leaveOut: [], budget: 40, start: "2026-11-19" };
    expect(sanitizePlan({ ...base, people: 2 })?.people).toBe(2);
    expect(sanitizePlan({ ...base, people: 1 })?.people).toBeUndefined();
    expect(sanitizePlan({ ...base, people: 9 })?.people).toBeUndefined();
    expect(sanitizePlan({ ...base, people: "2" })?.people).toBeUndefined();
  });
});

describe("Cheese left out", () => {
  it("leaves out pesto, paneer, ricotta and mascarpone dishes too (cheese whose names don't say so)", () => {
    const words = LEAVE_OUT.find((c) => c.id === "cheese")!.words;
    for (const w of ["pesto", "paneer", "ricotta", "mascarpone"]) expect(words).toContain(w);
    const pesto = RECIPES.filter((r) => /pesto/i.test(r.name));
    expect(pesto.length).toBeGreaterThan(0);
    for (const r of pesto) expect(leavesOut(r, ["cheese"]), r.name).toBe(true);
  });
});

describe("what a plan keeps about itself", () => {
  const plan: SavedPlan = { shops: ["sainsburys"], ids: Array.from({ length: PLAN_DAYS }, () => ["overnight-oats", "chicken-wrap", "chicken-curry"]), slots: ["breakfast", "lunch", "dinner"], leaveOut: [], budget: null, start: "2026-11-20" };

  it("keeps the diet it was made with (only what is on), and that the week went on the shopping list", () => {
    const saved = { ...plan, diet: cleanDiet({ vegetarianOnly: true, noPork: false, avoidAllergens: ["milk", "peanuts", "milk"] }), addedToList: planListKey(plan) };
    expect(saved.diet).toEqual({ vegetarianOnly: true, avoidAllergens: ALLERGEN_KEYS.filter((a) => a === "milk" || a === "peanuts") });
    expect(sanitizePlan(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    // anything else in those places is dropped
    expect(sanitizePlan({ ...plan, diet: "vegan", addedToList: "<script>" })).toEqual(plan);
    expect(sanitizePlan({ ...plan, diet: { vegetarianOnly: "yes", avoidAllergens: ["milk", "glitter"] } })?.diet).toEqual({ avoidAllergens: ["milk"] });
  });

  it("tells diets apart only by what they leave out (false and absent alike, allergies in any order)", () => {
    expect(sameDiet({ veganOnly: true, noPork: false, avoidAllergens: ["milk", "eggs"] }, { avoidAllergens: ["eggs", "milk"], veganOnly: true })).toBe(true);
    expect(sameDiet({ veganOnly: true }, {})).toBe(false);
    expect(sameDiet({ avoidAllergens: ["peanuts"] }, {})).toBe(false);
  });

  it("knows when the week changed since it went on the shopping list: a swapped meal, more people", () => {
    const key = planListKey(plan);
    expect(planListKey({ ...plan })).toBe(key);
    expect(key).toMatch(/^[a-z0-9]{1,24}$/);
    expect(planListKey({ ...plan, ids: setMeal(plan.ids, 2, 1, "tuna-pasta") })).not.toBe(key);
    expect(planListKey({ ...plan, people: 2 })).not.toBe(key);
    expect(planListKey({ ...plan, better: ["dinner:chicken-curry"] })).not.toBe(key);
  });

  it("says which of its days today is, by the local date: 0 on its first day, 6 on its last, past 6 once it's over", () => {
    expect(planDayIndex("2026-11-16", "2026-11-16")).toBe(0);
    expect(planDayIndex("2026-11-16", "2026-11-20")).toBe(4);
    expect(planDayIndex("2026-11-16", "2026-11-22")).toBe(6);
    expect(planDayIndex("2026-11-16", "2026-11-23")).toBe(7);
    expect(planDayIndex("2026-11-20", "2026-11-19")).toBe(-1);
    // across the clocks going back (25 October 2026) and a month end
    expect(planDayIndex("2026-10-24", "2026-10-26")).toBe(2);
    expect(planDayIndex("2026-11-28", "2026-12-02")).toBe(4);
  });
});

describe("a week that comes in under the person's calories", () => {
  const meal = (meal: "breakfast" | "lunch" | "dinner" | "snack", kcal: number) => ({ meal, candidate: { perServing: { kcal, protein: 0, carbs: 0, fat: 0 } } as never });
  const days = (kcals: number[][]) => ({ days: kcals.map((d) => ({ meals: [meal("breakfast", d[0]!), meal("lunch", d[1]!), meal("dinner", d[2]!), ...(d[3] ? [meal("snack", d[3])] : [])], kcal: d.reduce((a, b) => a + b, 0), protein: 0, cost: 0 })) });
  it("says the average day and the largest meal the recipes reach, when more than 5% under", () => {
    expect(SHORTFALL_NOTE).toBe(0.05);
    expect(planShortfall(days([[800, 950, 1176], [850, 900, 1100]]), 3400)).toEqual({ avg: 2888, max: 1180 });
    // a snack is never the largest meal
    expect(planShortfall(days([[800, 900, 900, 1300]]), 4600)?.max).toBe(900);
  });
  it("says nothing when the days come within 5%", () => {
    expect(planShortfall(days([[650, 650, 650]]), 2000)).toBeNull();
    expect(planShortfall(days([[700, 700, 700]]), 2000)).toBeNull();
    expect(planShortfall({ days: [] }, 2000)).toBeNull();
  });
});

describe("week 1 and each week after (founder 2026-11-20: \"week one cost and then the week afterwards costs\")", () => {
  const line = (cost: number, used: number, keeps: boolean, label = "x"): ShopLine => ({ shop: "s", product: { id: `${cost}-${used}-${keeps}`, name: "x", price: cost } as never, packs: 1, cost, cupboard: false, used, keeps, label });
  const week = (lines: ShopLine[]) => ({ shopping: lines, shoppingCost: Math.round(lines.reduce((s, l) => s + l.cost, 0) * 100) / 100 });

  it("week 1 buys every pack; later weeks buy the fresh food again and only the share eaten of what keeps", () => {
    // fresh chicken £4 (half eaten), olive oil £5.75 (22p used), rice £3.90 (£1.05 used)
    expect(weekCosts(week([line(4, 2, false), line(5.75, 0.22, true), line(3.9, 1.05, true)]))).toEqual({ first: 13.65, after: 5.27 });
    // nothing keeps: every week the same
    expect(weekCosts(week([line(2.5, 1, false), line(1.2, 1.2, false)]))).toEqual({ first: 3.7, after: 3.7 });
    // all of a keeping pack eaten in the week: bought again
    expect(weekCosts(week([line(1.5, 1.5, true)]))).toEqual({ first: 1.5, after: 1.5 });
    expect(weekCosts(week([]))).toEqual({ first: 0, after: 0 });
  });

  it("rounds to pence and never says later weeks cost more", () => {
    const c = weekCosts(week([line(0.333, 0.111, true), line(0.335, 0.2, false)]));
    expect(c.after).toBe(Math.round(c.after * 100) / 100);
    // a line whose used share was more than its cost (never in a real week) still counts at most its cost
    expect(weekCosts(week([line(1, 3, true)])).after).toBe(1);
  });

  it("says the two weeks apart only when later weeks are at least £1 less", () => {
    expect(WEEK_AFTER_SAVING).toBe(1);
    expect(showsWeekAfter({ first: 10, after: 9 })).toBe(true);
    expect(showsWeekAfter({ first: 47.83, after: 46.83 })).toBe(true);
    expect(showsWeekAfter({ first: 47.83, after: 46.84 })).toBe(false);
    expect(showsWeekAfter({ first: 12, after: 12 })).toBe(false);
  });

  it("names what makes the first shop dearer: the packs that keep, the most left over first, each once", () => {
    const w = week([line(4, 2, false, "Chicken"), line(5.75, 0.22, true, "Olive oil"), line(3.9, 1.05, true, "Rice"), line(0.65, 0.65, true, "Soy sauce"), line(1.2, 0.1, true, "Olive oil"), line(0.9, 0.3, true, "Salt")]);
    expect(lastingThings(w)).toEqual({ names: ["Olive oil", "Rice", "Salt"], more: false });
    expect(lastingThings(w, 2)).toEqual({ names: ["Olive oil", "Rice"], more: true });
    expect(lastingThings(week([line(4, 2, false, "Chicken")]))).toEqual({ names: [], more: false });
  });

  it("on real weeks at Sainsbury's: later weeks cost less, never more, and the saving is what keeps", () => {
    const shape = { ...DEFAULT_SHAPE, snacks: 0 };
    const cands = planCandidates(RECIPES, products, none, slotTargets(shape, { kcal: 2000, protein: 120 }), []);
    for (const variety of VARIETIES) {
      const w = makePlan(cands, null, planSlots(shape), variety)!.week;
      const c = weekCosts(w);
      expect(c.first).toBe(w.shoppingCost);
      expect(c.after).toBeLessThanOrEqual(c.first);
      expect(c.after).toBeGreaterThanOrEqual(w.fresh.bought - 0.01);
      const kept = w.shopping.filter((l) => l.keeps);
      expect(c.first - c.after).toBeCloseTo(kept.reduce((s, l) => s + l.cost - l.used, 0), 1);
      expect(showsWeekAfter(c), `variety ${variety}: ${JSON.stringify(c)}`).toBe(true);
      expect(lastingThings(w).names.length).toBeGreaterThan(0);
      for (const l of w.shopping) expect(l.label.length).toBeGreaterThan(0);
    }
  });
});

// A varied week (founder 2026-11-20: "a lot of them are to do with wraps ... You want kind of like a varied diet ... You can't just do wraps every single
// day"): never the same dish form twice in a day, never the same form in the same meal two days running, at most two wraps, where the recipes allow it.
// Every style is measured in tests/eatingStyle.test.ts; these are the plan's other answers.
describe("a varied week", () => {
  const forms = (ids: string[][], cands: Parameters<typeof weekForms>[1], slots: readonly MealType[]) => varietyReport(weekForms(ids, cands, slots));
  const SNACKS = planSlots({ meals: ["breakfast", "lunch", "dinner"], snacks: 2 });
  const sized = planCandidates(RECIPES, products, none, slotTargets({ meals: ["breakfast", "lunch", "dinner"], snacks: 2 }, { kcal: 2000, protein: 100 }, null), [], "sainsburys");

  it("one size for every meal, each way of repeating, with no budget and the cheapest week", () => {
    const cands = planCandidates(RECIPES, products, none, target, []);
    for (const variety of VARIETIES) {
      for (const budget of [null, 1]) {
        const plan = makePlan(cands, budget, PLAN_MEALS, variety)!;
        const r = forms(plan.ids, cands, PLAN_MEALS);
        expect(r, `${variety} ${budget}`).toEqual({ sameDay: 0, dayAfter: 0, wraps: expect.any(Number) });
        expect(r.wraps, `${variety} ${budget}`).toBeLessThanOrEqual(MAX_WRAPS_A_WEEK);
      }
    }
  });

  it("two snacks a day: the day's two snacks are different dishes too", () => {
    const plan = makePlan(sized, null, SNACKS, PER_MEAL_RECIPES)!;
    const r = forms(plan.ids, sized, SNACKS);
    expect(r.sameDay).toBe(0);
    expect(r.wraps).toBeLessThanOrEqual(MAX_WRAPS_A_WEEK);
    for (const d of plan.ids) expect(d[3]).not.toBe(d[4]);
  });

  it("a vegetarian at Morrisons and a household's plan (as written) are varied too", () => {
    const veg = planCandidates(RECIPES, morrisons, { vegetarianOnly: true }, target, [], "morrisons");
    const vegPlan = makePlan(veg, null)!;
    expect(forms(vegPlan.ids, veg, PLAN_MEALS)).toEqual({ sameDay: 0, dayAfter: 0, wraps: expect.any(Number) });
    const written = planCandidates(RECIPES, products, none, { breakfast: { kcal: 500 }, lunch: { kcal: 600 }, dinner: { kcal: 700 } }, [], "sainsburys", true);
    const home = makePlan(written, null)!;
    const r = forms(home.ids, written, PLAN_MEALS);
    expect(r).toEqual({ sameDay: 0, dayAfter: 0, wraps: expect.any(Number) });
    expect(r.wraps).toBeLessThanOrEqual(MAX_WRAPS_A_WEEK);
  });

  it("with only wraps to choose from, still makes the week (as varied as the recipes allow)", () => {
    const cands = planCandidates(RECIPES, products, none, target, []);
    const wrapsOnly = new Map([...cands].map(([m, l]) => [m, l.filter((c) => c.recipe.ingredients.some((i) => i.pantry === "wraps"))]));
    const plan = makePlan(wrapsOnly, null)!;
    expect(plan.week.days).toHaveLength(PLAN_DAYS);
    expect(forms(plan.ids, wrapsOnly, PLAN_MEALS).wraps).toBe(PLAN_DAYS * PLAN_MEALS.length);
  });

  it("names each day's dish forms from the candidates the week was made from", () => {
    const cands = planCandidates(RECIPES, products, none, target, []);
    const plan = makePlan(cands, null)!;
    const week = weekForms(plan.ids, cands);
    expect(week).toHaveLength(PLAN_DAYS);
    plan.ids.forEach((d, i) => d.forEach((id, j) => expect(week[i]![j]).toBe(dishForm(byId.get(id)!))));
    expect(weekForms([["not-a-recipe", "x", "y"]], cands)[0]).toEqual([undefined, undefined, undefined]);
  });
});

describe("the 21 November meeting (Kemi)", () => {
  it("a typed allergen or meat leaves out what has it by the pantry's flags: 'nuts' the peanut butter toast and the almond porridge", () => {
    const toast = byId.get("peanut-butter-banana-toast")!;
    const porridge = byId.get("berry-almond-porridge")!;
    expect(toast && porridge, "the two recipes").toBeTruthy();
    for (const w of ["nuts", "nut", "Nuts"]) {
      expect(leavesOut(toast, [w]), w).toBe(true);
      expect(leavesOut(porridge, [w]), w).toBe(true);
    }
    expect(leavesOut(toast, ["peanuts"])).toBe(true);
    expect(leavesOut(porridge, ["peanuts"])).toBe(false); // almonds are tree nuts
    // pork: the bacon and the ham, whatever their labels say
    const pork = RECIPES.filter((r) => r.ingredients.some((i) => i.pantry === "bacon" || i.pantry === "ham"));
    expect(pork.length).toBeGreaterThan(0);
    for (const r of pork) expect(leavesOut(r, ["pork"]), r.id).toBe(true);
    // sesame and soya by their flags (houmous, soy sauce), and a word that names nothing leaves out only what has it
    const houmous = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "houmous"));
    if (houmous) expect(leavesOut(houmous, ["sesame"])).toBe(true);
    const soy = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "soy"));
    if (soy) expect(leavesOut(soy, ["soya"])).toBe(true);
    expect(leavesOut(porridge, ["sweetcorn"])).toBe(false);
  });

  it("a meal planned for one diet fits another only when it is made the same way, with the same products' rules", () => {
    const chicken = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "chicken") && !r.ingredients.some((i) => i.pantry && PANTRY.get(i.pantry)?.contains.includes("lupin")))!;
    expect(fitsDietNow(chicken, {}, {})).toBe(true);
    // an allergy that changes nothing in it
    expect(fitsDietNow(chicken, {}, { avoidAllergens: ["lupin"] })).toBe(true);
    // the same recipe, now matched to other products: hidden until swapped
    expect(fitsDietNow(chicken, {}, { noHalalKosherMeat: true })).toBe(false);
    expect(fitsDietNow(chicken, {}, { halalOnly: true })).toBe(false);
    expect(fitsDietNow(chicken, { halalOnly: true }, {})).toBe(false);
    // left out by the diet now
    expect(fitsDietNow(chicken, {}, { vegetarianOnly: true })).toBe(false);
    // a meat-free meal is made the same way whatever the meat rules
    const veg = RECIPES.find((r) => r.meal === "dinner" && isVegan(r) && !r.ingredients.some((i) => i.pantry === "pesto"))!;
    expect(fitsDietNow(veg, {}, { noHalalKosherMeat: true })).toBe(true);
    expect(fitsDietNow(veg, {}, { vegetarianOnly: true })).toBe(true);
  });
});
