// The welcome tour on a first plain launch (founder 2026-11-17, docs/PROGRESS.md). Instant utility first still holds for links (13 Nov 2026): a shared list,
// a friend's invite, a restaurant or a dish opens at once. Only a plain start of the app (the iPhone app's start page, or numbite.com/app with nothing after
// it) by someone who hasn't set up, hasn't said "Not now", hasn't seen the tour on this phone and has nothing of their own stored yet goes to the welcome
// screens first. Pure, with no imports: the app's layout runs TOUR_GATE_SCRIPT before the first paint, and the unit tests run the same script.

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

/** Whether the tour is due: not set up, the setup card not put off with "Not now", the tour not seen on this phone, and nothing of the person's own stored. */
export function tourDue(read: (key: string) => unknown): boolean {
  const s = read("mm.v1.settings");
  if (s && typeof s === "object") {
    const { hasCompletedOnboarding, dismissedTargetsCard } = s as { hasCompletedOnboarding?: unknown; dismissedTargetsCard?: unknown };
    if (hasCompletedOnboarding || dismissedTargetsCard) return false;
  }
  if ((Number(read("mm.v1.tour")) || 0) >= TOUR_VERSION) return false;
  return !OWN_DATA_KEYS.some((key) => {
    const v = read(key);
    return Array.isArray(v) && v.length > 0;
  });
}

/**
 * The iPhone app's one-time free-trial offer (_components/TrialOffer.tsx): in the app only, once the person has set up or has seen the tour, never shown before,
 * not while paid access is on, and on Home only (never in front of a recipe, a shared list or the welcome screens).
 */
export function trialOfferDue(x: { native: boolean; onboarded: boolean; tourSeen: boolean; shown: boolean; paid: boolean; pathname: string }): boolean {
  return x.native && (x.onboarded || x.tourSeen) && !x.shown && !x.paid && HOME.test(x.pathname);
}

/**
 * The gate, as an inline script for the app's layout (after the text size is applied). Built from the same constants as isPlainLaunch and tourDue, never from a
 * function's source text. Storage that is blocked or throws, or holds text that isn't JSON, does nothing, so it can never loop.
 */
export const TOUR_GATE_SCRIPT = `try{(function(){var l=location;if(!/${PLAIN.source}/.test(l.pathname)||l.search!==""||l.hash!=="")return;var r=function(k){var z=JSON.parse(localStorage.getItem(k)||"null");return z&&typeof z==="object"?z.data:void 0};var s=r("mm.v1.settings");if(s&&typeof s==="object"&&(s.hasCompletedOnboarding||s.dismissedTargetsCard))return;if((Number(r("mm.v1.tour"))||0)>=${TOUR_VERSION})return;var o=${JSON.stringify(OWN_DATA_KEYS)};for(var i=0;i<o.length;i++){var d=r(o[i]);if(Array.isArray(d)&&d.length>0)return}l.replace("/app/welcome")})()}catch(e){}`;
