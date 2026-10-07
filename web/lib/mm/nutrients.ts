import { OPTIONAL_NUTRIENTS, REQUIRED_NUTRIENTS, type Nutrients, type NutrientKey } from "./types";

const INTEGER_NUTRIENTS: ReadonlySet<NutrientKey> = new Set<NutrientKey>(["calories", "sodium", "energyKj", "caffeine"]);

/** Round half away from zero (SPEC §6.1). Math.round and Intl default rounding differ for negatives/ties. */
export function halfUp(x: number, places = 0): number {
  const f = 10 ** places;
  return (Math.floor(Math.abs(x) * f + 0.5) / f) * (x >= 0 ? 1 : -1);
}

/** Same rounding the menu pipeline uses when it stores a value (tools/build_menus.py round_nutrient). */
export function roundNutrient(key: NutrientKey, value: number): number {
  if (INTEGER_NUTRIENTS.has(key)) return halfUp(value);
  if (key === "salt") return halfUp(value, 2); // UK guides publish salt to 2 decimals (0.05g must not round away)
  return halfUp(value, 1);
}

/**
 * Sum (nutrients, multiplier) pairs; a negative multiplier subtracts (a "remove" modifier).
 * Mirrors tools/build_menus.py add_nutrients: an optional nutrient appears in the total only if EVERY
 * part publishes it ("not published" propagates, we never estimate); totals never go below 0.
 */
export function sumNutrients(parts: ReadonlyArray<readonly [Nutrients, number]>): Nutrients {
  const total: Partial<Nutrients> = {};
  for (const key of [...REQUIRED_NUTRIENTS, ...OPTIONAL_NUTRIENTS] as NutrientKey[]) {
    if ((OPTIONAL_NUTRIENTS as readonly string[]).includes(key) && !parts.every(([n]) => n[key] !== undefined)) continue;
    const sum = parts.reduce((acc, [n, m]) => acc + (n[key] ?? 0) * m, 0);
    total[key] = roundNutrient(key, Math.max(sum, 0));
  }
  return total as Nutrients;
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return sumNutrients([[a, 1], [b, 1]]);
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  return sumNutrients([[n, factor]]);
}

/** Protein grams per 100 calories (0 when calories is 0). Only ever asked of items from chains with full nutrition. */
export function proteinPer100Cal(n: Pick<Nutrients, "calories" | "protein">): number {
  return n.calories > 0 ? ((n.protein ?? 0) / n.calories) * 100 : 0;
}

/** True when protein, carbs and fat are all published (always, except for chains with `nutritionLevel: "calories"`). */
export function hasMacros(n: Nutrients): boolean {
  return n.protein !== undefined && n.carbs !== undefined && n.fat !== undefined;
}

export const ZERO_NUTRIENTS: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };
