import { describe, expect, it } from "vitest";
import { EXAMPLE_DAYS, exampleWeek } from "../lib/mm/exampleWeek";
import { RECIPES } from "../lib/mm/recipeBook";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { recipeForDiet } from "../lib/mm/recipes";

const byId = new Map(RECIPES.map((r) => [r.id, r]));

describe("Your plan's example week (never worked out: founder 2026-11-20)", () => {
  it("is seven days of breakfast, lunch and dinner, each one of our recipes with a picture, and the days differ", () => {
    const week = exampleWeek({});
    expect(week).toHaveLength(EXAMPLE_DAYS);
    for (const day of week) {
      expect(day.meals.map((m) => m.meal)).toEqual(["breakfast", "lunch", "dinner"]);
      for (const m of day.meals) {
        expect(RECIPE_IMAGES[m.recipeId], m.recipeId).toBeTruthy();
        expect(byId.get(m.recipeId)!.meal).toBe(m.meal);
      }
    }
    for (const meal of ["breakfast", "lunch", "dinner"] as const) {
      const ids = week.map((d) => d.meals.find((m) => m.meal === meal)!.recipeId);
      expect(new Set(ids).size, meal).toBeGreaterThanOrEqual(5);
    }
  });

  it("only shows recipes that suit the diet and allergies as written", () => {
    for (const diet of [{ veganOnly: true }, { vegetarianOnly: true }, { pescatarianOnly: true }, { avoidAllergens: ["milk", "gluten"] as const }, { noPork: true, avoidAllergens: ["eggs"] as const }]) {
      for (const day of exampleWeek(diet)) {
        for (const m of day.meals) expect(recipeForDiet(byId.get(m.recipeId)!, diet), `${JSON.stringify(diet)} ${m.recipeId}`).not.toBeNull();
      }
    }
  });

  it("is the same week every time for the same diet (nothing random, nothing from the person's numbers)", () => {
    expect(exampleWeek({ veganOnly: true })).toEqual(exampleWeek({ veganOnly: true }));
  });
});
