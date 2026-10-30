"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { CuisineId, OccasionId } from "@/lib/mm/recipeBook/niches";
import { parseCuisine, parseOccasion, type CuisineOption, type OccasionOption } from "@/lib/mm/recipeNiche";
import { writeRecipesAddress } from "./useRecipeChoices";

// The cuisine and occasion chosen on the Recipes screen live in the address (/app/recipes?cuisine=chinese&occasion=picnic), not in the settings and not in
// any storage: the browser's Back and a link bring the same choice back, nothing is kept or sent anywhere, and a choice made for one occasion is not still on in
// the next season. They are read in the browser (useSearchParams), so the packed iPhone app, which is a static export, works the same way. Choosing writes the
// address with replace, not push, so each choice does not add a step to Back (the same as My meals' tabs), and through writeRecipesAddress, so it keeps the shop,
// meal and toggles chosen beside it and the search words kept in the history entry. An address that names something that is not on offer (a typo, a cuisine with
// too few recipes, an occasion out of season) is read as no choice.

export interface NicheChoice {
  cuisine: CuisineId | null;
  occasion: OccasionId | null;
}

export interface NicheFilter extends NicheChoice {
  setCuisine: (id: CuisineId | null) => void;
  setOccasion: (id: OccasionId | null) => void;
  /** Back to any cuisine and any occasion. */
  clear: () => void;
}

export function useNicheFilter(cuisines: readonly CuisineOption[], occasions: readonly OccasionOption[]): NicheFilter {
  const params = useSearchParams();
  const askedCuisine = parseCuisine(params.get("cuisine"), cuisines);
  const askedOccasion = parseOccasion(params.get("occasion"), occasions);
  const askedKey = `${askedCuisine ?? ""}|${askedOccasion ?? ""}`;

  // What the person has just chosen, shown at once while the address catches up. The address wins as soon as it changes (Back, a link, the address catching up
  // with this very choice), so this is dropped then: set while rendering, the way React documents adjusting state when something it follows changes.
  const [mine, setMine] = useState<NicheChoice | null>(null);
  const [seenKey, setSeenKey] = useState(askedKey);
  if (seenKey !== askedKey) {
    setSeenKey(askedKey);
    setMine(null);
  }
  const cuisine = mine ? parseCuisine(mine.cuisine, cuisines) : askedCuisine;
  const occasion = mine ? parseOccasion(mine.occasion, occasions) : askedOccasion;

  const choose = useCallback(
    (next: NicheChoice) => {
      if (next.cuisine === cuisine && next.occasion === occasion) return;
      setMine(next);
      // everything else in the address (the shop, the meal, the toggles) is kept
      writeRecipesAddress({ cuisine: next.cuisine, occasion: next.occasion });
    },
    [cuisine, occasion],
  );

  return {
    cuisine,
    occasion,
    setCuisine: (id) => choose({ cuisine: id, occasion }),
    setOccasion: (id) => choose({ cuisine, occasion: id }),
    clear: () => choose({ cuisine: null, occasion: null }),
  };
}
