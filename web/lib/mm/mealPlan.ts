import { tk } from "./i18n";
import type { DietPrefs } from "./pantry";
import { PANTRY } from "./pantry";
import { fitDistance, fitRecipe, pickFor, recipeForDiet, recipeTotals, resolveRecipe, type IngredientPick, type IngredientSpec, type MealTarget, type MealType, type Recipe } from "./recipes";
import { normalizeForSearch } from "./search";
import type { PricedProduct, ShopProduct } from "./shopProducts";

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
  recipe: Recipe;
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
export function planCandidates(recipes: readonly Recipe[], products: readonly ShopProduct[], diet: DietPrefs, target: MealTarget | null, leaveOut: readonly string[]): Map<MealType, PlanCandidate[]> {
  const out = new Map<MealType, PlanCandidate[]>(PLAN_MEALS.map((m) => [m, []]));
  for (const base of recipes) {
    if (!base.meal || !PLAN_MEALS.includes(base.meal)) continue;
    const recipe = recipeForDiet(base, diet);
    if (!recipe || leavesOut(recipe, leaveOut)) continue;
    const fitted = target ? fitRecipe(recipe, products, {}, target) : null;
    const resolved = fitted ? fitted.resolved : resolveRecipe(recipe, products);
    const totals = fitted ? fitted.totals : recipeTotals(resolved);
    if (!totals || !resolved.complete || totals.costPerServing === null) continue;
    out.get(base.meal)!.push({
      recipe: fitted ? fitted.recipe : recipe,
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

/** The plan as recipe ids: days × meals (PLAN_MEALS order). */
export type PlanIds = string[][];

export interface ShopLine {
  product: PricedProduct;
  /** Whole packs the week needs. */
  packs: number;
  cost: number;
  /** A cupboard item (oil, salt, stock cubes): the person may have it already. */
  cupboard: boolean;
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
  budget: number | null;
  /** The plan's shopping bill is more than the budget (the cheapest plan the recipes allow was made). */
  overBudget: boolean;
}

const money = (v: number) => Math.round(v * 100) / 100;

/** The week from the chosen ids: each day's meals and totals, and the shopping list for all of them. */
export function buildWeek(ids: PlanIds, candidates: Map<MealType, PlanCandidate[]>, budget: number | null): WeekPlan | null {
  const byId = new Map<string, PlanCandidate>();
  for (const list of candidates.values()) for (const c of list) byId.set(`${c.meal}:${c.recipe.id}`, c);
  const days: PlanDay[] = [];
  const need = new Map<string, { product: PricedProduct; spec: IngredientSpec; amount: number }>();
  for (const dayIds of ids) {
    const meals: PlanMeal[] = [];
    dayIds.forEach((id, i) => {
      const meal = PLAN_MEALS[i]!;
      const c = byId.get(`${meal}:${id}`);
      if (!c) return;
      meals.push({ meal, candidate: c });
      for (const p of c.picks) {
        const key = p.product.id;
        const amount = p.spec.amount / c.servings; // one serving's amount
        const had = need.get(key);
        if (had) had.amount += amount;
        else need.set(key, { product: p.product, spec: p.spec, amount });
      }
    });
    if (meals.length !== PLAN_MEALS.length) return null;
    days.push({
      meals,
      kcal: Math.round(meals.reduce((s, m) => s + m.candidate.perServing.kcal, 0)),
      protein: Math.round(meals.reduce((s, m) => s + m.candidate.perServing.protein, 0)),
      cost: money(meals.reduce((s, m) => s + m.candidate.cost, 0)),
    });
  }
  const shopping: ShopLine[] = [...need.values()]
    .map(({ product, spec, amount }) => {
      const pick = pickFor({ ...spec, amount: Math.ceil(amount) }, product);
      return { product, packs: pick.packs, cost: money(pick.basketCost), cupboard: !!spec.cupboard };
    })
    .sort((a, b) => Number(a.cupboard) - Number(b.cupboard) || b.cost - a.cost || a.product.name.localeCompare(b.product.name, "en-GB"));
  const shoppingCost = money(shopping.reduce((s, l) => s + l.cost, 0));
  return { days, mealsCost: money(days.reduce((s, d) => s + d.cost, 0)), shopping, shoppingCost, budget, overBudget: budget !== null && shoppingCost > budget };
}

/** Each meal's recipes for the week: the first `n` of its list in turn (A, B, C, D, A, B, C), so each comes round at most twice. */
function rotate(list: readonly PlanCandidate[], n: number): string[] {
  const pool = list.slice(0, Math.max(1, Math.min(n, list.length)));
  return Array.from({ length: PLAN_DAYS }, (_, d) => pool[d % pool.length]!.recipe.id);
}

const idsFrom = (cols: string[][]): PlanIds => Array.from({ length: PLAN_DAYS }, (_, d) => cols.map((col) => col[d]!));

/**
 * The best week the recipes allow: for each meal, the recipes closest to the meal size, four of them in turn. With a budget, while the shopping bill is over it
 * the dearest recipe still in the plan is swapped for the cheapest one of that meal not yet used (and, failing that, a meal rotates through fewer recipes, so
 * more packs are shared); it stops when the bill fits or nothing makes it cheaper. Null when a meal has no recipe at all for these choices.
 */
export function makePlan(candidates: Map<MealType, PlanCandidate[]>, budget: number | null): { ids: PlanIds; week: WeekPlan } | null {
  if (PLAN_MEALS.some((m) => !(candidates.get(m)?.length))) return null;
  const chosen = new Map<MealType, PlanCandidate[]>(PLAN_MEALS.map((m) => [m, candidates.get(m)!.slice(0, PER_MEAL_RECIPES)]));
  const counts = new Map<MealType, number>(PLAN_MEALS.map((m) => [m, PER_MEAL_RECIPES]));
  const ids = () => idsFrom(PLAN_MEALS.map((m) => rotate(chosen.get(m)!, counts.get(m)!)));
  let best = buildWeek(ids(), candidates, budget)!;
  for (let round = 0; budget !== null && best.shoppingCost > budget && round < 40; round++) {
    let improved = false;
    // the dearest recipe in use, across the three meals
    const inUse = PLAN_MEALS.flatMap((m) => chosen.get(m)!.slice(0, counts.get(m)!).map((c, i) => ({ m, c, i }))).sort((a, b) => b.c.cost - a.c.cost);
    for (const { m, c, i } of inUse) {
      const used = new Set(chosen.get(m)!.map((x) => x.recipe.id));
      const cheaper = candidates.get(m)!.filter((x) => !used.has(x.recipe.id) && x.cost < c.cost).sort((a, b) => a.cost - b.cost || a.distance - b.distance)[0];
      if (!cheaper) continue;
      const trial = chosen.get(m)!.slice();
      trial[i] = cheaper;
      const before = chosen.get(m)!;
      chosen.set(m, trial);
      const week = buildWeek(ids(), candidates, budget)!;
      if (week.shoppingCost < best.shoppingCost) { best = week; improved = true; break; }
      chosen.set(m, before);
    }
    if (improved) continue;
    // fewer recipes for the meal whose recipes cost most, so packs are shared
    const m = PLAN_MEALS.filter((x) => counts.get(x)! > 2).sort((a, b) => chosen.get(b)![0]!.cost - chosen.get(a)![0]!.cost)[0];
    if (!m) break;
    const list = chosen.get(m)!.slice(0, counts.get(m)!).sort((a, b) => a.cost - b.cost);
    chosen.set(m, list);
    counts.set(m, counts.get(m)! - 1);
    const week = buildWeek(ids(), candidates, budget)!;
    if (week.shoppingCost < best.shoppingCost) best = week;
    else { counts.set(m, counts.get(m)! + 1); break; }
  }
  const finalIds = ids();
  return { ids: finalIds, week: buildWeek(finalIds, candidates, budget)! };
}

/** One meal swapped for the next recipe of that meal (closest first) that isn't already on that day or used twice in the week. */
export function swapMeal(ids: PlanIds, day: number, mealIndex: number, candidates: Map<MealType, PlanCandidate[]>): PlanIds {
  const meal = PLAN_MEALS[mealIndex]!;
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
