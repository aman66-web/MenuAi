import { describe, expect, it } from "vitest";
import { macroTargets, suggestCarbFat, suggestTargets, type SuggestionInput } from "../lib/mm/targets";

const base: SuggestionInput = { sex: "male", age: 30, weightLb: 180, heightFt: 5, heightIn: 10, activity: "active", goal: "lose" };

describe("TargetSuggester (SPEC §6.2 test vectors)", () => {
  it("Male 30, 180 lb, 5'10\", active, lose → 2,260 kcal, 115 g", () => {
    expect(suggestTargets(base)).toEqual({ kind: "ok", calories: 2260, protein: 115 });
  });
  it("Female 42, 150 lb, 5'4\", lightly active, GLP-1 → 1,320 kcal, 95 g", () => {
    expect(suggestTargets({ sex: "female", age: 42, weightLb: 150, heightFt: 5, heightIn: 4, activity: "light", goal: "glp1" })).toEqual({
      kind: "ok",
      calories: 1320,
      protein: 95,
    });
  });
  it("Prefer not to say, 25, 200 lb, 6'1\", very active, build muscle → 3,460 kcal, 145 g", () => {
    expect(suggestTargets({ sex: "unspecified", age: 25, weightLb: 200, heightFt: 6, heightIn: 1, activity: "veryActive", goal: "buildMuscle" })).toEqual({
      kind: "ok",
      calories: 3460,
      protein: 145,
    });
  });
  it("Female 70, 110 lb, 5'0\", mostly sitting, lose → 1,200 kcal (floor), 70 g", () => {
    expect(suggestTargets({ sex: "female", age: 70, weightLb: 110, heightFt: 5, heightIn: 0, activity: "sedentary", goal: "lose" })).toEqual({
      kind: "ok",
      calories: 1200,
      protein: 70,
    });
  });
  it("age under 18 gets no suggestion", () => {
    expect(suggestTargets({ ...base, age: 17 })).toEqual({ kind: "under18" });
  });
  it("rejects nonsense input", () => {
    expect(suggestTargets({ ...base, age: 101 })).toEqual({ kind: "invalid" });
    expect(suggestTargets({ ...base, weightLb: 0 })).toEqual({ kind: "invalid" });
    expect(suggestTargets({ ...base, age: Number.NaN })).toEqual({ kind: "invalid" });
    expect(suggestTargets({ ...base, heightFt: 0, heightIn: 0 })).toEqual({ kind: "invalid" });
  });
});

describe("the Other goal", () => {
  it("suggests the same targets as Maintain", () => {
    expect(suggestTargets({ ...base, goal: "other" })).toEqual(suggestTargets({ ...base, goal: "maintain" }));
  });
});

describe("carb and fat targets (founder 2026-10-15: worked out, changeable in Settings)", () => {
  it("about 30% of calories from fat, the rest from carbs after protein, rounded to 5 g", () => {
    // 2,800 kcal, 180 g protein: fat 2,800 × 0.3 / 9 = 93.3 → 95 g; carbs (2,800 − 855 − 720) / 4 = 306.25 → 305 g
    expect(suggestCarbFat(2800, 180)).toEqual({ carbs: 305, fat: 95 });
    // 2,000 kcal, 120 g protein: fat 66.7 → 65 g; carbs (2,000 − 585 − 480) / 4 = 233.75 → 235 g
    expect(suggestCarbFat(2000, 120)).toEqual({ carbs: 235, fat: 65 });
  });
  it("with no protein target, protein is taken as 20% of calories", () => {
    // 2,000 kcal: fat 65 g; carbs (2,000 − 585 − 400) / 4 = 253.75 → 255 g
    expect(suggestCarbFat(2000)).toEqual({ carbs: 255, fat: 65 });
  });
  it("never goes below zero and copes with nonsense", () => {
    expect(suggestCarbFat(1200, 400).carbs).toBe(0);
    expect(suggestCarbFat(Number.NaN)).toEqual({ carbs: 0, fat: 0 });
  });
  it("targets typed in Settings win; otherwise they follow calories and protein", () => {
    expect(macroTargets({ dailyCalories: 2800, dailyProtein: 180 })).toEqual({ protein: 180, carbs: 305, fat: 95 });
    expect(macroTargets({ dailyCalories: 2800, dailyProtein: 180, dailyCarbs: 300, dailyFat: 70 })).toEqual({ protein: 180, carbs: 300, fat: 70 });
    expect(macroTargets({ dailyCalories: 2000 })).toEqual({ carbs: 255, fat: 65 });
  });
});
