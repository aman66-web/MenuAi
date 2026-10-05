import { describe, expect, it } from "vitest";
import { formatCalories, formatDate, formatDensity, formatGrams, formatOptionalGrams, formatSalt, formatSodium, lowerFirst, macroLine, nutrientAriaLabel, reasonLine } from "../lib/mm/format";
import { addNutrients, halfUp, proteinPer100Cal, scaleNutrients, sumNutrients } from "../lib/mm/nutrients";
import type { Nutrients } from "../lib/mm/types";

const full: Nutrients = { calories: 100, protein: 10, carbs: 5, fat: 2.5, saturatedFat: 1, sodium: 200, sugar: 2, fiber: 1 };
const noSugar: Nutrients = { calories: 50, protein: 5, carbs: 5, fat: 1, saturatedFat: 0.5, sodium: 100, fiber: 2 };

describe("rounding and formatting (SPEC §6.1)", () => {
  it("rounds half away from zero, not half to even", () => {
    expect(halfUp(20.5)).toBe(21);
    expect(halfUp(0.5)).toBe(1);
    expect(halfUp(1.5)).toBe(2);
    expect(halfUp(2.5)).toBe(3);
    expect(halfUp(-0.5)).toBe(-1);
    expect(halfUp(9.55, 1)).toBeCloseTo(9.6, 5);
  });
  it("shows Bowl & Co. chicken bowl fat 20.5 as 21g", () => {
    expect(formatGrams(20.5)).toBe("21g");
  });
  it("groups calories with a thousands separator regardless of locale", () => {
    expect(formatCalories(1050)).toBe("1,050 cal");
    expect(formatCalories(655)).toBe("655 cal");
  });
  it("formats density with one decimal", () => {
    expect(formatDensity({ calories: 610, protein: 58 })).toBe("9.5g per 100 cal");
    expect(formatDensity({ calories: 0, protein: 0 })).toBe("0.0g per 100 cal");
  });
  it("shows missing optionals as 'not published'", () => {
    expect(formatOptionalGrams(undefined)).toBe("not published");
    expect(formatSodium(undefined)).toBe("not published");
    expect(formatOptionalGrams(0)).toBe("0g");
    expect(formatSodium(1610)).toBe("1,610mg");
  });
  it("formats salt in grams with up to 2 decimals (UK guides) and never converts it from sodium", () => {
    expect(formatSalt(undefined)).toBe("not published");
    expect(formatSalt(0.9)).toBe("0.9g");
    expect(formatSalt(1.25)).toBe("1.25g");
    expect(formatSalt(0.05)).toBe("0.05g");
    expect(formatSalt(2)).toBe("2g");
    expect(formatSalt(0)).toBe("0g");
    expect(formatSalt(0.125)).toBe("0.13g"); // half away from zero, like the pipeline (0.125 is exact in binary)
  });
  it("builds the macro, reason and VoiceOver strings with the same rounding", () => {
    const n: Nutrients = { calories: 655, protein: 50, carbs: 67, fat: 20.5 };
    expect(macroLine(n)).toBe("655 cal · 50g protein · 67g carbs · 21g fat");
    expect(nutrientAriaLabel("Chicken bowl", n)).toBe("Chicken bowl, 655 calories, 50 grams protein, 67 grams carbs, 21 grams fat");
    expect(reasonLine({ calories: 610, protein: 58, carbs: 0, fat: 0 })).toBe("58g protein · 610 cal · 9.5g per 100 cal");
    expect(reasonLine({ calories: 1050, protein: 100, carbs: 0, fat: 0 })).toBe("100g protein · 1,050 cal · 9.5g per 100 cal");
  });
  it("formats dates in a fixed d MMM yyyy style", () => {
    expect(formatDate("2026-10-01")).toBe("1 Oct 2026");
    expect(formatDate("2026-12-25")).toBe("25 Dec 2026");
    expect(formatDate("nonsense")).toBe("nonsense");
  });
  it("lower-cases the first letter unless the second is upper-case", () => {
    expect(lowerFirst("No mayo")).toBe("no mayo");
    expect(lowerFirst("No BBQ sauce")).toBe("no BBQ sauce");
    expect(lowerFirst("BBQ sauce")).toBe("BBQ sauce");
    expect(lowerFirst("Chicken")).toBe("chicken");
    expect(lowerFirst("A")).toBe("a");
  });
});

describe("nutrient maths (docs/DATA.md)", () => {
  it("adds and scales", () => {
    expect(addNutrients(full, full)).toEqual({ calories: 200, protein: 20, carbs: 10, fat: 5, saturatedFat: 2, sodium: 400, sugar: 4, fiber: 2 });
    expect(scaleNutrients(full, 2).calories).toBe(200);
  });
  it("drops an optional nutrient from the total unless EVERY part publishes it", () => {
    const total = addNutrients(full, noSugar);
    expect(total.sugar).toBeUndefined();
    expect("sugar" in total).toBe(false);
    expect(total.fiber).toBe(3);
    expect(total.calories).toBe(150);
  });
  it("never goes below zero when subtracting", () => {
    const tiny: Nutrients = { calories: 10, protein: 1, carbs: 1, fat: 1 };
    const result = sumNutrients([[tiny, 1], [full, -1]]);
    expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it("rounds stored values like the pipeline (calories and sodium to integers, others to 1 decimal)", () => {
    const n: Nutrients = { calories: 1, protein: 0.25, carbs: 0.25, fat: 0.25 };
    const total = sumNutrients([[n, 3]]);
    expect(total.protein).toBe(0.8); // 0.75 → 0.8 (half up)
    expect(total.calories).toBe(3);
  });
  it("keeps salt to 2 decimals so small values are not rounded away, and propagates 'not published'", () => {
    const a: Nutrients = { calories: 10, protein: 1, carbs: 1, fat: 1, salt: 0.05 };
    const b: Nutrients = { calories: 10, protein: 1, carbs: 1, fat: 1, salt: 0.12 };
    expect(sumNutrients([[a, 1], [b, 1]]).salt).toBe(0.17);
    expect(sumNutrients([[a, 3]]).salt).toBe(0.15);
    expect(sumNutrients([[b, -1], [a, 1]]).salt).toBe(0); // never below zero
    const noSalt: Nutrients = { calories: 10, protein: 1, carbs: 1, fat: 1 };
    const total = sumNutrients([[a, 1], [noSalt, 1]]);
    expect("salt" in total).toBe(false);
    // salt and sodium are independent: one published does not create the other
    expect("sodium" in sumNutrients([[a, 1], [b, 1]])).toBe(false);
  });
  it("computes protein per 100 calories", () => {
    expect(proteinPer100Cal({ calories: 400, protein: 40 })).toBe(10);
    expect(proteinPer100Cal({ calories: 0, protein: 5 })).toBe(0);
  });
});
