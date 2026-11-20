// The welcome screens on a first plain launch (founder 2026-11-17, docs/PROGRESS.md). Instant utility first still holds for links (13 Nov 2026): a shared list,
// a friend's invite, a restaurant or a dish opens at once. Only a plain start of the app (the iPhone app's start page, or numbite.com/app with nothing after
// it) by someone who hasn't set up, hasn't said "Not now", hasn't finished the welcome screens on this phone and has nothing of their own stored yet goes to the
// welcome screens first. There is no tab tour any more (the onboarding redesign meeting of 20 November 2026, approved by the founder): the welcome screens show
// three features working with the person's own answers instead, and Pip's tips teach the real buttons on Home. mm.v1.tour now records that the welcome
// screens were finished on this phone (set by the welcome flow's one finish, with setup marked done); TOUR_VERSION 2 shows the new screens once to anyone who
// only saw the old tour and has still neither set up nor stored anything. Where everyone signs in, the account is the last welcome step, so someone can
// leave at any step: a plain start then goes back to the welcome screens' cover (with "Carry on from step {n}"), not to a bare sign-in screen, as long as setup
// isn't finished and nobody is signed in on this phone. Pure, importing only constants: the app's layout runs TOUR_GATE_SCRIPT before the first paint, and
// the unit tests run the same script and check it against tourDue.

import { APP_SWITCHES_KEY } from "./appSwitches";
import { SIGN_IN_REQUIRED } from "./config";

/**
 * The welcome screens' version (mm.v1.tour holds the version finished on this phone). Raising it shows the welcome screens again, once, on a plain launch, to
 * anyone who finished an older version but has neither set up nor stored anything of their own (tourDue): 2 is the onboarding redesign of 20 November 2026.
 */
export const TOUR_VERSION = 2;

/** Founder decision: the welcome screens also open by themselves on the website's plain /app (false: the gate runs only in the iPhone app). */
export const AUTO_TOUR_ON_WEBSITE = true;

/**
 * The person's own things. Something in any of these means the app has been used here already, so the welcome screens never open by themselves. The welcome
 * screens' own notes (mm.v1.welcomeProgress, Home's Start here note) are never among them: the welcome screens write nothing here before an account exists.
 */
export const OWN_DATA_KEYS: readonly string[] = ["mm.v1.log", "mm.v1.saved", "mm.v1.favorites", "mm.v1.shopping", "mm.v1.savedRecipes", "mm.v1.myRecipes", "mm.v1.water", "mm.v1.reminders"];

/** The app's start page: /app, /app/ or the exported /app/index.html. */
const PLAIN = /^\/app\/?(index\.html)?$/;
/** Home itself (what the router reports for the start page). */
const HOME = /^\/app\/?$/;

/** A plain start of the app: its start page with no "?" and no "#". Any query (a creator's ?ref= too) or fragment means a link was opened, so no welcome screens. */
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
 * Whether the welcome screens are due: not set up, the setup card not put off with "Not now", nothing of the person's own stored, and either the welcome screens
 * not finished on this phone (mm.v1.tour below TOUR_VERSION; someone who left at any step, signed in or not, comes back to the cover and its "Carry on") or,
 * where everyone signs in (`signInRequired`: SIGN_IN_REQUIRED, unless the switches file on numbite.com has made sign-in optional), nobody signed in here yet:
 * they come back to the welcome screens rather than a bare sign-in screen.
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
 * The iPhone app's one-time free-trial offer (_components/TrialOffer.tsx). The onboarding meeting of 19 November (question 5, approved that day), kept unchanged
 * by the redesign of 20 November: never straight after setup, where the first free moment became an offer to pay. Someone who taps a Premium feature first meets
 * the same offer in the paywall it opens (with the free-trial banner), so the sheet never follows a paywall already seen (`paywallSeen`). Otherwise it opens once,
 * on Home, on a later day than the first day the app was used on this phone (`firstDay`, `today`: "YYYY-MM-DD", lib/mm/ratingPrompt.ts) and not in the visit
 * where the welcome screens just finished (`setUpThisVisit`: their one finish holds the offer for the visit). In the app only, once the person has set up
 * (`onboarded`) or finished the welcome screens on this phone (`tourSeen`: mm.v1.tour at TOUR_VERSION or above), never shown before and not while paid access is on.
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
