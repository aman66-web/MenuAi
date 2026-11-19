import { tk } from "./i18n";
import type { DietPrefs } from "./pantry";
import { PANTRY } from "./pantry";
import { candidates as productCandidates, fitDistance, fitRecipe, isMeatFree, pickFor, recipeForDiet, recipeTotals, resolveRecipe, type IngredientPick, type IngredientSpec, type MealTarget, type MealType, type Recipe } from "./recipes";
import { normalizeForSearch } from "./search";
import { productKey, type PricedProduct, type ShopProduct } from "./shopProducts";

// A week's meal plan (founder 2026-11-18: "they type all of this in, and then my app will make them a diet plan for a week. It'll tell them what they need to buy
// for the week for their shopping list ... how much the price is for each meal of each day ... the full cost ... Budget, amount of money per week"; "you should
// only use the pre-made recipes ... just filter it to that, and make the best plan for them"). No AI: only our own recipes, each fitted to the person's meal
// size exactly as the Recipes tab fits it (lib/mm/recipes.ts fitRecipe), left out when the diet, an allergy or a food they don't eat rules it out, and only
// when the chosen shop sells every ingredient with a read label and a price. A meal's price is what the amounts it uses cost at the shop's price per kg or
// litre (a serving's price on the recipe page); the shopping bill is the whole packs the week needs, every meal's amounts added up per product first, so a
// pack shared by two meals is bought once. Pure and unit-tested (tests/mealPlan.test.ts); the screen is app/app/plan.

export const PLAN_DAYS = 7;
export const PLAN_MEALS: readonly MealType[] = ["breakfast", "lunch", "dinner"];
/** How many different recipes each meal of the day rotates through in a week: four, so each comes round at most twice (variety, and packs shared). */
export const PER_MEAL_RECIPES = 4;
/**
 * How often a meal may come round (founder 2026-11-18: "they can choose if they want any foods repeated"): seven recipes for each meal (a different one every
 * day), four (each twice at most: the default) or two (meal prep: cooked in batches, the least left in the packs).
 */
export const VARIETIES = [7, 4, 2] as const;
export type Variety = (typeof VARIETIES)[number];

/**
 * Kinds whose leftovers keep well past the week (founder 2026-11-18: "by the end of the week, all the ingredients shall be basically almost complete. Except for
 * like the oil and the herb ... which can be spread out over a long time"): store-cupboard seasonings and oils, dry goods, jars and bottles, and frozen food.
 * Everything else is fresh food, and the plan is made so as little of it as possible is left in the packs.
 */
export const KEEPS_WELL: ReadonlySet<string> = new Set([
  "rice", "pasta-long", "pasta-shapes", "oats", "egg-noodles", "rice-noodles", "lasagne-sheets", "granola", "wheat-biscuits", "red-lentils", "raisins", "dried-cranberries", "almonds", "mixed-seeds",
  "olive-oil", "honey", "stock-cube", "fajita-seasoning", "soy", "peanut-butter", "sweet-chilli", "bbq-sauce", "teriyaki", "light-mayo", "pesto", "curry-paste", "thai-curry-paste", "chopped-tomato-puree", "cranberry-sauce", "apple-sauce", "mincemeat",
  "peas", "edamame", "berries",
]);
/** Whether what's left of this product after the week keeps (KEEPS_WELL, a cupboard item, or a product sold frozen). */
export const keepsWell = (spec: IngredientSpec, product: { name: string }): boolean => !!spec.cupboard || KEEPS_WELL.has(spec.pantry ?? spec.key) || /\bfrozen\b/i.test(product.name);
/**
 * What a day of the plan is made of (founder 2026-11-18: "should also specify how many meals and how many snacks they want a day ... full personalization"):
 * any of breakfast, lunch and dinner, and up to three snacks. The slots are the day's meals in that order, then the snacks.
 */
export interface DayShape { meals: MealType[]; snacks: number }
export const MAX_SNACKS = 3;
export const DEFAULT_SHAPE: DayShape = { meals: ["breakfast", "lunch", "dinner"], snacks: 0 };
export const planSlots = (shape: DayShape): MealType[] => [...PLAN_MEALS.filter((m) => shape.meals.includes(m)), ...Array.from({ length: shape.snacks }, () => "snack" as const)];
export const shapeOf = (slots: readonly MealType[]): DayShape => ({ meals: PLAN_MEALS.filter((m) => slots.includes(m)), snacks: slots.filter((m) => m === "snack").length });

/** How the day's meals share what isn't eaten as snacks: a smaller breakfast, a bigger dinner. */
const MEAL_WEIGHT: Record<string, number> = { breakfast: 0.8, lunch: 1, dinner: 1.2 };

/**
 * Each slot's size from the person's own daily numbers, so the day adds up to them: a snack is a tenth of the day (100-250 kcal), the meals share the rest
 * by MEAL_WEIGHT, each kept between 200 and 1,200 kcal (and under the GLP-1 meal cap when the person has one); protein follows each slot's share of the day.
 * Recipes are then fitted to these sizes exactly as the Recipes tab fits them.
 */
