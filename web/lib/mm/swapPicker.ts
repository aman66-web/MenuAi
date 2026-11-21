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

/** What the person has chosen to narrow the list: the search (a test from the screen, matchesRecipeSearch), the quick filters, the cuisines and a price range. */
export interface SwapFilter {
  matches?: (c: PlanCandidate) => boolean;
  quick?: Iterable<QuickFilter>;
  cuisines?: readonly CuisineId[];
  price?: PriceRange | null;
}

/** The rows that pass every choice (each quick filter, one of the cuisines, inside the price range, and the search). */
export function filterSwapRows(rows: readonly SwapRow[], f: SwapFilter): SwapRow[] {
  const quick = [...(f.quick ?? [])];
  const cuisines = f.cuisines ?? [];
  return rows.filter(({ candidate: c }) =>
    quick.every((q) => QUICK_TESTS[q](c.recipe))
    && matchesNiche(c.recipe.id, cuisines, [])
    && (!f.price || inPriceRange(c.cost, f.price))
    && (!f.matches || f.matches(c)));
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
