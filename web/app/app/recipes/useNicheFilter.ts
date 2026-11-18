"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { CuisineId, OccasionId } from "@/lib/mm/recipeBook/niches";
import { parseCuisines, parseOccasions, type CuisineOption, type OccasionOption } from "@/lib/mm/recipeNiche";

// The cuisines and occasions chosen on the Recipes screen live in the address (/app/recipes?cuisine=chinese,indian&occasion=picnic), not in the settings and
// not in any storage: the browser's Back and a link bring the same choice back, nothing is kept or sent anywhere, and a choice made for one occasion is not
// still on in the next season. They are read in the browser (useSearchParams), so the packed iPhone app, which is a static export, works the same way. Choosing
// writes the address with replace, not push, so each choice does not add a step to Back (the same as My meals' tabs). A name in the address that is not on
// offer (a typo, a cuisine with too few recipes, an occasion out of season) is left out. Since founder 2026-11-18 ("they can select more filters multiple as
// many as they want") each field holds any number of choices.

export interface NicheChoice {
  cuisines: readonly CuisineId[];
  occasions: readonly OccasionId[];
}

export interface NicheFilter extends NicheChoice {
  /** Adds the cuisine, or takes it off when it is already chosen. */
  toggleCuisine: (id: CuisineId) => void;
  toggleOccasion: (id: OccasionId) => void;
  /** Back to any cuisine and any occasion. */
  clear: () => void;
}

const flip = <Id extends string>(list: readonly Id[], id: Id): Id[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function useNicheFilter(cuisineOpts: readonly CuisineOption[], occasionOpts: readonly OccasionOption[]): NicheFilter {
  const router = useRouter();
  const params = useSearchParams();
  const askedCuisines = parseCuisines(params.get("cuisine"), cuisineOpts);
  const askedOccasions = parseOccasions(params.get("occasion"), occasionOpts);
  const askedKey = `${askedCuisines.join(",")}|${askedOccasions.join(",")}`;

  // What the person has just chosen, shown at once while the address catches up. The address wins as soon as it changes (Back, a link, the address catching up
  // with this very choice), so this is dropped then: set while rendering, the way React documents adjusting state when something it follows changes.
  const [mine, setMine] = useState<NicheChoice | null>(null);
  const [seenKey, setSeenKey] = useState(askedKey);
  if (seenKey !== askedKey) {
    setSeenKey(askedKey);
    setMine(null);
  }
  // in the catalogue's order, whatever order they were tapped in, so the address and the field's face read the same way every time
  const cuisines = mine ? parseCuisines(mine.cuisines.join(","), cuisineOpts) : askedCuisines;
  const occasions = mine ? parseOccasions(mine.occasions.join(","), occasionOpts) : askedOccasions;

  const choose = useCallback(
    (next: NicheChoice) => {
      const c = parseCuisines(next.cuisines.join(","), cuisineOpts);
      const o = parseOccasions(next.occasions.join(","), occasionOpts);
      if (c.join(",") === cuisines.join(",") && o.join(",") === occasions.join(",")) return;
      setMine({ cuisines: c, occasions: o });
      // keep everything else in the address (the shop, ?r=)
      const q = new URLSearchParams(window.location.search);
      if (c.length) q.set("cuisine", c.join(",")); else q.delete("cuisine");
      if (o.length) q.set("occasion", o.join(",")); else q.delete("occasion");
      // the commas stay readable in the address (URLSearchParams would write them as %2C)
      const qs = q.toString().replace(/%2C/g, ",");
      router.replace(`/app/recipes${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, cuisines, occasions, cuisineOpts, occasionOpts],
  );

  return {
    cuisines,
    occasions,
    toggleCuisine: (id) => choose({ cuisines: flip(cuisines, id), occasions }),
    toggleOccasion: (id) => choose({ cuisines, occasions: flip(occasions, id) }),
    clear: () => choose({ cuisines: [], occasions: [] }),
  };
}
