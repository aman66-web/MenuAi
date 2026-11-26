// The welcome steps: their order, the counter behind the bar, Back, the jumps forward and carrying on after a relaunch. Pure and unit-tested
// (tests/welcomeSteps.test.ts); the screens are app/app/welcome.
//
// Onboarding in eight screens (founder, 20 November 2026, 12:21-12:37: "one question a screen", far fewer words, pictures over text), then the account:
//    1 goal      What's your goal?            (big tiles; top-right Skip)
//    2 avoid     Anything you avoid?          (diets as picture tiles, allergies as chips; top-right Skip)
//    3 shops     Where do you shop?           (the shops' logos; top-right Skip)
//    4 recipes   Recipes from {shop}          (two of our recipes priced there: tap one to cook first)
//    5 about     About you                    (sex, age, height and weight on one screen; top-right Skip skips 5 and 6)
//    6 active    How active are you?          (tiles; top-right Skip skips it too)
//    7 plan      Your plan                    (daily calories and protein, the week as pictures, its shopping, restaurant dishes)
//    8 colours   Pick your colours            (founder 2026-11-26: "at the end of the onboarding ... they then can pick a color scheme, and the default one's the
//                                              one it's on now"; today's Lime is ticked, a tap recolours the app at once; lib/mm/colourSchemes.ts)
//    9 save      the account (the sign-in screen; CLAUDE.md rule 4)
// A run that starts signed in (a Settings rerun, an account not set up yet that signed in from the cover, someone who signed in at a page) has no account step
// and step 8's button goes to Home. The run's steps are fixed before step 1 and never change; the bar only moves forward on a jump: Skip on 5 or 6
// (and an age under 18) goes to 7. Back goes to the last screen actually shown. No "Step n of N" is written on screen (the bar alone); a screen reader still
// hears it with each headline.
//
// The step reached and the two navigation hints (the restaurant dish first in step 7's row, the recipe chosen on step 4) are kept on this phone in
// mm.v1.welcomeProgress, so a plain launch reopens the cover with "Carry on from step {n}" (step 5 if they left during the questions about the person, whose
// answers are never kept), and the iPhone app's trip to Mail for the email code comes back to the account step with nothing lost. That key is local only: not
// one of the person's own stores (lib/mm/tour.ts OWN_DATA_KEYS, so it never stops the welcome screens opening), never synced (lib/mm/syncStores.ts), not
// emptied by a sign-in (lib/mm/sync.ts prepareFor resets only the synced and listed local stores), and removed when the welcome screens finish and by Settings ›
// Clear everything. The answers about the person's body are never part of it. A note written by the eleven-step screens before 20 November is read in the
// new steps' terms (LEGACY_STEPS).
// The note also says whether a goal was chosen on step 1 (so Back to step 1 after "Carry on" shows it ticked), and "Carry on" past the questions about the
// person marks their answers as gone (bodyGone), which is not the same as skipping them: the targets worked out from them before are the person's own.

import { createStore, type KeyValueStorage, type Store } from "./persist";

export const WELCOME_STEPS = ["goal", "avoid", "shops", "recipes", "about", "active", "plan", "colours", "save"] as const;
export type WelcomeStepId = (typeof WELCOME_STEPS)[number];

/** The questions about the person (sex, age, height and weight; activity): skipped together, and never kept. */
export const BODY_STEPS: readonly WelcomeStepId[] = ["about", "active"];
/** The question screens whose top-right "Skip" means "skip this question". */
export const QUESTION_STEPS: readonly WelcomeStepId[] = ["goal", "avoid", "shops"];
/** Every screen with a top-right Skip: the three questions (skip this one) and the two about the person (skip both, on to Your plan). */
export const SKIP_STEPS: readonly WelcomeStepId[] = [...QUESTION_STEPS, ...BODY_STEPS];
/** The screens that show the app working: no top-right pill, and their button is always enabled. */
export const FEATURE_STEPS: readonly WelcomeStepId[] = ["recipes", "plan"];

export const isWelcomeStep = (x: unknown): x is WelcomeStepId => typeof x === "string" && (WELCOME_STEPS as readonly string[]).includes(x);

/** One run of the welcome steps, fixed before step 1. */
export interface WelcomeRun {
  /** Someone was signed in when the run began: no account step. */
  readonly signedIn: boolean;
  /** The steps, in order (9, or 8 without "save"). */
  readonly steps: readonly WelcomeStepId[];
  /** How many segments the bar has (and N in the "Step n of N" a screen reader hears). */
  readonly total: number;
}

/** The run for someone signed in, or not, when it starts. Sign-in during the run (the account step, or the cover's link) never changes it. */
export function startRun(signedInAtStart: boolean): WelcomeRun {
  const steps = signedInAtStart ? WELCOME_STEPS.filter((s) => s !== "save") : [...WELCOME_STEPS];
  return Object.freeze({ signedIn: signedInAtStart, steps: Object.freeze(steps), total: steps.length });
}

