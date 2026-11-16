// UK reference intakes for an adult (the "% of your daily reference intake" printed on food labels).
// Source: Regulation (EU) No 1169/2011, Annex XIII Part B, as it applies in Great Britain (legislation.gov.uk/eur/2011/1169/annex/XIII), read 13 November 2026:
// energy 8,400 kJ / 2,000 kcal, total fat 70 g, saturates 20 g, carbohydrate 260 g, total sugars 90 g, protein 50 g, salt 6 g.
// A reference intake is a label convention for an average adult, not a target for any person and not advice (the app's own daily targets are separate).

import type { Nutrients } from "../types";

export const REFERENCE_INTAKE = {
  calories: 2000,
  fat: 70,
  saturatedFat: 20,
  carbs: 260,
  sugar: 90,
  protein: 50,
  salt: 6,
} as const;

export type RiKey = keyof typeof REFERENCE_INTAKE;

export const REFERENCE_INTAKE_SOURCE = {
  citation: "Regulation (EU) No 1169/2011, Annex XIII Part B (reference intakes), as it applies in Great Britain",
  url: "https://www.legislation.gov.uk/eur/2011/1169/annex/XIII",
  checkedOn: "2026-11-13",
} as const;

/** The nutrient's amount as a whole-number percentage of the reference intake, or undefined when the item doesn't publish it. */
export function percentOfReference(n: Partial<Nutrients>, key: RiKey): number | undefined {
  const value = n[key];
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round((value / REFERENCE_INTAKE[key]) * 100);
}
