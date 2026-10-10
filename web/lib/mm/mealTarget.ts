import { mealSizes, moreProteinGrams, type MealTarget } from "./recipes";
import type { RecipeMeal, UserSettings } from "./user-data";

// What Recipes fits each recipe to, from the person's settings (the Recipes screen's simple choices). Pure.

type TargetSettings = Pick<UserSettings, "dailyCalories" | "goal" | "glp1MealCap" | "recipeMeal">;

/** Before the person has chosen: a normal meal, with more protein for "build muscle" and GLP-1 ("smaller, protein-first"). */
export function currentRecipeMeal(s: Pick<UserSettings, "goal" | "recipeMeal">): RecipeMeal {
  return s.recipeMeal ?? { size: "normal", moreProtein: s.goal === "buildMuscle" || s.goal === "glp1" };
}

/** The target per serving, or null for "show recipes as written". GLP-1: a meal size is never above the comfortable meal size they set. */
export function mealTargetFor(s: TargetSettings): MealTarget | null {
  const m = currentRecipeMeal(s);
  if (m.size === "written") return null;
  if (m.size === "custom" && m.kcal) {
    const protein = m.protein ?? (m.moreProtein ? moreProteinGrams(m.kcal) : undefined);
    return { kcal: m.kcal, ...(protein ? { protein } : {}), ...(m.carbsMax ? { carbsMax: m.carbsMax } : {}), ...(m.fatMax ? { fatMax: m.fatMax } : {}) };
  }
  const sizes = mealSizes(s.dailyCalories);
  const preset = m.size === "custom" ? "normal" : m.size;
  const kcal = s.goal === "glp1" ? Math.min(sizes[preset], s.glp1MealCap) : sizes[preset];
  return { kcal, ...(m.moreProtein ? { protein: moreProteinGrams(kcal) } : {}) };
}
