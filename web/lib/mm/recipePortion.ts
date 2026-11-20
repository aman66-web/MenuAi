import { tk } from "./i18n";
import { currentRecipeMeal } from "./mealTarget";
import { mealSizes, type MealTarget } from "./recipes";
import type { UserSettings } from "./user-data";

// A recipe page says what size a serving is cooked to and why, right under its calories (founder 2026-11-20): "Sized to your meal: about {n} kcal", the reason in
// a few words when it comes from the person's day, and a switch to the "Usual portion" instead. Both are the app's own fitting (lib/mm/recipes.ts fitRecipe) on
// the products' labels; this file only says which size and why. Pure.

/** A usual portion: a serving of about 600 kcal, a usual main meal (the founder's brief, 20 November 2026; the UK's 400-600-600 guide for breakfast, lunch and dinner
 *  says the same of lunch and dinner). Our book's main-meal servings as written are smaller (a median of 458 kcal at Sainsbury's, measured 20 November). "Usual
 *  portion" fits the recipe to it, as "My meal size" fits it to the person's meal. */
export const USUAL_PORTION_KCAL = 600;
export const USUAL_PORTION: MealTarget = { kcal: USUAL_PORTION_KCAL };

/** The reason, in a few words, under "Sized to your meal". */
export const PORTION_REASONS = {
  /** A meal of the meal plan: the person's day shared equally between its meals (lib/mm/mealPlan.ts slotTargets). */
  overMeals: tk("Your {day} kcal day over {meals} meals"),
  /** Recipes' normal meal: 30% of the day (lib/mm/recipes.ts mealSizes). */
  share: tk("30% of your {day} kcal day"),
  small: tk("A small meal for your {day} kcal day"),
  big: tk("A big meal for your {day} kcal day"),
  /** GLP-1: the meal size they set in Settings ("Comfortable meal size"). */
  cap: tk("Your comfortable meal size"),
} as const;

export interface PortionReason {
  text: (typeof PORTION_REASONS)[keyof typeof PORTION_REASONS];
  day?: number;
  meals?: number;
}

type ReasonSettings = Pick<UserSettings, "dailyCalories" | "goal" | "glp1MealCap" | "recipeMeal">;

/**
 * Why a recipe is sized to `target`, when that comes from the person's day: only ever said when it is exactly how the size was worked out. From a meal plan, the
 * day shared equally between its meals (said only when the meal is that share: a day with snacks or a capped meal isn't); on Recipes, a normal meal is 30% of
 * the day and a small or big one 200 kcal either side; on a GLP-1 medicine, the comfortable meal size from Settings when that is what sized it. Null for the
 * person's own typed numbers, or when the size isn't the day's (a meal held at 300 or 1,200 kcal).
 */
export function portionReason(s: ReasonSettings, target: MealTarget, fromPlan: boolean): PortionReason | null {
  const day = s.dailyCalories;
  if (!(day > 0) || !(target.kcal > 0)) return null;
  if (s.goal === "glp1" && target.kcal === s.glp1MealCap) return { text: PORTION_REASONS.cap };
  if (fromPlan) {
    const meals = Math.round(day / target.kcal);
    const share = Math.max(200, Math.round(day / Math.max(1, meals) / 10) * 10);
    return meals >= 2 && meals <= 3 && share === target.kcal ? { text: PORTION_REASONS.overMeals, day, meals } : null;
  }
  const m = currentRecipeMeal(s);
  if (m.size === "custom" || m.size === "written") return null;
  const sizes = mealSizes(day);
  if (target.kcal !== sizes[m.size]) return null;
  // a normal meal held at the 300 or 1,200 kcal limit isn't 30% of the day
  if (sizes.normal !== Math.round((day * 0.3) / 50) * 50) return null;
  return { text: m.size === "normal" ? PORTION_REASONS.share : m.size === "small" ? PORTION_REASONS.small : PORTION_REASONS.big, day };
}

/** Whether two servings come to the same figures (the switch is left out when both sizes give the same recipe). */
export const samePortion = (a: { kcal: number; protein: number }, b: { kcal: number; protein: number }): boolean =>
  Math.round(a.kcal) === Math.round(b.kcal) && Math.round(a.protein) === Math.round(b.protein);
