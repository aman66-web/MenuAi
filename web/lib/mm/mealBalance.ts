import type { MealType, Recipe } from "./recipes";

// A balanced week (founder 2026-11-21, on Meal plan: "everything on it is cheesy stuff ... there's a lot of repetition ... salmon every day, or chicken every
// day, or beef every day ... people don't want to be having that every day. You know, balanced diets"). Next to the dish form (dishForm.ts: a wrap, a pasta, a
// curry), each lunch and dinner has a main: what most of its protein comes from (chicken, beef, salmon, beans ...), worked out from the recipe's own
// ingredients, never stored. The plan (mealPlan.ts makePlan) counts these as variety faults, weighed like the dish forms, so as far as the recipes allow: never
// the same main twice in a day, never the same main in a meal two days running, any one main at most MAX_SAME_MAIN_A_WEEK times a week, and cheese-heavy dishes
// at most one a day and MAX_CHEESY_A_WEEK a week. Pure; tests/mealBalance.test.ts.

export type MainKind =
  | "chicken" | "turkey" | "beef" | "pork" | "lamb" | "salmon" | "tuna" | "whiteFish" | "oilyFish" | "prawns" | "tofu" | "beans" | "lentils" | "cheese" | "eggs";

/** The ingredient kinds behind each main, by the start of the kind's key (pantry.ts). */
const MEAT_FISH_VEG: ReadonlyArray<readonly [MainKind, RegExp]> = [
  ["chicken", /^chicken/],
  ["turkey", /^turkey/],
  ["beef", /^beef/],
  ["lamb", /^lamb/],
  ["pork", /^(?:pork|bacon|ham|gammon|chorizo|sausage)/],
  ["salmon", /salmon/],
  ["tuna", /^tuna/],
  ["whiteFish", /^(?:cod|white-fish|haddock|basa|pollock|hake)/],
  ["oilyFish", /^(?:mackerel|sardine|kipper|trout)/],
  ["prawns", /^(?:prawn|seafood|mussel|squid)/],
  ["tofu", /^(?:tofu|quorn|tempeh)/],
  ["beans", /^(?:chickpeas|black-beans|kidney-beans|butter-beans|baked-beans|cannellini|borlotti|pinto|edamame|mixed-beans)/],
  ["lentils", /lentils/],
];
const CHEESE = /^(?:cheddar|feta|halloumi|mozzarella|parmesan|soft-cheese|cottage-cheese|paneer|goats-cheese|cheese|grated-cheese|red-leicester|mascarpone|ricotta|brie|stilton|gruyere|emmental)/;
const EGGS = /^eggs?$/;
/** A dish whose name says it is about cheese. */
const CHEESY_NAME = /\b(?:cheese|cheesy|macaroni|mac and|toastie|quesadillas?|pizzas?|lasagne|gratin|carbonara|alfredo|halloumi|fondue|rarebit)\b/i;

/** An ingredient leads part of a meal from this much a serving (meat, fish, tofu, beans), one egg, or this much cheese. */
const FEATURE_GRAMS = 30;
const FEATURE_EGG_GRAMS = 50;
const FEATURE_CHEESE_GRAMS = 25;
/** A main needs at least this much of its kind in one serving; cheese makes a dish cheese-heavy from this much a serving. */
const MAIN_MIN_GRAMS = 40;
const CHEESY_GRAMS = 35;
/** Any one main at most this many times across a week's lunches and dinners (fourteen meals), and cheese-heavy dishes at most this many a week. */
export const MAX_SAME_MAIN_A_WEEK = 3;
export const MAX_CHEESY_A_WEEK = 2;
/** The meals a main is counted in (a breakfast's eggs or a snack's nuts are their own thing). */
export const MAIN_MEALS: readonly MealType[] = ["lunch", "dinner"];

export interface MealBalance {
  main: MainKind | null;
  cheesy: boolean;
  /**
   * Every ingredient that leads part of the meal (founder 2026-11-21, on an egg mayonnaise wrap for lunch and egg foo young for dinner: "Too much egg ... avoid
   * repeating ingredients on the same day"): each meat, fish or vegetarian protein from FEATURE_GRAMS a serving, eggs from one egg, cheese from a good handful.
   */
  featured: MainKind[];
}

