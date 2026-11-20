"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { parseNumber } from "@/lib/mm/addFood";
import { analytics, reportSetupScreen } from "@/lib/mm/analytics";
import { tk } from "@/lib/mm/i18n";
import { dayParam } from "@/lib/mm/day";
import { EMPTY_BODY, bodyProblems, planFromAnswers, readTargetFields, type BodyAnswers } from "@/lib/mm/onboardingPlan";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeShopSet } from "@/lib/mm/shopProducts";
import { mealPlanStore, settingsStore, updateSettings } from "@/lib/mm/stores";
import { afterSignIn, sanitizeResume, SIGN_IN_RESUME_KEY, TYPED_SETUP_KEYS, typedSetup, type SignInReason, type SignInResume, type TypedSetup } from "@/lib/mm/signInGate";
import type { Goal } from "@/lib/mm/types";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/mm/user-data";
import {
  backFrom, moveOn, NO_ANSWERS, progressNote, QUESTION_STEPS, resumeAt, startRun, stepCounter, welcomeProgressStore,
  type FirstDish, type WelcomeAnswers, type WelcomeMove, type WelcomeRun, type WelcomeStepId,
} from "@/lib/mm/welcomeSteps";
import { InfoBanner } from "../_components/Note";
import { SignInSheet, SigningIn } from "../_components/SignIn";
import { SignInScreen } from "../_components/SignInScreen";
import { holdTrialOfferThisVisit } from "../_components/TrialOffer";
import { Spinner } from "../_components/ui";
import { signInOutcome, signInSettled, useAccountChecking, useAccountUser } from "../_lib/account";
import { useSignInRequired } from "../_lib/appSwitches";
import { travelBack } from "../_lib/backNav";
import { useHydrated, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { ActivityStep, AboutYouStep, AGE_BOX, YourSizeStep } from "./BodySteps";
import { Cover, type CoverNotice } from "./Cover";
import { EatOutStep, RecipesStep, WeekStep } from "./FeatureSteps";
import { finishWelcome, type WelcomeEnding } from "./finish";
import { preloadShowcaseMenus } from "./EatOutShowcase";
import { Bottom, BottomButton, QuietLink, reducedMotion, SCREEN, TopBar, TopButton, WHY_GREY, WHY_GREY_LINE } from "./Frame";
import { AvoidStep, GoalStep, ShopsStep } from "./QuestionSteps";
import { TargetsStep } from "./TargetsStep";
import { useTargetFields } from "./useTargetFields";
import { prepareWeek } from "./WeekShowcase";

// The welcome screens (the onboarding redesign meeting of 20 November 2026, docs/meetings/2026-11-20-onboarding-redesign.json; approved by the founder: "Whatever
// the meeting ... conclude, go with that"). Showing what the app does, made from the person's own answers, instead of a tour: after the cover, eleven steps in
// one honest counter (lib/mm/welcomeSteps.ts), each straight before the screen it changes:
//    1 What's your goal? · 2 Anything you avoid? · 3 Know before you order (real dishes at a restaurant, free) · 4 Where do you shop? · 5 Recipes from {shop}
//    (two of our recipes priced there, free) · 6 About you · 7 Your height and weight · 8 How active are you? · 9 Your daily targets · 10 Your week, planned
//    (Meal plan, Premium where sold) · 11 Save your plan: make your free account
// A run that starts signed in (a Settings rerun, an account not set up yet that signed in from the cover, someone who signed in at a page) has no step 11:
// "Step n of 10", and step 10's button is "Save and go to Home". The total is fixed for the run before step 1; the counter never restarts and only jumps forward
// ("Skip these questions" and an age under 18 go from 6 to 9; step 3's "Skip setup and make my account" goes to 11). Back goes to the last screen actually shown.
// - The cover (Cover.tsx): Get started, or "Carry on from step {n}" with "Start again" for someone who left part-way (mm.v1.welcomeProgress, written at each
//   step; the questions about the body resume at About you, because those answers are never kept), the status line after Clear data (?cleared=1) or after
//   "Delete my account" (?deleted=1), and "Already have an account? Sign in" ("Welcome back. Sign in": an account already set up goes straight to Home with its
//   own settings; one not set up yet goes on as a signed-in run of 10). A set-up person who signed out and taps Get started meets that same screen.
// - Pip's one entrance is on step 1; he listens on steps 2, 4 and 8 and waves on step 11. He is off the feature screens (3, 5, 10) and the number screens
//   (6, 7, 9): they carry figures, prices, money or typed body measurements (the founder's 20 November rule, made strict by the meeting).
// - What is saved: the goal, the foods avoided, the shops and the targets, each on its Continue (so someone who leaves keeps them); the answers about the body
//   stay in this page's memory only and are gone when it closes (CLAUDE.md rule 4). Nothing of the person's own (their food log, favourites, lists, saved
//   meals or recipes) is written before an account exists: the restaurant left showing on step 3 and the recipe chosen on step 5 are navigation hints only.
// - Every ending goes through finishWelcome (finish.ts): after signing in at step 11, after "Not now" where sign-in is optional, and at the end of a signed-in
//   run; then straight to Home, where the toast and the one-time Start here card take over. There is no "You're all set!" screen, no confetti and no fork.
// - ?showcase=1 (Settings › Help › "Show me what Numbite can do", Home's StartPrompt): steps 3, 5 and 10 again with the person's current settings, "{n} of 3",
//   Close, Next and Done; nothing is saved. An old ?tour=1 link opens the same.
// - The website's Apple and Google sign-in leaves the page and comes back with ?signin=ok: why the sign-in screen was showing, what was typed and the two hints
//   wait in this tab's session storage meanwhile (lib/mm/signInGate.ts SignInResume; never the answers about the body). One that didn't finish comes back with
//   ?signin=cancelled, failed, expired or busy: the same screen opens again with a line saying what happened, and the address is tidied (the 20 November 2026
//   audit). After signing out, ?signedout=1 puts a line on the cover; where everyone signs in, the cover has no Back for someone signed out.
// - The 20 November 2026 audit also: the note records whether step 1's goal was chosen (so it shows ticked after "Carry on"); "Carry on" past the questions
//   about the person keeps the targets worked out from them as the person's own; nothing is ticked for sex until a tile is tapped; a tap on About you's grey
//   Continue brings the Age box into view; on a short screen (under 620 px) step 11 leaves out the recipe line so the sign-in buttons come first.

type View =
  | { kind: "cover" }
  | { kind: "step"; step: WelcomeStepId }
  /** the cover's "Already have an account? Sign in" */
  | { kind: "returning" }
  /** ?showcase=1: the three feature screens again */
  | { kind: "replay"; index: number };

/** The replay's screens, in order. */
const REPLAY: readonly WelcomeStepId[] = ["eatOut", "recipes", "week"];

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

/** A screen too short for step 11's extra lines above the sign-in buttons (an iPhone SE at large text, a 320 x 568 phone). */
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
  // the run, fixed when the steps begin (a run started signed out has the account as step 11)
  const [run, setRun] = useState<WelcomeRun>(() => startRun(false));
  // back from Apple or Google at the account step: Back from it goes where it would have (to step 3 after its link), and the body answers are gone
  const [answers, setAnswers] = useState<WelcomeAnswers>(() => (resume?.reason === "setup" ? resumeAt(startRun(false), { step: "save", savedOn: "", ...(progress?.skippedSetup ? { skippedSetup: true as const } : {}) })?.answers ?? NO_ANSWERS : NO_ANSWERS));
  const [view, setView] = useState<View>(() => (replay ? { kind: "replay", index: 0 } : resume?.reason === "setup" ? { kind: "step", step: "save" } : resume?.reason === "returning" ? { kind: "returning" } : { kind: "cover" }));
  // came back to the account step through "Carry on" (its Pip line says the answers are still here)
  const [resumed, setResumed] = useState(false);
  // the navigation hints for Home's Start here card: the recipe chosen on step 5 and the restaurant dish left showing on step 3
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
  // Skip on step 1 leaves the goal unset for step 3's list ("Most protein for the calories")
  const [goalSkipped, setGoalSkipped] = useState(false);
  const target = useTargetFields(initial);
  const [prefs, setPrefs] = useState(initial.preferences);
  const [shops, setShops] = useState<string[]>(initial.shops ?? []);
  // The answers about the person (steps 6-8): React state only, never saved or sent; dropped with this page when the welcome screens end.
  const [body, setBody] = useState<BodyAnswers>(EMPTY_BODY);
  // Nothing is picked on "How active are you?" until a tile is tapped, on every run (the answers are never stored, so a re-run has nothing real to show).
  const [activityPicked, setActivityPicked] = useState(false);
  // Nor for sex on About you: "Prefer not to say" is what the sums use until a tile is tapped, but no tile shows as chosen (the onboarding meeting).
  const [sexPicked, setSexPicked] = useState(false);
  const plan = useMemo(() => planFromAnswers({ goal, prefs, body }), [goal, prefs, body]);
  const changeBody = (patch: Partial<BodyAnswers>) => setBody((b) => ({ ...b, ...patch }));
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
      // the goal chosen before: ticked (with Pip's reaction, not his hello) if the person goes Back to step 1
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

  // Signed in at the account step or from the cover's link (in the iPhone app at once; on the website back from Apple or Google, once the app knows who): wait for
  // the account's settings, then carry on (lib/mm/signInGate.ts afterSignIn). Meanwhile "Signing you in…".
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

  // ------------------------------------------------------------------------------------------------ notes, counts, focus

  // The step reached, kept on this phone so a plain launch can carry on from it (never in the replay).
  useEffect(() => {
    if (replay || view.kind !== "step" || finishing.current) return;
    welcomeProgressStore.set(progressNote({ step: view.step, answers, firstRecipeId, firstDish, goalPicked: goalSaved }, dayParam(new Date())));
  }, [replay, view, answers, firstRecipeId, firstDish, goalSaved]);

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

  // The week for step 10 is worked out while "Your daily targets" shows: 600 ms after it has drawn or after the last change (never while typing), in chunks that
  // hand control back to the screen, into the cache step 10 and Meal plan read. A change of numbers stops the old sums; going on to step 10 lets them finish.
  const targetReading = readTargetFields(target.fields, goal === "glp1");
  const weekKey = runStep === "targets" && plan.plan.kind !== "under18" && targetReading.problems.length === 0 && targetReading.calories !== undefined
    ? JSON.stringify([goal, targetReading.calories, targetReading.protein, goal === "glp1" ? targetReading.mealCap : null])
    : "";
  const weekWork = useRef<{ key: string; stop: AbortController } | null>(null);
  useEffect(() => {
    if (!weekKey || replay || weekWork.current?.key === weekKey) return;
    const id = window.setTimeout(() => {
      weekWork.current?.stop.abort();
      const stop = new AbortController();
      weekWork.current = { key: weekKey, stop };
      const now = settingsStore.get();
      const [g, calories, protein, mealCap] = JSON.parse(weekKey) as [Goal, number, number | undefined, number | null];
      void prepareWeek({ goal: g, dailyCalories: calories, dailyProtein: protein ?? undefined, glp1MealCap: mealCap ?? now.glp1MealCap }, now.preferences, now.shops, stop.signal);
    }, 600);
    return () => window.clearTimeout(id);
  }, [weekKey, replay]);
  useEffect(() => () => weekWork.current?.stop.abort(), []);

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
    const top = <TopBar start={<TopButton onClick={leave}>{t("Close")}</TopButton>} segments={REPLAY.length} current={i} status={t("{n} of {total}", { n: i + 1, total: REPLAY.length })} />;
    const counter = t("{n} of {total}", { n: i + 1, total: REPLAY.length });
    const bottom = { next: last ? t("Done") : t("Next"), onNext: () => (last ? leave() : setView({ kind: "replay", index: i + 1 })) };
    return (
      <div key={`replay-${i}`} className={SCREEN}>
        {REPLAY[i] === "eatOut" && <EatOutStep top={top} counter={counter} goal={settings.goal} prefs={settings.preferences} bottom={bottom} />}
        {REPLAY[i] === "recipes" && <ReplayRecipes top={top} counter={counter} bottom={bottom} />}
        {REPLAY[i] === "week" && <WeekStep top={top} counter={counter} planLine={planThisWeek(savedPlan?.start, dayParam(new Date()))} bottom={bottom} />}
      </div>
    );
  }

  const step = view.step;
  const counter = counterOf(step);
  const index = run.steps.indexOf(step);
  const skipThis = () => {
    analytics.track({ name: "onboardingSkipped", step });
    if (step === "goal") {
      // Skip never saves: the goal goes back to what is saved, and step 3 uses "Most protein for the calories"
      setGoal(settingsStore.get().goal);
      setGoalTouched(false);
      setGoalSkipped(!wasOnboarded);
    } else if (step === "avoid") {
      setPrefs(settingsStore.get().preferences);
      preloadShowcaseMenus();
    } else if (step === "shops") {
      setShops(settingsStore.get().shops ?? []);
    }
    forward(step);
  };
  const top = (
    <TopBar
      onBack={() => back(step)}
      end={QUESTION_STEPS.includes(step) ? <TopButton onClick={skipThis}>{t("Skip")}</TopButton> : undefined}
      segments={run.total}
      current={index}
      status={counter}
    />
  );

  // The account step (step 11): the sign-in screen as the bar's last segment, with Back. Where sign-in is optional, it also has "Not now".
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

  const problems = bodyProblems(body);
  const skipBody = () => {
    analytics.track({ name: "onboardingSkipped", step });
    setBody(EMPTY_BODY);
    setActivityPicked(false);
    setSexPicked(false);
    target.applyPlan(null);
    forward(step, "skipBody");
  };
  // Continue on "Your daily targets": all four numbers as they stand (typed or filled in) are saved. A protein, carbs or fat box left empty stays unset, so Home
  // works it out. The targets count as set only when they are the person's own: worked out from the questions, a suggestion they asked for, or a box they
  // changed. Untouched starting numbers stay marked as starting numbers. Never written as false, so a Settings rerun keeps targets set before.
  const saveTargets = () => {
    const r = targetReading;
    if (r.problems.length > 0 || r.calories === undefined) return;
    const workedOut = !answers.bodySkipped && plan.plan.kind === "ok";
    const suggested = target.suggestedNotes !== null;
    const changed = TARGET_BOXES.some((k) => parseNumber(target.fields[k]) !== parseNumber(target.start[k]));
    updateSettings({
      dailyCalories: r.calories,
      ...(workedOut || suggested || changed ? { hasSetTargets: true } : {}),
      dailyProtein: r.protein,
      dailyCarbs: r.carbs,
      dailyFat: r.fat,
      ...(goal === "glp1" && r.mealCap !== undefined ? { glp1MealCap: r.mealCap } : {}),
    });
    forward("targets");
  };
  const defaultShop = recipeShopSet(manifest, null, [])[0];
  /** A tap on About you's grey Continue: the Age box into view, ready to type in. */
  const showAgeBox = () => {
    const box = document.getElementById(AGE_BOX);
    box?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    box?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  };
  // back after "Carry on" past the questions about the person: the targets on the boxes were worked out from them before (they are the person's own)
  const keptTargets = !!answers.bodyGone && settingsStore.get().hasSetTargets === true;

  return (
    <div key={step} className={SCREEN}>
      {step === "goal" && (
        <>
          {top}
          <GoalStep
            goal={goal}
            shown={goalShown}
            reacted={goalTouched}
            pick={(g) => { setGoal(g); setGoalTouched(true); }}
            onContinue={() => { updateSettings({ goal }); setGoalSkipped(false); setGoalSaved(true); forward("goal"); }}
            counter={counter}
            total={run.total}
            jump={!pipHasJumped}
          />
        </>
      )}

      {step === "avoid" && (
        <>
          {top}
          <AvoidStep prefs={prefs} setPrefs={setPrefs} counter={counter} onContinue={() => { updateSettings({ preferences: prefs }); preloadShowcaseMenus(); forward("avoid"); }} />
        </>
      )}

      {step === "eatOut" && (
        <EatOutStep
          top={top}
          counter={counter}
          goal={goalSkipped ? null : settings.goal}
          prefs={settings.preferences}
          onDish={setFirstDish}
          bottom={{
            next: t("Next: where you shop"),
            onNext: () => forward("eatOut"),
            link: {
              label: run.signedIn ? t("Skip the rest and go to Home") : t("Skip setup and make my account"),
              onClick: () => { analytics.track({ name: "onboardingSkipped", step: "eatOut" }); forward("eatOut", "skipSetup"); },
            },
          }}
        />
      )}

      {step === "shops" && (
        <>
          {top}
          <ShopsStep
            shops={shops}
            setShops={setShops}
            counter={counter}
            defaultShop={defaultShop}
            onContinue={() => {
              updateSettings({ shops: shops.length ? shops : undefined });
              // none ticked: the default recipe shop's file starts loading for the next screen (a ticked shop's started on the tick: ShopPicker's `warm`)
              if (!shops.length && defaultShop) void loadShopFile(defaultShop).catch(() => undefined);
              forward("shops");
            }}
          />
        </>
      )}

      {step === "recipes" && (
        <RecipesStep top={top} counter={counter} chosen={firstRecipeId} onChoose={setFirstRecipeId} bottom={{ next: t("Next: your daily numbers"), onNext: () => forward("recipes") }} />
      )}

      {/* The three questions about the person: why Continue is grey is said beside it and linked to it, and "Skip these questions" sits quietly under it (no
          top-right pill on steps 6 to 8: the link is the skip). An age under 18 goes straight to the targets, where nothing is worked out. */}
      {step === "about" && (
        <>
          {top}
          <section className="mt-5 flex flex-1 flex-col">
            <AboutYouStep body={body} sex={sexPicked ? body.sex : null} change={(patch) => { if (patch.sex) setSexPicked(true); changeBody(patch); }} counter={counter} />
            <Bottom>
              {problems.includes("age") && <p id={WHY_GREY} className={WHY_GREY_LINE}>{body.age.trim() === "" ? t("Type your age in the Age box to go on, or skip these questions.") : t("Check your age in the Age box: a whole number from 18 to 100.")}</p>}
              <BottomButton
                disabled={problems.includes("age")}
                onBlocked={showAgeBox}
                describedBy={problems.includes("age") ? WHY_GREY : undefined}
                onClick={() => {
                  const under18 = plan.plan.kind === "under18";
                  if (under18) target.applyPlan(plan.plan);
                  forward("about", "next", { ...answers, under18 });
                }}
              >
                {t("Continue")}
              </BottomButton>
              <QuietLink onClick={skipBody}>{t("Skip these questions")}</QuietLink>
            </Bottom>
          </section>
        </>
      )}

      {step === "size" && (
        <>
          {top}
          <section className="mt-5 flex flex-1 flex-col">
            <YourSizeStep body={body} change={changeBody} counter={counter} />
            <Bottom>
              {problems.some((p) => p !== "age") && <p id={WHY_GREY} className={WHY_GREY_LINE}>{t("Fill in your height and weight above to go on, or skip these questions below.")}</p>}
              <BottomButton disabled={problems.some((p) => p !== "age")} describedBy={problems.some((p) => p !== "age") ? WHY_GREY : undefined} onClick={() => forward("size")}>{t("Continue")}</BottomButton>
              <QuietLink onClick={skipBody}>{t("Skip these questions")}</QuietLink>
            </Bottom>
          </section>
        </>
      )}

      {step === "active" && (
        <>
          {top}
          <section className="mt-5 flex flex-1 flex-col">
            <ActivityStep activity={activityPicked ? body.activity : null} pick={(activity) => { changeBody({ activity }); setActivityPicked(true); }} counter={counter} />
            <Bottom>
              {!activityPicked && <p id={WHY_GREY} className={WHY_GREY_LINE}>{t("Pick the one closest to your week to go on, or skip these questions below.")}</p>}
              <BottomButton disabled={!activityPicked} describedBy={activityPicked ? undefined : WHY_GREY} onClick={() => { if (!activityPicked) return; target.applyPlan(plan.plan); forward("active"); }}>{t("Work out my numbers")}</BottomButton>
              <QuietLink onClick={skipBody}>{t("Skip these questions")}</QuietLink>
            </Bottom>
          </section>
        </>
      )}

      {step === "targets" && (
        <>
          {top}
          <TargetsStep
            goal={goal}
            prefs={prefs}
            answers={answers.bodySkipped ? null : plan}
            skipped={(answers.bodySkipped && !keptTargets) || (!answers.bodySkipped && plan.plan.kind === "invalid")}
            kept={keptTargets}
            fields={target.fields}
            setField={target.setField}
            reading={targetReading}
            suggestedNotes={target.suggestedNotes}
            applySuggestion={target.apply}
            counter={counter}
          />
          <Bottom>
            <BottomButton disabled={targetReading.problems.length > 0} onClick={saveTargets}>{answers.under18 ? t("Next") : t("Next: plan my week")}</BottomButton>
          </Bottom>
        </>
      )}

      {step === "week" && (
        <WeekStep
          top={top}
          counter={counter}
          under18={answers.under18}
          // "your numbers", not "your plan": the week shown here isn't kept (step 11 makes the account that keeps the goal and the numbers)
          bottom={{ next: run.signedIn ? t("Save and go to Home") : t("Next: save your numbers"), onNext: () => forward("week") }}
        />
      )}
    </div>
  );
}

/** The replay's recipes: a first recipe can be chosen there too, but nothing keeps it. */
function ReplayRecipes({ top, counter, bottom }: { top: React.ReactNode; counter: string; bottom: { next: string; onNext: () => void } }) {
  const [chosen, setChosen] = useState<string | null>(null);
  return <RecipesStep top={top} counter={counter} chosen={chosen} onChoose={setChosen} bottom={bottom} />;
}
