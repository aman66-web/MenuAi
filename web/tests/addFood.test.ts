import { describe, expect, it } from "vitest";
import {
  amountNutrients, MAX_AMOUNT, MAX_NAME_LENGTH, MAX_SERVINGS, MAX_TYPED_GRAMS, MAX_TYPED_KCAL, MIN_SERVINGS, parseAmount, parseNumber, recipeNutrients, stepServings, typedEntry,
} from "../lib/mm/addFood";
import { entryMeal, loggedGaps, loggedToday } from "../lib/mm/budget";
import { sanitizeLog } from "../lib/mm/user-data";

// The Add food sheet's rules: typed numbers are the person's own (an empty box is no figure, never 0), a product is its label x the amount over 100,
// a recipe is its per-serving figures x the servings, and an entry added from a meal's + stays in that meal.

describe("parseNumber", () => {
  it("reads whole and part numbers, with a point or a comma", () => {
    expect(parseNumber("250")).toBe(250);
    expect(parseNumber(" 12.5 ")).toBe(12.5);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("7.")).toBe(7);
    expect(parseNumber("0,125")).toBe(0.125);
    expect(parseNumber("1,23")).toBe(1.23);
  });
  it("reads a comma that groups thousands as the UK writes it", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("2,500")).toBe(2500);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("12,345,678")).toBe(12345678);
  });
  it("reads digits typed in another numeral system", () => {
    expect(parseNumber("٢٥٠")).toBe(250); // Arabic-Indic
    expect(parseNumber("১২")).toBe(12); // Bengali
    expect(parseNumber("٣٫٥")).toBe(3.5); // Arabic decimal separator
  });
  it("calls an empty box null and anything else bad", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    for (const bad of ["abc", "12abc", "-5", "1.2.3", "1,2,3", "1e3", "∞", "NaN", "+4"]) expect(parseNumber(bad), bad).toBe("bad");
  });
});

describe("typedEntry", () => {
  const input = { name: "", calories: "", protein: "", carbs: "", fat: "" };
  it("needs the calories", () => {
    expect(typedEntry(input, "Mine")).toEqual({ ok: false, field: "calories", problem: "missing" });
    expect(typedEntry({ ...input, protein: "20" }, "Mine")).toEqual({ ok: false, field: "calories", problem: "missing" });
  });
  it("leaves out the numbers that were left empty (never 0)", () => {
    const r = typedEntry({ ...input, calories: "250" }, "Mine");
    expect(r).toEqual({ ok: true, name: "Mine", nutrients: { calories: 250 } });
    expect(r.ok && "protein" in r.nutrients).toBe(false);
  });
  it("keeps what was typed, calories whole and grams to one place", () => {
    const r = typedEntry({ name: "  Toast   and jam ", calories: "249.6", protein: "7,25", carbs: "40", fat: "0" }, "Mine");
    expect(r).toEqual({ ok: true, name: "Toast and jam", nutrients: { calories: 250, protein: 7.3, carbs: 40, fat: 0 } });
  });
  it("accepts 0 calories (black coffee) and 0 grams", () => {
    expect(typedEntry({ ...input, calories: "0", protein: "0" }, "Mine")).toEqual({ ok: true, name: "Mine", nutrients: { calories: 0, protein: 0 } });
  });
  it("names the box that is wrong", () => {
    expect(typedEntry({ ...input, calories: "lots" }, "Mine")).toEqual({ ok: false, field: "calories", problem: "bad" });
    expect(typedEntry({ ...input, calories: "100", fat: "a bit" }, "Mine")).toEqual({ ok: false, field: "fat", problem: "bad" });
    expect(typedEntry({ ...input, calories: String(MAX_TYPED_KCAL + 1) }, "Mine")).toEqual({ ok: false, field: "calories", problem: "toobig" });
    expect(typedEntry({ ...input, calories: String(MAX_TYPED_KCAL) }, "Mine").ok).toBe(true);
    expect(typedEntry({ ...input, calories: "100", carbs: String(MAX_TYPED_GRAMS + 1) }, "Mine")).toEqual({ ok: false, field: "carbs", problem: "toobig" });
    expect(typedEntry({ ...input, calories: "100", protein: String(MAX_TYPED_GRAMS) }, "Mine").ok).toBe(true);
  });
  it("keeps a name to a sensible length", () => {
    const r = typedEntry({ ...input, name: "x".repeat(200), calories: "1" }, "Mine");
    expect(r.ok && r.name.length).toBe(MAX_NAME_LENGTH);
  });
});

describe("amountNutrients (a label per 100 g or ml, scaled)", () => {
  const beans = { kcal: 78, protein: 4.7, carbs: 11.4, fat: 0.5 };
  it("is the label x amount / 100", () => {
    expect(amountNutrients(beans, 100)).toEqual({ calories: 78, protein: 4.7, carbs: 11.4, fat: 0.5 });
    expect(amountNutrients(beans, 200)).toEqual({ calories: 156, protein: 9.4, carbs: 22.8, fat: 1 });
    expect(amountNutrients(beans, 50)).toEqual({ calories: 39, protein: 2.4, carbs: 5.7, fat: 0.3 });
  });
  it("carries the rest of the label only where it is printed", () => {
    expect(amountNutrients(beans, 100)).not.toHaveProperty("salt");
    expect(amountNutrients({ ...beans, saturates: 0.1, sugars: 4.9, fibre: 3.7, salt: 0.55, kj: 330 }, 250)).toEqual({
      calories: 195, protein: 11.8, carbs: 28.5, fat: 1.3, saturatedFat: 0.3, sugar: 12.3, fiber: 9.3, salt: 1.38, energyKj: 825,
    });
  });
});

