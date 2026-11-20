// The picture on each diet tile of "Anything you avoid?" (founder, 20 November 2026: "people understand images better than writing"): one of OUR OWN recipes
// that fits that diet as written, shown by its illustration (CLAUDE.md rule 2: an illustration only for our own recipes, no visible caption). Pure, with
// relative imports, so the unit tests can load it (tests/welcomeDietPictures.test.ts).
// - "Fits as written": lib/mm/recipes.ts recipeForDiet keeps the recipe for that one diet. It never swaps an ingredient for another food (it only narrows which
//   products match, as halal or rennet-free cheese), so the picture shows food that diet eats.
// - A diet that still eats meat (halal, no pork, no beef, kosher style, no red meat, no meat sold as halal or kosher) shows a dish with meat, so the tile can't
//   be read as vegetarian; pescatarian shows fish; vegetarian shows a dish that isn't vegan (cheese, eggs or milk), so it differs from vegan's.
// - Dinners first, then lunches, then breakfasts; the recipe book's own order after that; no picture twice on the screen.

import type { MoreDietKey } from "../../../lib/mm/foodDiet";
import type { DietKey } from "../../../lib/mm/menu-view";
import { PANTRY, type DietPrefs, type PantryKind } from "../../../lib/mm/pantry";
import { RECIPES } from "../../../lib/mm/recipeBook";
import { RECIPE_IMAGES } from "../../../lib/mm/recipeImages";
import { recipeForDiet, type Recipe } from "../../../lib/mm/recipes";

/** The tiles in the picker's order: the six first, then the six behind "More diets". */
export const PICTURE_DIETS: readonly DietKey[] = ["vegetarianOnly", "veganOnly", "pescatarianOnly", "halalOnly", "noPork", "noBeef", "jain", "noOnionGarlic", "kosherStyle", "noRedMeat", "noAlcohol", "noHalalKosherMeat"] satisfies readonly (DietKey | MoreDietKey)[];

const kinds = (r: Recipe): PantryKind[] => r.ingredients.map((i) => (i.pantry ? PANTRY.get(i.pantry) : undefined)).filter((k): k is PantryKind => !!k);
const hasMeat = (r: Recipe) => kinds(r).some((k) => !!k.meat);
const hasFish = (r: Recipe) => kinds(r).some((k) => !!k.fish);
const hasAnimal = (r: Recipe) => kinds(r).some((k) => !!k.animal);

/** What the picture must show besides fitting the diet (see the top of this file). */
const WANT: Partial<Record<DietKey, (r: Recipe) => boolean>> = {
  vegetarianOnly: hasAnimal,
  pescatarianOnly: hasFish,
  halalOnly: hasMeat,
  noPork: hasMeat,
  noBeef: hasMeat,
  kosherStyle: hasMeat,
  noRedMeat: (r) => hasMeat(r) || hasFish(r),
  noHalalKosherMeat: hasMeat,
};

const MEAL_ORDER = ["dinner", "lunch", "breakfast"] as const;

/** Each diet's picture: the recipe's id and its illustration's path (public/recipe-images/), or none when no recipe with an illustration fits. */
export function dietPictures(recipes: readonly Recipe[] = RECIPES, images: Readonly<Record<string, string>> = RECIPE_IMAGES): Partial<Record<DietKey, { recipeId: string; src: string }>> {
  const pictured = recipes.filter((r) => !!images[r.id] && !!r.meal && (MEAL_ORDER as readonly string[]).includes(r.meal));
  const ordered = MEAL_ORDER.flatMap((m) => pictured.filter((r) => r.meal === m));
  const used = new Set<string>();
  const out: Partial<Record<DietKey, { recipeId: string; src: string }>> = {};
  for (const key of PICTURE_DIETS) {
    const diet = { [key]: true } as DietPrefs;
    const want = WANT[key];
    const pick = ordered.find((r) => !used.has(r.id) && recipeForDiet(r, diet) !== null && (!want || want(r)));
    if (!pick) continue;
    used.add(pick.id);
    out[key] = { recipeId: pick.id, src: images[pick.id]! };
  }
  return out;
}

let cached: ReturnType<typeof dietPictures> | null = null;
/** The pictures for the recipe book as built (worked out once). */
export function bookDietPictures(): ReturnType<typeof dietPictures> {
  cached ??= dietPictures();
  return cached;
}
