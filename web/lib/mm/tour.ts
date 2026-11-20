// The welcome tour on a first plain launch (founder 2026-11-17, docs/PROGRESS.md). Instant utility first still holds for links (13 Nov 2026): a shared list,
// a friend's invite, a restaurant or a dish opens at once. Only a plain start of the app (the iPhone app's start page, or numbite.com/app with nothing after
// it) by someone who hasn't set up, hasn't said "Not now", hasn't seen the tour on this phone and has nothing of their own stored yet goes to the welcome
// screens first. Where everyone signs in, sign-in comes after "Your daily targets" (the onboarding meeting of 19 November, question 1, approved that day), so
// someone can see the tour and leave during the questions or at the sign-in screen: a plain start then goes back to the welcome screens too (not to a bare
// sign-in screen), as long as setup isn't finished and nobody is signed in on this phone. Pure, importing only constants: the app's layout runs
// TOUR_GATE_SCRIPT before the first paint, and the unit tests run the same script.

import { APP_SWITCHES_KEY } from "./appSwitches";
import { SIGN_IN_REQUIRED } from "./config";

/** The tour's version. Raising it shows the tour again, once, to everyone who saw an older one. */
export const TOUR_VERSION = 1;

/** Founder decision: the tour also starts on the website's plain /app (false: the gate runs only in the iPhone app). */
export const AUTO_TOUR_ON_WEBSITE = true;

/** The person's own things. Something in any of these means the app has been used here already, so the tour never starts by itself. */
export const OWN_DATA_KEYS: readonly string[] = ["mm.v1.log", "mm.v1.saved", "mm.v1.favorites", "mm.v1.shopping", "mm.v1.savedRecipes", "mm.v1.myRecipes", "mm.v1.water", "mm.v1.reminders"];

/** The app's start page: /app, /app/ or the exported /app/index.html. */
const PLAIN = /^\/app\/?(index\.html)?$/;
/** Home itself (what the router reports for the start page). */
const HOME = /^\/app\/?$/;

/** A plain start of the app: its start page with no "?" and no "#". Any query (a creator's ?ref= too) or fragment means a link was opened, so no tour. */
export function isPlainLaunch(pathname: string, search: string, hash: string): boolean {
  return PLAIN.test(pathname) && search === "" && hash === "";
}

/**
 * A reader for tourDue: the `data` of a key's { v, data } envelope, undefined when the key is missing or holds no envelope. Text that isn't JSON throws, and the
 * gate then does nothing (someone whose storage is in a bad state is never sent round in circles).
 */
export function storedData(getItem: (key: string) => string | null): (key: string) => unknown {
  return (key) => {
    const z: unknown = JSON.parse(getItem(key) || "null");
    return z && typeof z === "object" ? (z as { data?: unknown }).data : undefined;
  };
}

/** Who is signed in on this phone: the app's record of the account and the iPhone app's own copy of the session (app/app/_lib/account.ts). Signed out, both hold null. */
export const SIGNED_IN_KEYS: readonly string[] = ["mm.v1.account", "mm.v1.session"];

/**
 * Whether the tour is due: not set up, the setup card not put off with "Not now", nothing of the person's own stored, and either the tour not seen on this phone or,
 * where everyone signs in (`signInRequired`: SIGN_IN_REQUIRED, unless the switches file on numbite.com has made sign-in optional), nobody signed in here yet: someone
 * who saw the tour and left during the questions, or at the sign-in screen, comes back to the welcome screens rather than a bare sign-in screen.
 */
export function tourDue(read: (key: string) => unknown, signInRequired = false): boolean {
  const s = read("mm.v1.settings");
  if (s && typeof s === "object") {
    const { hasCompletedOnboarding, dismissedTargetsCard } = s as { hasCompletedOnboarding?: unknown; dismissedTargetsCard?: unknown };
    if (hasCompletedOnboarding || dismissedTargetsCard) return false;
  }
  const ownData = OWN_DATA_KEYS.some((key) => {
    const v = read(key);
    return Array.isArray(v) && v.length > 0;
  });
  if (ownData) return false;
  if ((Number(read("mm.v1.tour")) || 0) < TOUR_VERSION) return true;
  if (!signInRequired) return false;
  const switches = read(APP_SWITCHES_KEY);
  if (switches && typeof switches === "object" && (switches as { signInOptional?: unknown }).signInOptional === true) return false;
  return !SIGNED_IN_KEYS.some((key) => {
    const v = read(key);
    return !!v && typeof v === "object";
  });
}

/**
 * The iPhone app's one-time free-trial offer (_components/TrialOffer.tsx). The onboarding meeting of 19 November (question 5, approved that day): never straight
 * after setup, where the first free moment became an offer to pay. Someone who taps a Premium feature first meets the same offer in the paywall it opens (with the
 * free-trial banner), so the sheet never follows a paywall already seen (`paywallSeen`). Otherwise it opens once, on Home, on a later day than the first day the app
 * was used on this phone (`firstDay`, `today`: "YYYY-MM-DD", lib/mm/ratingPrompt.ts) and not in the visit where setup or "Look around first" just finished
 * (`setUpThisVisit`). In the app only, once the person has set up or has seen the tour, never shown before and not while paid access is on.
 */
export function trialOfferDue(x: {
  native: boolean;
  onboarded: boolean;
  tourSeen: boolean;
  shown: boolean;
  paid: boolean;
  pathname: string;
  firstDay: string | null;
  today: string;
  paywallSeen: boolean;
  setUpThisVisit: boolean;
}): boolean {
  if (!x.native || !(x.onboarded || x.tourSeen) || x.shown || x.paid || x.paywallSeen || x.setUpThisVisit) return false;
  return x.firstDay !== null && x.firstDay < x.today && HOME.test(x.pathname);
}

/**
 * The gate, as an inline script for the app's layout (after the text size is applied), for a build where everyone signs in (`signInRequired`) or not. Built from
 * the same constants as isPlainLaunch and tourDue, never from a function's source text. Storage that is blocked or throws, or holds text that isn't JSON, does
 * nothing, so it can never loop.
 */
export function tourGateScript(signInRequired: boolean): string {
  const seen = signInRequired
    ? `{var w=r(${JSON.stringify(APP_SWITCHES_KEY)});if(w&&typeof w==="object"&&w.signInOptional===true)return;var a=${JSON.stringify(SIGNED_IN_KEYS)};for(var j=0;j<a.length;j++){var u=r(a[j]);if(u&&typeof u==="object")return}}`
    : "return;";
  return `try{(function(){var l=location;if(!/${PLAIN.source}/.test(l.pathname)||l.search!==""||l.hash!=="")return;var r=function(k){var z=JSON.parse(localStorage.getItem(k)||"null");return z&&typeof z==="object"?z.data:void 0};var s=r("mm.v1.settings");if(s&&typeof s==="object"&&(s.hasCompletedOnboarding||s.dismissedTargetsCard))return;var o=${JSON.stringify(OWN_DATA_KEYS)};for(var i=0;i<o.length;i++){var d=r(o[i]);if(Array.isArray(d)&&d.length>0)return}if((Number(r("mm.v1.tour"))||0)>=${TOUR_VERSION})${seen}l.replace("/app/welcome")})()}catch(e){}`;
}

/** This build's gate (SIGN_IN_REQUIRED; the switches file is read by the script itself). */
export const TOUR_GATE_SCRIPT = tourGateScript(SIGN_IN_REQUIRED);
