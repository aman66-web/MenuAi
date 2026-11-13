// "What that looks like": a published nutrient shown as things people know, only where a source we have opened gives the conversion.
// Each equivalent is labelled "about", carries its basis and source, and is never shown for a nutrient the item doesn't publish.
// Opened and read 13 November 2026:
//  - Sugar cubes: the NHS page "Sugar: the facts" pairs its limits with cubes (24 g = 6 cubes, 14 g = 3½ cubes, 10 g = 2½ cubes, 30 g about 7), which is 4 g a cube.
//    (It gives no figure for a teaspoon, so teaspoons are not used.)
//  - Butter: McCance and Widdowson's The Composition of Foods Integrated Dataset 2021 gives butter as 82 g of fat per 100 g (average of UK, Irish, Danish, French and
//    New Zealand butter), read through Patient.info's table that cites it. Shown as grams of butter; no portion size is claimed.
//  - Eggs: the British Egg Information Service's table gives 6.4 g of protein in a medium egg (58 g).

import type { Nutrients } from "../types";

export type HouseholdKind = "sugar" | "fat" | "protein";

export interface HouseholdSource {
  citation: string;
  url: string;
  checkedOn: string;
}

export const SUGAR_GRAMS_PER_CUBE = 4;
export const BUTTER_FAT_FRACTION = 0.82;
export const EGG_PROTEIN_GRAMS = 6.4;
/** The drawing of butter shows one block for every this many grams (a drawing scale, not a portion size). */
export const BUTTER_GRAMS_PER_BLOCK = 10;
export const MAX_ICONS = 12;

export const HOUSEHOLD_SOURCES: Record<HouseholdKind, HouseholdSource> = {
  sugar: {
    citation: "NHS, Sugar: the facts (sugar cubes against grams of free sugars)",
    url: "https://www.nhs.uk/live-well/eat-well/food-types/how-does-sugar-in-our-diet-affect-our-health/",
    checkedOn: "2026-11-13",
  },
  fat: {
    citation: "McCance and Widdowson's The Composition of Foods Integrated Dataset 2021: butter, 82 g of fat per 100 g",
    url: "https://patient.info/nutrition/foods/butter-unsalted",
    checkedOn: "2026-11-13",
  },
  protein: {
    citation: "British Egg Information Service, Protein in eggs (a medium egg, 58 g, has 6.4 g of protein)",
    url: "https://www.egginfo.co.uk/egg-nutrition/information/protein-in-eggs",
    checkedOn: "2026-11-13",
  },
};

export interface HouseholdEquivalent {
  kind: HouseholdKind;
  /** The published figure this is worked out from, in grams. */
  grams: number;
  /** How many of the household thing: nearest half for cubes and eggs, nearest 5 g for butter. */
  amount: number;
  /** How many drawn icons: whole, at most MAX_ICONS. */
  icons: number;
  /** Plain words, "about" included: "about 6 sugar cubes". English, run through t() with {amount}/{grams} by the screen. */
  text: string;
  /** The one-line basis shown with it: "A sugar cube is about 4 g." */
  basis: string;
  source: HouseholdSource;
}

/** The smallest published amount worth showing (below it the equivalent would round to nothing). */
export const MIN_GRAMS: Record<HouseholdKind, number> = { sugar: 3, fat: 5, protein: 3.2 };

const usable = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v >= 0;
const nearestHalf = (x: number) => Math.round(x * 2) / 2;
const nearestFive = (x: number) => Math.round(x / 5) * 5;
const iconCount = (x: number) => Math.min(MAX_ICONS, Math.max(1, Math.round(x)));
/** 1 → "1", 2.5 → "2½" (the same way the NHS page writes half cubes). */
export const countText = (x: number): string => (Number.isInteger(x) ? String(x) : `${Math.floor(x) === 0 ? "" : Math.floor(x)}½`);

export function sugarEquivalent(n: Partial<Nutrients>): HouseholdEquivalent | undefined {
  if (!usable(n.sugar) || n.sugar < MIN_GRAMS.sugar) return undefined;
  const amount = nearestHalf(n.sugar / SUGAR_GRAMS_PER_CUBE);
  return {
    kind: "sugar",
    grams: n.sugar,
    amount,
    icons: iconCount(amount),
    text: `about ${countText(amount)} sugar ${amount === 1 ? "cube" : "cubes"}`,
    basis: `The NHS counts a sugar cube as about ${SUGAR_GRAMS_PER_CUBE} g.`,
    source: HOUSEHOLD_SOURCES.sugar,
  };
}

export function butterEquivalent(n: Partial<Nutrients>): HouseholdEquivalent | undefined {
  if (!usable(n.fat) || n.fat < MIN_GRAMS.fat) return undefined;
  const amount = nearestFive(n.fat / BUTTER_FAT_FRACTION);
  return {
    kind: "fat",
    grams: n.fat,
    amount,
    icons: iconCount(amount / BUTTER_GRAMS_PER_BLOCK),
    text: `about ${amount} g of butter`,
    basis: `Butter is about ${Math.round(BUTTER_FAT_FRACTION * 100)} g of fat in every 100 g. Each block drawn is ${BUTTER_GRAMS_PER_BLOCK} g.`,
    source: HOUSEHOLD_SOURCES.fat,
  };
}

export function eggEquivalent(n: Partial<Nutrients>): HouseholdEquivalent | undefined {
  if (!usable(n.protein) || n.protein < MIN_GRAMS.protein) return undefined;
  const amount = Math.max(0.5, nearestHalf(n.protein / EGG_PROTEIN_GRAMS));
  return {
    kind: "protein",
    grams: n.protein,
    amount,
    icons: iconCount(amount),
    text: `about ${countText(amount)} medium ${amount === 1 ? "egg's" : "eggs'"} worth`,
    basis: `A medium egg has about ${EGG_PROTEIN_GRAMS} g of protein.`,
    source: HOUSEHOLD_SOURCES.protein,
  };
}

/** The equivalents for the nutrients this item publishes, in the order sugar, fat, protein. */
export function householdEquivalents(n: Partial<Nutrients>): HouseholdEquivalent[] {
  return [sugarEquivalent(n), butterEquivalent(n), eggEquivalent(n)].filter((e): e is HouseholdEquivalent => e !== undefined);
}
