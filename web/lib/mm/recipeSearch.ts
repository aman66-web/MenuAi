import type { T } from "./i18n";
import { nicheSearchWords, type CuisineOption, type OccasionOption } from "./recipeNiche";
import { isMeatFree, isQuick, isVegan, MEAL_TYPES, recipeForDiet, type Recipe } from "./recipes";
import type { AllergenKey } from "./types";

// The Recipes screen's search box and its quick filters, shared with Meal plan's Swap sheet (founder 2026-11-20: "a version of that which is also in the meal
// plan part"), so a word finds the same recipes in both. Pure and unit-tested (tests/recipeSearch.test.ts).

/** The quick filters under the search (Quick, No meat or fish, Vegan): each one applies when chosen, all of them together. */
export type QuickFilter = "quick" | "meatFree" | "vegan";
export const QUICK_TESTS: Record<QuickFilter, (r: Recipe) => boolean> = { quick: isQuick, meatFree: isMeatFree, vegan: isVegan };

/** Words a recipe is also found by (the audit, 20 November 2026: "vegetarian", "veggie", "gluten free" and "high protein" found nothing): the tiles' own words, the
 *  meal, "{allergen} free" for each allergen none of its ingredients brings (by the same rules the diet uses), and "high protein" when protein gives at least a
 *  fifth of its calories (the UK's rule for that claim). In English and through t(); searched only, never shown. */
const ALLERGEN_FREE: Partial<Record<AllergenKey, string>> = {
  gluten: "gluten free gluten-free", milk: "dairy free dairy-free milk free", eggs: "egg free egg-free", nuts: "nut free nut-free", peanuts: "peanut free peanut-free",
  soya: "soya free soy free", sesame: "sesame free", fish: "fish free", mustard: "mustard free", celery: "celery free", sulphites: "sulphite free",
};

/** A recipe's extra search words (above), from the recipe and one serving's calories and protein as the screen shows them. */
export function recipeSearchExtras(r: Recipe, perServing: { kcal: number; protein: number }, t: T): string {
  const words: string[] = [];
  if (isMeatFree(r)) words.push("vegetarian veggie meat-free meat free no meat", t("No meat or fish"));
  if (isVegan(r)) words.push("vegan plant-based plant based", t("Vegan"));
  if (isQuick(r)) words.push("quick fast", t("Quick"));
  const meal = MEAL_TYPES.find((m) => m.value === r.meal);
  if (meal) words.push(meal.value, meal.label, t(meal.label));
  for (const [a, w] of Object.entries(ALLERGEN_FREE)) if (recipeForDiet(r, { avoidAllergens: [a as AllergenKey] })) words.push(w);
  const { kcal, protein } = perServing;
  if (kcal > 0 && (protein * 4) / kcal >= 0.2) words.push("high protein high-protein");
  return words.join(" ");
}

/** Search words against a recipe's name, blurb and ingredient names ("chicken", "curry", "oats"), in English and in the reader's language, the words of its
 *  cuisine and occasions that are on offer ("chinese", "picnic", "bbq"), and its diet and meal words (`extras`: recipeSearchExtras). Every word must be found. */
export function matchesRecipeSearch(r: Recipe, q: string, t: T, offered: { cuisines: readonly CuisineOption[]; occasions: readonly OccasionOption[] }, extras = ""): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const labels = r.ingredients.map((i) => i.label);
  const own = r.ai ? labels.map((x) => t(x)) : [r.name, r.blurb, ...labels].map((x) => t(x));
  const hay = [r.name, r.blurb, ...labels, ...own, ...nicheSearchWords(r.id, t, offered), extras].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}
