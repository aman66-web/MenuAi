import { tk } from "./i18n";
import { halfUp } from "./nutrients";
import type { Goal, Meal, Nutrients, Profile } from "./types";

// SPEC §6.3: left today and meal budget.

export const MEAL_SHARE: Record<Meal, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.4 };
export const DEFAULT_DAILY_CALORIES = 2000;
export const DEFAULT_GLP1_MEAL_CAP = 450;
export const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: tk("Breakfast"), lunch: tk("Lunch"), dinner: tk("Dinner") };

/** Meal slot from local time: breakfast before 10:30, lunch 10:30–15:59, dinner from 16:00. */
export function mealSlotFor(date: Date): Meal {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 10 * 60 + 30) return "breakfast";
  if (minutes < 16 * 60) return "lunch";
  return "dinner";
}

/** The meal an entry sits under: the row it was added to (Home's + on a meal), else the meal its time falls in. */
export function entryMeal(e: { loggedAt: string; meal?: Meal }): Meal {
  return e.meal ?? mealSlotFor(new Date(e.loggedAt));
}

export interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const NO_TOTALS: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Sum of entries logged on the current local calendar day. */
export function loggedToday(entries: ReadonlyArray<{ loggedAt: string; nutrients: Nutrients }>, now: Date): Totals {
  const total = { ...NO_TOTALS };
  for (const e of entries) {
    if (!isSameLocalDay(new Date(e.loggedAt), now)) continue;
    total.calories += e.nutrients.calories;
    // An entry typed in with calories only has no protein, carbs or fat: it adds nothing to those sums, and loggedGaps says that it happened.
    total.protein += e.nutrients.protein ?? 0;
    total.carbs += e.nutrients.carbs ?? 0;
    total.fat += e.nutrients.fat ?? 0;
  }
  return total;
}

/** How many of today's entries have no protein, carbs or fat (typed in with calories only): those sums leave them out, never count them as 0. */
export interface LoggedGaps {
  protein: number;
  carbs: number;
  fat: number;
  /** True when any of the three is missing from any entry. */
  any: boolean;
}

export function loggedGaps(entries: ReadonlyArray<{ loggedAt: string; nutrients: Nutrients }>, now: Date): LoggedGaps {
  const gaps = { protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    if (!isSameLocalDay(new Date(e.loggedAt), now)) continue;
    if (e.nutrients.protein === undefined) gaps.protein++;
    if (e.nutrients.carbs === undefined) gaps.carbs++;
    if (e.nutrients.fat === undefined) gaps.fat++;
  }
  return { ...gaps, any: gaps.protein + gaps.carbs + gaps.fat > 0 };
}

export interface Remaining {
  calories: number; // may be negative
  protein?: number; // only when a protein target is set; may be negative
}

export function remainingToday(profile: Profile, logged: Totals): Remaining {
  return {
    calories: profile.dailyCalories - logged.calories,
    ...(profile.dailyProtein !== undefined ? { protein: profile.dailyProtein - logged.protein } : {}),
  };
}

/** mealBudget = min(remaining, round(daily × share)); GLP-1: min(remaining, comfortable meal size). */
export function mealBudget(
  profile: Profile,
  loggedCalories: number,
  meal: Meal,
  shares: Record<Meal, number> = MEAL_SHARE,
): { remaining: number; budget: number } {
  const remaining = profile.dailyCalories - loggedCalories;
  const goal: Goal = profile.goal;
  const budget =
    goal === "glp1"
      ? Math.min(remaining, profile.glp1MealCap ?? DEFAULT_GLP1_MEAL_CAP)
      : Math.min(remaining, halfUp(profile.dailyCalories * shares[meal]));
  return { remaining, budget };
}
