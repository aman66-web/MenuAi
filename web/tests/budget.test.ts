import { describe, expect, it } from "vitest";
import { loggedToday, mealBudget, mealSlotFor, remainingToday } from "../lib/mm/budget";
import type { Nutrients, Profile } from "../lib/mm/types";

const at = (h: number, m: number) => new Date(2026, 9, 5, h, m);
const n = (calories: number, protein = 0): Nutrients => ({ calories, protein, carbs: 0, fat: 0 });

describe("meal slots (SPEC §6.3)", () => {
  it("breakfast before 10:30, lunch 10:30–15:59, dinner from 16:00", () => {
    expect(mealSlotFor(at(6, 0))).toBe("breakfast");
    expect(mealSlotFor(at(10, 29))).toBe("breakfast");
    expect(mealSlotFor(at(10, 30))).toBe("lunch");
    expect(mealSlotFor(at(15, 59))).toBe("lunch");
    expect(mealSlotFor(at(16, 0))).toBe("dinner");
    expect(mealSlotFor(at(23, 59))).toBe("dinner");
  });
});

describe("meal budget", () => {
  const muscle: Profile = { goal: "buildMuscle", dailyCalories: 2400 };
  it("is min(remaining, daily × share)", () => {
    expect(mealBudget(muscle, 1350, "lunch")).toEqual({ remaining: 1050, budget: 840 });
    expect(mealBudget(muscle, 0, "breakfast")).toEqual({ remaining: 2400, budget: 600 });
    expect(mealBudget(muscle, 0, "dinner")).toEqual({ remaining: 2400, budget: 960 });
  });
  it("caps at what is left when remaining is smaller than the share", () => {
    expect(mealBudget(muscle, 2200, "dinner")).toEqual({ remaining: 200, budget: 200 });
  });
  it("uses the comfortable meal size for GLP-1 (default 450), still capped by remaining", () => {
    const glp1: Profile = { goal: "glp1", dailyCalories: 1500, glp1MealCap: 450 };
    expect(mealBudget(glp1, 300, "lunch")).toEqual({ remaining: 1200, budget: 450 });
    expect(mealBudget({ goal: "glp1", dailyCalories: 1500 }, 0, "dinner").budget).toBe(450);
    expect(mealBudget(glp1, 1200, "dinner")).toEqual({ remaining: 300, budget: 300 });
  });
  it("lets remaining go negative", () => {
    expect(mealBudget(muscle, 2500, "dinner").remaining).toBe(-100);
  });
});

describe("left today", () => {
  it("sums only entries logged on the current local day (23:59 and 00:01 are different days)", () => {
    const entries = [
      { loggedAt: new Date(2026, 9, 4, 23, 59).toISOString(), nutrients: n(500, 30) },
      { loggedAt: new Date(2026, 9, 5, 0, 1).toISOString(), nutrients: n(300, 20) },
      { loggedAt: new Date(2026, 9, 5, 12, 0).toISOString(), nutrients: n(400, 25) },
    ];
    expect(loggedToday(entries, at(13, 0))).toEqual({ calories: 700, protein: 45, carbs: 0, fat: 0 });
    expect(loggedToday(entries, new Date(2026, 9, 4, 23, 59, 30)).calories).toBe(500);
  });
  it("computes remaining calories and (when set) protein", () => {
    const logged = { calories: 950, protein: 28, carbs: 0, fat: 0 };
    expect(remainingToday({ goal: "maintain", dailyCalories: 2000, dailyProtein: 120 }, logged)).toEqual({ calories: 1050, protein: 92 });
    expect(remainingToday({ goal: "maintain", dailyCalories: 2000 }, logged)).toEqual({ calories: 1050 });
  });
});