/** A step's place among the run's steps (n from 1), or null for a step the run doesn't have ("save" in a signed-in run). */
export function stepCounter(run: WelcomeRun, step: WelcomeStepId): { step: number; total: number } | null {
  const i = run.steps.indexOf(step);
  return i < 0 ? null : { step: i + 1, total: run.total };
}

/** What has been answered so far that changes which screens are shown (never the answers themselves). */
export interface WelcomeAnswers {
  /** Skip was used on About you or How active are you?, or (after a relaunch) the body answers are gone: Your plan has the starting numbers, and Back from it
   *  goes to About you. */
  bodySkipped: boolean;
  /** The age typed on About you is under 18: nothing is worked out, so how active isn't asked. */
  under18: boolean;
  /** Set only by resumeAt: the run carried on past the questions about the person after a relaunch, so their answers are gone (bodySkipped is set too), but
   *  they were answered, not skipped. Cleared by answering or skipping them again. */
  bodyGone?: boolean;
}
export const NO_ANSWERS: WelcomeAnswers = Object.freeze({ bodySkipped: false, under18: false });

/** The screens this person sees, in order (a skip leaves screens out; the bar still has a segment for each step of the run). */
export function welcomePath(run: WelcomeRun, a: WelcomeAnswers): WelcomeStepId[] {
  return run.steps.filter((s) => s !== "active" || (!a.bodySkipped && !a.under18));
}

/** How the person leaves a screen. */
export type WelcomeMove =
  /** Continue, or a question's own top-right Skip (skip this question, on to the next screen) */
  | "next"
  /** Skip on About you or How active are you? (to Your plan, the typed answers thrown away) */
  | "skipBody";

/** Where a move leads: the next screen, or "home" when the run is finished (the end of a signed-in run, or after the account). */
export interface WelcomeNext {
  to: WelcomeStepId | "home";
  answers: WelcomeAnswers;
}

/** The answers without the relaunch's "gone" mark (the questions about the person were answered or skipped again in this run). */
function withoutGone(a: WelcomeAnswers): WelcomeAnswers {
  if (a.bodyGone === undefined) return a;
  const copy = { ...a };
  delete copy.bodyGone;
  return copy;
}

/**
 * The screen after `from`. Pass the answers as they are when the person taps (`under18` as the age now typed): a Continue on a question about the person means
 * those questions are being answered (bodySkipped goes). Every move goes forward.
 */
export function moveOn(run: WelcomeRun, answers: WelcomeAnswers, from: WelcomeStepId, how: WelcomeMove = "next"): WelcomeNext {
  if (how === "skipBody" && BODY_STEPS.includes(from)) return { to: "plan", answers: { ...withoutGone(answers), bodySkipped: true, under18: false } };
  const a: WelcomeAnswers = BODY_STEPS.includes(from) ? { ...withoutGone(answers), bodySkipped: false } : answers;
  const path = welcomePath(run, a);
  const i = path.indexOf(from);
  if (i >= 0) return { to: path[i + 1] ?? "home", answers: a };
  // a screen this path doesn't show (it can't be on it): the next step after it
  const j = run.steps.indexOf(from);
  return { to: j >= 0 ? (run.steps[j + 1] ?? "home") : "home", answers: a };
}

/** Back: the last screen actually shown before `from` (Your plan after a skip returns to About you); the cover before step 1. */
export function backFrom(run: WelcomeRun, answers: WelcomeAnswers, from: WelcomeStepId): WelcomeStepId | "cover" {
  const path = welcomePath(run, answers);
  const i = path.indexOf(from);
  if (i > 0) return path[i - 1]!;
  if (i === 0) return "cover";
  const j = run.steps.indexOf(from);
  return j > 0 ? run.steps[j - 1]! : "cover";
}

// ------------------------------------------------------------------------------------------------ carrying on after a relaunch (mm.v1.welcomeProgress)

/** A restaurant dish, by its chain and item ids (a navigation hint for Home's Start here card: never logged, never favourited). */
export interface FirstDish {
  chainId: string;
  itemId: string;
}

export interface WelcomeProgress {
  /** The last step reached. */
  step: WelcomeStepId;
  /** The recipe chosen on step 4 ("Tap one to cook first"), if any. */
  firstRecipeId?: string;
  /** The first restaurant dish in Your plan's row, if any. */
  firstDish?: FirstDish;
  /** A goal was chosen with step 1's Continue (it is saved in the settings): after "Carry on", step 1 shows it ticked. */
  goalPicked?: true;
  /** The day it was written ("YYYY-MM-DD", the phone's own calendar). */
  savedOn: string;
}

export const WELCOME_PROGRESS_KEY = "mm.v1.welcomeProgress";

/**
 * The eleven steps before 20 November, read as today's: Know before you order came before the shops, Your height and weight is About you now, and Your daily
 * targets and Your week, planned are Your plan.
 */
