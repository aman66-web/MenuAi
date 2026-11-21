import { mealBalanceOf, type MainKind } from "./mealBalance";
import { fitsStyle, type EatingStyle, type PlanCandidate, type PlanIds } from "./mealPlan";
import type { CuisineId } from "./recipeBook/niches";
import { matchesNiche, nicheCounts, type CuisineOption } from "./recipeNiche";
import { QUICK_TESTS, type QuickFilter } from "./recipeSearch";
import type { MealType } from "./recipes";
import { inPriceRange, servingPriceBounds, type PriceRange } from "./servingPrice";

// Meal plan's Swap sheet as a small Recipes screen (founder 2026-11-20: "they also should be able to search ... a version of that which is also in the meal
// plan part ... they can choose an item that they want to put in instead, like a recipe they want to put in"): every recipe the plan priced for that meal at the
// plan's shops, found by the Recipes search words, narrowed by its quick filters, cuisine and serving price, and sorted. Pure and unit-tested
// (tests/swapPicker.test.ts); the screen is app/app/plan/SwapPicker.tsx.

export type SwapSort = "fit" | "price" | "protein";

export interface SwapRow {
  candidate: PlanCandidate;
  /** On another day or in another slot of this week already (still choosable). */
  inPlan: boolean;
  /** Of the plan's eating style (fitsStyle: Balanced, every recipe). */
  fitsStyle: boolean;
}

/**
 * Every recipe the plan can put in this slot: its meal's candidates (the ones the week is built from, so a choice always fits in the week), except the one there
 * now, one already in another slot that day, and any the diet now leaves out (`fits`: a diet changed since the plan was made). Each says whether the week has it already and whether it is of the style.
 */
export function swapRows(
  ids: PlanIds,
  day: number,
  mealIndex: number,
  candidates: ReadonlyMap<MealType, readonly PlanCandidate[]>,
  slots: readonly MealType[],
  style: EatingStyle,
  fits: (recipeId: string) => boolean = () => true,
): SwapRow[] {
  const meal = slots[mealIndex];
  if (!meal) return [];
  const current = ids[day]?.[mealIndex];
  const used = new Set<string>();
  ids.forEach((d, i) => d.forEach((id, j) => { if (i !== day || j !== mealIndex) used.add(id); }));
  // never the same recipe twice in one day: a second snack that's the first one again (the 21 November meeting, Kemi)
  const sameDay = new Set(ids[day]?.filter((_, j) => j !== mealIndex));
  return (candidates.get(meal) ?? [])
    .filter((c) => c.recipe.id !== current && !sameDay.has(c.recipe.id) && fits(c.recipe.id))
    .map((c) => ({ candidate: c, inPlan: used.has(c.recipe.id), fitsStyle: fitsStyle(c, style) })); // the whole candidate, so the ingredient rules (Longevity, Paleo, the diets...) count too
}

/**
 * The Swap sheet's other filters (founder 2026-11-21: "when they swap the meal, it should be the same customization as the recipe screen ... you can completely
 * filter exactly what you want"): the meal's numbers (High protein, Low fat, Lower carb, as Meal plan's eating styles count them), and leaving out what the
 * week has already.
 */
export type SwapExtra = "highProtein" | "lowFat" | "lowerCarb" | "notInPlan";
export const SWAP_EXTRAS: readonly SwapExtra[] = ["highProtein", "lowFat", "lowerCarb", "notInPlan"];
const EXTRA_TESTS: Record<SwapExtra, (r: SwapRow) => boolean> = {
  highProtein: (r) => fitsStyle(r.candidate, "highProtein"),
  lowFat: (r) => fitsStyle(r.candidate, "lowFat"),
  lowerCarb: (r) => fitsStyle(r.candidate, "lowerCarb"),
  notInPlan: (r) => !r.inPlan,
};

/** What a meal is mainly made of (mealBalance.ts), as the sheet offers it: fish of every kind together, beans with lentils. */
export type SwapMain = "chicken" | "beef" | "pork" | "lamb" | "turkey" | "fish" | "prawns" | "eggs" | "beans" | "tofu" | "cheese";
export const SWAP_MAINS: readonly SwapMain[] = ["chicken", "beef", "pork", "lamb", "turkey", "fish", "prawns", "eggs", "beans", "tofu", "cheese"];
const MAIN_OF: Record<MainKind, SwapMain> = {
  chicken: "chicken", turkey: "turkey", beef: "beef", pork: "pork", lamb: "lamb", salmon: "fish", tuna: "fish", whiteFish: "fish", oilyFish: "fish", prawns: "prawns",
  tofu: "tofu", beans: "beans", lentils: "beans", cheese: "cheese", eggs: "eggs",
};
export const swapMainOf = (c: PlanCandidate): SwapMain | null => { const m = mealBalanceOf(c.recipe).main; return m ? MAIN_OF[m] : null; };

/** What can be left out: a meal with any of it leading part of it (mealBalance featured), or made with bread. */
export type SwapAvoid = "eggs" | "cheese" | "bread" | "fish" | "pork" | "beef";
export const SWAP_AVOIDS: readonly SwapAvoid[] = ["eggs", "cheese", "bread", "fish", "pork", "beef"];
export function hasAvoid(c: PlanCandidate, a: SwapAvoid): boolean {
  const b = mealBalanceOf(c.recipe);
  if (a === "bread") return b.bread;
  return b.featured.some((k) => MAIN_OF[k] === a);
}

