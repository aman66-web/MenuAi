import { tk } from "./i18n";
import { halfUp } from "./nutrients";
import { toAsciiDigits } from "./numbers";
import type { Meal, Nutrients } from "./types";

// The "Add food" sheet on Home's meal rows (founder 2026-10-15, on the + beside Breakfast: "a kind of menu vibe sheet should launch where you can
// either type in macros, choose a recipe perhaps, choose a meal from a restaurant or whatever"). Pure rules for what it adds. Nothing here
// invents a number: typed numbers are the person's own, a recipe's are the recipe page's own per-serving figures, a supermarket product's
// are its label scaled by the weight the person says they had (plain arithmetic, like the recipes), a restaurant dish's are the restaurant's.

/** The sheet's title and its button, and the line shown after: one whole sentence per meal so a translation can inflect the meal's name. */
export const ADD_TO: Record<Meal, string> = { breakfast: tk("Add to Breakfast"), lunch: tk("Add to Lunch"), dinner: tk("Add to Dinner") };
export const ADDED_TO: Record<Meal, string> = {
  breakfast: tk("Added “{name}” to Breakfast."),
  lunch: tk("Added “{name}” to Lunch."),
  dinner: tk("Added “{name}” to Dinner."),
};

/** The most calories one typed entry can hold, and the most grams of protein, carbs or fat: a slip of the finger (an extra zero) is caught, a big day isn't. */
export const MAX_TYPED_KCAL = 5000;
export const MAX_TYPED_GRAMS = 1000;
/** The longest name kept for an entry. */
export const MAX_NAME_LENGTH = 60;

/**
 * One typed box. Empty = null (not entered), a number written with a point or a comma = that number, anything else = "bad". Digits typed in
 * another numeral system count (an Arabic or Urdu keyboard). A comma is a thousands separator when it groups three digits after a first group
 * that doesn't start with 0 ("1,234" is 1234, as written in the UK); otherwise it is the decimal point ("12,5" is 12.5, "0,125" is 0.125).
 */
export function parseNumber(raw: string): number | null | "bad" {
  let s = toAsciiDigits(raw).replace(/[\s\u00a0]/g, "").replace(/\u066b/g, ".");
  if (s === "") return null;
  s = /^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, "") : s.replace(/,/g, ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return "bad";
  const n = Number(s);
  return Number.isFinite(n) ? n : "bad";
}

export type TypedField = "calories" | "protein" | "carbs" | "fat";
export interface TypedInput { name: string; calories: string; protein: string; carbs: string; fat: string }
export type TypedResult =
  | { ok: true; name: string; nutrients: Nutrients }
  | { ok: false; field: TypedField; problem: "missing" | "bad" | "toobig" };

/**
 * The numbers a person typed as one entry. Calories are needed (0 is fine: black coffee); protein, carbs and fat may be left empty, and then the
 * entry simply has no figure for them (never 0). `fallbackName` is used when no name was typed.
 */
export function typedEntry(input: TypedInput, fallbackName: string): TypedResult {
  const kcal = parseNumber(input.calories);
  if (kcal === null) return { ok: false, field: "calories", problem: "missing" };
  if (kcal === "bad" || kcal < 0) return { ok: false, field: "calories", problem: "bad" };
  if (kcal > MAX_TYPED_KCAL) return { ok: false, field: "calories", problem: "toobig" };
  const nutrients: Nutrients = { calories: halfUp(kcal) };
  for (const field of ["protein", "carbs", "fat"] as const) {
    const v = parseNumber(input[field]);
    if (v === null) continue;
    if (v === "bad") return { ok: false, field, problem: "bad" };
    if (v > MAX_TYPED_GRAMS) return { ok: false, field, problem: "toobig" };
    nutrients[field] = halfUp(v, 1);
  }
  return { ok: true, name: input.name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH) || fallbackName, nutrients };
}

// ---- a supermarket product, by weight

/** The shortest and longest amount (grams or millilitres) that can be added. */
export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 5000;

/** A label's figures per 100 g or 100 ml (a ListedProduct has these). */
export interface PerHundred {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  saturates?: number;
  sugars?: number;
  fibre?: number;
  salt?: number;
  kj?: number;
}

/** What the person had, from a label's per-100 figures: figure x amount / 100 (a figure the label doesn't print stays absent). Calories whole, grams to 1 place, salt to 2. */
export function amountNutrients(p: PerHundred, amount: number): Nutrients {
  const f = amount / 100;
  const n: Nutrients = {
    calories: halfUp(p.kcal * f),
    protein: halfUp(p.protein * f, 1),
    carbs: halfUp(p.carbs * f, 1),
    fat: halfUp(p.fat * f, 1),
  };
  if (p.saturates !== undefined) n.saturatedFat = halfUp(p.saturates * f, 1);
  if (p.sugars !== undefined) n.sugar = halfUp(p.sugars * f, 1);
  if (p.fibre !== undefined) n.fiber = halfUp(p.fibre * f, 1);
  if (p.salt !== undefined) n.salt = halfUp(p.salt * f, 2);
  if (p.kj !== undefined) n.energyKj = halfUp(p.kj * f);
  return n;
}

/** The amount typed for a product: a whole or part number of grams or millilitres between MIN_AMOUNT and MAX_AMOUNT, else null. */
export function parseAmount(raw: string): number | null {
  const v = parseNumber(raw);
  return typeof v === "number" && v >= MIN_AMOUNT && v <= MAX_AMOUNT ? v : null;
}

// ---- a recipe, by servings

export const MIN_SERVINGS = 0.5;
export const MAX_SERVINGS = 6;
export const SERVINGS_STEP = 0.5;

/** One step up (+1) or down (-1) in the servings eaten, kept between half a serving and six. */
export function stepServings(current: number, direction: 1 | -1): number {
  const next = Math.round((current + direction * SERVINGS_STEP) / SERVINGS_STEP) * SERVINGS_STEP;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, next));
}

/** The recipe page's per-serving figures (RecipeTotals) for the servings eaten; the rest of the label only where every product printed it. */
export function recipeNutrients(
  totals: { perServing: { kcal: number; protein: number; carbs: number; fat: number }; label: { kj: number | null; saturates: number | null; sugars: number | null; fibre: number | null; salt: number | null } },
  servings: number,
): Nutrients {
  const { perServing: s, label: l } = totals;
  const n: Nutrients = {
    calories: halfUp(s.kcal * servings),
    protein: halfUp(s.protein * servings, 1),
    carbs: halfUp(s.carbs * servings, 1),
    fat: halfUp(s.fat * servings, 1),
  };
  if (l.saturates !== null) n.saturatedFat = halfUp(l.saturates * servings, 1);
  if (l.sugars !== null) n.sugar = halfUp(l.sugars * servings, 1);
  if (l.fibre !== null) n.fiber = halfUp(l.fibre * servings, 1);
  if (l.salt !== null) n.salt = halfUp(l.salt * servings, 2);
  if (l.kj !== null) n.energyKj = halfUp(l.kj * servings);
  return n;
}
