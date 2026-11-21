// Your plan's example week (the last welcome screen). Founder, 20 November 2026: "We shouldn't calculate the meal plan. This should just be an example of their
// meal plan, showing the app is like how it works ... because it depends if you want to make it a premium feature." So the week is never worked out for the
// person: no sizing to their numbers, nothing saved. It is our own illustrated recipes that suit the person's diet and allergies as written (so a vegan never
// sees bacon), spread through the book so the days differ. Meal plan itself (Premium) makes the real week.
//
// Its price (founder, 20 November 2026, about 21:55: "week one cost and then the week afterwards costs ... they need to understand that we are helping them save
// a lot of money"): once the person's recipe shop has priced our recipes (planPreview.ts workOut, each recipe as written, one serving), the example is chosen
// the same way from only the recipes that shop can make, and its shopping is added up as Meal plan adds it up (buildWeek, whole packs; weekCosts). Until then,
// offline, or when the shop can't make a meal, it is the book's example with no price. Pure apart from the shop file, which the caller loads; unit-tested.

import { dishForm, MAX_WRAPS_A_WEEK, varietyFaults, type DishForm } from "./dishForm";
import { buildWeek, PER_MEAL_RECIPES, PLAN_MEALS, weekCosts, type PlanCandidate, type PlanIds, type WeekCosts, type WeekPlan } from "./mealPlan";
import type { DietPrefs } from "./pantry";
import { dietKey, loadShops, workOut, type ShopLoader, type Targets } from "./planPreview";
import { RECIPES } from "./recipeBook";
import { RECIPE_IMAGES } from "./recipeImages";
import { recipeForDiet, type MealType, type Recipe } from "./recipes";

export const EXAMPLE_DAYS = 7;
export const EXAMPLE_MEALS = ["breakfast", "lunch", "dinner"] as const;
export type ExampleMeal = (typeof EXAMPLE_MEALS)[number];

export interface ExampleDay {
  meals: Array<{ meal: ExampleMeal; recipeId: string; name: string }>;
}

/**
 * Seven days of breakfast, lunch and dinner from the book. A meal with no recipe that suits the diet and has a picture stays empty that day. `canMake`: only
 * the recipes it keeps (a shop's priced ones), in the book's order, with the same spread.
 */
export function exampleWeek(diet: DietPrefs, recipes: readonly Recipe[] = RECIPES, images: Readonly<Record<string, string>> = RECIPE_IMAGES, canMake?: (meal: ExampleMeal, id: string) => boolean): ExampleDay[] {
  const pool = (meal: ExampleMeal) => recipes.filter((r) => r.meal === meal && !!images[r.id] && (!canMake || canMake(meal, r.id)) && recipeForDiet(r, diet) !== null);
  // Like a real plan, each meal comes round from PER_MEAL_RECIPES dishes (A, B, C, D, A, B, C), so the packs are shared and the example's price looks like a real
  // week's (20 November 2026: 21 different dishes priced at £109 for a first shop against a real plan's £67). The dishes are spread through the book, and varied
  // as a real plan is (founder 2026-11-20: "You can't just do wraps every single day"): a meal's dishes each a different dish form where its recipes allow
  // (dishForm.ts), one wrap in the week's dishes at most (it comes round twice: MAX_WRAPS_A_WEEK), and their turns ordered so no day has a form twice and no
  // meal has the same form two days running (varietyFaults), as far as they allow.
  let wraps = 0;
  const pools = EXAMPLE_MEALS.map((meal) => {
    const list = pool(meal);
    const n = Math.min(PER_MEAL_RECIPES, list.length);
    const comes = n ? Math.ceil(EXAMPLE_DAYS / n) : 0;
    const picks: Array<Recipe | null> = Array.from({ length: n }, () => null);
    const forms = new Set<DishForm>();
    // each dish from its own spot in the book on, the first of a form the meal doesn't have yet; then, where none is left, the first not yet chosen
    for (const strict of [true, false]) {
      for (let i = 0; i < n; i++) {
        if (picks[i]) continue;
        const start = Math.floor((i * list.length) / n);
        for (let k = 0; k < list.length; k++) {
          const r = list[(start + k) % list.length]!;
          if (picks.includes(r)) continue;
          const f = dishForm(r);
          if (strict && (forms.has(f) || (f === "wrap" && wraps + comes > MAX_WRAPS_A_WEEK))) continue;
          picks[i] = r;
          forms.add(f);
          if (f === "wrap") wraps += comes;
          break;
        }
      }
    }
    return [meal, picks.filter((r): r is Recipe => !!r)] as const;
  });
  const orders = bestTurns(pools.map(([, picks]) => picks));
  return Array.from({ length: EXAMPLE_DAYS }, (_, day) => ({
    meals: pools.flatMap(([meal], m) => {
      const picks = orders[m]!;
      if (!picks.length) return [];
      const r = picks[(day + m) % picks.length]!;
      return [{ meal, recipeId: r.id, name: r.name }];
    }),
  }));
}

