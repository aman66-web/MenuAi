// The five one-tap lists on a restaurant's page. Each is a plain filter over the published figures (the pill says the number); none says a dish is good or bad.
// Only meals count (a main or a kids' dish at 120 kcal or more), never a drink, a dip, a side or an add-on. A list a chain can't answer (it publishes no protein,
// or no sugar) is not offered for that chain rather than answered with a guess.

import type { Chain, MenuItem } from "../types";
import { itemKind, isMealKind } from "./itemKind";
import { MIN_SCORED_KCAL, proteinShare } from "./proteinScore";

export const PRESET_IDS = ["under-500", "protein-35", "small-appetite", "sugar-5", "most-protein"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface PresetDef {
  id: PresetId;
  /** The pill. English; the screen runs it through t(). Numbers in the words, no claim in them. */
  label: string;
  /** One line under the list saying exactly what the filter was. */
  rule: string;
  needs: "calories" | "protein" | "sugar";
}

export const PRESETS: readonly PresetDef[] = [
  { id: "under-500", label: "Under 500 calories", rule: "Meals of 500 kcal or less, with the most protein first.", needs: "calories" },
  { id: "protein-35", label: "35 g+ protein", rule: "Meals with 35 g of protein or more, most protein for their calories first.", needs: "protein" },
  { id: "small-appetite", label: "Small appetite", rule: "Meals of 400 kcal or less with at least 20 g of protein, most protein for the calories first.", needs: "protein" },
  { id: "sugar-5", label: "5 g sugar or less", rule: "Meals that publish their sugar and have 5 g or less, lowest first.", needs: "sugar" },
  { id: "most-protein", label: "Most protein for the calories", rule: "Meals of 250 kcal or more with at least 20 g of protein, ranked by protein for their calories.", needs: "protein" },
];

export const UNDER_500_KCAL = 500;
export const PROTEIN_35_G = 35;
export const SMALL_APPETITE = { maxKcal: 400, minProtein: 20 } as const;
export const SUGAR_5_G = 5;
export const MOST_PROTEIN = { minKcal: 250, minProtein: 20 } as const;

const meal = (i: MenuItem): boolean =>
  i.nutrients.calories >= MIN_SCORED_KCAL && isMealKind(itemKind({ name: i.name, category: i.category, calories: i.nutrients.calories }));

const protein = (i: MenuItem): number | undefined => i.nutrients.protein;
const share = (i: MenuItem): number => proteinShare(i.nutrients) ?? 0;
const byName = (a: MenuItem, b: MenuItem) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1);

/** Which lists this chain can answer from what it publishes. */
export function presetsFor(chain: Pick<Chain, "items" | "nutritionLevel">): PresetDef[] {
  const full = chain.nutritionLevel !== "calories";
  const hasSugar = chain.items.some((i) => i.nutrients.sugar !== undefined);
  return PRESETS.filter((p) => (p.needs === "calories" ? true : p.needs === "protein" ? full : hasSugar));
}

/** The items for one preset, in the order the rule says. `items` should already be the person's diet-filtered list. Pure and deterministic. */
export function applyPreset(id: PresetId, items: readonly MenuItem[]): MenuItem[] {
  const meals = items.filter(meal);
  switch (id) {
    case "under-500":
      return meals
        .filter((i) => i.nutrients.calories <= UNDER_500_KCAL)
        .sort((a, b) => (protein(b) ?? -1) - (protein(a) ?? -1) || a.nutrients.calories - b.nutrients.calories || byName(a, b));
    case "protein-35":
      return meals.filter((i) => (protein(i) ?? -1) >= PROTEIN_35_G).sort((a, b) => share(b) - share(a) || (protein(b) as number) - (protein(a) as number) || byName(a, b));
    case "small-appetite":
      return meals
        .filter((i) => i.nutrients.calories <= SMALL_APPETITE.maxKcal && (protein(i) ?? -1) >= SMALL_APPETITE.minProtein)
        .sort((a, b) => share(b) - share(a) || byName(a, b));
    case "sugar-5":
      return meals
        .filter((i) => i.nutrients.sugar !== undefined && i.nutrients.sugar <= SUGAR_5_G)
        .sort((a, b) => (a.nutrients.sugar as number) - (b.nutrients.sugar as number) || (protein(b) ?? -1) - (protein(a) ?? -1) || byName(a, b));
    case "most-protein":
      return meals
        .filter((i) => i.nutrients.calories >= MOST_PROTEIN.minKcal && (protein(i) ?? -1) >= MOST_PROTEIN.minProtein)
        .sort((a, b) => share(b) - share(a) || byName(a, b));
  }
}
