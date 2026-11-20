// When the app shows the sign-in screen instead of a page (founder 2026-11-17: everyone signs in; lib/mm/config.ts SIGN_IN_REQUIRED). Pure and unit-tested.

import { tk } from "./i18n";
import { canonical } from "./syncMerge";
import { sanitizeSettings, type UserSettings } from "./user-data";

/** Pages that stay open without an account: the welcome screens (they ask for the account themselves, after "Your daily targets") and the offline page. */
const OPEN = /^\/app\/(?:welcome|offline)(?:\/|$)/;

export interface GateState {
  /** SIGN_IN_REQUIRED. */
  required: boolean;
  /** The page has read this device's storage (before that nobody is known, so nothing is decided). */
  hydrated: boolean;
  /** Someone is signed in on this device (the app's own record of who). */
  signedIn: boolean;
  /** The app is still finding out who is signed in (just back from Apple or Google, or the iPhone app holds a session it hasn't checked yet). */
  checking: boolean;
  pathname: string;
}

export type Gate = "open" | "wait" | "signIn";

/** "signIn": show the sign-in screen; "wait": show a spinner while the app finds out who is signed in; "open": show the page. */
export function signInGate(s: GateState): Gate {
  if (!s.required || OPEN.test(s.pathname) || s.signedIn) return "open";
  if (!s.hydrated || s.checking) return "wait";
  return "signIn";
}

// ------------------------------------------------------------------------------------------------ the welcome screens' sign-in step

// Where everyone signs in, the welcome screens ask for the account after "Your daily targets", titled "Save your plan: make your free account", still before Home
// (the onboarding meeting of 19 November, questions 1 and 4, approved by the founder that day: "Do whatever you think is best"). "Look around first" goes through
// the same screen ("Make your free account"), and the cover's "Already have an account? Sign in" opens it at once ("Welcome back. Sign in"). Nobody reaches a page
// of the app unsigned. The rule for what was typed before signing in: a brand-new account keeps the goal, the targets, the foods avoided and the shops just typed
// on this phone; an account that already has its own settings keeps them (the account's win, lib/mm/sync.ts reconcileValue). Age, height, weight, sex and
// activity are never part of it: they live in the welcome page's memory only and are never stored or sent (CLAUDE.md rule 4).

/** Why the welcome screens show the sign-in screen: after the targets (setup), from "Look around first" (look), or from the cover's link (returning). */
export type SignInReason = "setup" | "look" | "returning";
export const SIGN_IN_REASONS: readonly SignInReason[] = ["setup", "look", "returning"];

/** The sign-in screen's heading for each way in (question 4); a page of the app, reached signed out, keeps "Sign in or sign up" (founder 2026-11-18). */
export const SIGN_IN_HEADING: Readonly<Record<SignInReason | "page", string>> = {
  setup: tk("Save your plan: make your free account"),
  look: tk("Make your free account"),
  returning: tk("Welcome back. Sign in"),
  page: tk("Sign in or sign up"),
};

/** The settings typed in setup that a new account keeps: the goal, the four daily targets (and GLP-1's meal size), the foods avoided and the shops. */
export const TYPED_SETUP_KEYS = ["goal", "dailyCalories", "dailyProtein", "dailyCarbs", "dailyFat", "hasSetTargets", "glp1MealCap", "preferences", "shops"] as const satisfies readonly (keyof UserSettings)[];
export type TypedSetup = Partial<Pick<UserSettings, (typeof TYPED_SETUP_KEYS)[number]>>;

/** What was typed in setup, from the settings as saved on this phone (each key, even an empty one, so an emptied target is put back empty). */
export function typedSetup(s: UserSettings): TypedSetup {
  const out: Record<string, unknown> = {};
  for (const k of TYPED_SETUP_KEYS) out[k] = s[k];
  return out as TypedSetup;
}

export type AfterSignIn =
  /** the account was already set up: straight to the app, with its own settings */
  | { to: "app" }
  /** "Look around first": on to Home, where the setup card waits */
  | { to: "home" }
  /** the cover's link, an account not set up yet: on into the welcome screens */
  | { to: "tour" }
  /** after the targets: on to "Where do you shop?", first putting back what was typed if signing in emptied this phone (`restore`, only the keys that differ) */
  | { to: "shops"; restore: TypedSetup };

/**
 * What follows the welcome screens' sign-in, once the sync it started has settled (app/app/_lib/account.ts signInSettled). `setUp`: the settings now on this phone
 * say setup was finished (the account's own, arrived with the sync). `cleared`: a different person had signed in on this phone before, so signing in emptied its
 * stores (lib/mm/sync.ts prepareFor) and with them what was just typed. `settingsSynced`: the sync settled with settings that came from the account (after
 * `cleared`, nothing on this phone could have sent any). Otherwise the sync engine has already kept what was typed for a new account, and an account's own
 * settings have already won.
 */
export function afterSignIn(x: { reason: SignInReason; setUp: boolean; cleared: boolean; settingsSynced: boolean; current: UserSettings; typed: TypedSetup | null }): AfterSignIn {
  if (x.setUp) return { to: "app" };
  if (x.reason === "look") return { to: "home" };
  if (x.reason === "returning") return { to: "tour" };
  const restore: Record<string, unknown> = {};
  if (x.cleared && !x.settingsSynced && x.typed) {
    for (const k of TYPED_SETUP_KEYS) if (k in x.typed && canonical(x.typed[k]) !== canonical(x.current[k])) restore[k] = x.typed[k];
  }
  return { to: "shops", restore: restore as TypedSetup };
}

/**
 * The website's Apple and Google sign-in leaves the page and comes back to it (with ?signin=ok), so the welcome screens note in this tab's session storage why the
 * sign-in screen was showing and what was typed (TypedSetup only: never the answers about the person's body). Read back, it is checked like anything stored.
 */
export interface SignInResume {
  reason: SignInReason;
  typed: TypedSetup | null;
}
export const SIGN_IN_RESUME_KEY = "mm.welcomeSignIn";

export function sanitizeResume(raw: unknown): SignInResume | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { reason?: unknown; typed?: unknown };
  if (!SIGN_IN_REASONS.includes(r.reason as SignInReason)) return null;
  const typed = r.typed && typeof r.typed === "object" ? typedSetup(sanitizeSettings(r.typed)) : null;
  return { reason: r.reason as SignInReason, typed };
}