/** Every order of a list (the first as it is first, so a tie keeps the book's order). */
function orderings<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((x, i) => orderings([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** The meals' dishes in the order of turns that leaves the fewest variety faults over the week (the first such order: the same week every time). */
function bestTurns(pools: ReadonlyArray<readonly Recipe[]>): Recipe[][] {
  const forms = pools.map((p) => new Map(p.map((r) => [r.id, dishForm(r)])));
  const week = (orders: ReadonlyArray<readonly Recipe[]>) => Array.from({ length: EXAMPLE_DAYS }, (_, day) => orders.map((o, m) => (o.length ? forms[m]!.get(o[(day + m) % o.length]!.id) : undefined)));
  const choices = pools.map((p) => orderings(p));
  let best: Recipe[][] = pools.map((p) => [...p]);
  let fewest = varietyFaults(week(best));
  const walk = (m: number, taken: Recipe[][]): boolean => {
    if (fewest === 0) return true;
    if (m === pools.length) {
      const f = varietyFaults(week(taken));
      if (f < fewest) { fewest = f; best = taken.map((o) => [...o]); }
      return fewest === 0;
    }
    for (const o of choices[m]!) if (walk(m + 1, [...taken, o])) return true;
    return false;
  };
  walk(0, []);
  return best;
}

/** The example week from one shop: its days, the week as Meal plan builds it, and what its shopping comes to in week 1 and each week after. */
export interface PricedExample {
  days: ExampleDay[];
  ids: PlanIds;
  week: WeekPlan;
  costs: WeekCosts;
}

/**
 * The example week chosen from only the recipes a shop can make (`candidates`: its priced recipes, planCandidates as written), and built as Meal plan builds a
 * week, so its shopping is real whole packs at the shop's prices. Null when the shop can't make one of the meals (the screen then shows the book's example with
 * no price: never a week with a gap).
 */
export function pricedExampleWeek(diet: DietPrefs, candidates: Map<MealType, PlanCandidate[]>, recipes: readonly Recipe[] = RECIPES, images: Readonly<Record<string, string>> = RECIPE_IMAGES): PricedExample | null {
  const priced = new Map(EXAMPLE_MEALS.map((m) => [m, new Set((candidates.get(m) ?? []).map((c) => c.recipe.id))]));
  const days = exampleWeek(diet, recipes, images, (meal, id) => priced.get(meal)!.has(id));
  if (days.some((d) => d.meals.length !== EXAMPLE_MEALS.length)) return null;
  const ids: PlanIds = days.map((d) => EXAMPLE_MEALS.map((m) => d.meals.find((x) => x.meal === m)!.recipeId));
  const week = buildWeek(ids, candidates, null, PLAN_MEALS);
  return week ? { days, ids, week, costs: weekCosts(week) } : null;
}

/** With each recipe as written (planCandidates' asWritten), the sizes only name the meals to price. */
const AS_WRITTEN: Targets = Object.fromEntries(EXAMPLE_MEALS.map((m) => [m, { kcal: 0 }]));

/** The example priced at one shop, with the date its prices were read. */
export type ShopExample = PricedExample & { shop: string; checkedOn: string };

const examples = new Map<string, ShopExample | null>();
const exampleKey = (shop: string, diet: DietPrefs) => JSON.stringify([shop, dietKey(diet)]);

/** The example already priced for this shop and diet while the app is open (undefined: not yet; null: the shop can't make one of the meals). */
export const knownExample = (shop: string, diet: DietPrefs): ShopExample | null | undefined => examples.get(exampleKey(shop, diet));

/**
 * The example priced at the person's recipe shop: the shop's list loaded, our recipes priced in chunks that hand control back to the screen (workOut; the
 * shared cache Meal plan uses too), then pricedExampleWeek. Kept by shop and diet while the app is open. Null when the shop can't make one of the meals or
 * its list can't be loaded (offline: not kept, so it is tried again next time). Never throws.
 */
export async function shopExample(shop: string, diet: DietPrefs, deps: { load: ShopLoader; yieldToScreen?: () => Promise<void> }): Promise<ShopExample | null> {
  const key = exampleKey(shop, diet);
  const known = examples.get(key);
  if (known !== undefined) return known;
  try {
    const loaded = await loadShops([shop], deps.load);
    const candidates = await workOut(loaded, diet, AS_WRITTEN, [], [], undefined, true, deps.yieldToScreen);
    const priced = pricedExampleWeek(diet, candidates);
    const result = priced && { ...priced, shop, checkedOn: loaded[0]!.file.checkedOn };
    examples.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/** Tests only: forget the priced examples. */
export function forgetExamples(): void {
  examples.clear();
}
