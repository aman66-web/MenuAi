import type { Recipe } from "../recipes";
import { BREAKFAST } from "./breakfast";
import { CORE } from "./core";
import { DINNER_HOME } from "./dinnerHome";
import { DINNER_WORLD } from "./dinnerWorld";
import { LUNCH } from "./lunch";
import { SNACKS } from "./snacks";

// The recipe book: our own recipes, built from the pantry (lib/mm/pantry.ts). Each ingredient is a kind of food, not a product: the app
// finds the products at the person's shop (or a substitute when the shop doesn't sell it) and works out every number from their labels.
// Rules for every recipe (tests/recipeBook.test.ts checks them):
// - plain British English anyone can follow, including older people and beginners; 2 to 7 short steps;
// - the name and blurb describe the dish and never make a health or nutrition claim (no "healthy", "light", "lean", "guilt-free",
//   "high-protein", "low-calorie"...), and no step gives a nutrition figure or a price;
// - say how to tell food is cooked: chicken, pork and mince until piping hot with no pink left, fish until it flakes easily, eggs until set;
// - amounts are for the whole recipe, as weighed before cooking (dry pasta and rice, drained tins); servings 1 to 6;
// - fresh vegetables, herbs, spices, garlic, onions, lemon and a little oil go in "extras" (not counted: the shop's pages don't give their
//   numbers yet); everything counted is a pantry kind.

export const RECIPES: readonly Recipe[] = [...CORE, ...BREAKFAST, ...LUNCH, ...DINNER_WORLD, ...DINNER_HOME, ...SNACKS];
