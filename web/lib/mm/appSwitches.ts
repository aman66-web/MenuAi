import { createStore } from "./persist";

// The remote switches file (public/app-switches.json; the onboarding meeting of 19 November 2026, question 8, approved by the founder that day: "Do whatever you
// think is best"). The packed iPhone app reads it from numbite.com on every launch, like the logo take-down list (public/logos/hidden.json), so a switch can change
// an app already installed without a new build or a second App Review. Today it holds one switch: "signInOptional", the fallback if App Review objects to everyone
// signing in (guideline 5.1.1(v)). It can only ever make sign-in optional, never stricter: a build with sign-in optional (NEXT_PUBLIC_SIGN_IN_REQUIRED=0) stays
// optional whatever the file says. Pure apart from the device's copy of the last file read (never synced, never sent: it holds no personal data).

export interface AppSwitches {
  /** true: sign-in is optional, as it was before 17 November 2026 (CLAUDE.md rule 4's fallback). Only a literal true counts. */
  signInOptional: boolean;
}

/** The file as shipped, and what the app assumes before it has read one. */
export const NO_SWITCHES: AppSwitches = { signInOptional: false };

/** What the file (or the device's copy) holds, tidied: anything but a literal true (missing, "true", 1, a broken file) leaves the build's own setting. */
export function sanitizeAppSwitches(raw: unknown): AppSwitches {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { signInOptional: r.signInOptional === true };
}

/** Whether everyone must sign in: the build's own setting (SIGN_IN_REQUIRED), which the file can relax but never tighten. */
export function signInRequiredWith(build: boolean, switches: AppSwitches): boolean {
  return build && !switches.signInOptional;
}

/**
 * The live file's answer replaces the device's copy (so turning the switch back off on numbite.com applies too). The copy packed inside the app may be older than the
 * live file, so when only the packed copy could be read it may make sign-in optional but never undo a live answer that did.
 */
export function mergeSwitches(current: AppSwitches, read: AppSwitches, fromLiveFile: boolean): AppSwitches {
  return fromLiveFile ? read : { signInOptional: current.signInOptional || read.signInOptional };
}

/** The key of the device's copy (the layout's first-paint gate reads it too, lib/mm/tour.ts). */
export const APP_SWITCHES_KEY = "mm.v1.appSwitches";

/** The last switches read on this device, so the answer holds offline and from the first paint of the next launch. */
export const appSwitchesStore = createStore<AppSwitches>(APP_SWITCHES_KEY, NO_SWITCHES, { sanitize: sanitizeAppSwitches });
