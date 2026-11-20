// Your plan's example week (the last welcome screen). Founder, 20 November 2026: "We shouldn't calculate the meal plan. This should just be an example of their
// meal plan, showing the app is like how it works ... because it depends if you want to make it a premium feature." So the week is never worked out: no shop,
// no sizing to the person's numbers, no prices, nothing saved. It is our own illustrated recipes that suit the person's diet and allergies as written (so a
// vegan never sees bacon), spread through the book so the days differ. Meal plan itself (Premium) makes the real week. Pure, so it is unit-tested.

import type { DietPrefs } from "./pantry";
import { RECIPES } from "./recipeBook";
import { RECIPE_IMAGES } from "./recipeImages";
import { recipeForDiet, type Recipe } from "./recipes";

export const EXAMPLE_DAYS = 7;
export const EXAMPLE_MEALS = ["breakfast", "lunch", "dinner"] as const;
export type ExampleMeal = (typeof EXAMPLE_MEALS)[number];

export interface ExampleDay {
  meals: Array<{ meal: ExampleMeal; recipeId: string; name: string }>;
}

/** Seven days of breakfast, lunch and dinner from the book. A meal with no recipe that suits the diet and has a picture stays empty that day. */
export function exampleWeek(diet: DietPrefs, recipes: readonly Recipe[] = RECIPES, images: Readonly<Record<string, string>> = RECIPE_IMAGES): ExampleDay[] {
  const pool = (meal: ExampleMeal) => recipes.filter((r) => r.meal === meal && !!images[r.id] && recipeForDiet(r, diet) !== null);
  const pools = EXAMPLE_MEALS.map((meal) => [meal, pool(meal)] as const);
  return Array.from({ length: EXAMPLE_DAYS }, (_, day) => ({
    meals: pools.flatMap(([meal, list]) => {
      if (!list.length) return [];
      // spread through the book: day d takes the recipe d/7 of the way along, so a long list never shows seven near neighbours
      const r = list[Math.floor((day * list.length) / EXAMPLE_DAYS) % list.length]!;
      return [{ meal, recipeId: r.id, name: r.name }];
    }),
  }));
}