export function slotTargets(shape: DayShape, daily: { kcal: number; protein: number }, cap?: number | null): Partial<Record<MealType, MealTarget>> {
  const out: Partial<Record<MealType, MealTarget>> = {};
  const round10 = (v: number) => Math.round(v / 10) * 10;
  const snackKcal = shape.snacks ? Math.min(250, Math.max(100, round10(daily.kcal * 0.1))) : 0;
  const meals = PLAN_MEALS.filter((m) => shape.meals.includes(m));
  const rest = daily.kcal - shape.snacks * snackKcal;
  const weights = meals.reduce((t, m) => t + MEAL_WEIGHT[m]!, 0);
  const share = (kcal: number) => Math.max(5, Math.round((daily.protein * kcal) / Math.max(1, daily.kcal)));
  for (const m of meals) {
    let kcal = Math.min(1200, Math.max(200, round10((rest * MEAL_WEIGHT[m]!) / weights)));
    if (cap) kcal = Math.min(kcal, cap);
    out[m] = { kcal, protein: share(kcal) };
  }
  if (shape.snacks) out.snack = { kcal: snackKcal, protein: share(snackKcal) };
  return out;
}

/** A budget never swaps a meal for one this far from the meal size (fitDistance; 0.3 is about 30% off on calories): a cheap 200 kcal soup doesn't make a lunch. */
export const MAX_SWAP_DISTANCE = 0.3;

/** Foods people commonly leave out that a diet or an allergy doesn't already cover, as plain choices; each matches these words in a recipe's ingredients. */
export const LEAVE_OUT: ReadonlyArray<{ id: string; label: string; words: readonly string[] }> = [
  { id: "mushrooms", label: tk("Mushrooms"), words: ["mushroom"] },
  { id: "fish", label: tk("Fish and seafood"), words: ["fish", "salmon", "tuna", "cod", "haddock", "mackerel", "prawn", "seafood", "sardine", "anchov"] },
  { id: "eggs", label: tk("Eggs"), words: ["egg"] },
  { id: "onions", label: tk("Onions"), words: ["onion"] },
  { id: "peppers", label: tk("Peppers"), words: ["peppers", "red pepper", "green pepper", "yellow pepper"] },
  { id: "spicy", label: tk("Spicy food"), words: ["chilli", "jalapeno", "jalapeño", "cayenne", "curry paste", "hot sauce", "sriracha"] },
  { id: "tomatoes", label: tk("Tomatoes"), words: ["tomato", "passata"] },
  { id: "beans", label: tk("Beans and lentils"), words: ["bean", "lentil", "chickpea"] },
  { id: "cheese", label: tk("Cheese"), words: ["cheese", "cheddar", "mozzarella", "feta", "halloumi", "parmesan"] },
  { id: "coconut", label: tk("Coconut"), words: ["coconut"] },
  { id: "rice", label: tk("Rice"), words: ["rice"] },
  { id: "pasta", label: tk("Pasta"), words: ["pasta", "spaghetti", "penne", "fusilli", "noodle"] },
];

/** The words a recipe is checked against for a food left out: its name and each ingredient's label and kind (never a seasoning's: "black pepper" is not peppers). */
function recipeWords(recipe: Recipe): string {
  const parts = [recipe.name];
  for (const i of recipe.ingredients) {
    const kind = i.pantry ? PANTRY.get(i.pantry) : undefined;
    if (kind?.labelOptional) continue; // salt, pepper and dried spices
    parts.push(i.label, kind?.label ?? "");
  }
  return ` ${normalizeForSearch(parts.join(" "))} `;
}

/** Whether a recipe has any of the foods left out (the choices above by id, or words the person typed). */
export function leavesOut(recipe: Recipe, leaveOut: readonly string[]): boolean {
  if (!leaveOut.length) return false;
  const hay = recipeWords(recipe);
  return leaveOut.some((x) => {
    const choice = LEAVE_OUT.find((c) => c.id === x);
    const words = choice ? choice.words : [x];
    return words.some((w) => {
      const n = normalizeForSearch(w);
      return n.length >= 3 && hay.includes(` ${n}`);
    });
  });
}

/** A recipe that can go in the plan: fitted to the meal, every ingredient at the shop with a price, and what one serving costs. */
export interface PlanCandidate {
  /** The shop every ingredient comes from (several shops: the one where this recipe fits best and costs least). */
  shop: string;
  recipe: Recipe;
  /** The recipe for the person's diet before it was fitted to the meal (a better version is fitted again from it). */
  base: Recipe;
  /** Made with the shop's better products (betterCandidate). */
  better?: boolean;
  meal: MealType;
  perServing: { kcal: number; protein: number; carbs: number; fat: number };
  /** What one serving's amounts cost (the recipe page's price a serving). */
  cost: number;
  /** The fitted recipe's products for its written servings. */
  picks: IngredientPick[];
  servings: number;
  /** How far one serving is from the meal size (0 = spot on). */
  distance: number;
}

