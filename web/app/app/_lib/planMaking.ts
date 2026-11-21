"use client";

import type { Store } from "@/lib/mm/persist";

// A plan Pip is still making, wherever the person goes (founder 2026-11-21: "If the person clicks off their plan will still be made like if they go into a
// different screen they can still see their plan progress is loading at the top of the screen like a notification and will say when ready"). Meal plan's
// make() starts it and finishes it; Pip's request is no longer stopped when the plan screen closes (only by the next plan); PlanMakingBanner shows it at the
// top of every screen but "Making your plan" itself. Kept in memory only: the phone's own week is saved before Pip starts, so a closed app still has a plan.

export interface PlanMaking {
  /** Which plan this is (a newer one replaces it). */
  run: number;
  state: "pip" | "ready";
  /** When Pip started (ms), for the bar. */
  started: number;
  /** Pip couldn't use the answers this time: the week is the phone's own. */
  pipMissed?: boolean;
}

/** A store kept in memory only (never written to the phone: nothing for Clear data to forget). */
function memoryStore<T>(initial: T): Store<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  const set = (next: T) => {
    if (Object.is(next, current)) return;
    current = next;
    for (const l of listeners) l();
  };
  return {
    get: () => current,
    getServerSnapshot: () => initial,
    set,
    update: (fn) => set(fn(current)),
    reset: () => set(initial),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const planMakingStore = memoryStore<PlanMaking | null>(null);
/** "Making your plan" is on screen: the notice stays away while it is. */
export const planMakingWatchedStore = memoryStore<boolean>(false);

let runs = 0;
let inFlight: AbortController | null = null;

/** A new plan with Pip: the previous one still on its way is stopped. Returns the plan's number and the signal its request goes with. */
export function startPlanMaking(): { run: number; signal: AbortSignal } {
  inFlight?.abort();
  inFlight = new AbortController();
  const run = ++runs;
  planMakingStore.set({ run, state: "pip", started: Date.now() });
  return { run, signal: inFlight.signal };
}

/** Pip's week is back and checked (or the phone's week stands): "Your meal plan is ready". */
export function finishPlanMaking(run: number, pipMissed: boolean): void {
  const now = planMakingStore.get();
  if (now?.run === run) planMakingStore.set({ ...now, state: "ready", ...(pipMissed ? { pipMissed: true } : {}) });
}

/** Seen (the week opened, or the notice closed). */
export function clearPlanMaking(): void {
  planMakingStore.set(null);
}
