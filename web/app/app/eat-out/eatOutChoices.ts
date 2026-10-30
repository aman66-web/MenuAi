"use client";

import { useState } from "react";

// The choices under Eat out's "More ways to find a restaurant" besides the type (which useBrowseType keeps as mm.browseType): whether the row is open,
// "Full nutrition only" and "Halal". Kept for this browser tab (sessionStorage, on this device only), so that opening a restaurant and coming Back, or
// leaving the Eat out tab and coming back to it, finds the list as it was; before anything is chosen here, Halal follows the person's saved diet setting.
// Closing the row turns them all off and that is kept too, so Back after closing shows every restaurant.

export interface EatOutChoices {
  moreOpen: boolean;
  fullOnly: boolean;
  halalOnly: boolean;
}

export const EAT_OUT_CHOICES_KEY = "mm.eatOutChoices";

/** What was stored, checked: anything that isn't three true/false answers is nothing stored. */
export function parseEatOutChoices(raw: string | null): EatOutChoices | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { moreOpen, fullOnly, halalOnly } = v;
    if (typeof moreOpen !== "boolean" || typeof fullOnly !== "boolean" || typeof halalOnly !== "boolean") return null;
    return { moreOpen, fullOnly, halalOnly };
  } catch {
    return null;
  }
}

/** The choices as they start: what this tab kept, else none of them with Halal (and the row open) as the person's saved setting says. */
export function startingChoices(stored: EatOutChoices | null, savedHalal: boolean): EatOutChoices {
  return stored ?? { moreOpen: savedHalal, fullOnly: false, halalOnly: savedHalal };
}

/**
 * Eat out's choices for this tab. Read when the page is first built: Eat out shows a spinner until it has hydrated, so what is restored is never seen as a
 * mismatch with the server's page (the numbers finder does the same), and coming Back shows the list as it was from the first frame.
 */
export function useEatOutChoices(savedHalal: boolean): [EatOutChoices, (change: Partial<EatOutChoices>) => void] {
  const [choices, setChoices] = useState<EatOutChoices>(() => {
    let stored: EatOutChoices | null = null;
    try {
      stored = parseEatOutChoices(sessionStorage.getItem(EAT_OUT_CHOICES_KEY));
    } catch { /* storage blocked, or the server: nothing kept */ }
    return startingChoices(stored, savedHalal);
  });
  const change = (patch: Partial<EatOutChoices>) => {
    const next = { ...choices, ...patch };
    setChoices(next);
    try {
      sessionStorage.setItem(EAT_OUT_CHOICES_KEY, JSON.stringify(next));
    } catch { /* not remembered, still works */ }
  };
  return [choices, change];
}
