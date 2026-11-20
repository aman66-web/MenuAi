// The welcome steps: their order, the one honest counter, Back, the jumps forward and carrying on after a relaunch. Pure and unit-tested
// (tests/welcomeSteps.test.ts); the screens are app/app/welcome.
//
// The onboarding redesign meeting of 20 November 2026 (docs/meetings/2026-11-20-onboarding-redesign.json, build list 1; approved by the founder: "Whatever the
// meeting ... conclude, go with that"): after the cover, eleven steps, each straight before the screen it changes:
//    1 goal      What's your goal?                       (question, top-right Skip)
//    2 avoid     Anything you avoid?                     (question, top-right Skip)
//    3 eatOut    Know before you order                   (feature screen: real dishes at a restaurant, free)
//    4 shops     Where do you shop?                      (question, top-right Skip)
//    5 recipes   Recipes from {shop}                     (feature screen: two of our recipes priced there, free)
//    6 about     About you                               (about the person: "Skip these questions")
//    7 size      Your height and weight                  (about the person)
//    8 active    How active are you?                     (about the person)
//    9 targets   Your daily targets                      (the reveal, every number editable)
//   10 week      Your week, planned                      (feature screen: Meal plan, Premium where sold)
//   11 save      Save your plan: make your free account  (the required account, CLAUDE.md rule 4)
// A run that starts signed in (a Settings rerun, an account not set up yet that signed in from the cover, someone who signed in at a page) has no step 11:
// "Step n of 10", and step 10's button is "Save and go to Home". The total is fixed for the run before step 1 and never changes; the counter never restarts and
// only jumps forward: "Skip these questions" (and an age under 18) go from 6 to 9, and step 3's "Skip setup and make my account" goes to 11 ("Skip the rest and
// go to Home" in a signed-in run, which finishes). Back goes to the last screen actually shown.
//
// The step reached and the two navigation hints (the restaurant dish left showing on step 3, the recipe chosen on step 5) are kept on this phone in
// mm.v1.welcomeProgress, so a plain launch reopens the cover with "Carry on from step {n}" (step 6 if they left during the questions about the person, whose
// answers are never kept), and the iPhone app's trip to Mail for the email code comes back to step 11 with nothing lost. That key is local only: not one of the
// person's own stores (lib/mm/tour.ts OWN_DATA_KEYS, so it never stops the welcome screens opening), never synced (lib/mm/syncStores.ts), not emptied by a
// sign-in (lib/mm/sync.ts prepareFor resets only the synced and listed local stores), and removed when the welcome screens finish and by Settings › Clear
// everything. The answers about the person's body are never part of it.

import { createStore, type KeyValueStorage, type Store } from "./persist";

export const WELCOME_STEPS = ["goal", "avoid", "eatOut", "shops", "recipes", "about", "size", "active", "targets", "week", "save"] as const;
export type WelcomeStepId = (typeof WELCOME_STEPS)[number];

/** The questions about the person (sex and age, height and weight, activity): skipped together, and never kept. */
export const BODY_STEPS: readonly WelcomeStepId[] = ["about", "size", "active"];
/** The question screens whose top-right "Skip" means "skip this question" (the body screens' skip is the "Skip these questions" link). */
export const QUESTION_STEPS: readonly WelcomeStepId[] = ["goal", "avoid", "shops"];
/** The feature screens: Pip is off (they carry figures and prices), there is no top-right pill, and Next is always enabled. */
export const FEATURE_STEPS: readonly WelcomeStepId[] = ["eatOut", "recipes", "week"];

export const isWelcomeStep = (x: unknown): x is WelcomeStepId => typeof x === "string" && (WELCOME_STEPS as readonly string[]).includes(x);

/** One run of the welcome steps, fixed before step 1. */
export interface WelcomeRun {
  /** Someone was signed in when the run began: no step 11, "Step n of 10". */
  readonly signedIn: boolean;
  /** The counted steps, in order (11, or 10 without "save"). */
  readonly steps: readonly WelcomeStepId[];
  /** N in "Step n of N" (and the digit in Pip's first line). */
  readonly total: number;
}

