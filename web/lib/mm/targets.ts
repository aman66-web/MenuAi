import { tk } from "./i18n";
import type { Goal } from "./types";

// SPEC §6.2: Mifflin-St Jeor suggestion. Always shown with "Suggested starting points, not medical advice."

export type Sex = "male" | "female" | "unspecified";
export type Activity = "sedentary" | "light" | "active" | "veryActive";

export const ACTIVITY_FACTOR: Record<Activity, number> = { sedentary: 1.2, light: 1.375, active: 1.55, veryActive: 1.725 };
export const ACTIVITY_LABEL: Record<Activity, string> = {
  sedentary: tk("Mostly sitting"),
  light: tk("Lightly active"),
  active: tk("Active"),
  veryActive: tk("Very active"),
};
const SEX_OFFSET: Record<Sex, number> = { male: 5, female: -161, unspecified: -78 };
const CALORIE_ADJUSTMENT: Record<Goal, number> = { lose: -500, maintain: 0, buildMuscle: 250, glp1: -500, other: 0 };
const PROTEIN_PER_KG: Record<Goal, number> = { lose: 1.4, maintain: 1.2, buildMuscle: 1.6, glp1: 1.4, other: 1.2 }; // "other" = maintain

export const MIN_SUGGESTED_CALORIES = 1200;
export const UNDER_18_COPY = tk("Ask a doctor or dietitian for targets.");
export const SUGGESTION_NOTE = tk("Suggested starting points, not medical advice. Adjust any time.");
/** Shown (not blocking) under a typed calorie target below what suggestions ever start from (App Review 1.4.1: no encouraging of unsafe dieting). */
export const LOW_CALORIES_NOTE = tk("That's lower than most adults need. If you plan to eat this little, please talk to a doctor or dietitian first.");
/** Under the GLP-1 goal: the app follows the person's medicine plan, it doesn't give medical advice (App Review 1.4.1). */
export const GLP1_NOTE = tk("If you take a GLP-1 medicine, follow the advice of your doctor or pharmacist. {app} doesn't give medical advice.");
/** True for a typed target that is a number but below MIN_SUGGESTED_CALORIES. */
export const isLowCalories = (value: string | number): boolean => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < MIN_SUGGESTED_CALORIES;
};

export interface SuggestionInput {
  sex: Sex;
  age: number;
  weightLb: number;
  heightFt: number;
  heightIn: number;
  activity: Activity;
  goal: Goal;
}

export type Suggestion = { kind: "ok"; calories: number; protein: number } | { kind: "under18" } | { kind: "invalid" };

function roundTo(x: number, increment: number): number {
  return Math.floor(x / increment + 0.5) * increment; // half away from zero (x is positive here)
}

export function suggestTargets(input: SuggestionInput): Suggestion {
  const { sex, age, weightLb, heightFt, heightIn, activity, goal } = input;
  if (Number.isFinite(age) && age < 18) return { kind: "under18" };
  const valid =
    Number.isFinite(age) && age >= 18 && age <= 100 &&
    Number.isFinite(weightLb) && weightLb > 0 &&
    Number.isFinite(heightFt) && heightFt >= 0 && Number.isFinite(heightIn) && heightIn >= 0 &&
    heightFt * 12 + heightIn > 0;
  if (!valid) return { kind: "invalid" };

  const kg = weightLb * 0.45359237;
  const cm = (heightFt * 12 + heightIn) * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + SEX_OFFSET[sex];
  const tdee = bmr * ACTIVITY_FACTOR[activity];
  const calories = Math.max(MIN_SUGGESTED_CALORIES, roundTo(tdee + CALORIE_ADJUSTMENT[goal], 10));
  const protein = roundTo(kg * PROTEIN_PER_KG[goal], 5);
  return { kind: "ok", calories, protein };
}

// Carbs and fat get targets too (founder 2026-10-15, for Home's "CARBS 98g / 305g" rows, like their reference picture): worked out from
// the calorie and protein targets as suggested starting points, and changeable in Settings. About 30% of the day's calories from fat
// (9 kcal a gram) and the rest from carbs (4 kcal a gram) after protein (4 kcal a gram; 20% of calories when no protein target is set),
// rounded to 5 g. They are targets the person can change, never figures about a food.
export const FAT_SHARE = 0.3;
const PROTEIN_SHARE_WITHOUT_TARGET = 0.2;
export const CARB_FAT_NOTE = tk("Carbs and fat are worked out from your calories and protein: about 30% of calories from fat and the rest from carbs. Type your own to change them.");
export const MAX_MACRO_TARGET = 2000;

export function suggestCarbFat(dailyCalories: number, dailyProtein?: number): { carbs: number; fat: number } {
  const calories = Number.isFinite(dailyCalories) && dailyCalories > 0 ? dailyCalories : 0;
  const fat = roundTo((calories * FAT_SHARE) / 9, 5);
  const proteinKcal = dailyProtein !== undefined && Number.isFinite(dailyProtein) && dailyProtein > 0 ? dailyProtein * 4 : calories * PROTEIN_SHARE_WITHOUT_TARGET;
  const carbs = Math.max(0, roundTo((calories - fat * 9 - proteinKcal) / 4, 5));
  return { carbs, fat };
}

/** The day's targets for each macro: protein as set (none if unset), carbs and fat as typed in Settings or else worked out. */
export function macroTargets(s: { dailyCalories: number; dailyProtein?: number; dailyCarbs?: number; dailyFat?: number }): { protein?: number; carbs: number; fat: number } {
  const suggested = suggestCarbFat(s.dailyCalories, s.dailyProtein);
  return {
    ...(s.dailyProtein !== undefined ? { protein: s.dailyProtein } : {}),
    carbs: s.dailyCarbs ?? suggested.carbs,
    fat: s.dailyFat ?? suggested.fat,
  };
}
