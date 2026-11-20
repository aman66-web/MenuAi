"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { parseNumber } from "@/lib/mm/addFood";
import { analytics, reportSetupScreen } from "@/lib/mm/analytics";
import { tk } from "@/lib/mm/i18n";
import { dayParam } from "@/lib/mm/day";
import { EMPTY_BODY, bodyProblems, planFromAnswers, readTargetFields, type BodyAnswers, type BodyProblem } from "@/lib/mm/onboardingPlan";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeShopSet } from "@/lib/mm/shopProducts";
import { mealPlanStore, settingsStore, updateSettings } from "@/lib/mm/stores";
import { afterSignIn, sanitizeResume, SIGN_IN_RESUME_KEY, TYPED_SETUP_KEYS, typedSetup, type SignInReason, type SignInResume, type TypedSetup } from "@/lib/mm/signInGate";
import type { PlanNote } from "@/lib/mm/targets";
import type { Goal } from "@/lib/mm/types";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/mm/user-data";
import {
  backFrom, BODY_STEPS, moveOn, NO_ANSWERS, progressNote, resumeAt, SKIP_STEPS, startRun, stepCounter, welcomeProgressStore,
  type FirstDish, type WelcomeAnswers, type WelcomeMove, type WelcomeRun, type WelcomeStepId,
} from "@/lib/mm/welcomeSteps";
import { InfoBanner } from "../_components/Note";
import { SignInSheet } from "../_components/SignIn";
import { SigningIn } from "../_components/SigningIn";
import { SignInScreen } from "../_components/SignInScreen";
import { holdTrialOfferThisVisit } from "../_components/TrialOffer";
import { Spinner } from "../_components/ui";
import { signInOutcome, signInSettled, useAccountChecking, useAccountUser } from "../_lib/account";
import { useSignInRequired } from "../_lib/appSwitches";
import { travelBack } from "../_lib/backNav";
import { useHydrated, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { aboutProblemLine, ActivityStep, AboutYouStep, BODY_BOX, typedUnder18 } from "./BodySteps";
import { Cover, type CoverNotice } from "./Cover";
import { RecipesStep } from "./FeatureSteps";
import { finishWelcome, type WelcomeEnding } from "./finish";
import { Bottom, BottomButton, reducedMotion, SCREEN, TopBar, TopButton, WHY_GREY, WHY_GREY_LINE } from "./Frame";
import { STEP_TOP } from "./parts";
import { PlanStep } from "./PlanStep";
import { AvoidStep, GoalStep, ShopsStep } from "./QuestionSteps";
import { preloadRestaurantRow } from "./RestaurantRow";
import { useTargetFields } from "./useTargetFields";

// The welcome screens: onboarding in seven screens, then the account (founder, 20 November 2026, 12:21-12:37: one question a screen, a short heading, a big
// input, Continue pinned at the bottom, Back top left, far fewer words, pictures over text, no labels on what the app shows, no "Step n of N" words, no Pip
// speech bubbles). lib/mm/welcomeSteps.ts holds the order:
//    1 What's your goal? · 2 Anything you avoid? · 3 Where do you shop? · 4 Recipes from {shop} · 5 About you · 6 How active are you? · 7 Your plan · the account
// A run that starts signed in (a Settings rerun, an account not set up yet that signed in from the cover, someone who signed in at a page) has no account step,
// and Your plan's button is "Save and go to Home". Skip (top right) on 1 to 3 skips that question; on 5 and 6 it skips both, to Your plan with the starting
// numbers (and an age under 18 goes from 5 to 7 too). Back goes to the last screen actually shown.
// - The cover (Cover.tsx): Get started, or "Carry on from step {n}" with "Start again" for someone who left part-way (mm.v1.welcomeProgress, written at each
//   step; the questions about the body resume at About you, because those answers are never kept), the status line after Clear data (?cleared=1), after
//   "Delete my account" (?deleted=1) or after signing out (?signedout=1), and "Already have an account? Sign in" ("Welcome back. Sign in": an account already set
//   up goes straight to Home with its own settings; one not set up yet goes on as a signed-in run).
// - Pip appears once, small, beside step 1's heading, with no speech bubble.
// - What is saved: the goal, the foods avoided and the shops, each on its Continue; the daily numbers when they are worked out (leaving How active are you?),
//   changed ("Change", then "Save") or confirmed (Your plan's button). The answers about the body stay in this page's memory only and are gone when it closes
//   (CLAUDE.md rule 4). Nothing of the person's own (their food log, favourites, lists, saved meals or recipes) is written before an account exists: the recipe
//   chosen on step 4 and the first restaurant dish on Your plan are navigation hints only.
// - Every ending goes through finishWelcome (finish.ts): after signing in at the account step, after "Not now" where sign-in is optional, and at the end of a
//   signed-in run; then straight to Home, where the toast and the one-time Start here card take over.
// - ?showcase=1 (Settings › Help, Home's StartPrompt): screens 4 and 7 again with the person's current settings, Close, Next and Done; nothing is saved or
//   changed. An old ?tour=1 link opens the same.
// - The website's Apple and Google sign-in leaves the page and comes back with ?signin=ok: why the sign-in screen was showing, what was typed and the two hints
//   wait in this tab's session storage meanwhile (lib/mm/signInGate.ts SignInResume; never the answers about the body). One that didn't finish comes back with
//   ?signin=cancelled, failed, expired or busy: the same screen opens again with a line saying what happened, and the address is tidied.

type View =
  | { kind: "cover" }
  | { kind: "step"; step: WelcomeStepId }
  /** the cover's "Already have an account? Sign in" */
  | { kind: "returning" }
  /** ?showcase=1: screens 4 and 7 again */
  | { kind: "replay"; index: number };

/** The replay's screens, in order. */
const REPLAY: readonly WelcomeStepId[] = ["recipes", "plan"];

// The four daily target boxes (not GLP-1's meal size): a change to any of them makes the targets the person's own (saveTargets).
const TARGET_BOXES = ["calories", "protein", "carbs", "fat"] as const;

function saveResume(r: SignInResume): void {
  try {
    sessionStorage.setItem(SIGN_IN_RESUME_KEY, JSON.stringify(r));
  } catch {
    /* storage blocked: back from Apple or Google, the cover shows */
  }
}
function readResume(): SignInResume | null {
  try {
    return sanitizeResume(JSON.parse(sessionStorage.getItem(SIGN_IN_RESUME_KEY) || "null"));
  } catch {
    return null;
  }
}
function forgetResume(): void {
  try {
    sessionStorage.removeItem(SIGN_IN_RESUME_KEY);
  } catch {
    /* storage blocked */
  }
}

/** What the website's Apple or Google sign-in said when it didn't finish (?signin=…; the same words as Settings › Account). */
const SIGN_IN_NOTES: Readonly<Record<string, string>> = {
  cancelled: tk("Sign-in was cancelled."),
  failed: tk("Sign-in didn't finish. Please try again."),
  expired: tk("That sign-in took too long. Please try again."),
  busy: tk("Too many tries. Please wait a few minutes and try again."),
};

/** A screen too short for the account step's extra lines above the sign-in buttons (an iPhone SE at large text, a 320 x 568 phone). */
const SHORT_SCREEN = 620;
const onResize = (change: () => void) => {
  window.addEventListener("resize", change);
  return () => window.removeEventListener("resize", change);
};

/** A saved Meal plan whose seven days include today ("You already have a plan for this week."). */
function planThisWeek(start: string | undefined, today: string): boolean {
  if (!start) return false;
  const from = Date.parse(`${start}T00:00:00`);
  const now = Date.parse(`${today}T00:00:00`);
  return Number.isFinite(from) && Number.isFinite(now) && now >= from && now < from + 7 * 24 * 60 * 60 * 1000;
}

/** The box a tap on About you's grey Continue takes the person to: the first that needs them. */
const PROBLEM_BOX: Readonly<Record<BodyProblem, string>> = { age: BODY_BOX.age, height: BODY_BOX.heightMajor, "height-part": BODY_BOX.heightMajor, weight: BODY_BOX.weightMajor, "weight-part": BODY_BOX.weightMajor };

/** The welcome screens are a static shell (like the restaurant page): the address's ?showcase=1, ?signin=ok and ?cleared=1 are read once on the phone. */
export default function WelcomePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const accountUser = useAccountUser();
  const accountChecking = useAccountChecking();
  const signInRequired = useSignInRequired();
  const hydrated = useHydrated();
  const settings = useSettings();
  const manifest = useShopManifest();
  const savedPlan = useStore(mealPlanStore);

  const [initial] = useState<UserSettings>(() => settingsStore.get());
  const [wasOnboarded] = useState(initial.hasCompletedOnboarding);
  const [replay] = useState(() => params.get("showcase") === "1" || params.get("tour") === "1");
  const [notice] = useState<CoverNotice>(() => (params.get("cleared") === "1" ? "cleared" : params.get("deleted") === "1" ? "deleted" : params.get("signedout") === "1" ? "signedOut" : null));
  const [progress, setProgress] = useState(() => (replay ? null : welcomeProgressStore.get()));
  // back from Apple or Google sign-in on the website (finished or not): the sign-in step it was on, if this tab noted one, and what happened when it didn't finish
  const [signinBack] = useState(() => params.get("signin"));
  const [resume] = useState(() => (!replay && signinBack && (signinBack === "ok" || signinBack in SIGN_IN_NOTES) ? readResume() : null));
  const signInNote = resume && signinBack && signinBack in SIGN_IN_NOTES ? SIGN_IN_NOTES[signinBack]! : null;
  const shortScreen = useSyncExternalStore(onResize, () => window.innerHeight < SHORT_SCREEN, () => false);
  // the run, fixed when the steps begin (a run started signed out has the account as its last step)
  const [run, setRun] = useState<WelcomeRun>(() => startRun(false));
  // back from Apple or Google at the account step: Back from it goes to Your plan, and the body answers are gone
  const [answers, setAnswers] = useState<WelcomeAnswers>(() => (resume?.reason === "setup" ? resumeAt(startRun(false), { step: "save", savedOn: "" })?.answers ?? NO_ANSWERS : NO_ANSWERS));
  const [view, setView] = useState<View>(() => (replay ? { kind: "replay", index: 0 } : resume?.reason === "setup" ? { kind: "step", step: "save" } : resume?.reason === "returning" ? { kind: "returning" } : { kind: "cover" }));
  // came back to the account step through "Carry on" (its line says the answers are still here)
  const [resumed, setResumed] = useState(false);
  // the navigation hints for Home's Start here card: the recipe chosen on step 4 and the first restaurant dish on Your plan
  const [firstRecipeId, setFirstRecipeId] = useState<string | null>(() => resume?.firstRecipeId ?? null);
  const [firstDish, setFirstDish] = useState<FirstDish | null>(() => resume?.firstDish ?? null);
  const hints = useRef<{ firstRecipeId: string | null; firstDish: FirstDish | null }>({ firstRecipeId, firstDish });
  useEffect(() => { hints.current = { firstRecipeId, firstDish }; }, [firstRecipeId, firstDish]);
  // what was typed when the account step opened (the goal, targets, diet and shops as saved here), for afterSignIn
  const typed = useRef<TypedSetup | null>(resume?.typed ?? null);
  const settling = useRef(false);
  // Once a finish has started, a second tap does nothing.
  const finishing = useRef(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [goal, setGoal] = useState<Goal>(initial.goal);
  // Nothing is picked for the person on a first run: no goal is ticked until one is tapped; someone already set up who runs this again sees their saved goal
  const [goalTouched, setGoalTouched] = useState(false);
  const goalShown = wasOnboarded || goalTouched;
  // a goal was chosen with step 1's Continue (it is in the settings): noted, so "Carry on" shows it ticked if the person goes Back to step 1
  const [goalSaved, setGoalSaved] = useState(false);
  // Skip on step 1 leaves the goal unset for Your plan's restaurant dishes ("Most protein for the calories")
  const [goalSkipped, setGoalSkipped] = useState(false);
  const target = useTargetFields(initial);
  const [prefs, setPrefs] = useState(initial.preferences);
  const [shops, setShops] = useState<string[]>(initial.shops ?? []);
  // The answers about the person (screens 5 and 6): React state only, never saved or sent; dropped with this page when the welcome screens end.
  const [body, setBody] = useState<BodyAnswers>(EMPTY_BODY);
  // Nothing is picked on "How active are you?" until a tile is tapped, on every run (the answers are never stored, so a re-run has nothing real to show).
  const [activityPicked, setActivityPicked] = useState(false);
  // Nor for sex on About you: "Prefer not to say" is what the sums use until a tile is tapped, but no tile shows as chosen.
  const [sexPicked, setSexPicked] = useState(false);
  // a tap on About you's grey Continue: what is wrong is then said and marked
  const [aboutTried, setAboutTried] = useState(false);
  const plan = useMemo(() => planFromAnswers({ goal, prefs, body }), [goal, prefs, body]);
  const changeBody = (patch: Partial<BodyAnswers>) => setBody((b) => ({ ...b, ...patch }));
  // the worked-out numbers were saved in this run (leaving How active are you?): a skip afterwards puts back the numbers the run started with
  const savedWorkedOut = useRef(false);
  // Pip's entrance on step 1 plays once per visit to these screens
  const [pipHasJumped, setPipHasJumped] = useState(false);

  const runStep = view.kind === "step" ? view.step : null;
  const counterOf = (s: WelcomeStepId): string => {
    const c = stepCounter(run, s);
    return c ? t("Step {step} of {total}", c) : "";
  };

  // ------------------------------------------------------------------------------------------------ moving between screens

  const toStep = (s: WelcomeStepId) => {
    if (s !== "goal") setPipHasJumped(true);
    setView({ kind: "step", step: s });
  };
  const forward = (from: WelcomeStepId, how: WelcomeMove = "next", a: WelcomeAnswers = answers) => {
    const r = moveOn(run, a, from, how);
    setAnswers(r.answers);
    if (r.to === "home") finish(wasOnboarded ? "saved" : "signedIn");
    else toStep(r.to);
  };
  const back = (from: WelcomeStepId) => {
    if (from === "save") forgetResume();
    const b = backFrom(run, answers, from);
    if (b === "cover") setView({ kind: "cover" });
    else toStep(b);
  };
  const beginRun = (signedIn: boolean, at: { step: WelcomeStepId; answers: WelcomeAnswers } | null) => {
    setRun(startRun(signedIn));
    setAnswers(at?.answers ?? NO_ANSWERS);
    toStep(at?.step ?? "goal");
  };
  // Out of the replay, or Back on the cover for someone already set up: to the page it was opened from (Settings when there is nothing before it).
  const leave = () => {
    if (!travelBack(router, "/app/settings")) router.replace("/app/settings");
  };

  // ------------------------------------------------------------------------------------------------ the one finish

  const finish = (ending: WelcomeEnding) => {
    if (finishing.current) return;
    finishing.current = true;
    finishWelcome(ending, hints.current, { holdTrialOffer: holdTrialOfferThisVisit });
    if (ending !== "saved" && ending !== "returning") analytics.track({ name: "onboardingCompleted" });
    router.replace("/app");
  };

  // The account's own settings arrived and say setup is finished (signed in on another device meanwhile): to the app, with them. Not while a sign-in is settling
  // (it decides that itself), nor for someone who was already set up and opened this screen on purpose.
  const signingFor: SignInReason | null = view.kind === "returning" ? "returning" : runStep === "save" ? "setup" : null;
  useEffect(() => {
    if (!hydrated || replay || wasOnboarded || !settings.hasCompletedOnboarding || signingFor || finishing.current) return;
    finishing.current = true;
    router.replace("/app");
  }, [hydrated, replay, wasOnboarded, settings.hasCompletedOnboarding, signingFor, router]);

  // ------------------------------------------------------------------------------------------------ the cover

  const progressRun = startRun(!!accountUser);
  // set up here and signed out, where everyone signs in: Get started is their way back in, at "Welcome back. Sign in", so there is nothing to carry on from
  const returningOnly = signInRequired && !accountUser && wasOnboarded;
  // read once the page has hydrated (the server knows nothing of this phone's note)
  const carryOn = hydrated && !returningOnly && progress ? resumeAt(progressRun, progress) : null;
  const openReturning = () => {
    saveResume({ reason: "returning", typed: null });
    setView({ kind: "returning" });
  };
  const start = () => {
    if (returningOnly) return openReturning();
    if (carryOn && progress) {
      setFirstRecipeId(progress.firstRecipeId ?? null);
      setFirstDish(progress.firstDish ?? null);
      setResumed(carryOn.step === "save");
      // the goal chosen before: ticked if the person goes Back to step 1
      if (progress.goalPicked) {
        setGoalTouched(true);
        setGoalSaved(true);
        setPipHasJumped(true);
      }
      return beginRun(!!accountUser, carryOn);
    }
    beginRun(!!accountUser, null);
  };
  // "Start again": the saved step forgotten, step 1 with nothing ticked; for someone not set up yet, what they had answered goes too (a Settings rerun keeps the
  // saved settings, which are theirs)
  const startAgain = () => {
    welcomeProgressStore.reset();
    setProgress(null);
    setFirstRecipeId(null);
    setFirstDish(null);
    setGoalTouched(false);
    setGoalSaved(false);
    setGoalSkipped(false);
    setBody(EMPTY_BODY);
    setActivityPicked(false);
    setSexPicked(false);
    setAboutTried(false);
    if (!wasOnboarded) {
      const fresh: Record<string, unknown> = {};
      for (const k of TYPED_SETUP_KEYS) fresh[k] = DEFAULT_SETTINGS[k];
      updateSettings(fresh as Partial<UserSettings>);
      setGoal(DEFAULT_SETTINGS.goal);
      setPrefs(DEFAULT_SETTINGS.preferences);
      setShops([]);
      target.resetTo(DEFAULT_SETTINGS);
    }
    beginRun(!!accountUser, null);
  };

  // ------------------------------------------------------------------------------------------------ the account step and the cover's sign-in

  // On the account step: what was typed is noted for afterSignIn and, for the website's Apple and Google sign-in, which leaves this page, in this tab's session
  // storage with the two hints.
  useEffect(() => {
    if (runStep !== "save") return;
    typed.current ??= typedSetup(settingsStore.get());
    saveResume({ reason: "setup", typed: typed.current, ...(firstRecipeId ? { firstRecipeId } : {}), ...(firstDish ? { firstDish } : {}) });
  }, [runStep, firstRecipeId, firstDish]);

  // Signed in at the account step or from the cover's link (in the iPhone app at once; on the website back from Apple or Google, once the app knows who): wait
  // for the account's settings, then carry on (lib/mm/signInGate.ts afterSignIn). Meanwhile "Signing you in…".
  useEffect(() => {
    if (!signingFor || !accountUser || settling.current) return;
    settling.current = true;
    const reason = signingFor;
    void signInSettled().then(() => {
      settling.current = false;
      forgetResume();
      const current = settingsStore.get();
      const after = afterSignIn({ reason, setUp: current.hasCompletedOnboarding, ...signInOutcome(), current, typed: typed.current });
      typed.current = null;
      if (after.to === "app") return finish(reason === "returning" ? "returning" : "signedInBack");
      if (after.to === "tour") {
        // an account not set up yet: on into the steps, signed in, with whatever it brought
        const now = settingsStore.get();
        setGoal(now.goal);
        setPrefs(now.preferences);
        setShops(now.shops ?? []);
        return beginRun(true, null);
      }
      if (Object.keys(after.restore).length > 0) updateSettings(after.restore);
      finish("signedIn");
    });
  }, [signingFor, accountUser]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per sign-in; the functions it calls read refs and setters

  // ------------------------------------------------------------------------------------------------ notes, counts, focus, the week ahead

  // The step reached, kept on this phone so a plain launch can carry on from it (never in the replay).
  useEffect(() => {
    if (replay || view.kind !== "step" || finishing.current) return;
    welcomeProgressStore.set(progressNote({ step: view.step, firstRecipeId, firstDish, goalPicked: goalSaved }, dayParam(new Date())));
  }, [replay, view, firstRecipeId, firstDish, goalSaved]);

  // A sign-in on the website that didn't finish: its line is shown on the sign-in screen (below), so the address is tidied. "?signin=ok" stays for the account
  // code, which reads it to ask who is signed in.
  useEffect(() => {
    if (!signinBack || signinBack === "ok") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("signin");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [signinBack]);

  // The anonymous setup screen counts (lib/mm/analytics.ts; nothing at all unless TelemetryDeck was switched on when the app was built): the screen's name only.
  useEffect(() => {
    if (replay || !hydrated) return;
    if (view.kind === "cover") reportSetupScreen("cover");
    else if (view.kind === "returning") reportSetupScreen("returning");
    else if (view.kind === "step") analytics.track({ name: "welcomeStep", step: view.step });
  }, [replay, hydrated, view]);

  // Every new screen starts at the top with its headline focused, so a screen reader reads it first (with "Step n of N"). Done as the screen is put in place, so
  // it can never take the focus back from a box or a choice tapped straight after. Not when the page first opens on the cover: a screen reader starts at the top.
  const viewKey = view.kind === "step" ? view.step : view.kind === "replay" ? `replay-${view.index}` : view.kind;
  const firstScreen = useRef(true);
  useLayoutEffect(() => {
    const first = firstScreen.current;
    firstScreen.current = false;
    if (first && viewKey === "cover") return;
    window.scrollTo({ top: 0 });
    const h = document.querySelector<HTMLElement>("main h1");
    if (!h) return;
    if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  }, [viewKey]);

  // Your plan's week is an example (WeekShowcase, founder 2026-11-20), so nothing is worked out ahead while How active are you? shows.

  // ------------------------------------------------------------------------------------------------ the daily numbers

  const targetReading = readTargetFields(target.fields, goal === "glp1");
  // back after "Carry on" past the questions about the person: the targets on the boxes were worked out from them before (they are the person's own)
  const keptTargets = !!answers.bodyGone && settingsStore.get().hasSetTargets === true;
  const changedByHand = TARGET_BOXES.some((k) => parseNumber(target.fields[k]) !== parseNumber(target.start[k]));
  /**
   * The numbers on the boxes, saved (Your plan's "Save" and its button). They count as set only when they are the person's own: worked out from the questions or
   * a box they changed; untouched starting numbers stay marked as starting numbers. Never written as false, so a Settings rerun keeps targets set before.
   */
  const saveTargets = (): boolean => {
    const r = readTargetFields(target.fields, goal === "glp1");
    if (r.problems.length > 0 || r.calories === undefined) return false;
    const workedOut = !answers.bodySkipped && plan.plan.kind === "ok";
    updateSettings({
      dailyCalories: r.calories,
      ...(workedOut || changedByHand ? { hasSetTargets: true } : {}),
      dailyProtein: r.protein,
      dailyCarbs: r.carbs,
      dailyFat: r.fat,
      ...(goal === "glp1" && r.mealCap !== undefined ? { glp1MealCap: r.mealCap } : {}),
    });
    return true;
  };
  /** Leaving How active are you?: the numbers worked out from the answers fill the boxes and are saved, so Your plan's week is made for them. */
  const saveWorkedOut = () => {
    const p = plan.plan;
    target.applyPlan(p);
    if (p.kind !== "ok") return;
    savedWorkedOut.current = true;
    updateSettings({ dailyCalories: p.calories, dailyProtein: p.protein, dailyCarbs: p.carbs, dailyFat: p.fat, hasSetTargets: true });
  };
  /** Skipping the questions about the person (or an age under 18) after numbers were worked out in this run: the boxes and the saved numbers as the run began. */
  const undoWorkedOut = () => {
    target.applyPlan(null);
    if (!savedWorkedOut.current) return;
    savedWorkedOut.current = false;
    updateSettings({ dailyCalories: initial.dailyCalories, dailyProtein: initial.dailyProtein, dailyCarbs: initial.dailyCarbs, dailyFat: initial.dailyFat, hasSetTargets: initial.hasSetTargets });
  };

  // ------------------------------------------------------------------------------------------------ the screens

  // Signed in at the sign-in step: "Signing you in…" while the account's settings arrive (the effect above then carries on).
  if (signingFor && accountUser) return <SigningIn />;

  // what the website's sign-in said when it didn't finish, above the sign-in screen it came back to
  const signInLine = signInNote ? <InfoBanner className="mt-3">{t(signInNote)}</InfoBanner> : null;

  if (view.kind === "returning") {
    if (accountChecking && !accountUser) return <Spinner />;
    return (
      <>
        {signInLine}
        <SignInScreen reason="returning" onBack={() => { forgetResume(); setView({ kind: "cover" }); }} />
      </>
    );
  }

  if (view.kind === "cover") {
    return (
      <>
        <Cover
          notice={notice}
          carryOn={carryOn ? stepCounter(progressRun, carryOn.step)?.step ?? null : null}
          onStart={start}
          onStartAgain={startAgain}
          onSignIn={accountUser ? undefined : signInRequired ? openReturning : () => setSheetOpen(true)}
          // where everyone signs in, someone signed out has nowhere to go back to (Back led to a second sign-in screen)
          onBack={wasOnboarded && !(signInRequired && !accountUser) ? leave : undefined}
          signInRequired={signInRequired}
        />
        {!signInRequired && !accountUser && <SignInSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
      </>
    );
  }

  if (view.kind === "replay") {
    const i = view.index;
    const last = i === REPLAY.length - 1;
    const top = <TopBar start={<TopButton onClick={leave}>{t("Close")}</TopButton>} segments={REPLAY.length} current={i} />;
    const counter = t("{n} of {total}", { n: i + 1, total: REPLAY.length });
    const bottom = { next: last ? t("Done") : t("Next"), onNext: () => (last ? leave() : setView({ kind: "replay", index: i + 1 })) };
    return (
      <div key={`replay-${i}`} className={SCREEN}>
        {REPLAY[i] === "recipes" && <ReplayRecipes top={top} counter={counter} bottom={bottom} />}
        {REPLAY[i] === "plan" && (
          <>
            {top}
            <PlanStep
              counter={counter}
              goal={settings.goal}
              prefs={settings.preferences}
              replay
              planLine={planThisWeek(savedPlan?.start, dayParam(new Date()))}
              targets={{ fields: target.fields, setField: target.setField, reading: targetReading, starting: false, under18: false, notes: [], save: () => true }}
              bottom={bottom}
            />
          </>
        )}
      </div>
    );
  }

  const step = view.step;
  const counter = counterOf(step);
  const index = run.steps.indexOf(step);
  const skipThis = () => {
    analytics.track({ name: "onboardingSkipped", step });
    if (BODY_STEPS.includes(step)) {
      // Skip on About you or How active are you?: both are skipped, the typed answers thrown away, to Your plan with the starting numbers
      setBody(EMPTY_BODY);
      setActivityPicked(false);
      setSexPicked(false);
      setAboutTried(false);
      undoWorkedOut();
      return forward(step, "skipBody");
    }
    if (step === "goal") {
      // Skip never saves: the goal goes back to what is saved, and Your plan's restaurant dishes use "Most protein for the calories"
      setGoal(settingsStore.get().goal);
      setGoalTouched(false);
      setGoalSkipped(!wasOnboarded);
    } else if (step === "avoid") {
      setPrefs(settingsStore.get().preferences);
    } else if (step === "shops") {
      setShops(settingsStore.get().shops ?? []);
      preloadRestaurantRow();
    }
    forward(step);
  };
  const top = (
    <TopBar
      onBack={() => back(step)}
      end={SKIP_STEPS.includes(step) ? <TopButton onClick={skipThis}>{t("Skip")}</TopButton> : undefined}
      segments={run.total}
      current={index}
    />
  );

  // The account step: the sign-in screen as the bar's last segment, with Back. Where sign-in is optional, it also has "Not now".
  if (step === "save") {
    if (accountChecking && !accountUser) return <Spinner />;
    const recipe = firstRecipeId ? RECIPES.find((r) => r.id === firstRecipeId) : undefined;
    return (
      <SignInScreen
        reason="setup"
        top={signInLine ? <>{top}{signInLine}</> : top}
        counter={counter}
        // on a short screen the recipe line is left out, so Apple, Google and email come first
        waiting={recipe && !shortScreen ? t(recipe.name) : null}
        resumed={resumed}
        onNotNow={signInRequired ? undefined : () => finish("notNow")}
      />
    );
  }

  const defaultShop = recipeShopSet(manifest, null, [])[0];
  // About you: an age under 18 needs nothing else (nothing is worked out); otherwise the age, height and weight
  const under18Typed = typedUnder18(body.age);
  const bodyWrong: BodyProblem[] = under18Typed ? [] : bodyProblems(body);
  const partWrong = bodyWrong.filter((p) => p.endsWith("-part"));
  // nothing typed yet: the button says it can be skipped and does what Skip does (founder 2026-11-20: "the person should definitely know that they don't have to
  // add any of these"), so there is no grey button and no line asking for the numbers
  const nothingTyped = body.age.trim() === "" && `${body.height.major}${body.height.minor}${body.weight.major}${body.weight.minor}`.trim() === "";
  const aboutLine = nothingTyped || bodyWrong.length === 0 ? null : aboutTried || partWrong.length > 0 ? aboutProblemLine(t, body, bodyWrong) : t("Add your age, height and weight, or tap Skip.");
  /** A tap on About you's grey Continue: what is wrong is said, and the first box that needs the person is brought into view, ready to type in. */
  const showProblem = () => {
    setAboutTried(true);
    const box = bodyWrong[0] ? document.getElementById(PROBLEM_BOX[bodyWrong[0]]) : null;
    box?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    box?.focus({ preventScroll: true });
  };
  const planStarting = !answers.under18 && ((answers.bodySkipped && !keptTargets) || (!answers.bodySkipped && plan.plan.kind === "invalid")) && !changedByHand;
  const planNotes: readonly PlanNote[] = !answers.bodySkipped && plan.plan.kind === "ok" ? plan.plan.notes : goal === "glp1" ? ["glp1"] : [];

  return (
    <div key={step} className={SCREEN}>
      {step === "goal" && (
        <>
          {top}
          <GoalStep
            goal={goal}
            shown={goalShown}
            pick={(g) => { setGoal(g); setGoalTouched(true); }}
            onContinue={() => { updateSettings({ goal }); setGoalSkipped(false); setGoalSaved(true); forward("goal"); }}
            counter={counter}
            jump={!pipHasJumped}
          />
        </>
      )}

      {step === "avoid" && (
        <>
          {top}
          <AvoidStep prefs={prefs} setPrefs={setPrefs} counter={counter} onContinue={() => { updateSettings({ preferences: prefs }); forward("avoid"); }} />
        </>
      )}

      {step === "shops" && (
        <>
          {top}
          <ShopsStep
            shops={shops}
            setShops={setShops}
            counter={counter}
            onContinue={() => {
              updateSettings({ shops: shops.length ? shops : undefined });
              // none ticked: the default recipe shop's file starts loading for the next screen (a ticked shop's started on the tick: ShopPicker's `warm`)
              if (!shops.length && defaultShop) void loadShopFile(defaultShop).catch(() => undefined);
              preloadRestaurantRow();
              forward("shops");
            }}
          />
        </>
      )}

      {step === "recipes" && (
        <RecipesStep top={top} counter={counter} chosen={firstRecipeId} onChoose={setFirstRecipeId} bottom={{ next: t("Continue"), onNext: () => forward("recipes") }} />
      )}

      {/* About you: everything on one screen. Why Continue is grey is said beside it and linked to it; Skip is at the top right. An age under 18 goes straight
          to Your plan, where nothing is worked out. */}
      {step === "about" && (
        <>
          {top}
          <section className={`${STEP_TOP} flex flex-1 flex-col`}>
            <AboutYouStep body={body} sex={sexPicked ? body.sex : null} change={(patch) => { if (patch.sex) setSexPicked(true); changeBody(patch); }} counter={counter} shown={aboutTried ? bodyWrong : partWrong} />
            <div aria-hidden className="h-6 shrink-0" />
            <Bottom>
              {aboutLine && <p id={WHY_GREY} className={WHY_GREY_LINE}>{aboutLine}</p>}
              {nothingTyped ? (
                <BottomButton onClick={skipThis}>{t("Skip these")}</BottomButton>
              ) : (
                <BottomButton
                  disabled={bodyWrong.length > 0}
                  onBlocked={showProblem}
                  describedBy={aboutLine ? WHY_GREY : undefined}
                  onClick={() => {
                    if (under18Typed) undoWorkedOut();
                    forward("about", "next", { ...answers, under18: under18Typed });
                  }}
                >
                  {t("Continue")}
                </BottomButton>
              )}
            </Bottom>
          </section>
        </>
      )}

      {step === "active" && (
        <>
          {top}
          <section className={`${STEP_TOP} flex flex-1 flex-col`}>
            <ActivityStep activity={activityPicked ? body.activity : null} pick={(activity) => { changeBody({ activity }); setActivityPicked(true); }} counter={counter} />
            <div aria-hidden className="h-6 shrink-0" />
            <Bottom>
              {!activityPicked && <p id={WHY_GREY} className={WHY_GREY_LINE}>{t("Pick one, or tap Skip.")}</p>}
              <BottomButton disabled={!activityPicked} describedBy={activityPicked ? undefined : WHY_GREY} onClick={() => { if (!activityPicked) return; saveWorkedOut(); forward("active"); }}>{t("See my plan")}</BottomButton>
            </Bottom>
          </section>
        </>
      )}

      {step === "plan" && (
        <>
          {top}
          <PlanStep
            counter={counter}
            goal={goalSkipped ? null : goal}
            prefs={prefs}
            onDish={setFirstDish}
            targets={{ fields: target.fields, setField: target.setField, reading: targetReading, starting: planStarting, under18: answers.under18, notes: planNotes, save: saveTargets }}
            bottom={{
              next: run.signedIn ? t("Save and go to Home") : t("Save my plan"),
              onNext: () => {
                // the numbers as they stand (worked out, starting or typed) are saved; a box left wrong while changing them keeps the person here
                if (!answers.under18 && !saveTargets()) return;
                forward("plan");
              },
            }}
          />
        </>
      )}
    </div>
  );
}

/** The replay's recipes: a first recipe can be chosen there too, but nothing keeps it. */
function ReplayRecipes({ top, counter, bottom }: { top: React.ReactNode; counter: string; bottom: { next: string; onNext: () => void } }) {
  const [chosen, setChosen] = useState<string | null>(null);
  return <RecipesStep top={top} counter={counter} chosen={chosen} onChoose={setChosen} bottom={bottom} />;
}
