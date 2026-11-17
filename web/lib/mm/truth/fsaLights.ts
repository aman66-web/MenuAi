// The UK's voluntary front-of-pack traffic lights, applied only as the Food Standards Agency's guidance says (colour coding applies to fat, saturates,
// total sugars and salt; calories and protein are never coloured; "colours do not represent claims").
// Source: "Guide to creating a front of pack (FoP) nutrition label for pre-packed products sold through retail outlets" (UK Government, FSA/DHSC/Scottish and
// Welsh Governments, 2016), the colour-coding table, opened and read 13 November 2026:
//   per 100 g   green ≤ / amber / red >:   fat 3.0 / 17.5   saturates 1.5 / 5.0   sugars 5.0 / 22.5   salt 0.3 / 1.5
//   per portion (portions over 100 g)   red >:   fat 21 g   saturates 6 g   sugars 27 g   salt 1.8 g
//
// What we publish and what that allows (nothing is estimated):
//  - Restaurants publish figures per serving. Only 11% of items also publish the serving's weight, so a per-100 g colour can't be worked out for the rest.
//  - A serving over the per-portion "high" figure is red whatever it weighs (a lighter serving would be even higher per 100 g), so red is always safe to show.
//  - Green and amber need the weight: shown only where the weight is published; otherwise the nutrient is "not coloured" and its figure is shown with the % of reference intake.
//  - Drinks have their own per-100 ml table and are not coloured here. Salt is the published salt figure only (never worked out from sodium).

import type { Nutrients } from "../types";

export const FSA_KEYS = ["fat", "saturatedFat", "sugar", "salt"] as const;
export type FsaKey = (typeof FSA_KEYS)[number];

export const FSA_PER_100G: Record<FsaKey, { low: number; high: number }> = {
  fat: { low: 3.0, high: 17.5 },
  saturatedFat: { low: 1.5, high: 5.0 },
  sugar: { low: 5.0, high: 22.5 },
  salt: { low: 0.3, high: 1.5 },
};

export const FSA_PER_PORTION_HIGH: Record<FsaKey, number> = { fat: 21, saturatedFat: 6, sugar: 27, salt: 1.8 };

export const FSA_SOURCE = {
  citation: "UK Government, Guide to creating a front of pack (FoP) nutrition label for pre-packed products sold through retail outlets (2016)",
  url: "https://assets.publishing.service.gov.uk/media/5a80cd03ed915d74e33fc7c5/FoP_Nutrition_labelling_UK_guidance.pdf",
  checkedOn: "2026-11-13",
} as const;

export type Light = "green" | "amber" | "red";
export type LightBasis =
  /** Over the per-portion high figure: red whatever the serving weighs. */
  | "portion"
  /** Coloured from the published serving weight, per 100 g. */
  | "per100g"
  /** Published, but with no serving weight, so green and amber can't be told apart. */
  | "no-weight"
  /** The item doesn't publish this figure. */
  | "not-published"
  /** A drink: the guidance's per-100 ml table isn't applied here. */
  | "drink";

export interface LightResult {
  key: FsaKey;
  grams?: number;
  light?: Light;
  basis: LightBasis;
}

const fsaValue = (n: Partial<Nutrients>, key: FsaKey): number | undefined => {
  const v = n[key];
  return v === undefined || !Number.isFinite(v) || v < 0 ? undefined : v;
};

/** The guidance's colour for a figure per 100 g of food (Table 2): green ≤ low, amber up to high, red above. */
export function bandPer100g(key: FsaKey, per100: number): Light {
  const { low, high } = FSA_PER_100G[key];
  if (per100 > high) return "red";
  if (per100 > low) return "amber";
  return "green";
}

/** One nutrient's light. `isDrink`: no colour (see the header). */
export function fsaLight(n: Partial<Nutrients>, key: FsaKey, isDrink = false): LightResult {
  const grams = fsaValue(n, key);
  if (grams === undefined) return { key, basis: "not-published" };
  if (isDrink) return { key, grams, basis: "drink" };
  if (grams > FSA_PER_PORTION_HIGH[key]) return { key, grams, light: "red", basis: "portion" };
  const weight = n.weight;
  if (weight !== undefined && Number.isFinite(weight) && weight > 0) {
    return { key, grams, light: bandPer100g(key, (grams / weight) * 100), basis: "per100g" };
  }
  return { key, grams, basis: "no-weight" };
}

/** The four lights, in the order the label prints them. */
export function fsaLights(n: Partial<Nutrients>, isDrink = false): LightResult[] {
  return FSA_KEYS.map((key) => fsaLight(n, key, isDrink));
}
