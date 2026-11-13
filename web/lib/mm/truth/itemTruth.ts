// Everything the "Truth" card shows for one menu item, worked out from the item's own published figures and nothing else.

import type { MenuItem, Nutrients } from "../types";
import { fsaLights, type LightResult } from "./fsaLights";
import { householdEquivalents, type HouseholdEquivalent } from "./household";
import { itemKind, type ItemKind } from "./itemKind";
import { proteinScore, type ProteinScore } from "./proteinScore";
import { percentOfReference, REFERENCE_INTAKE, type RiKey } from "./referenceIntake";

export interface ReferenceRow {
  key: RiKey;
  grams: number;
  /** Whole-number % of the UK reference intake. */
  percent: number;
}

export interface ItemTruth {
  kind: ItemKind;
  /** Numbite's 1 to 5 protein score; null for drinks, sauces and add-ons, for items with no published protein or under 120 kcal. */
  score: ProteinScore | null;
  /** The four FSA lights (fat, saturates, sugars, salt), as far as the published figures allow. */
  lights: LightResult[];
  /** % of reference intake for each figure the item publishes, in label order. */
  reference: ReferenceRow[];
  /** Calories as a whole-number % of the 2,000 kcal reference intake. */
  caloriePercent: number;
  household: HouseholdEquivalent[];
}

/** Kinds that get a protein score (the others are not things you'd judge by their protein: a dip, a coffee, an add-on). */
const SCORED_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(["main", "kids", "side", "dessert"]);

const REFERENCE_ORDER: RiKey[] = ["calories", "protein", "carbs", "sugar", "fat", "saturatedFat", "salt"];

export function referenceRows(n: Partial<Nutrients>): ReferenceRow[] {
  const rows: ReferenceRow[] = [];
  for (const key of REFERENCE_ORDER) {
    const percent = percentOfReference(n, key);
    const grams = n[key];
    if (percent !== undefined && grams !== undefined) rows.push({ key, grams, percent });
  }
  return rows;
}

export function itemTruth(item: Pick<MenuItem, "name" | "category" | "nutrients">): ItemTruth {
  const n = item.nutrients;
  const kind = itemKind({ name: item.name, category: item.category, calories: n.calories });
  return {
    kind,
    score: SCORED_KINDS.has(kind) ? proteinScore(n) : null,
    lights: fsaLights(n, kind === "drink"),
    reference: referenceRows(n),
    caloriePercent: Math.round((n.calories / REFERENCE_INTAKE.calories) * 100),
    household: householdEquivalents(n),
  };
}

/** The plain-English line under the calories: only worth saying once an item is a tenth of a day. English; the screen runs it through t(). */
export const CALORIE_CALLOUT_MIN_PERCENT = 10;
export const calorieCalloutParts = (percent: number): { percent: number } | null => (percent >= CALORIE_CALLOUT_MIN_PERCENT ? { percent } : null);
