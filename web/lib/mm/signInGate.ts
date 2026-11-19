// When the app shows the sign-in screen instead of a page (founder 2026-11-17: everyone signs in; lib/mm/config.ts SIGN_IN_REQUIRED). Pure and unit-tested.

/** Pages that stay open without an account: the welcome screen (it sends "Get started" through sign-in itself) and the offline page. */
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
