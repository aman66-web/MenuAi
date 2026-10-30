"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { mergeQuery, onlyParam, ownHistoryState, parseMealParam, parseOnlyParam, type RecipeToggle } from "@/lib/mm/recipeAddress";
import type { MealType } from "@/lib/mm/recipes";

// The shop, the meal tile and the toggle tiles chosen on the Recipes screen live in its address (lib/mm/recipeAddress.ts), like the cuisine and occasion
// (useNicheFilter), so Back from a recipe finds the list as it was left; the search words are kept in the history entry itself (useEntryQuery).

/**
 * Writes one change into the Recipes address. The native history.replaceState, not router.replace: Next.js keeps useSearchParams in step with it (its own
 * keys are copied back by Next), the address changes at once, so two changes made together both land, and the entry keeps its own state (the search
 * words and Back's depth), which router.replace would drop. A replace, not a push, so each choice does not add a step to Back.
 */
export function writeRecipesAddress(patch: Readonly<Record<string, string | null>>): void {
  const qs = mergeQuery(window.location.search, patch);
  try {
    window.history.replaceState(ownHistoryState(window.history.state), "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  } catch {
    /* Safari allows about 100 of these every 30 seconds: the choice still shows, it is just not kept for Back */
  }
}

export interface RecipeChoices {
  /** The shop asked for (?r=); the page checks it is one that can fill recipes. */
  shop: string | null;
  meal: MealType | null;
  toggles: ReadonlySet<RecipeToggle>;
  setShop: (id: string) => void;
  setMeal: (meal: MealType | null) => void;
  flip: (x: RecipeToggle) => void;
  /** Back to any meal and no toggles (the shop stays). */
  clear: () => void;
}

interface Chosen {
  shop: string | null;
  meal: MealType | null;
  only: string | null;
}

export function useRecipeChoices(): RecipeChoices {
  const params = useSearchParams();
  const asked: Chosen = { shop: params.get("r"), meal: parseMealParam(params.get("meal")), only: onlyParam(parseOnlyParam(params.get("only"))) };
  const askedKey = `${asked.shop ?? ""}|${asked.meal ?? ""}|${asked.only ?? ""}`;
  // What was just chosen, shown at once while useSearchParams catches up with the address; dropped as soon as the address changes (that choice
  // landing, Back, a link), the way useNicheFilter does it.
  const [mine, setMine] = useState<Chosen | null>(null);
  const [seenKey, setSeenKey] = useState(askedKey);
  if (seenKey !== askedKey) {
    setSeenKey(askedKey);
    setMine(null);
  }
  const now = mine ?? asked;
  const toggles = parseOnlyParam(now.only);

  const choose = useCallback((next: Chosen) => {
    setMine(next);
    writeRecipesAddress({ r: next.shop, meal: next.meal, only: next.only });
  }, []);

  return {
    shop: now.shop,
    meal: now.meal,
    toggles,
    setShop: (id) => choose({ ...now, shop: id }),
    setMeal: (meal) => choose({ ...now, meal }),
    flip: (x) => {
      const n = new Set(toggles);
      if (n.has(x)) n.delete(x);
      else n.add(x);
      choose({ ...now, only: onlyParam(n) });
    },
    clear: () => choose({ ...now, meal: null, only: null }),
  };
}
