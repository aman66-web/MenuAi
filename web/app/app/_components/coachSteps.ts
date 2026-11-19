// Relative imports (not "@/"), so the unit tests can load the steps (tests/coach.test.ts).
import type { CoachScreen } from "../../../lib/mm/coach";
import { FOOD_SCAN_ENABLED, PHOTO_RECIPES_ENABLED } from "../../../lib/mm/config";
import { tk } from "../../../lib/mm/i18n";

// What Pip points at on each tab (founder 2026-11-18: "a guided tour of what everything does"; CoachMarks.tsx draws it). Each tip lights up one real control,
// found on the page by `at` (a CSS selector: a link's own address where it has one, else a `data-coach` name on the element), and says in one plain sentence
// what it does, so someone new to phones learns the screen by looking at it. A tip whose control isn't on the page (a switched-off feature, a list still
// loading) is left out. No figures, no good/bad words (CLAUDE.md rule 3).

export interface CoachStep {
  at: string;
  title: string; // tk()
  text: string; // tk()
  when?: boolean;
}

export const COACH_STEPS: Readonly<Record<CoachScreen, readonly CoachStep[]>> = {
  home: [
    { at: '[data-coach="home-numbers"]', title: tk("Your day"), text: tk("What you've eaten today, and what's left of your calories, protein, carbs and fat.") },
    { at: '[data-coach="home-add"]', title: tk("Add what you ate"), text: tk("Tap + next to a meal to add what you ate: a restaurant dish, a recipe, a supermarket product, or your own numbers.") },
    { at: 'main a[href="/app/scan"]', title: tk("Scan your food"), text: tk("Take a photo of your plate and Pip estimates its calories, protein, carbs and fat. It's part of Premium."), when: FOOD_SCAN_ENABLED },
    { at: 'main a[href="/app/groceries/list"]', title: tk("Shopping list"), text: tk("Everything you've added to buy, ready when you go to the shops.") },
    { at: 'main a[href="/app/plan"]', title: tk("Meal plan"), text: tk("Pip plans a week of meals for your goal, diet and budget, from the shops you use. It's part of Premium.") },
    { at: 'main a[href="/app/settings"]', title: tk("Settings"), text: tk("Your goal, diet, allergies, text size, and these tips again.") },
    { at: '[data-coach="tabs"]', title: tk("Moving around"), text: tk("These buttons take you to each part of the app: Home, Eat out, Groceries and Recipes.") },
  ],
  eatOut: [
    { at: 'main a[href="/app/search"]', title: tk("Search"), text: tk("Type the name of a restaurant or a dish to find it.") },
    { at: 'main a[href="/app/map"]', title: tk("Near me"), text: tk("See the places to eat around you on a map.") },
    { at: 'main a[href="/app/eat-out/favourites"]', title: tk("Favourite restaurants"), text: tk("Tap the star on a restaurant's page and it's kept here.") },
    { at: '[data-coach="eatout-list"]', title: tk("Restaurants"), text: tk("Tap any restaurant to see the calories and protein of every dish on its menu.") },
  ],
  groceries: [
    { at: '[data-coach="groceries-shops"]', title: tk("Your supermarkets"), text: tk("Tap a shop to see its products and prices. Tap Select on a few to see them together.") },
    { at: 'main a[href="/app/groceries/search"]', title: tk("Search every shop"), text: tk("Type a product's name to find it in every supermarket at once.") },
    { at: '[data-coach="groceries-scan"]', title: tk("Scan a barcode"), text: tk("Point your camera at a product's barcode to see its label.") },
    { at: 'main a[href="/app/groceries/leaderboards"]', title: tk("Nutrition leaderboards"), text: tk("Supermarket products ranked by their protein, fibre and more.") },
    { at: 'main a[href="/app/groceries/list"]', title: tk("Shopping list"), text: tk("Products and recipes you add go here. Tick them off as you shop.") },
  ],
  recipes: [
    { at: '[data-coach="recipes-tiles"]', title: tk("Choose a meal"), text: tk("Tap Breakfast, Lunch, Dinner or Snacks to see recipes for that meal. Tap More for every filter.") },
    { at: '[data-coach="recipes-photo"]', title: tk("Make it at home"), text: tk("Take a photo of a dish you've loved and get a recipe for it from your supermarket. It's part of Premium."), when: PHOTO_RECIPES_ENABLED },
    { at: 'main a[href="/app/plan"]', title: tk("Meal plan"), text: tk("A week of meals for your goal and budget, with the shopping list and what each meal costs.") },
    { at: '[data-coach="recipes-mine"]', title: tk("My recipes"), text: tk("Recipes you keep, and ones Pip made for you, are here.") },
  ],
};

/** The tips this build has for a tab (a tip for a switched-off feature is left out). */
export const coachStepsFor = (screen: CoachScreen): CoachStep[] => COACH_STEPS[screen].filter((s) => s.when !== false);
