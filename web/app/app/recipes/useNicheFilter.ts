"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { CuisineId, OccasionId } from "@/lib/mm/recipeBook/niches";
import { parseCuisine, parseOccasion, type CuisineOption, type OccasionOption } from "@/lib/mm/recipeNiche";

// The cuisine and occasion chosen on the Recipes screen live in the address (/app/recipes?cuisine=chinese&occasion=picnic), not in the settings and not in
// any storage: the browser's Back and a link bring the same choice back, nothing is kept or sent anywhere, and a choice made for one occasion is not still on in
// the next season. They are read in the browser (useSearchParams), so the packed iPhone app, which is a static export, works the same way. Choosing writes the
// address with replace, not push, so each choice does not add a step to Back (the same as My meals' tabs). An address that names something that is not on offer
// (a typo, a cuisine with too few recipes, an occasion out of season) is read as no choice.

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
  const router = useRouter();
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
      // keep everything else in the address (the shop, ?r=)
      const q = new URLSearchParams(window.location.search);
      if (next.cuisine) q.set("cuisine", next.cuisine); else q.delete("cuisine");
      if (next.occasion) q.set("occasion", next.occasion); else q.delete("occasion");
      const qs = q.toString();
      router.replace(`/app/recipes${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, cuisine, occasion],
  );

  return {
    cuisine,
    occasion,
    setCuisine: (id) => choose({ cuisine: id, occasion }),
    setOccasion: (id) => choose({ cuisine, occasion: id }),
    clear: () => choose({ cuisine: null, occasion: null }),
  };
}
