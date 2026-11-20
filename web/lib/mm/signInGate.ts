// When the app shows the sign-in screen instead of a page (founder 2026-11-17: everyone signs in; lib/mm/config.ts SIGN_IN_REQUIRED). Pure and unit-tested.

import { tk } from "./i18n";
import { canonical } from "./syncMerge";
import { sanitizeSettings, type UserSettings } from "./user-data";
import { sanitizeFirstDish, sanitizeRecipeId, type FirstDish } from "./welcomeSteps";

/** Pages that stay open without an account: the welcome screens (they ask for the account themselves, as their last step) and the offline page. */
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

// Where everyone signs in, the account is the welcome screens' last step: "Save your plan" (founder, 20 November afternoon; that morning "Save your goal and numbers: make your free account"), Step 11 of 11, after the three feature
// screens (a restaurant's dishes, two recipes from the person's shop, their week planned) and straight before Home (the onboarding redesign meeting of
// 20 November 2026, approved by the founder; it refines the 19 November order, which asked straight after "Your daily targets" with the shops after it). Step
// 3's "Skip setup and make my account" jumps to it. After signing in nothing more is asked: straight to Home. A run that starts signed in (a Settings rerun, or
// an account not set up yet) has no account step. The cover's "Already have an account? Sign in" opens the same screen at once, headed "Welcome back. Sign in":
// an account already set up goes straight to the app with its own settings, one not set up yet goes on into the welcome steps as a signed-in run of 10. Nobody
// reaches a page of the app unsigned. The rule for what was typed before signing in: a brand-new account keeps the goal, the targets, the foods avoided and the
// shops typed on this phone; an account that already has its own settings keeps them (the account's win, lib/mm/sync.ts reconcileValue), and Home's Start here
// dish and recipe are checked again against them. Age, height, weight, sex and activity are never part of it: they live in the welcome page's memory only and
// are never stored or sent (CLAUDE.md rule 4). "Look around first" and its "Make your free account" reason are gone (it only led to this same screen).

/** Why the welcome screens show the sign-in screen: their last step (setup), or the cover's "Already have an account? Sign in" (returning). */
export type SignInReason = "setup" | "returning";
export const SIGN_IN_REASONS: readonly SignInReason[] = ["setup", "returning"];

/** The sign-in screen's heading for each way in; a page of the app, reached signed out, keeps "Sign in or sign up" (founder 2026-11-18). The last welcome step
 *  says "Save your plan" (founder 2026-11-20, "short and simple"; until then "Save your goal and numbers: make your free account"). */
export const SIGN_IN_HEADING: Readonly<Record<SignInReason | "page", string>> = {
  setup: tk("Save your plan"),
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
  /** the account was already set up: straight to the app, with its own settings ("Signed in. Your saved settings are back.") */
  | { to: "app" }
  /** the cover's link, an account not set up yet: on into the welcome steps, as a signed-in run of 10 */
  | { to: "tour" }
  /** the last step: finish and go to Home, first putting back what was typed if signing in emptied this phone (`restore`, only the keys that differ) */
  | { to: "home"; restore: TypedSetup };

/**
 * What follows the welcome screens' sign-in, once the sync it started has settled (app/app/_lib/account.ts signInSettled). `setUp`: the settings now on this phone
 * say setup was finished (the account's own, arrived with the sync). `cleared`: a different person had signed in on this phone before, so signing in emptied its
 * stores (lib/mm/sync.ts prepareFor) and with them what was just typed. `settingsSynced`: the sync settled with settings that came from the account (after
 * `cleared`, nothing on this phone could have sent any). Otherwise the sync engine has already kept what was typed for a new account, and an account's own
 * settings have already won.
 */
export function afterSignIn(x: { reason: SignInReason; setUp: boolean; cleared: boolean; settingsSynced: boolean; current: UserSettings; typed: TypedSetup | null }): AfterSignIn {
  if (x.setUp) return { to: "app" };
  if (x.reason === "returning") return { to: "tour" };
  const restore: Record<string, unknown> = {};
  if (x.cleared && !x.settingsSynced && x.typed) {
    for (const k of TYPED_SETUP_KEYS) if (k in x.typed && canonical(x.typed[k]) !== canonical(x.current[k])) restore[k] = x.typed[k];
  }
  return { to: "home", restore: restore as TypedSetup };
}

/**
 * The website's Apple and Google sign-in leaves the page and comes back to it (with ?signin=ok), so the welcome screens note in this tab's session storage why the
 * sign-in screen was showing, what was typed (TypedSetup only: never the answers about the person's body) and the two navigation hints for Home's Start here card
 * (the recipe chosen on step 5 and the restaurant dish left showing on step 3; lib/mm/welcomeSteps.ts). Read back, it is checked like anything stored. A note
 * from before 20 November that says "look" no longer reads: that tab simply lands on the cover.
 */
export interface SignInResume {
  reason: SignInReason;
  typed: TypedSetup | null;
  firstRecipeId?: string;
  firstDish?: FirstDish;
}
export const SIGN_IN_RESUME_KEY = "mm.welcomeSignIn";

export function sanitizeResume(raw: unknown): SignInResume | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { reason?: unknown; typed?: unknown; firstRecipeId?: unknown; firstDish?: unknown };
  if (!SIGN_IN_REASONS.includes(r.reason as SignInReason)) return null;
  const typed = r.typed && typeof r.typed === "object" ? typedSetup(sanitizeSettings(r.typed)) : null;
  const firstRecipeId = sanitizeRecipeId(r.firstRecipeId);
  const firstDish = sanitizeFirstDish(r.firstDish);
  return { reason: r.reason as SignInReason, typed, ...(firstRecipeId ? { firstRecipeId } : {}), ...(firstDish ? { firstDish } : {}) };
}

// ------------------------------------------------------------------------------------------------ the email code screens

// "Continue with email" is two screens of one question each (founder 2026-11-20, from his reference apps): "What's your email?" with one big box, then "Enter the
// code" with six big boxes that go on by themselves when the sixth digit is in, and "Send it again" once the wait below is over (_components/SignIn.tsx).

/** The code in the email is 6 digits (Supabase's email code). */
export const CODE_LENGTH = 6;
/** Supabase sends an address one email code a minute (docs/ACCOUNTS_SYNC.md "Rate limits"), so "Send it again" is offered after this many seconds. */
export const CODE_RESEND_SECONDS = 60;

/** Whether what was typed looks like an email address: something@something.something, with no spaces. */
export function looksLikeEmail(s: string): boolean {
  return /^\S+@\S+\.\S+$/.test(s.trim());
}

/**
 * The code's digits from whatever went into the boxes: typed, filled in by the phone from Mail, or pasted ("123 456" gives "123456"; a pasted sentence with one
 * run of six digits in it gives that run). Never more than six. Wide digits from some keyboards count as digits.
 */
export function codeDigits(raw: string): string {
  const s = raw.normalize("NFKC");
  const digits = s.replace(/\D/g, "");
  if (digits.length > CODE_LENGTH) {
    const run = /(?:^|\D)(\d{6})(?!\d)/.exec(s);
    if (run) return run[1]!;
  }
  return digits.slice(0, CODE_LENGTH);
}

/** Whole seconds until "Send it again" is offered, for a code sent at `sentAt` (ms); 0 once the wait is over. */
export function resendWait(sentAt: number, now: number): number {
  return Math.min(CODE_RESEND_SECONDS, Math.max(0, CODE_RESEND_SECONDS - Math.floor((now - sentAt) / 1000)));
}
