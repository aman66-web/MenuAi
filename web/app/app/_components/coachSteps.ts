// Relative imports (not "@/"), so the unit tests can load the steps (tests/coach.test.ts).
import type { CoachRound, CoachState } from "../../../lib/mm/coach";
import { FOOD_SCAN_ENABLED, PHOTO_RECIPES_ENABLED } from "../../../lib/mm/config";
import { LOG_IS_PAID } from "../../../lib/mm/entitlements";
import { tk } from "../../../lib/mm/i18n";

// What Pip points at on each tab (founder 2026-11-18: "a guided tour of what everything does"; CoachMarks.tsx draws it). Each tip lights up one real control,
// found on the page by `at` (a CSS selector: a link's own address where it has one, else a `data-coach` name on the element), and says in one plain sentence
// what it does, so someone new to phones learns the screen by looking at it. A tip whose control isn't on the page (a switched-off feature, a list still
// loading) is left out. No figures, no good/bad words (CLAUDE.md rule 3). Each button is taught once (onboarding meetings, 19 and 20 November): a card that
// names itself (Meal plan, Cook with what you already have) or a list that is empty on day one (Favourite restaurants) has no tip, a tip a welcome showcase
// already gave (`showcaseCovers`) is left out after the welcome screens, and the + is left out while Home's Start here card (which teaches it) is there.
// After the welcome screens Home's tips come over two visits (lib/mm/coach.ts): `later` ones on the second.

export interface CoachStep {
  at: string;
  title: string; // tk()
  text: string; // tk()
  when?: boolean;
  /** A welcome showcase already shows this (Eat out's restaurants, on step 3): left out when the tips follow the welcome screens (CoachState.afterShowcase). */
  showcaseCovers?: boolean;
  /** Home after the welcome screens: taught on the second visit ("homeLater"), not the first. */
  later?: boolean;
  /** Left out while this is on the page (Home's Start here card already teaches the +). */
  unless?: string;
  /** Pip hops once along the lit control (the tab bar), standing on it; still with Reduce Motion. */
  hop?: boolean;
}

// The + tip says "It's part of Premium" exactly when adding a meal is paid on this build (LOG_IS_PAID, lib/mm/entitlements.ts), so it is never untrue.
// Home's order is the order on one visit (Settings' "Show me the buttons"); after the welcome screens the first visit takes the ones not `later`, in order
// ("Your day", the + when it shows, "Moving around"), and the second the `later` ones ("Scan your food", "Shopping list, Settings").
export const COACH_STEPS: Readonly<Record<CoachRound, readonly CoachStep[]>> = {
  home: [
    // true whether the pages slide (with dots) or stack (a phone under 366 px, or large text: no dots), so it names what is there, not how to get to it
    { at: '[data-coach="home-numbers"]', title: tk("Your day"), text: tk("What you've eaten today and what's left, and your week.") },
    { at: '[data-coach="home-add"]', title: tk("Add what you ate"), text: tk("Tap + next to a meal to add what you ate: a restaurant dish, a recipe, a supermarket product, or your own numbers. It's part of Premium."), when: LOG_IS_PAID, unless: '[data-coach="home-start"]' },
    { at: '[data-coach="home-add"]', title: tk("Add what you ate"), text: tk("Tap + next to a meal to add what you ate: a restaurant dish, a recipe, a supermarket product, or your own numbers."), when: !LOG_IS_PAID, unless: '[data-coach="home-start"]' },
    // the cooking tools sit on Home under the numbers (founder 2026-11-19); Meal plan and Cook with what you already have are cards that name themselves, so only Scan your food has a tip
    { at: '[data-coach="home-photo"]', title: tk("Scan your food"), text: tk("Take a photo of a meal: see its calories and macros, or get the recipe to make it at home. It's part of Premium."), when: PHOTO_RECIPES_ENABLED || FOOD_SCAN_ENABLED, later: true },
    // the shopping list and the gear share the top right corner (founder 2026-11-19), so one tip lights both
    { at: '[data-coach="home-top"]', title: tk("Shopping list, Settings"), text: tk("At the top right: your shopping list, and Settings, where you can change your goal, your diet and these tips."), later: true },
    { at: '[data-coach="tabs"]', title: tk("Moving around"), text: tk("These buttons take you to each part of the app: Home, Recipes, Groceries and Eat out."), hop: true },
  ],
  // Home's second visit after the welcome screens: its `later` tips (coachStepsFor)
  homeLater: [],
  // in the order they come down the page; Favourite restaurants (empty on day one) and Settings (taught on Home) have no tip here
  eatOut: [
    { at: 'main a[href="/app/search"]', title: tk("Search"), text: tk("Type the name of a restaurant or a dish to find it.") },
    { at: 'main a[href="/app/map"]', title: tk("Near me"), text: tk("See the places to eat around you on a map.") },
    // the welcome screens' step 3 shows real dishes at a restaurant, so this goes after them
    { at: '[data-coach="eatout-list"]', title: tk("Restaurants"), text: tk("Tap any restaurant to see the calories and protein of every dish on its menu."), showcaseCovers: true },
  ],
  // Nutrition leaderboards names itself; the shopping list is taught on Home
  groceries: [
    { at: '[data-coach="groceries-shops"]', title: tk("Your supermarkets"), text: tk("Tap a shop to see its products and prices. Tap Select on a few to see them together.") },
    { at: 'main a[href="/app/groceries/search"]', title: tk("Search every shop"), text: tk("Type a product's name to find it in every supermarket at once.") },
    { at: '[data-coach="groceries-scan"]', title: tk("Scan a barcode"), text: tk("Point your camera at a product's barcode to see its label.") },
  ],
  recipes: [
    { at: '[data-coach="recipes-tiles"]', title: tk("Choose a meal"), text: tk("Tap Breakfast, Lunch, Dinner or Snacks to see recipes for that meal. Tap More for every filter.") },
    { at: '[data-coach="recipes-mine"]', title: tk("My recipes"), text: tk("Recipes you keep, and ones I made for you, are here.") },
  ],
};

/**
 * The tips this build has for a round: a tip for a switched-off feature is left out, and after the welcome screens (`state.afterShowcase`) so is one a
 * showcase gave, and Home's split over two visits. (Whether the Start here card is on the page is checked on the page: `unless`.)
 */
export function coachStepsFor(round: CoachRound, state?: Pick<CoachState, "afterShowcase">): CoachStep[] {
  const after = state?.afterShowcase === true;
  const steps = round === "homeLater" ? COACH_STEPS.home.filter((s) => s.later) : round === "home" && after ? COACH_STEPS.home.filter((s) => !s.later) : COACH_STEPS[round];
  return steps.filter((s) => s.when !== false && !(s.showcaseCovers && after));
}