export const LEGACY_STEPS: Readonly<Record<string, WelcomeStepId>> = { eatOut: "shops", size: "about", targets: "plan", week: "plan" };

const RECIPE_ID = /^[a-z0-9-]{1,80}$/;
const CHAIN_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const ITEM_ID = /^[a-z0-9][a-z0-9_.-]{0,199}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A dish hint as stored or as given, or null when it isn't one (ids of the shapes the menu data uses). */
export function sanitizeFirstDish(raw: unknown): FirstDish | null {
  if (!raw || typeof raw !== "object") return null;
  const { chainId, itemId } = raw as { chainId?: unknown; itemId?: unknown };
  return typeof chainId === "string" && CHAIN_ID.test(chainId) && typeof itemId === "string" && ITEM_ID.test(itemId) ? { chainId, itemId } : null;
}

/** A recipe hint as stored or as given, or null. */
export const sanitizeRecipeId = (raw: unknown): string | null => (typeof raw === "string" && RECIPE_ID.test(raw) ? raw : null);

/** The note as stored, checked like anything stored: null unless the step is one of the steps (or an older one, LEGACY_STEPS) and the day is a day; a damaged
 *  hint is dropped on its own. */
export function sanitizeWelcomeProgress(raw: unknown): WelcomeProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const step = isWelcomeStep(r.step) ? r.step : typeof r.step === "string" && Object.prototype.hasOwnProperty.call(LEGACY_STEPS, r.step) ? LEGACY_STEPS[r.step]! : null;
  if (!step || typeof r.savedOn !== "string" || !DAY.test(r.savedOn)) return null;
  const firstRecipeId = sanitizeRecipeId(r.firstRecipeId);
  const firstDish = sanitizeFirstDish(r.firstDish);
  return {
    step,
    ...(firstRecipeId ? { firstRecipeId } : {}),
    ...(firstDish ? { firstDish } : {}),
    ...(r.goalPicked === true ? { goalPicked: true as const } : {}),
    savedOn: r.savedOn,
  };
}

/** The note for where the person is now: the step showing, the hints held in the page's memory (null or absent = none), whether step 1's goal was chosen,
 *  and today's date. */
export function progressNote(x: { step: WelcomeStepId; firstRecipeId?: string | null; firstDish?: FirstDish | null; goalPicked?: boolean }, today: string): WelcomeProgress {
  const firstRecipeId = sanitizeRecipeId(x.firstRecipeId);
  const firstDish = sanitizeFirstDish(x.firstDish);
  return {
    step: x.step,
    ...(firstRecipeId ? { firstRecipeId } : {}),
    ...(firstDish ? { firstDish } : {}),
    ...(x.goalPicked === true ? { goalPicked: true as const } : {}),
    savedOn: today,
  };
}

/**
 * Where "Carry on from step {n}" goes, and the answers the run starts with there; null when there is nothing to carry on from (no note, or only step 1 reached:
 * Get started does the same). The questions about the person start again at About you, because their answers are never kept; past them, those answers are gone,
 * so Back from Your plan goes to About you. A step the new run doesn't have ("save", for someone signed in by now) is its last step, the colours, whose button
 * then goes to Home.
 * `ownTargets`: the settings hold targets of the person's own (hasSetTargets). Without them, Your plan is never carried on to: the run carries on at About you
 * instead, as the age is never kept and an age under 18 must not be shown or save numbers (the meeting of 21 November 2026, Ada). The account step is still
 * carried on to (the iPhone app's trip to Mail for the email code comes back to it); it shows no numbers. (The welcome page always passes it.)
 */
export function resumeAt(run: WelcomeRun, progress: WelcomeProgress | null, ownTargets = true): { step: WelcomeStepId; answers: WelcomeAnswers } | null {
  if (!progress || progress.step === "goal") return null;
  const wanted: WelcomeStepId = BODY_STEPS.includes(progress.step) ? "about" : progress.step;
  let step = run.steps.includes(wanted) ? wanted : run.steps[run.steps.length - 1]!;
  if (step === "plan" && !ownTargets && run.steps.includes("about")) step = "about";
  const past = WELCOME_STEPS.indexOf(step) > WELCOME_STEPS.indexOf("active");
  return { step, answers: { bodySkipped: past, under18: false, ...(past ? { bodyGone: true } : {}) } };
}

/** The note's store (the app's { v, data } envelope). `storage` for tests; the app uses the browser's. */
export function createWelcomeProgressStore(storage?: KeyValueStorage | null): Store<WelcomeProgress | null> {
  return createStore<WelcomeProgress | null>(WELCOME_PROGRESS_KEY, null, { sanitize: sanitizeWelcomeProgress, ...(storage !== undefined ? { storage } : {}) });
}

/** This phone's note. `.reset()` removes it (the end of the welcome screens, "Start again", Settings › Clear everything). */
export const welcomeProgressStore = createWelcomeProgressStore();