/** The recipe's main and whether it is cheese-heavy, per serving as written. */
export function mealBalance(r: Pick<Recipe, "name" | "ingredients" | "servings">): MealBalance {
  const per = Math.max(1, r.servings || 1);
  const grams = new Map<MainKind, number>();
  let cheese = 0;
  let eggs = 0;
  for (const i of r.ingredients) {
    const kind = i.pantry ?? i.key;
    const g = i.amount / per;
    const meat = MEAT_FISH_VEG.find(([, re]) => re.test(kind));
    if (meat) grams.set(meat[0], (grams.get(meat[0]) ?? 0) + g);
    else if (CHEESE.test(kind)) cheese += g;
    else if (EGGS.test(kind)) eggs += g;
  }
  let main: MainKind | null = null;
  let most = MAIN_MIN_GRAMS - 1e-9;
  for (const [k, g] of grams) if (g > most) { main = k; most = g; }
  if (!main && cheese >= MAIN_MIN_GRAMS) main = "cheese";
  if (!main && eggs >= 100) main = "eggs";
  const featured: MainKind[] = [...grams].filter(([, g]) => g >= FEATURE_GRAMS).map(([k]) => k);
  if (eggs >= FEATURE_EGG_GRAMS) featured.push("eggs");
  if (cheese >= FEATURE_CHEESE_GRAMS) featured.push("cheese");
  return { main, cheesy: cheese >= CHEESY_GRAMS || (cheese >= 15 && CHEESY_NAME.test(r.name)), featured };
}

const memo = new WeakMap<object, MealBalance>();
export function mealBalanceOf(r: Pick<Recipe, "name" | "ingredients" | "servings">): MealBalance {
  let b = memo.get(r);
  if (!b) memo.set(r, (b = mealBalance(r)));
  return b;
}

/**
 * How far a week (days × slots, the slots' meals in `slots`) is from balanced: one for each lunch or dinner whose main was already eaten that day, one for each
 * whose main is the same as the day before's in that meal, one for each time a main comes more than MAX_SAME_MAIN_A_WEEK times, one for each cheese-heavy dish
 * after the first in a day, and one for each over MAX_CHEESY_A_WEEK. 0 is a balanced week.
 */
export function balanceFaults(week: ReadonlyArray<ReadonlyArray<MealBalance | undefined>>, slots: readonly MealType[]): number {
  const r = balanceReport(week, slots);
  // too much cheese weighs double (it was the founder's own complaint: "everything on it is cheesy stuff")
  return r.sameDay + r.dayAfter + r.overWeek + r.sharedDay + 2 * (r.cheesyDay + r.cheesyWeek);
}

/** The parts of balanceFaults, for tests. */
export function balanceReport(week: ReadonlyArray<ReadonlyArray<MealBalance | undefined>>, slots: readonly MealType[]): { sameDay: number; dayAfter: number; overWeek: number; sharedDay: number; cheesyDay: number; cheesyWeek: number } {
  let sameDay = 0;
  let sharedDay = 0;
  let dayAfter = 0;
  let cheesyDay = 0;
  let cheesy = 0;
  const count = new Map<MainKind, number>();
  week.forEach((day, d) => {
    const seen = new Set<MainKind>();
    let cheeseToday = 0;
    day.forEach((b, i) => {
      if (!b) return;
      if (b.cheesy) { cheeseToday++; cheesy++; }
      if (!MAIN_MEALS.includes(slots[i]!) || !b.main) return;
      if (seen.has(b.main)) sameDay++;
      seen.add(b.main);
      if (d > 0 && week[d - 1]![i]?.main === b.main) dayAfter++;
      count.set(b.main, (count.get(b.main) ?? 0) + 1);
    });
    cheesyDay += Math.max(0, cheeseToday - 1);
    // a leading ingredient in more than one of the day's meals, breakfast and snacks too (eggs at breakfast and an egg lunch)
    const kinds = new Map<MainKind, number>();
    for (const b of day) for (const k of new Set(b?.featured ?? [])) kinds.set(k, (kinds.get(k) ?? 0) + 1);
    for (const n of kinds.values()) sharedDay += Math.max(0, n - 1);
  });
  let overWeek = 0;
  for (const n of count.values()) overWeek += Math.max(0, n - MAX_SAME_MAIN_A_WEEK);
  return { sameDay, dayAfter, overWeek, sharedDay, cheesyDay, cheesyWeek: Math.max(0, cheesy - MAX_CHEESY_A_WEEK) };
}
