import { mealBudget } from "./budget";
import { passesDiet } from "./menu-view";
import { hasMacros } from "./nutrients";
import type { Chain, Preferences, Profile } from "./types";

// The friendly numbers at the end of onboarding. Everything is a count of real published dishes (nothing estimated).

export const TEASER_MIN_PROTEIN = 20;

/** How many of a chain's main dishes have at least 20 g protein and fit the user's lunch budget, with their diet filters on. */
export function lunchTeaser(chain: Pick<Chain, "items">, profile: Profile, prefs: Preferences): { count: number; budget: number } {
  const { budget } = mealBudget(profile, 0, "lunch");
  const count = chain.items.filter(
    (i) => i.rankable && hasMacros(i.nutrients) && (i.nutrients.protein ?? 0) >= TEASER_MIN_PROTEIN && i.nutrients.calories > 0 && i.nutrients.calories <= budget && passesDiet(i, prefs),
  ).length;
  return { count, budget };
}