describe("parseAmount", () => {
  it("accepts 1 to the maximum, with part amounts", () => {
    expect(parseAmount("250")).toBe(250);
    expect(parseAmount("37,5")).toBe(37.5);
    expect(parseAmount(String(MAX_AMOUNT))).toBe(MAX_AMOUNT);
  });
  it("refuses empty, zero, too much and words", () => {
    for (const bad of ["", "0", "0.5", String(MAX_AMOUNT + 1), "lots", "-3"]) expect(parseAmount(bad), bad).toBeNull();
  });
});

describe("servings", () => {
  it("steps by half a serving between half and six", () => {
    expect(stepServings(1, 1)).toBe(1.5);
    expect(stepServings(1, -1)).toBe(MIN_SERVINGS);
    expect(stepServings(MIN_SERVINGS, -1)).toBe(MIN_SERVINGS);
    expect(stepServings(MAX_SERVINGS, 1)).toBe(MAX_SERVINGS);
    expect(stepServings(5.5, 1)).toBe(6);
  });
  const totals = {
    perServing: { kcal: 512, protein: 31.4, carbs: 60.2, fat: 14.9 },
    label: { kj: 2140, saturates: 4.2, sugars: null, fibre: 6.1, salt: 1.2 },
  };
  it("multiplies the recipe's per-serving figures", () => {
    expect(recipeNutrients(totals, 1)).toEqual({ calories: 512, protein: 31.4, carbs: 60.2, fat: 14.9, saturatedFat: 4.2, fiber: 6.1, salt: 1.2, energyKj: 2140 });
    expect(recipeNutrients(totals, 2)).toEqual({ calories: 1024, protein: 62.8, carbs: 120.4, fat: 29.8, saturatedFat: 8.4, fiber: 12.2, salt: 2.4, energyKj: 4280 });
  });
  it("leaves out a figure some label doesn't print (sugars here), never filling it in", () => {
    expect(recipeNutrients(totals, 1.5)).not.toHaveProperty("sugar");
  });
});

describe("the meal an entry sits under", () => {
  const entry = (hour: number, meal?: "breakfast" | "lunch" | "dinner") => ({ loggedAt: new Date(2026, 9, 15, hour, 0).toISOString(), ...(meal ? { meal } : {}) });
  it("is the row it was added to, else the meal its time falls in", () => {
    expect(entryMeal(entry(8))).toBe("breakfast");
    expect(entryMeal(entry(13))).toBe("lunch");
    expect(entryMeal(entry(19))).toBe("dinner");
    expect(entryMeal(entry(19, "breakfast"))).toBe("breakfast");
    expect(entryMeal(entry(8, "dinner"))).toBe("dinner");
  });
});

describe("a logged entry without protein, carbs or fat", () => {
  const base = { id: "a", loggedAt: new Date(2026, 9, 15, 9, 0).toISOString(), chainId: "", chainName: "", name: "Toast", source: "custom" };
  it("is kept by the sanitiser, and counts only what it has", () => {
    const list = sanitizeLog([{ ...base, nutrients: { calories: 200 } }, { ...base, id: "b", nutrients: { calories: 100, protein: 5, carbs: 10, fat: 2 } }]);
    expect(list).toHaveLength(2);
    expect(loggedToday(list, new Date(2026, 9, 15, 12, 0))).toEqual({ calories: 300, protein: 5, carbs: 10, fat: 2 });
  });
  it("is counted in loggedGaps (today's entries only), never as 0 grams", () => {
    const today = new Date(2026, 9, 15, 12, 0);
    const list = sanitizeLog([
      { ...base, nutrients: { calories: 200 } },
      { ...base, id: "b", nutrients: { calories: 100, protein: 5 } },
      { ...base, id: "c", nutrients: { calories: 50, protein: 0, carbs: 0, fat: 0 } }, // typed zeros are figures
      { ...base, id: "d", loggedAt: new Date(2026, 9, 14, 12, 0).toISOString(), nutrients: { calories: 9 } }, // yesterday
    ]);
    expect(loggedGaps(list, today)).toEqual({ protein: 1, carbs: 2, fat: 2, any: true });
    expect(loggedGaps([], today)).toEqual({ protein: 0, carbs: 0, fat: 0, any: false });
    expect(loggedGaps(sanitizeLog([{ ...base, nutrients: { calories: 1, protein: 1, carbs: 1, fat: 1 } }]), today).any).toBe(false);
  });
  it("still refuses calories that are not a number, or a protein that is not", () => {
    expect(sanitizeLog([{ ...base, nutrients: { calories: "200" } }])).toEqual([]);
    expect(sanitizeLog([{ ...base, nutrients: { calories: 200, protein: "x" } }])).toEqual([]);
    expect(sanitizeLog([{ ...base, nutrients: { calories: Infinity } }])).toEqual([]);
    expect(sanitizeLog([{ ...base, nutrients: {} }])).toEqual([]);
  });
  it("keeps a known meal and drops one it doesn't know", () => {
    const [kept, dropped] = sanitizeLog([{ ...base, meal: "lunch", nutrients: { calories: 1 } }, { ...base, id: "c", meal: "supper", nutrients: { calories: 1 } }]);
    expect(kept?.meal).toBe("lunch");
    expect(dropped).toBeDefined();
    expect(dropped && "meal" in dropped).toBe(false);
  });
});
