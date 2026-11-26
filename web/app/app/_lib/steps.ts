"use client";

import { useEffect, useSyncExternalStore } from "react";
import { hasNative, nativeSteps, type StepsAnswer } from "@/lib/mm/native";
import type { DaySteps, StepPermission } from "@/lib/mm/steps";
import { stepsStore } from "@/lib/mm/stores";

// The web half of step counting (lib/mm/steps.ts). The phone counts the steps; this asks it for the last seven days when a screen that shows them opens, when
// the app comes back to the front, and every few minutes while one is open. The answer lives in memory only, for this visit: it is never stored, synced or
// sent. The phone's own permission question is asked only when the person taps "Turn on step counting" (turnOnSteps), never at launch.

export interface StepsSnapshot {
  /** What the phone said; null until it has answered once (nothing is shown until then). */
  permission: StepPermission | null;
  /** The days the phone counted, oldest first (empty unless permission is "granted"). */
  days: readonly DaySteps[];
  /** The phone's permission question is open. */
  asking: boolean;
}

const START: StepsSnapshot = { permission: null, days: [], asking: false };
let snap: StepsSnapshot = START;
const listeners = new Set<() => void>();

function set(patch: Partial<StepsSnapshot>): void {
  snap = { ...snap, ...patch };
  for (const l of [...listeners]) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The snapshot after one "steps.get" answer. "failed" (no answer in time) changes nothing. */
function apply(answer: StepsAnswer): void {
  switch (answer.kind) {
    case "days":
      set({ permission: "granted", days: answer.days });
      break;
    case "notDetermined":
      set({ permission: "notDetermined", days: [] });
      break;
    case "denied":
      set({ permission: "denied", days: [] });
      break;
    case "unavailable":
      set({ permission: "unavailable", days: [] });
      break;
    case "failed":
      break;
  }
}

let inFlight: Promise<void> | null = null;

/** Ask the phone again (never shows its permission question). On the website: "unavailable" at once. */
export function refreshSteps(): Promise<void> {
  if (!hasNative()) {
    if (snap.permission !== "unavailable") set({ permission: "unavailable", days: [] });
    return Promise.resolve();
  }
  if (snap.asking) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      if (stepsStore.get().on) {
        const answer = await nativeSteps.read(false);
        if (!snap.asking) apply(answer);
      } else {
        const permission = await nativeSteps.status();
        if (!snap.asking && permission !== "failed") set({ permission, days: [] });
      }
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** "Turn on step counting": remembered on this device, then the phone asks its own question (the first time) and the days come back. */
export async function turnOnSteps(): Promise<void> {
  stepsStore.update((s) => ({ ...s, on: true }));
  if (!hasNative()) return;
  set({ asking: true });
  try {
    apply(await nativeSteps.read(true));
  } finally {
    set({ asking: false });
  }
}

/** "Stop counting steps": off on this device (the phone's own permission stays as the person set it), and the days on screen go. */
export function turnOffSteps(): void {
  stepsStore.update((s) => ({ ...s, on: false }));
  set({ days: [] });
  void nativeSteps.stop();
  void refreshSteps();
}

/** "Not now" on Home's offer: the card doesn't come back (Settings › Steps still turns counting on). */
export function dismissStepsOffer(): void {
  stepsStore.update((s) => ({ ...s, dismissed: true, on: false }));
}

/** How often an open screen asks again (today's number moves while you walk). */
const REFRESH_MS = 2 * 60_000;

/** The phone's steps, kept fresh while the calling screen is open: on mount, when step counting is turned on or off, back at the front, and every few minutes. */
export function useSteps(): StepsSnapshot {
  const value = useSyncExternalStore(subscribe, () => snap, () => START);
  const on = useSyncExternalStore(stepsStore.subscribe, () => stepsStore.get().on, () => false);
  useEffect(() => {
    void refreshSteps();
    const back = () => {
      if (document.visibilityState === "visible") void refreshSteps();
    };
    const timer = setInterval(back, REFRESH_MS);
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [on]);
  return value;
}
