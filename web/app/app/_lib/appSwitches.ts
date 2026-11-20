"use client";

import { APP_BUILD, APP_SWITCHES_PATH, REMOTE_BASE, SIGN_IN_REQUIRED } from "@/lib/mm/config";
import { appSwitchesStore, mergeSwitches, sanitizeAppSwitches, signInRequiredWith } from "@/lib/mm/appSwitches";
import { useStore } from "./hooks";

// The remote switches (public/app-switches.json; lib/mm/appSwitches.ts), read once per launch exactly like the taken-down logos (_lib/hiddenLogos.ts): the website
// reads its own copy; the iPhone app asks the live website first (so the switch reaches an app already installed) and falls back to the copy packed inside it.
// Offline, the device keeps the last answer it read.

let started = false;

export function refreshAppSwitches(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const live = APP_BUILD && REMOTE_BASE ? `${REMOTE_BASE}${APP_SWITCHES_PATH}` : null;
  void (async () => {
    for (const url of live ? [live, APP_SWITCHES_PATH] : [APP_SWITCHES_PATH]) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const read = sanitizeAppSwitches(await res.json());
        // the website's own file is the live one; in the app only the numbite.com copy is
        appSwitchesStore.update((current) => mergeSwitches(current, read, !live || url === live));
        return;
      } catch {
        /* offline or blocked: keep the last answer */
      }
    }
  })();
}

/** Whether everyone must sign in on this device now: this build's SIGN_IN_REQUIRED, unless the switches file has made it optional. Re-renders when that changes. */
export function useSignInRequired(): boolean {
  return signInRequiredWith(SIGN_IN_REQUIRED, useStore(appSwitchesStore));
}

/** The same, read once (outside React). */
export function signInRequiredNow(): boolean {
  return signInRequiredWith(SIGN_IN_REQUIRED, appSwitchesStore.get());
}
