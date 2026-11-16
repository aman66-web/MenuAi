// "Smart Swap": one lighter option from the SAME restaurant and the SAME menu section, chosen from published figures only.
// It never crosses a restaurant or a kind of item (a main is never swapped for a dip or a drink), only offers dishes that pass the person's diet and
// allergy settings, and says only what the numbers say ("Saves 340 kcal, 12 g more protein"): it never calls either dish better or healthier.
//  - Chains that publish protein: a candidate must save calories AND have at least as much protein as the dish it replaces (a dish with less protein is
//    not offered; "nothing lighter with as much protein" is an honest answer).
//  - Calories-only chains (118 of 241): no protein is published, so the swap is a "lower-calorie option" and says nothing about protein.

import { passesDiet } from "../menu-view";
import type { Chain, MenuItem, Preferences } from "../types";
import { itemKind, type ItemKind } from "./itemKind";
import { MIN_SCORED_KCAL, proteinShare } from "./proteinScore";

/** Kinds that can be swapped for another of the same kind. Sauces, drinks and add-ons never are. */
const SWAPPABLE: ReadonlySet<ItemKind> = new Set<ItemKind>(["main", "kids", "side", "dessert"]);

/** Don't offer a swap for something small: below this there is no meaningful saving. */
export const MIN_ORIGINAL_KCAL = 200;
/** The saving must be at least this many kcal and at least this share of the original. */
export const MIN_SAVING_KCAL = 75;
export const MIN_SAVING_SHARE = 0.1;
/** The option must still be a dish of a similar size: at least this share of the original's calories. */
export const MIN_SIZE_SHARE = 0.4;
/** A rounding tolerance when comparing two published protein figures (grams). */
export const PROTEIN_TOLERANCE_G = 0.5;

export interface SwapSuggestion {
  item: MenuItem;
  tier: "protein-first" | "lower-calorie";
  /** Calories the option saves (always positive). */
  kcalSaved: number;
  /** Option's protein minus the original's, in grams, only when both publish it (protein-first tier). */
  proteinDiff?: number;
}

const calories = (i: MenuItem) => i.nutrients.calories;
const hasProtein = (i: MenuItem) => i.nutrients.protein !== undefined && Number.isFinite(i.nutrients.protein);

const kindOf = (i: MenuItem): ItemKind => itemKind({ name: i.name, category: i.category, calories: calories(i) });

export function smartSwap(chain: Chain, original: MenuItem, prefs: Preferences): SwapSuggestion | null {
  const kind = kindOf(original);
  const kcal = calories(original);
  if (!SWAPPABLE.has(kind) || !Number.isFinite(kcal) || kcal < MIN_ORIGINAL_KCAL) return null;

  const minSaving = Math.max(MIN_SAVING_KCAL, Math.ceil(kcal * MIN_SAVING_SHARE));
  const proteinFirst = hasProtein(original) && chain.nutritionLevel !== "calories";

  let best: { s: SwapSuggestion; share: number } | null = null;
  for (const c of chain.items) {
    if (c.id === original.id || c.category !== original.category || c.limitedTime) continue;
    const ck = calories(c);
    if (!Number.isFinite(ck) || ck < MIN_SCORED_KCAL || kcal - ck < minSaving || ck < kcal * MIN_SIZE_SHARE) continue;
    if (kindOf(c) !== kind || !passesDiet(c, prefs)) continue;

    if (proteinFirst) {
      if (!hasProtein(c)) continue;
      const diff = (c.nutrients.protein as number) - (original.nutrients.protein as number);
      if (diff < -PROTEIN_TOLERANCE_G) continue;
      const share = proteinShare(c.nutrients) ?? 0;
      const s: SwapSuggestion = { item: c, tier: "protein-first", kcalSaved: kcal - ck, proteinDiff: diff };
      if (!best || share > best.share || (share === best.share && (s.kcalSaved > best.s.kcalSaved || (s.kcalSaved === best.s.kcalSaved && c.id < best.s.item.id)))) best = { s, share };
    } else {
      const s: SwapSuggestion = { item: c, tier: "lower-calorie", kcalSaved: kcal - ck };
      // The biggest saving that is still a dish of similar size; ties by id so the answer never changes between visits.
      if (!best || s.kcalSaved > best.s.kcalSaved || (s.kcalSaved === best.s.kcalSaved && c.id < best.s.item.id)) best = { s, share: 0 };
    }
  }
  return best ? best.s : null;
}

/** The numbers-only sentences for a swap, as words the screen runs through t(): "Saves {n} kcal" and, where it is true, "{n} g more protein". */
export function swapFacts(s: SwapSuggestion): { saves: number; moreProtein?: number } {
  const out: { saves: number; moreProtein?: number } = { saves: Math.round(s.kcalSaved) };
  if (s.proteinDiff !== undefined && Math.round(s.proteinDiff) >= 1) out.moreProtein = Math.round(s.proteinDiff);
  return out;
}
