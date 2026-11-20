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

// What the last replace asked the address to become, while the router hasn't written it yet (Next.js writes history after its render): two choices in quick
// succession (Clear all, a tile and the search) then build on each other instead of the second putting back what the first took out. Only for a moment: by
// then the router has written it, and an address reached later (Back) is never mistaken for one still on its way.
const PENDING_MS = 1000;
let pending: { from: string; to: string; at: number } | null = null;

/** Puts these names into the address with replace (null or "" takes one out), keeping everything else in it; does nothing when nothing changes. */
export function replaceAddress(router: ReturnType<typeof useRouter>, path: string, patch: Readonly<Record<string, string | null>>): void {
  const now = window.location.search;
  const base = pending && pending.from === now && Date.now() - pending.at < PENDING_MS ? pending.to : now;
  const q = new URLSearchParams(base);
  for (const [k, v] of Object.entries(patch)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  // the commas stay readable in the address (URLSearchParams would write them as %2C)
  const qs = q.toString().replace(/%2C/g, ",");
  if (qs === new URLSearchParams(base).toString().replace(/%2C/g, ",")) return;
  pending = { from: now, to: qs ? `?${qs}` : "", at: Date.now() };
  router.replace(`${path}${qs ? `?${qs}` : ""}`, { scroll: false });
}

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
      // keep everything else in the address (the shop, ?r=, the meals and the search)
      replaceAddress(router, "/app/recipes", { cuisine: c.join(","), occasion: o.join(",") });
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

/**
 * The rest of the Recipes screen's choices kept in the address the same way (the 30-person audit, 20 November 2026: Back from a recipe wiped the meal tiles, the
 * toggles, the search and the sort, and put the scroll back on a different list): ?meal=dinner,lunch&only=vegan&q=curry&sort=price&shown=48. `read` gives what the
 * address says when the screen opens (Back, the iPhone's swipe back and PageHeader's Back all return to that address); `write` puts changed values in with
 * replace, keeping everything else there (the shop, the cuisine). A value of null or "" takes that name out.
 */
export function useListAddress(path = "/app/recipes"): { read: (name: string) => string | null; write: (patch: Readonly<Record<string, string | null>>) => void } {
  const router = useRouter();
  const params = useSearchParams();
  const write = useCallback((patch: Readonly<Record<string, string | null>>) => replaceAddress(router, path, patch), [router, path]);
  return { read: (name) => params.get(name), write };
}
