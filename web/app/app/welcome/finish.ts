// The welcome screens' one finish (the onboarding redesign meeting of 20 November 2026, build list 8; approved by the founder): every ending goes through here,
// after signing in at step 11, after "Not now" (where sign-in is optional), at the end of a run that started signed in, and for an account already set up that
// signed in from the cover. Relative imports (not "@/"), so the unit tests can load it (tests/welcomeFinish.test.ts).
//
// What it does, in this order:
// - holds the free-trial offer for the rest of this visit (never straight after setup: lib/mm/tour.ts trialOfferDue's setUpThisVisit);
// - marks setup finished (hasCompletedOnboarding, trialOfferDue's onboarded) and the welcome screens finished on this phone (mm.v1.tour at TOUR_VERSION,
//   trialOfferDue's tourSeen), so a plain launch never opens them again by itself;
// - switches Pip's tips on for the real screens, after the showcases (lib/mm/coach.ts coachAfterWelcome: no stored afterTour), except after a Settings rerun or a
//   returning account, which never get tips;
// - leaves Home its one toast and, for a new setup, the one-time Start here card with the two navigation hints (the restaurant dish left showing on step 3 and
//   the recipe chosen on step 5; lib/mm/homePages.ts withArrival). Local only, never synced;
// - forgets the welcome progress note (mm.v1.welcomeProgress).
// Nothing of the person's own (their log, favourites, lists or saved recipes) is written: only the settings, these marks and the two local notes.

import { coachAfterWelcome } from "../../../lib/mm/coach";
import { withArrival, type HomeArrival } from "../../../lib/mm/homePages";
import { coachStore, homePagesStore, tourStore, updateSettings } from "../../../lib/mm/stores";
import { TOUR_VERSION } from "../../../lib/mm/tour";
import { sanitizeFirstDish, sanitizeRecipeId, welcomeProgressStore, type FirstDish } from "../../../lib/mm/welcomeSteps";

/** How the welcome screens ended, which decides Home's toast, the Start here card and the tips. */
export type WelcomeEnding =
  /** signed in at step 11 with a brand-new account, or a run that started signed in by someone not set up yet */
  | "signedIn"
  /** signed in at step 11 with an account that was already set up (its own settings won) */
  | "signedInBack"
  /** the cover's "Already have an account? Sign in", with an account already set up: straight to Home with its own settings, no card and no tips */
  | "returning"
  /** "Not now" at step 11, where sign-in is optional */
  | "notNow"
  /** a Settings rerun ("Set up your plan again"): the toast only, no card and no tips */
  | "saved";

const TOAST: Readonly<Record<WelcomeEnding, HomeArrival>> = { signedIn: "signedIn", signedInBack: "signedInBack", returning: "signedInBack", notNow: "notNow", saved: "saved" };
/** The endings that get the Start here card and Pip's tips: a first setup on this phone. */
const FIRST_SETUP: readonly WelcomeEnding[] = ["signedIn", "signedInBack", "notNow"];

export interface FinishHints {
  firstRecipeId?: string | null;
  firstDish?: FirstDish | null;
}

/** What finishWelcome needs from the app: holding the trial offer (app/app/_components/TrialOffer.tsx holdTrialOfferThisVisit) and the time. */
export interface FinishDeps {
  holdTrialOffer: () => void;
  now?: Date;
}

/** The one finish (see the top of this file). The caller then goes to Home (router.replace("/app")). */
export function finishWelcome(ending: WelcomeEnding, hints: FinishHints, deps: FinishDeps): void {
  deps.holdTrialOffer();
  updateSettings({ hasCompletedOnboarding: true });
  tourStore.set(TOUR_VERSION);
  const first = FIRST_SETUP.includes(ending);
  if (first) coachStore.set(coachAfterWelcome(coachStore.get()));
  const firstRecipeId = first ? sanitizeRecipeId(hints.firstRecipeId) : null;
  const firstDish = first ? sanitizeFirstDish(hints.firstDish) : null;
  homePagesStore.set(withArrival(homePagesStore.get(), { toast: TOAST[ending], card: first, ...(firstRecipeId ? { firstRecipeId } : {}), ...(firstDish ? { firstDish } : {}) }, deps.now ?? new Date()));
  welcomeProgressStore.reset();
}
