"use client";

import { useState } from "react";

// The choices under Eat out's "More ways to find a restaurant" besides the type (which useBrowseType keeps as mm.browseType): whether the row is open,
// "Full nutrition only" and "Halal". Kept for this browser tab (sessionStorage, on this device only), so that opening a restaurant and coming Back, or
// leaving the Eat out tab and coming back to it, finds the list as it was; before anything is chosen here, Halal follows the person's saved diet setting.
// Closing the row turns them all off and that is kept too, so Back after closing shows every restaurant. The saved Halal setting is kept with the choices:
// if it has changed since (Settings > Diet and allergies), the setting wins again, so a diet chosen later is never ignored on Eat out.

export interface EatOutChoices {
  moreOpen: boolean;
  fullOnly: boolean;
  halalOnly: boolean;
}

/** What this tab keeps: the choices, and the saved Halal setting they were made under. */
export interface StoredEatOutChoices extends EatOutChoices {
  savedHalal: boolean;
}

export const EAT_OUT_CHOICES_KEY = "mm.eatOutChoices";

/** What was stored, checked: anything that isn't four true/false answers is nothing stored. */
export function parseEatOutChoices(raw: string | null): StoredEatOutChoices | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { moreOpen, fullOnly, halalOnly, savedHalal } = v;
    if (typeof moreOpen !== "boolean" || typeof fullOnly !== "boolean" || typeof halalOnly !== "boolean" || typeof savedHalal !== "boolean") return null;
    return { moreOpen, fullOnly, halalOnly, savedHalal };
  } catch {
    return null;
  }
}

/**
 * The choices as they start: what this tab kept, else none of them with Halal (and the row open) as the person's saved setting says. When the saved
 * setting has changed since the choices were kept, Halal follows the setting again (and the row opens if it is now on); the other choices are kept.
 */
export function startingChoices(stored: StoredEatOutChoices | null, savedHalal: boolean): EatOutChoices {
  if (!stored) return { moreOpen: savedHalal, fullOnly: false, halalOnly: savedHalal };
  const { moreOpen, fullOnly, halalOnly } = stored;
  if (stored.savedHalal !== savedHalal) return { moreOpen: moreOpen || savedHalal, fullOnly, halalOnly: savedHalal };
  return { moreOpen, fullOnly, halalOnly };
}

/**
 * Eat out's choices for this tab. Read when the page is first built: Eat out shows a spinner until it has hydrated, so what is restored is never seen as a
 * mismatch with the server's page (the numbers finder does the same), and coming Back shows the list as it was from the first frame.
 */
export function useEatOutChoices(savedHalal: boolean): [EatOutChoices, (change: Partial<EatOutChoices>) => void] {
  const [choices, setChoices] = useState<EatOutChoices>(() => {
    let stored: StoredEatOutChoices | null = null;
    try {
      stored = parseEatOutChoices(sessionStorage.getItem(EAT_OUT_CHOICES_KEY));
    } catch { /* storage blocked, or the server: nothing kept */ }
    return startingChoices(stored, savedHalal);
  });
  const change = (patch: Partial<EatOutChoices>) => {
    const next = { ...choices, ...patch };
    setChoices(next);
    try {
      sessionStorage.setItem(EAT_OUT_CHOICES_KEY, JSON.stringify({ ...next, savedHalal } satisfies StoredEatOutChoices));
    } catch { /* not remembered, still works */ }
  };
  return [choices, change];
}