/** What the person has chosen to narrow the list: the search (a test from the screen, matchesRecipeSearch), the quick filters, the cuisines and a price range. */
export interface SwapFilter {
  matches?: (c: PlanCandidate) => boolean;
  quick?: Iterable<QuickFilter>;
  cuisines?: readonly CuisineId[];
  price?: PriceRange | null;
  /** Every one of these must hold. */
  extras?: Iterable<SwapExtra>;
  /** Mainly one of these (none chosen: any). */
  mains?: readonly SwapMain[];
  /** None of these. */
  avoid?: readonly SwapAvoid[];
}

/** The rows that pass every choice (each quick filter, one of the cuisines, inside the price range, and the search). */
export function filterSwapRows(rows: readonly SwapRow[], f: SwapFilter): SwapRow[] {
  const quick = [...(f.quick ?? [])];
  const cuisines = f.cuisines ?? [];
  const extras = [...(f.extras ?? [])];
  const mains = f.mains ?? [];
  const avoid = f.avoid ?? [];
  return rows.filter((row) => {
    const c = row.candidate;
    return quick.every((q) => QUICK_TESTS[q](c.recipe))
      && extras.every((x) => EXTRA_TESTS[x](row))
      && (!mains.length || mains.includes(swapMainOf(c) as SwapMain))
      && !avoid.some((a) => hasAvoid(c, a))
      && matchesNiche(c.recipe.id, cuisines, [])
      && (!f.price || inPriceRange(c.cost, f.price))
      && (!f.matches || f.matches(c));
  });
}

/** The extra filters worth offering here: each that keeps some rows but not all. */
export function usefulExtras(rows: readonly SwapRow[]): SwapExtra[] {
  return SWAP_EXTRAS.filter((x) => { const n = rows.filter((r) => EXTRA_TESTS[x](r)).length; return n > 0 && n < rows.length; });
}

/** The mains these rows come in, with how many (only those that have some), and the things worth leaving out (some rows have them, not all). */
export function swapMainCounts(rows: readonly SwapRow[]): Map<SwapMain, number> {
  const out = new Map<SwapMain, number>();
  for (const r of rows) { const m = swapMainOf(r.candidate); if (m) out.set(m, (out.get(m) ?? 0) + 1); }
  return new Map(SWAP_MAINS.filter((m) => out.has(m)).map((m) => [m, out.get(m)!]));
}
export function usefulAvoids(rows: readonly SwapRow[]): SwapAvoid[] {
  return SWAP_AVOIDS.filter((a) => { const n = rows.filter((r) => hasAvoid(r.candidate, a)).length; return n > 0 && n < rows.length; });
}

/** The sorts that mean something here: "closest fit" only when the recipes were fitted to the meal (some are further from it than others). */
export function swapSorts(rows: readonly SwapRow[]): SwapSort[] {
  return rows.some((r) => r.candidate.distance > 0) ? ["fit", "price", "protein"] : ["price", "protein"];
}

/** Of the plan's style first, then closest to the meal, cheapest or most protein, then the name. */
export function sortSwapRows(rows: readonly SwapRow[], sort: SwapSort): SwapRow[] {
  const key = (c: PlanCandidate): number[] => (sort === "fit" ? [c.distance, c.cost] : sort === "price" ? [c.cost, c.distance] : [-c.perServing.protein, c.distance]);
  return [...rows].sort((a, b) => {
    if (a.fitsStyle !== b.fitsStyle) return a.fitsStyle ? -1 : 1;
    const ka = key(a.candidate);
    const kb = key(b.candidate);
    return ka[0]! - kb[0]! || ka[1]! - kb[1]! || a.candidate.recipe.name.localeCompare(b.candidate.recipe.name, "en-GB");
  });
}

/** The quick filters worth a tile for these rows: each that keeps some of them but not all (Vegan for a vegan's plan, or Quick when none is, would do nothing). */
export function usefulQuickFilters(rows: readonly SwapRow[], all: readonly QuickFilter[]): QuickFilter[] {
  return all.filter((q) => {
    const n = rows.filter((r) => QUICK_TESTS[q](r.candidate.recipe)).length;
    return n > 0 && n < rows.length;
  });
}

/** The cuisines these rows come in, in the options' order (the Cuisine field's choices); none when fewer than two, so the field is worth showing. */
export function swapCuisines(rows: readonly SwapRow[], options: readonly CuisineOption[]): CuisineOption[] {
  const counts = nicheCounts(rows.map((r) => r.candidate.recipe.id), [], []).cuisine;
  const have = options.filter((o) => (counts.get(o.id) ?? 0) > 0);
  return have.length >= 2 ? have : [];
}

/** The Serving price field's default range: the cheapest and dearest of these rows' prices, to the 10p (null when there are none). */
export const swapPriceBounds = (rows: readonly SwapRow[]): PriceRange | null => servingPriceBounds(rows.map((r) => r.candidate.cost));
