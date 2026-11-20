// What Premium adds: the one list (the meetings of 19 and 20 November 2026, build item 14). The paywall, the free-trial offer and the plans page (/app/pro) all
// read it through PremiumOffer, so the three can no longer disagree. Each entry names the paywall trigger(s) that open on it, so a test checks that every
// Premium action someone can tap is on the list, and nothing is on the list that this build doesn't have (`on`). Words only here (tk keys): the screen draws the
// icon named by `icon`. Numbers come from the constants that set the limits, never typed again.

import { FOOD_SCAN_ENABLED, FREE_SAVED_ORDER_LIMIT, PHOTO_RECIPES_ENABLED } from "./config";
import { FREE_BEST_RESULTS, type PaywallTrigger } from "./entitlements";
import { tk } from "./i18n";
import { BOARD_SIZE } from "./leaderboards";
import { FREE_LEADERBOARD_ROWS, FREE_PRESET_RESULTS, FREE_TRUTH_PER_DAY } from "./paid";

export type PremiumIcon = "calendar" | "camera" | "pot" | "fridge" | "bolt" | "swap" | "shrink" | "star" | "podium" | "bookmark";

export interface PremiumFeature {
  id: string;
  /** tk keys; `values` fills the line's {placeholders}. */
  title: string;
  line: string;
  values?: Record<string, string | number>;
  icon: PremiumIcon;
  /** The paywall triggers that open on this feature. */
  triggers: readonly PaywallTrigger[];
  /** The feature exists on this build (the photo features ride on their own switch). */
  on: boolean;
  /** One of the four named first, as a short checklist under the plans; the rest are behind "See everything Premium adds". */
  headline: boolean;
}

export const PREMIUM_FEATURES: readonly PremiumFeature[] = [
  { id: "mealPlan", title: tk("Meal plan"), line: tk("A week of meals for your goal, with one shopping list"), icon: "calendar", triggers: ["mealPlan"], on: true, headline: true },
  { id: "foodScan", title: tk("Scan your food"), line: tk("A photo of a meal, an estimate of its calories and macros"), icon: "camera", triggers: ["foodScan"], on: FOOD_SCAN_ENABLED, headline: true },
  { id: "photoRecipe", title: tk("Make it at home"), line: tk("Cook any dish from a photo"), icon: "pot", triggers: ["photoRecipe"], on: PHOTO_RECIPES_ENABLED, headline: true },
  // matching our own recipes to the fridge is free; Pip writing a new one is Premium (recipes/fridge/page.tsx)
  { id: "fridgeRecipe", title: tk("Cook with what you already have"), line: tk("Pip makes a new recipe from what you have at home"), icon: "fridge", triggers: ["fridgeRecipe"], on: PHOTO_RECIPES_ENABLED, headline: true },
  { id: "truth", title: tk("Every Truth card"), line: tk("Not just {n} a day"), values: { n: FREE_TRUTH_PER_DAY }, icon: "bolt", triggers: ["truthLimit"], on: true, headline: true },
  { id: "quickAnswers", title: tk("Every Smart Swap"), line: tk("And every Quick answer"), icon: "swap", triggers: ["moreResults"], on: true, headline: false },
  { id: "smallAppetite", title: tk("Small appetite"), line: tk("Smaller meals with plenty of protein, on every menu"), icon: "shrink", triggers: ["smallAppetite"], on: true, headline: false },
  { id: "bestForYou", title: tk("Top 5 picks"), line: tk("For your goal at every restaurant"), icon: "star", triggers: ["bestForYou"], on: true, headline: false },
  { id: "leaderboards", title: tk("Nutrition leaderboards"), line: tk("All {n} on every board, every shop"), values: { n: BOARD_SIZE }, icon: "podium", triggers: ["leaderboard"], on: true, headline: false },
  { id: "savedOrders", title: tk("Saved orders"), line: tk("As many as you like"), icon: "bookmark", triggers: ["saveLimit"], on: true, headline: false },
];

/** The features this build has, in the list's order. */
export const premiumFeaturesOn = (): PremiumFeature[] => PREMIUM_FEATURES.filter((f) => f.on);

/** The short checklist under the plans: the first four headline features this build has (topped up from the rest when a photo feature is off). */
export function headlineFeatures(list: readonly PremiumFeature[] = premiumFeaturesOn()): PremiumFeature[] {
  const first = list.filter((f) => f.headline);
  return [...first, ...list.filter((f) => !f.headline)].slice(0, 4);
}

/** Everything else, behind "See everything Premium adds". */
export function moreFeatures(list: readonly PremiumFeature[] = premiumFeaturesOn()): PremiumFeature[] {
  const head = new Set(headlineFeatures(list).map((f) => f.id));
  return list.filter((f) => !head.has(f.id));
}

/**
 * Why the paywall opened, said in one plain line at its top (it used to open on the plans with no reason, so "You've seen today's 3 free Truth cards" was never
 * said anywhere). Every trigger that can open a paywall on a paid build has its own line; the ones that never do there (logging, the order builder, Pip's dormant
 * recipe maker) keep a plain one for the older test builds.
 */
export const PAYWALL_REASON: Readonly<Record<PaywallTrigger, { text: string; values?: Record<string, string | number> }>> = {
  truthLimit: { text: tk("You've seen today's {n} free Truth cards. More tomorrow, or every one with Premium."), values: { n: FREE_TRUTH_PER_DAY } },
  leaderboard: { text: tk("The top {free} are free. Premium shows the full top {n}."), values: { free: FREE_LEADERBOARD_ROWS, n: BOARD_SIZE } },
  mealPlan: { text: tk("Meal plan is part of Premium.") },
  foodScan: { text: tk("Scan your food is part of Premium.") },
  photoRecipe: { text: tk("Make it at home is part of Premium.") },
  fridgeRecipe: { text: tk("Pip's new recipe from what you have at home is part of Premium. Matching our recipes to it stays free.") },
  smallAppetite: { text: tk("Small appetite is part of Premium.") },
  bestForYou: { text: tk("Your first {n} picks are free. Premium shows every pick for your goal."), values: { n: FREE_BEST_RESULTS } },
  moreResults: { text: tk("The first {n} answers are free. Premium shows the whole list."), values: { n: FREE_PRESET_RESULTS } },
  saveLimit: { text: tk("You've saved {n} orders, the most you can for free. Premium saves as many as you like."), values: { n: FREE_SAVED_ORDER_LIMIT } },
  log: { text: tk("Keeping a log is part of Premium.") },
  orderBuilder: { text: tk("The order builder is part of Premium.") },
  recipeMaker: { text: tk("Pip's recipe maker is part of Premium.") },
};

/**
 * The free-trial sheet waits for a later visit when this visit came through the sign-in screen (every 1.0 user updating to 1.1 meets it once, and the sheet
 * used to pop up straight after it). AppShell carries `sawSignIn` through the visit: once the sign-in screen has shown, the visit's next "open" holds the offer.
 * ("wait" alone, the moment before a signed-in phone has read its storage, never counts.)
 */
export function afterSignInGate(sawSignIn: boolean, gate: "open" | "wait" | "signIn"): { sawSignIn: boolean; holdTrialOffer: boolean } {
  const saw = sawSignIn || gate === "signIn";
  return { sawSignIn: saw && gate !== "open", holdTrialOffer: saw && gate === "open" };
}
