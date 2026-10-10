import type { Goal } from "./types";

// SPEC §6.2: Mifflin-St Jeor suggestion. Always shown with "Suggested starting points, not medical advice."

export type Sex = "male" | "female" | "unspecified";
export type Activity = "sedentary" | "light" | "active" | "veryActive";

export const ACTIVITY_FACTOR: Record<Activity, number> = { sedentary: 1.2, light: 1.375, active: 1.55, veryActive: 1.725 };
export const ACTIVITY_LABEL: Record<Activity, string> = {
  sedentary: "Mostly sitting",
  light: "Lightly active",
  active: "Active",
  veryActive: "Very active",
};
const SEX_OFFSET: Record<Sex, number> = { male: 5, female: -161, unspecified: -78 };
const CALORIE_ADJUSTMENT: Record<Goal, number> = { lose: -500, maintain: 0, buildMuscle: 250, glp1: -500, other: 0 };
const PROTEIN_PER_KG: Record<Goal, number> = { lose: 1.4, maintain: 1.2, buildMuscle: 1.6, glp1: 1.4, other: 1.2 }; // "other" = maintain

export const MIN_SUGGESTED_CALORIES = 1200;
export const UNDER_18_COPY = "Ask a doctor or dietitian for targets.";
export const SUGGESTION_NOTE = "Suggested starting points, not medical advice. Adjust any time.";

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
