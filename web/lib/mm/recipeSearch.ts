import type { T } from "./i18n";
import { PANTRY } from "./pantry";
import { nicheSearchWords, type CuisineOption, type OccasionOption } from "./recipeNiche";
import { isMeatFree, isQuick, isVegan, MEAL_TYPES, recipeForDiet, type Recipe } from "./recipes";
import type { AllergenKey } from "./types";

// The Recipes screen's search box and its quick filters, shared with Meal plan's Swap sheet (founder 2026-11-20: "a version of that which is also in the meal
// plan part"), so a word finds the same recipes in both. Pure and unit-tested (tests/recipeSearch.test.ts).

/** The quick filters under the search (Quick, No meat or fish, Vegan): each one applies when chosen, all of them together. */
export type QuickFilter = "quick" | "meatFree" | "vegan";
export const QUICK_TESTS: Record<QuickFilter, (r: Recipe) => boolean> = { quick: isQuick, meatFree: isMeatFree, vegan: isVegan };

/** Text folded as the shop search folds it (lib/mm/search.ts normalizeForSearch): no accents, lower case, no apostrophes, so "tomato puree" finds "purée",
 *  "nicoise" finds "niçoise" and "shepherds" finds "shepherd's" (Hassan, 21 November 2026: "tomato puree" found 0 recipes). */
const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/['’]/g, "");

/** Words a recipe is also found by (the audit, 20 November 2026: "vegetarian", "veggie", "gluten free" and "high protein" found nothing): the tiles' own words, the
 *  meal, "{allergen} free" for each allergen none of its ingredients brings (by the same rules the diet uses), and "high protein" when protein gives at least a
 *  fifth of its calories (the UK's rule for that claim). In English and through t(); searched only, never shown.
 *  The free-from and meat-free words are whole phrases, never single words (Hassan, 21 November 2026: "fish", "meat", "egg", "nut", "milk", "soy" and "sesame"
 *  each found nearly every recipe, through "fish free", "no meat", "egg free" and the rest). */
const ALLERGEN_FREE: Partial<Record<AllergenKey, readonly string[]>> = {
  gluten: ["gluten free", "gluten-free"], milk: ["dairy free", "dairy-free", "milk free", "milk-free"], eggs: ["egg free", "egg-free"], nuts: ["nut free", "nut-free"],
  peanuts: ["peanut free", "peanut-free"], soya: ["soya free", "soya-free", "soy free", "soy-free"], sesame: ["sesame free", "sesame-free"], fish: ["fish free", "fish-free"],
  mustard: ["mustard free", "mustard-free"], celery: ["celery free", "celery-free"], sulphites: ["sulphite free", "sulphite-free"],
};
const MEAT_FREE = ["meat-free", "meat free", "no meat", "no meat or fish"];
const NO_MEAT_LABEL = "No meat or fish";

/** A recipe's extra search terms (recipeSearchExtras): `words`, each found at the start of a word; `phrases`, each found only when typed whole (folded). */
export interface RecipeSearchExtras {
  words: string;
  phrases: readonly string[];
}
const NO_EXTRAS: RecipeSearchExtras = { words: "", phrases: [] };

/** Every phrase the search knows (in English and the reader's language), longest first, so "no meat or fish" is taken out before "no meat" and "peanut free"
 *  is never read as "nut free". */
const phraseCache = new WeakMap<T, readonly string[]>();
function knownPhrases(t: T): readonly string[] {
  let out = phraseCache.get(t);
  if (!out) {
    out = [...new Set([...MEAT_FREE, t(NO_MEAT_LABEL), ...Object.values(ALLERGEN_FREE).flat()].map(fold))].sort((a, b) => b.length - a.length);
    phraseCache.set(t, out);
  }
  return out;
}

/** A recipe's extra search terms (above), from the recipe and one serving's calories and protein as the screen shows them. */
export function recipeSearchExtras(r: Recipe, perServing: { kcal: number; protein: number }, t: T): RecipeSearchExtras {
  const words: string[] = [];
  const phrases: string[] = [];
  if (isMeatFree(r)) {
    // "vegetarian" only when no ingredient is usually made with animal rennet (Hassan, 21 November 2026: three recipes made with ordinary green pesto were found
    // by it), unless the card is made for a vegetarian diet: recipeForDiet then sets `vegetarian` and those ingredients are the versions made without it.
    // Still "no meat or fish": that is true of them.
    if (r.vegetarian || !r.ingredients.some((i) => !!i.pantry && !!PANTRY.get(i.pantry)?.rennet)) words.push("vegetarian veggie");
    phrases.push(...MEAT_FREE, t(NO_MEAT_LABEL));
  }
  if (isVegan(r)) words.push("vegan plant-based plant based", t("Vegan"));
  if (isQuick(r)) words.push("quick fast", t("Quick"));
  const meal = MEAL_TYPES.find((m) => m.value === r.meal);
  if (meal) words.push(meal.value, meal.label, t(meal.label));
  for (const [a, w] of Object.entries(ALLERGEN_FREE)) if (recipeForDiet(r, { avoidAllergens: [a as AllergenKey] })) phrases.push(...w);
  const { kcal, protein } = perServing;
  if (kcal > 0 && (protein * 4) / kcal >= 0.2) words.push("high protein high-protein");
  return { words: fold(words.join(" ")), phrases: [...new Set(phrases.map(fold))] };
}

/** Whether `w` starts a word of `text` (after a space or a hyphen): "veg" finds "veggie", but "egg" never does. */
function startsAWord(text: string, w: string): boolean {
  for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + 1)) if (i === 0 || text[i - 1] === " " || text[i - 1] === "-") return true;
  return false;
}

/** Search words against a recipe's name, blurb and ingredient names ("chicken", "curry", "oats"), in English and in the reader's language, the words of its
 *  cuisine and occasions that are on offer ("chinese", "picnic", "bbq"), and its diet and meal words (`extras`: recipeSearchExtras). Every word must be found.
 *  A free-from or meat-free phrase typed ("fish free", "no meat") must be one of the recipe's own and is then taken out of the search, so its words never search
 *  on their own; the diet and meal words are found only at the start of a word (so "egg" never finds "veggie"); accents and apostrophes don't count. */
export function matchesRecipeSearch(r: Recipe, q: string, t: T, offered: { cuisines: readonly CuisineOption[]; occasions: readonly OccasionOption[] }, extras: RecipeSearchExtras = NO_EXTRAS): boolean {
  let rest = ` ${fold(q).split(/\s+/).filter(Boolean).join(" ")} `;
  if (!rest.trim()) return true;
  const mine = new Set(extras.phrases);
  for (const p of knownPhrases(t)) {
    const needle = ` ${p} `;
    if (!rest.includes(needle)) continue;
    if (!mine.has(p)) return false;
    while (rest.includes(needle)) rest = rest.replace(needle, " ");
  }
  const words = rest.split(" ").filter(Boolean);
  if (!words.length) return true;
  const labels = r.ingredients.map((i) => i.label);
  const own = r.ai ? labels.map((x) => t(x)) : [r.name, r.blurb, ...labels].map((x) => t(x));
  const hay = fold([r.name, r.blurb, ...labels, ...own, ...nicheSearchWords(r.id, t, offered)].join(" "));
  return words.every((w) => hay.includes(w) || startsAWord(extras.words, w));
}