/** The run for someone signed in, or not, when it starts. Sign-in during the run (step 11, or the cover's link) never changes it. */
export function startRun(signedInAtStart: boolean): WelcomeRun {
  const steps = signedInAtStart ? WELCOME_STEPS.filter((s) => s !== "save") : [...WELCOME_STEPS];
  return Object.freeze({ signedIn: signedInAtStart, steps: Object.freeze(steps), total: steps.length });
}

/** "Step n of N": a step's place among the run's counted steps (n from 1), or null for a step the run doesn't have ("save" in a signed-in run). */
export function stepCounter(run: WelcomeRun, step: WelcomeStepId): { step: number; total: number } | null {
  const i = run.steps.indexOf(step);
  return i < 0 ? null : { step: i + 1, total: run.total };
}

/** What has been answered so far that changes which screens are shown (never the answers themselves). */
export interface WelcomeAnswers {
  /** "Skip these questions" was used, or (after a relaunch) the body answers are gone: the targets come straight after About you, and Back from them goes there. */
  bodySkipped: boolean;
  /** The age typed on About you is under 18: nothing is worked out, so height, weight and activity aren't asked. */
  under18: boolean;
  /** Step 3's "Skip setup and make my account" was used: straight on to the account (Back from it returns to step 3). */
  skippedSetup: boolean;
}
export const NO_ANSWERS: WelcomeAnswers = Object.freeze({ bodySkipped: false, under18: false, skippedSetup: false });

/** The screens this person sees, in order (a skip leaves screens out; the counter still numbers each by its place in the run). */
export function welcomePath(run: WelcomeRun, a: WelcomeAnswers): WelcomeStepId[] {
  const shown = (s: WelcomeStepId): boolean => {
    if (a.skippedSetup) return s === "goal" || s === "avoid" || s === "eatOut" || s === "save";
    if (s === "size" || s === "active") return !a.bodySkipped && !a.under18;
    return true;
  };
  return run.steps.filter(shown);
}

/** How the person leaves a screen. */
export type WelcomeMove =
  /** Continue, Next, or a question's own top-right Skip (skip this question, on to the next screen) */
  | "next"
  /** "Skip these questions" on About you, Your height and weight or How active are you? (to Your daily targets, the typed answers thrown away) */
  | "skipBody"
  /** Step 3's "Skip setup and make my account" ("Skip the rest and go to Home" in a signed-in run) */
  | "skipSetup";

/** Where a move leads: the next screen, or "home" when the run is finished (the end of a signed-in run, or after the account). */
export interface WelcomeNext {
  to: WelcomeStepId | "home";
  answers: WelcomeAnswers;
}

/**
 * The screen after `from`. Pass the answers as they are when the person taps (`under18` as the age now typed): a Continue on a question about the person means
 * those questions are being answered (bodySkipped goes), and Next on step 3 means the setup goes on (skippedSetup goes). Every move goes forward.
 */
export function moveOn(run: WelcomeRun, answers: WelcomeAnswers, from: WelcomeStepId, how: WelcomeMove = "next"): WelcomeNext {
  if (how === "skipBody" && BODY_STEPS.includes(from)) return { to: "targets", answers: { ...answers, bodySkipped: true, under18: false } };
  if (how === "skipSetup" && from === "eatOut") return { to: run.signedIn ? "home" : "save", answers: { ...answers, skippedSetup: true } };
  const a: WelcomeAnswers = from === "eatOut" ? { ...answers, skippedSetup: false } : BODY_STEPS.includes(from) ? { ...answers, bodySkipped: false } : answers;
  const path = welcomePath(run, a);
  const i = path.indexOf(from);
  if (i >= 0) return { to: path[i + 1] ?? "home", answers: a };
  // a screen this path doesn't show (it can't be on it): the next counted step after it
  const j = run.steps.indexOf(from);
  return { to: j >= 0 ? (run.steps[j + 1] ?? "home") : "home", answers: a };
}

