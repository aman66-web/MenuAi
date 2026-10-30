"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shownOf, stateForAddress, withParams, withShown } from "./addressState";

// The window half of addressState.ts: a grocery list screen's choices in the address, and how many rows "Show more" had opened in the history entry, so Back
// from a product finds the list as it was left.
//
// The address is written with the browser's own history.replaceState, not router.replace: Next.js supports that and keeps useSearchParams in step (its
// "native history API", docs: 01-app/01-getting-started/04-linking-and-navigating.md), and it keeps the entry's own state, so the words useEntryQuery saved
// there and the shown count survive a change of aisle or sort. A router.replace writes a fresh state and would drop them. Replace, not push: a choice is not a
// step for Back (the same as the Recipes screen's cuisine and My meals' tabs). Read in the browser (useSearchParams), so the packed iPhone app, a static
// export, works the same way.

export interface Address {
  /** A key of the address as it now stands (with a choice just made, before Next.js has caught up). */
  get: (key: string) => string | null;
  /** Change some keys (null removes one); everything else in the address (the shop, ?r=) is kept. */
  set: (changes: Record<string, string | null>) => void;
}

export function useAddress(): Address {
  const params = useSearchParams();
  const key = params.toString();
  // What the person has just chosen, shown at once while useSearchParams catches up (it follows in a transition). Dropped as soon as the address moves on
  // (this very choice arriving, or Back): it belongs to the address it was made from.
  const [mine, setMine] = useState<{ from: string; search: string } | null>(null);
  const search = mine && mine.from === key ? mine.search : key;
  const current = useMemo(() => new URLSearchParams(search), [search]);
  const get = useCallback((k: string) => current.get(k), [current]);
  const set = useCallback(
    (changes: Record<string, string | null>) => {
      const next = withParams(window.location.search, changes);
      if (next === (window.location.search === "?" ? "" : window.location.search)) return;
      setMine({ from: key, search: next.replace(/^\?/, "") });
      try {
        window.history.replaceState(stateForAddress(window.history.state), "", `${window.location.pathname}${next}${window.location.hash}`);
      } catch { /* Safari allows about 100 of these every 30 seconds: the choice shows, it is just not kept for Back */ }
    },
    [key],
  );
  return useMemo(() => ({ get, set }), [get, set]);
}

/**
 * How many rows "Show more" has opened, kept in the history entry like useEntryQuery's words: Back from a product shows the same rows. A fresh visit starts at
 * `page`. Written only when the number changes (a reset on every keystroke would spend Safari's history budget for nothing).
 */
export function useEntryShown(page: number): [number, (n: number) => void] {
  const [shown, setShown] = useState(page);
  const last = useRef(page);
  useEffect(() => {
    const saved = shownOf(window.history.state, page);
    last.current = saved;
    if (saved !== page) setShown(saved); // eslint-disable-line react-hooks/set-state-in-effect -- the entry's count is only known in the browser, after the page opens
  }, [page]);
  const set = useCallback(
    (n: number) => {
      setShown(n);
      if (n === last.current) return;
      last.current = n;
      try { window.history.replaceState(withShown(window.history.state, n, page), ""); } catch { /* not kept: see useAddress */ }
    },
    [page],
  );
  return [shown, set];
}