/** Every recipe that can go in the plan, for each meal, closest to the meal size first (then cheapest, then name). */
export function planCandidates(
  recipes: readonly Recipe[],
  products: readonly ShopProduct[],
  diet: DietPrefs,
  targets: MealTarget | Partial<Record<MealType, MealTarget>> | null,
  leaveOut: readonly string[],
  shop = "",
): Map<MealType, PlanCandidate[]> {
  // one size for breakfast, lunch and dinner (the Recipes tab's), or a size for each slot the day has (slotTargets)
  const single = !targets || "kcal" in targets;
  const wanted: MealType[] = single ? [...PLAN_MEALS] : (Object.keys(targets) as MealType[]);
  const targetFor = (m: MealType): MealTarget | null => (single ? ((targets as MealTarget | null) ?? null) : ((targets as Partial<Record<MealType, MealTarget>>)[m] ?? null));
  const out = new Map<MealType, PlanCandidate[]>(wanted.map((m) => [m, []]));
  for (const base of recipes) {
    if (!base.meal || !wanted.includes(base.meal)) continue;
    const target = targetFor(base.meal);
    const recipe = recipeForDiet(base, diet);
    if (!recipe || leavesOut(recipe, leaveOut)) continue;
    const fitted = target ? fitRecipe(recipe, products, {}, target) : null;
    const resolved = fitted ? fitted.resolved : resolveRecipe(recipe, products);
    const totals = fitted ? fitted.totals : recipeTotals(resolved);
    if (!totals || !resolved.complete || totals.costPerServing === null) continue;
    out.get(base.meal)!.push({
      shop,
      recipe: fitted ? fitted.recipe : recipe,
      base: recipe,
      meal: base.meal,
      perServing: totals.perServing,
      cost: totals.costPerServing,
      picks: resolved.picks as IngredientPick[],
      servings: (fitted ? fitted.recipe : recipe).servings,
      distance: target ? fitDistance(totals.perServing, target) : 0,
    });
  }
  for (const list of out.values()) list.sort((a, b) => a.distance - b.distance || a.cost - b.cost || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
  return out;
}

/** How much further from the meal size another shop's version of a recipe may be and still be chosen for being cheaper (fitDistance units). */
export const SHOP_FIT_SLACK = 0.05;

/**
 * Every recipe that can go in the plan from any of the person's shops (founder 2026-11-18: "they're able to select multiple supermarkets ... it'll combine
 * everything and then choose the best meal plan overall"): each recipe is fitted at every shop, and the plan uses the shop where it comes closest to the meal
 * size, or a cheaper one that is as close (within SHOP_FIT_SLACK). All of one recipe's ingredients come from one shop, so a meal is bought in one place.
 */
export function planCandidatesAcross(
  recipes: readonly Recipe[],
  shops: ReadonlyArray<{ id: string; products: readonly ShopProduct[] }>,
  diet: DietPrefs,
  target: MealTarget | Partial<Record<MealType, MealTarget>> | null,
  leaveOut: readonly string[],
): Map<MealType, PlanCandidate[]> {
  return mergeCandidates(shops.map((sh) => planCandidates(recipes, sh.products, diet, target, leaveOut, sh.id)));
}

/** planCandidatesAcross's second half, for a screen that works out one shop at a time: each recipe from the shop where it fits best (see above). */
export function mergeCandidates(each: ReadonlyArray<Map<MealType, PlanCandidate[]>>): Map<MealType, PlanCandidate[]> {
  const meals = [...new Set(each.flatMap((m) => [...m.keys()]))];
  const out = new Map<MealType, PlanCandidate[]>(meals.map((m) => [m, []]));
  for (const meal of meals) {
    const byRecipe = new Map<string, PlanCandidate[]>();
    for (const cands of each) for (const c of cands.get(meal) ?? []) byRecipe.set(c.recipe.id, [...(byRecipe.get(c.recipe.id) ?? []), c]);
    for (const options of byRecipe.values()) {
      const closest = Math.min(...options.map((o) => o.distance));
      const best = options.filter((o) => o.distance <= closest + SHOP_FIT_SLACK).sort((a, b) => a.cost - b.cost || a.distance - b.distance || a.shop.localeCompare(b.shop))[0]!;
      out.get(meal)!.push(best);
    }
    out.get(meal)!.sort((a, b) => a.distance - b.distance || a.cost - b.cost || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
  }
  return out;
}

/**
 * Better produce (founder 2026-11-18: "higher than the green part is a higher budget to afford better produce"): the shops' own better ranges, organic and
 * free range, as their product names say.
 */
export const BETTER = /\b(taste the difference|finest|extra special|exceptional|the best|no\.? ?1|duchy|specially selected|deluxe|luxury|organic|free range)\b/i;

/**
 * The same recipe with each ingredient's better product where the shop sells one (the first such product the recipe page would offer for it), fitted to the
 * meal the same way. Cupboard things (oil, salt, stock) stay as they are. Null when the shop has no better product for any ingredient.
 */
export function betterCandidate(c: PlanCandidate, products: readonly ShopProduct[], target: MealTarget | null): PlanCandidate | null {
  const meatFree = isMeatFree(c.base);
  const chosen: Record<string, string> = {};
  for (const pick of c.picks) {
    if (pick.spec.cupboard || BETTER.test(pick.product.name)) continue;
    const alt = productCandidates(products, pick.spec, meatFree).find((a) => BETTER.test(a.product.name));
    if (alt) chosen[pick.spec.key] = productKey(alt.product);
  }
  if (!Object.keys(chosen).length) return null;
  const fitted = target ? fitRecipe(c.base, products, chosen, target) : null;
  const resolved = fitted ? fitted.resolved : resolveRecipe(c.base, products, chosen);
  const totals = fitted ? fitted.totals : recipeTotals(resolved);
  if (!totals || !resolved.complete || totals.costPerServing === null || totals.costPerServing <= c.cost) return null;
  const recipe = fitted ? fitted.recipe : c.base;
  return { ...c, recipe, perServing: totals.perServing, cost: totals.costPerServing, picks: resolved.picks as IngredientPick[], servings: recipe.servings, distance: target ? fitDistance(totals.perServing, target) : 0, better: true };
}

/** The candidates with some recipes (by "meal:id") made with better products. */
export function withBetter(cands: Map<MealType, PlanCandidate[]>, better: ReadonlyMap<string, PlanCandidate>): Map<MealType, PlanCandidate[]> {
  if (!better.size) return cands;
  return new Map([...cands].map(([meal, list]) => [meal, list.map((c) => better.get(`${meal}:${c.recipe.id}`) ?? c)]));
}

/** The budget slider's three points: the cheapest week the recipes allow, the best fit for the person's goal, and that week with every better product. */
export interface BudgetRange { min: number; best: number; max: number }

/** The plan for a budget, and which of its recipes use better products (by "meal:id"). */
export interface BudgetPlan { ids: PlanIds; week: WeekPlan; better: string[] }

/**
 * The week for a budget (founder 2026-11-18: "lower on the scale is lower value produce but still to fit what they want; they can't go lower than what they
 * want"): under the best fit's bill, makePlan swaps in cheaper recipes (never one far from the meal size); at or over it, the best fit's recipes are made with
 * better products, the one that adds least to the bill first, while the bill stays within the budget. Null budget: the best fit.
 */
export function planForBudget(cands: Map<MealType, PlanCandidate[]>, budget: number | null, betterOf: (c: PlanCandidate) => PlanCandidate | null, slots: readonly MealType[] = PLAN_MEALS, variety: number = PER_MEAL_RECIPES): BudgetPlan | null {
  const best = makePlan(cands, null, slots, variety);
  if (!best) return null;
  if (budget === null) return { ...best, better: [] };
  if (best.week.shoppingCost > budget) {
    const cheaper = makePlan(cands, budget, slots, variety);
    return cheaper ? { ...cheaper, better: [] } : null;
  }
  const byKey = new Map<string, PlanCandidate>();
  for (const [meal, list] of cands) for (const c of list) byKey.set(`${meal}:${c.recipe.id}`, c);
  const inPlan = [...new Set(best.ids.flatMap((d) => d.map((id, i) => `${slots[i]}:${id}`)))];
  const options = inPlan.map((key) => ({ key, b: byKey.get(key) ? betterOf(byKey.get(key)!) : null })).filter((o): o is { key: string; b: PlanCandidate } => !!o.b);
  const chosen = new Map<string, PlanCandidate>();
  let week = best.week;
  // cheapest additions first
  const added = options
    .map((o) => ({ ...o, extra: (buildWeek(best.ids, withBetter(cands, new Map([[o.key, o.b]])), budget, slots)?.shoppingCost ?? Infinity) - best.week.shoppingCost }))
    .sort((a, b) => a.extra - b.extra || a.key.localeCompare(b.key));
  for (const o of added) {
    const trial = new Map(chosen).set(o.key, o.b);
    const w = buildWeek(best.ids, withBetter(cands, trial), budget, slots);
    if (w && w.shoppingCost <= budget + 0.005) {
      chosen.set(o.key, o.b);
      week = w;
    }
  }
  return { ids: best.ids, week, better: [...chosen.keys()] };
}

/** The slider's range for these candidates (see BudgetRange); null when no week can be made. */
export function budgetRange(cands: Map<MealType, PlanCandidate[]>, betterOf: (c: PlanCandidate) => PlanCandidate | null, slots: readonly MealType[] = PLAN_MEALS, variety: number = PER_MEAL_RECIPES): BudgetRange | null {
  const best = makePlan(cands, null, slots, variety);
  const cheapest = makePlan(cands, 0.01, slots, variety);
  if (!best || !cheapest) return null;
  const all = planForBudget(cands, Number.MAX_SAFE_INTEGER, betterOf, slots, variety);
  const min = Math.min(cheapest.week.shoppingCost, best.week.shoppingCost);
  return { min, best: best.week.shoppingCost, max: Math.max(best.week.shoppingCost, all?.week.shoppingCost ?? 0) };
}

/** The plan as recipe ids: days × meals (PLAN_MEALS order). */
export type PlanIds = string[][];

export interface ShopLine {
  /** The shop this product is bought at. */
  shop: string;
  product: PricedProduct;
  /** Whole packs the week needs. */
  packs: number;
  cost: number;
  /** A cupboard item (oil, salt, stock cubes): the person may have it already. */
  cupboard: boolean;
  /** What the week's meals eat of it, at the shop's price (never more than `cost`). */
  used: number;
  /** What's left keeps past the week (keepsWell). */
  keeps: boolean;
}

export interface PlanMeal { meal: MealType; candidate: PlanCandidate }
export interface PlanDay { meals: PlanMeal[]; kcal: number; protein: number; cost: number }

export interface WeekPlan {
  days: PlanDay[];
  /** What the 21 meals' amounts cost, added up (each meal's price a serving). */
  mealsCost: number;
  /** The shopping list: every meal's amounts added up per product, as whole packs. */
  shopping: ShopLine[];
  shoppingCost: number;
  /** The shops the week's shopping comes from, the one with the most to buy first. */
  shops: string[];
  /** The fresh food (everything that doesn't keep): what its packs cost, and what of that the week's meals eat. */
  fresh: { bought: number; eaten: number };
  budget: number | null;
  /** The plan's shopping bill is more than the budget (the cheapest plan the recipes allow was made). */
  overBudget: boolean;
}

const money = (v: number) => Math.round(v * 100) / 100;

/** The week from the chosen ids: each day's meals and totals, and the shopping list for all of them. */
export function buildWeek(ids: PlanIds, candidates: Map<MealType, PlanCandidate[]>, budget: number | null, slots: readonly MealType[] = PLAN_MEALS): WeekPlan | null {
  const byId = new Map<string, PlanCandidate>();
  for (const list of candidates.values()) for (const c of list) byId.set(`${c.meal}:${c.recipe.id}`, c);
  const days: PlanDay[] = [];
  const need = new Map<string, { shop: string; product: PricedProduct; spec: IngredientSpec; amount: number }>();
  for (const dayIds of ids) {
    const meals: PlanMeal[] = [];
    dayIds.forEach((id, i) => {
      const meal = slots[i]!;
      const c = byId.get(`${meal}:${id}`);
      if (!c) return;
      meals.push({ meal, candidate: c });
      for (const p of c.picks) {
        const key = `${c.shop}|${p.product.id}`;
        const amount = p.spec.amount / c.servings; // one serving's amount
        const had = need.get(key);
        if (had) had.amount += amount;
        else need.set(key, { shop: c.shop, product: p.product, spec: p.spec, amount });
      }
    });
    if (meals.length !== slots.length) return null;
    days.push({
      meals,
      kcal: Math.round(meals.reduce((s, m) => s + m.candidate.perServing.kcal, 0)),
      protein: Math.round(meals.reduce((s, m) => s + m.candidate.perServing.protein, 0)),
      cost: money(meals.reduce((s, m) => s + m.candidate.cost, 0)),
    });
  }
  const lines: ShopLine[] = [...need.values()].map(({ shop, product, spec, amount }) => {
    const pick = pickFor({ ...spec, amount: Math.ceil(amount) }, product);
    const cost = money(pick.basketCost);
    return { shop, product, packs: pick.packs, cost, cupboard: !!spec.cupboard, used: Math.min(cost, money(pick.usedCost ?? pick.basketCost)), keeps: keepsWell(spec, product) };
  });
  const perShop = new Map<string, number>();
  for (const l of lines) perShop.set(l.shop, (perShop.get(l.shop) ?? 0) + l.cost);
  const shops = [...perShop.keys()].sort((a, b) => perShop.get(b)! - perShop.get(a)! || a.localeCompare(b));
  const shopping = lines.sort((a, b) => shops.indexOf(a.shop) - shops.indexOf(b.shop) || Number(a.cupboard) - Number(b.cupboard) || b.cost - a.cost || a.product.name.localeCompare(b.product.name, "en-GB"));
  const shoppingCost = money(shopping.reduce((s, l) => s + l.cost, 0));
  const fresh = shopping.filter((l) => !l.keeps);
  return {
    days, mealsCost: money(days.reduce((s, d) => s + d.cost, 0)), shopping, shoppingCost, shops, budget, overBudget: budget !== null && shoppingCost > budget,
    fresh: { bought: money(fresh.reduce((s, l) => s + l.cost, 0)), eaten: money(fresh.reduce((s, l) => s + l.used, 0)) },
  };
}

/** Each meal's recipes for the week: the first `n` of its list in turn (A, B, C, D, A, B, C), so each comes round at most twice. */
function rotate(list: readonly PlanCandidate[], n: number, offset = 0): string[] {
  const pool = list.slice(0, Math.max(1, Math.min(n, list.length)));
  return Array.from({ length: PLAN_DAYS }, (_, d) => pool[(d + offset) % pool.length]!.recipe.id);
}

const idsFrom = (cols: string[][]): PlanIds => Array.from({ length: PLAN_DAYS }, (_, d) => cols.map((col) => col[d]!));

/** How far from the meal size a recipe may be and still come in to use up packs (fitDistance units), unless the plan's own recipes are already further. */
export const PACK_FIT_LIMIT = 0.1;
/** How many of a meal's closest recipes are tried for each place while using up packs. */
const PACK_SHORTLIST = 30;
/** The search weighs, in pounds: fresh food left in the packs at 1, the shopping bill at this, and how far each meal is from its size at FIT_WEIGHT a meal. */
const COST_WEIGHT = 0.3;
const FIT_WEIGHT = 3;

/** buildWeek's sums without the days, for the search: the bill, the fresh food left in the packs, and how far the meals are from their sizes, added up. */
function packScore(ids: PlanIds, byId: ReadonlyMap<string, PlanCandidate>, slots: readonly MealType[], memo: Map<string, { cost: number; left: number }>): { cost: number; left: number; fit: number } {
  const need = new Map<string, { pick: IngredientPick; amount: number }>();
  let fit = 0;
  for (const dayIds of ids) {
    for (let i = 0; i < dayIds.length; i++) {
      const c = byId.get(`${slots[i]}:${dayIds[i]}`);
      if (!c) continue;
      fit += c.distance;
      for (const p of c.picks) {
        const key = `${c.shop}|${p.product.id}`;
        const had = need.get(key);
        if (had) had.amount += p.spec.amount / c.servings;
        else need.set(key, { pick: p, amount: p.spec.amount / c.servings });
      }
    }
  }
  let cost = 0;
  let left = 0;
  for (const [key, { pick, amount }] of need) {
    const a = Math.ceil(amount);
    const mk = `${key}|${a}|${pick.spec.pantry ?? pick.spec.key}|${pick.spec.drained ? 1 : 0}`;
    let r = memo.get(mk);
    if (!r) {
      const p = pickFor({ ...pick.spec, amount: a }, pick.product);
      r = { cost: p.basketCost, left: keepsWell(pick.spec, pick.product) ? 0 : Math.max(0, p.basketCost - (p.usedCost ?? p.basketCost)) };
      memo.set(mk, r);
    }
    cost += r.cost;
    left += r.left;
  }
  return { cost, left, fit };
}

// makePlan's answers for one set of candidates (the budget step asks for the same week several times)
const planMemo = new WeakMap<Map<MealType, PlanCandidate[]>, Map<string, { ids: PlanIds; week: WeekPlan } | null>>();

/**
 * The best week the recipes allow: for each meal, the recipes closest to the meal size, `variety` of them in turn (VARIETIES). With a budget, while the shopping
 * bill is over it the dearest recipe still in the plan is swapped for the cheapest one of that meal not yet used (and, failing that, a meal rotates through
 * fewer recipes, so more packs are shared); it stops when the bill fits or nothing makes it cheaper. Then the packs are used up (founder 2026-11-18: "by the end
 * of the week, all the ingredients shall be basically almost complete"): a recipe is changed for another close to the meal size, or two swap which comes round
 * more often, whenever that leaves less fresh food in the packs (weighed with the bill and the fit), never making the bill more than the budget or, with no
 * budget, more than it was. Null when a meal has no recipe at all for these choices.
 */
export function makePlan(candidates: Map<MealType, PlanCandidate[]>, budget: number | null, slots: readonly MealType[] = PLAN_MEALS, variety: number = PER_MEAL_RECIPES): { ids: PlanIds; week: WeekPlan } | null {
  const memoKey = `${budget}|${slots.join(",")}|${variety}`;
  const known = planMemo.get(candidates)?.get(memoKey);
  if (known !== undefined) return known;
  const result = makePlanFresh(candidates, budget, slots, variety);
  if (!planMemo.has(candidates)) planMemo.set(candidates, new Map());
  planMemo.get(candidates)!.set(memoKey, result);
  return result;
}

function makePlanFresh(candidates: Map<MealType, PlanCandidate[]>, budget: number | null, slots: readonly MealType[], variety: number): { ids: PlanIds; week: WeekPlan } | null {
  const types = [...new Set(slots)];
  if (!slots.length || types.some((m) => !(candidates.get(m)?.length))) return null;
  const each = Math.max(1, Math.min(PLAN_DAYS, Math.round(variety)));
  // a meal that comes more than once a day (two snacks) rotates through more recipes, so the day's two are different
  const per = new Map<MealType, number>(types.map((m) => [m, slots.filter((x) => x === m).length]));
  const chosen = new Map<MealType, PlanCandidate[]>(types.map((m) => [m, candidates.get(m)!.slice(0, each * per.get(m)!)]));
  const counts = new Map<MealType, number>(types.map((m) => [m, each * per.get(m)!]));
  const nth = slots.map((m, i) => slots.slice(0, i).filter((x) => x === m).length);
  const ids = () => idsFrom(slots.map((m, i) => {
    const pool = Math.max(1, Math.min(counts.get(m)!, chosen.get(m)!.length));
    return rotate(chosen.get(m)!, counts.get(m)!, nth[i]! * Math.floor(pool / per.get(m)!));
  }));
  let best = buildWeek(ids(), candidates, budget, slots)!;
  for (let round = 0; budget !== null && best.shoppingCost > budget && round < 40; round++) {
    let improved = false;
    // the dearest recipe in use, across the day's meals
    const inUse = types.flatMap((m) => chosen.get(m)!.slice(0, counts.get(m)!).map((c, i) => ({ m, c, i }))).sort((a, b) => b.c.cost - a.c.cost);
    for (const { m, c, i } of inUse) {
      const used = new Set(chosen.get(m)!.map((x) => x.recipe.id));
      const cheaper = candidates.get(m)!.filter((x) => !used.has(x.recipe.id) && x.cost < c.cost && x.distance <= Math.max(MAX_SWAP_DISTANCE, c.distance)).sort((a, b) => a.cost - b.cost || a.distance - b.distance)[0];
      if (!cheaper) continue;
      const trial = chosen.get(m)!.slice();
      trial[i] = cheaper;
      const before = chosen.get(m)!;
      chosen.set(m, trial);
      const week = buildWeek(ids(), candidates, budget, slots)!;
      if (week.shoppingCost < best.shoppingCost) { best = week; improved = true; break; }
      chosen.set(m, before);
    }
    if (improved) continue;
    // fewer recipes for the meal whose recipes cost most, so packs are shared
    const m = types.filter((x) => counts.get(x)! > 2 * per.get(x)!).sort((a, b) => chosen.get(b)![0]!.cost - chosen.get(a)![0]!.cost)[0];
    if (!m) break;
    const list = chosen.get(m)!.slice(0, counts.get(m)!).sort((a, b) => a.cost - b.cost);
    chosen.set(m, list);
    counts.set(m, counts.get(m)! - 1);
    const week = buildWeek(ids(), candidates, budget, slots)!;
    if (week.shoppingCost < best.shoppingCost) best = week;
    else { counts.set(m, counts.get(m)! + 1); break; }
  }
  usePacks(candidates, chosen, counts, types, slots, ids, budget);
  const finalIds = ids();
  return { ids: finalIds, week: buildWeek(finalIds, candidates, budget, slots)! };
}

/** makePlan's last step (see there): changes `chosen` in place, one move at a time, the move that helps most first, until no move helps. */
function usePacks(candidates: Map<MealType, PlanCandidate[]>, chosen: Map<MealType, PlanCandidate[]>, counts: ReadonlyMap<MealType, number>, types: readonly MealType[], slots: readonly MealType[], ids: () => PlanIds, budget: number | null): void {
  const byId = new Map<string, PlanCandidate>();
  for (const list of candidates.values()) for (const c of list) byId.set(`${c.meal}:${c.recipe.id}`, c);
  const memo = new Map<string, { cost: number; left: number }>();
  const score = (s: { cost: number; left: number; fit: number }) => s.left + COST_WEIGHT * s.cost + FIT_WEIGHT * s.fit;
  for (const m of types) chosen.set(m, chosen.get(m)!.slice());
  const size = (m: MealType) => Math.min(counts.get(m)!, chosen.get(m)!.length);
  const limit = new Map(types.map((m) => [m, Math.max(PACK_FIT_LIMIT, ...chosen.get(m)!.slice(0, size(m)).map((c) => c.distance))]));
  const start = packScore(ids(), byId, slots, memo);
  const cap = (budget !== null ? Math.max(budget, start.cost) : start.cost) + 0.005;
  let current = score(start);
  for (let round = 0; round < 40; round++) {
    let move: { m: MealType; i: number; j?: number; x?: PlanCandidate } | null = null;
    let bestScore = current - 0.01;
    const tryIt = (m: MealType, i: number, j?: number, x?: PlanCandidate) => {
      const s = packScore(ids(), byId, slots, memo);
      if (s.cost <= cap && score(s) < bestScore) { bestScore = score(s); move = { m, i, j, x }; }
    };
    for (const m of types) {
      const pool = chosen.get(m)!;
      const n = size(m);
      const inPool = new Set(pool.slice(0, n).map((c) => c.recipe.id));
      const shortlist = candidates.get(m)!.filter((x) => x.distance <= limit.get(m)! && !inPool.has(x.recipe.id)).slice(0, PACK_SHORTLIST);
      for (let i = 0; i < n; i++) {
        const was = pool[i]!;
        for (const x of shortlist) { pool[i] = x; tryIt(m, i, undefined, x); }
        pool[i] = was;
        // which of two recipes comes round more often
        for (let j = i + 1; j < n; j++) {
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
          tryIt(m, i, j);
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
        }
      }
    }
    if (!move) break;
    const { m, i, j, x } = move as { m: MealType; i: number; j?: number; x?: PlanCandidate };
    const pool = chosen.get(m)!;
    if (x) pool[i] = x;
    else if (j !== undefined) [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    current = bestScore;
  }
}

/**
 * The recipes a meal could be swapped for (founder 2026-11-18: "if they don't like any of the options, they're able to swap them out for other meals"): that
 * meal's recipes closest to the meal size first, leaving out the one there now and any already used twice that week. At most `limit`.
 */
export function swapChoices(ids: PlanIds, day: number, mealIndex: number, candidates: Map<MealType, PlanCandidate[]>, limit = 10, slots: readonly MealType[] = PLAN_MEALS): PlanCandidate[] {
  const meal = slots[mealIndex]!;
  const today = new Set(ids[day] ?? []);
  const uses = (id: string) => ids.reduce((n, d) => n + d.filter((x, i) => slots[i] === meal && x === id).length, 0);
  // never one already on that day (two snacks stay different), and none used twice a week in that kind of meal
  return (candidates.get(meal) ?? []).filter((c) => !today.has(c.recipe.id) && uses(c.recipe.id) < 2 * slots.filter((x) => x === meal).length).slice(0, limit);
}

/** The plan with one meal set to a chosen recipe. */
export function setMeal(ids: PlanIds, day: number, mealIndex: number, recipeId: string): PlanIds {
  return ids.map((d, i) => (i === day ? d.map((x, j) => (j === mealIndex ? recipeId : x)) : d.slice()));
}

/** One meal swapped for the next recipe of that meal (closest first) that isn't already on that day or used twice in the week. */
export function swapMeal(ids: PlanIds, day: number, mealIndex: number, candidates: Map<MealType, PlanCandidate[]>, slots: readonly MealType[] = PLAN_MEALS): PlanIds {
  const meal = slots[mealIndex]!;
  const list = candidates.get(meal) ?? [];
  const current = ids[day]![mealIndex]!;
  const uses = (id: string) => ids.reduce((n, d) => n + (d[mealIndex] === id ? 1 : 0), 0);
  const start = list.findIndex((c) => c.recipe.id === current);
  for (let k = 1; k <= list.length; k++) {
    const c = list[(start + k) % list.length]!;
    if (c.recipe.id === current || uses(c.recipe.id) >= 2) continue;
    return ids.map((d, i) => (i === day ? d.map((x, j) => (j === mealIndex ? c.recipe.id : x)) : d.slice()));
  }
  return ids;
}

/** The plan kept on the phone (mm.v1.mealPlan; never synced): the answers and the recipe ids, worked out again from the shop's list when it is opened. */
export interface SavedPlan {
  /** The shops chosen (a plan from before 18 November had one: `shop`). */
  shops: string[];
  /** The day's meals and snacks in order (planSlots); absent = breakfast, lunch and dinner, as plans were before 18 November. */
  slots?: MealType[];
  ids: PlanIds;
  leaveOut: string[];
  budget: number | null;
  /** The day the plan starts (yyyy-mm-dd): its days are named from it. */
  start: string;
  /** The recipes made with better products, by "meal:id" (planForBudget). */
  better?: string[];
  /** How often a meal may come round (VARIETIES); absent = PER_MEAL_RECIPES, as plans were before 19 November. */
  variety?: Variety;
}

export function sanitizePlan(raw: unknown): SavedPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const slotsOk = Array.isArray(r.slots) && r.slots.length >= 1 && r.slots.length <= 6 && r.slots.every((x) => x === "breakfast" || x === "lunch" || x === "dinner" || x === "snack")
    && JSON.stringify(r.slots) === JSON.stringify(planSlots(shapeOf(r.slots as MealType[]))) && (r.slots as MealType[]).filter((x) => x === "snack").length <= MAX_SNACKS;
  const slots: MealType[] = slotsOk ? [...(r.slots as MealType[])] : [...PLAN_MEALS];
  const ids = Array.isArray(r.ids) && r.ids.length === PLAN_DAYS && r.ids.every((d) => Array.isArray(d) && d.length === slots.length && d.every((x) => typeof x === "string" && /^[a-z0-9-]{1,80}$/.test(x))) ? (r.ids as PlanIds) : null;
  const shopId = (x: unknown): x is string => typeof x === "string" && /^[a-z0-9-]{2,40}$/.test(x);
  const shops = Array.isArray(r.shops) ? [...new Set((r.shops as unknown[]).filter(shopId))].slice(0, 12) : shopId(r.shop) ? [r.shop] : [];
  if (!ids || !shops.length || typeof r.start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.start)) return null;
  const leaveOut = Array.isArray(r.leaveOut) ? (r.leaveOut as unknown[]).filter((x): x is string => typeof x === "string" && x.length <= 40).slice(0, 30) : [];
  const budget = typeof r.budget === "number" && Number.isFinite(r.budget) && r.budget > 0 && r.budget < 10000 ? r.budget : null;
  const better = Array.isArray(r.better) ? (r.better as unknown[]).filter((x): x is string => typeof x === "string" && /^(breakfast|lunch|dinner|snack):[a-z0-9-]{1,80}$/.test(x)).slice(0, 42) : [];
  const variety = (VARIETIES as readonly unknown[]).includes(r.variety) ? (r.variety as Variety) : null;
  return { shops, ids, leaveOut, budget, start: r.start, ...(slotsOk ? { slots } : {}), ...(better.length ? { better } : {}), ...(variety ? { variety } : {}) };
}

/**
 * Earlier plans (founder 2026-11-19: "if they've done their meal plan, they can start another meal plan ... or they can create multiple meal plans, whatever you
 * think could be the best"): one plan is the one being followed; making a new one keeps the old one among the last MAX_EARLIER_PLANS, newest first, so it can
 * be opened again. On this phone only, like the plan itself.
 */
export const MAX_EARLIER_PLANS = 5;

const samePlan = (a: SavedPlan, b: SavedPlan) => a.start === b.start && JSON.stringify(a.ids) === JSON.stringify(b.ids);

/** The earlier plans once `old` is set aside (a new plan made, or an earlier one opened): `old` first, without a copy of it, at most MAX_EARLIER_PLANS. */
export function keepEarlier(earlier: readonly SavedPlan[], old: SavedPlan | null): SavedPlan[] {
  if (!old) return earlier.slice(0, MAX_EARLIER_PLANS);
  return [old, ...earlier.filter((p) => !samePlan(p, old))].slice(0, MAX_EARLIER_PLANS);
}

/** Opening an earlier plan: it becomes the plan, and the one it replaces goes to the top of the earlier ones. */
export function openEarlier(current: SavedPlan | null, earlier: readonly SavedPlan[], index: number): { current: SavedPlan | null; earlier: SavedPlan[] } {
  const chosen = earlier[index];
  if (!chosen) return { current, earlier: [...earlier] };
  const rest = earlier.filter((_, i) => i !== index);
  return { current: chosen, earlier: keepEarlier(rest, current) };
}

export function sanitizePlans(raw: unknown): SavedPlan[] {
  return Array.isArray(raw) ? raw.map(sanitizePlan).filter((p): p is SavedPlan => !!p).slice(0, MAX_EARLIER_PLANS) : [];
}