/** Back: the last screen actually shown before `from` (step 9 after a jump returns to About you; step 11 after step 3's link returns to step 3); the cover before step 1. */
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
  /** The recipe chosen on step 5 ("Your first recipe"), if any. */
  firstRecipeId?: string;
  /** The restaurant chosen on step 3 and its top dish, if any. */
  firstDish?: FirstDish;
  /** Step 3's "Skip setup and make my account" led to the account, so Back from it returns to step 3 after a relaunch too. */
  skippedSetup?: true;
  /** The day it was written ("YYYY-MM-DD", the phone's own calendar). */
  savedOn: string;
}

export const WELCOME_PROGRESS_KEY = "mm.v1.welcomeProgress";

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

/** The note as stored, checked like anything stored: null unless the step is one of the steps and the day is a day; a damaged hint is dropped on its own. */
export function sanitizeWelcomeProgress(raw: unknown): WelcomeProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isWelcomeStep(r.step) || typeof r.savedOn !== "string" || !DAY.test(r.savedOn)) return null;
  const firstRecipeId = sanitizeRecipeId(r.firstRecipeId);
  const firstDish = sanitizeFirstDish(r.firstDish);
  return { step: r.step, ...(firstRecipeId ? { firstRecipeId } : {}), ...(firstDish ? { firstDish } : {}), ...(r.skippedSetup === true ? { skippedSetup: true as const } : {}), savedOn: r.savedOn };
}

/** The note for where the person is now: the step showing, the hints held in the page's memory (null or absent = none) and today's date. */
export function progressNote(x: { step: WelcomeStepId; answers?: Pick<WelcomeAnswers, "skippedSetup">; firstRecipeId?: string | null; firstDish?: FirstDish | null }, today: string): WelcomeProgress {
  const firstRecipeId = sanitizeRecipeId(x.firstRecipeId);
  const firstDish = sanitizeFirstDish(x.firstDish);
  return {
    step: x.step,
    ...(firstRecipeId ? { firstRecipeId } : {}),
    ...(firstDish ? { firstDish } : {}),
    ...(x.answers?.skippedSetup && x.step === "save" ? { skippedSetup: true as const } : {}),
    savedOn: today,
  };
}

/**
 * Where "Carry on from step {n}" goes, and the answers the run starts with there; null when there is nothing to carry on from (no note, or only step 1 reached:
 * Get started does the same). The questions about the person start again at About you, because their answers are never kept; past them, those answers are gone,
 * so Back from the targets goes to About you. A step the new run doesn't have ("save", for someone signed in by now) is its last step, Your week, whose button
 * then saves and goes to Home. After step 3's link, Back from the account still returns to step 3.
 */
export function resumeAt(run: WelcomeRun, progress: WelcomeProgress | null): { step: WelcomeStepId; answers: WelcomeAnswers } | null {
  if (!progress || progress.step === "goal") return null;
  const wanted: WelcomeStepId = BODY_STEPS.includes(progress.step) ? "about" : progress.step;
  const step = run.steps.includes(wanted) ? wanted : run.steps[run.steps.length - 1]!;
  const past = WELCOME_STEPS.indexOf(step) > WELCOME_STEPS.indexOf("active");
  return { step, answers: { bodySkipped: past, under18: false, skippedSetup: step === "save" && progress.skippedSetup === true } };
}

/** The note's store (the app's { v, data } envelope). `storage` for tests; the app uses the browser's. */
export function createWelcomeProgressStore(storage?: KeyValueStorage | null): Store<WelcomeProgress | null> {
  return createStore<WelcomeProgress | null>(WELCOME_PROGRESS_KEY, null, { sanitize: sanitizeWelcomeProgress, ...(storage !== undefined ? { storage } : {}) });
}

/** This phone's note. `.reset()` removes it (the end of the welcome screens, "Start again", Settings › Clear everything). */
export const welcomeProgressStore = createWelcomeProgressStore();
