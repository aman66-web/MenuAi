"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseNumber } from "@/lib/mm/addFood";
import { formatInt } from "@/lib/mm/format";
import { retailerName } from "@/lib/mm/groceries";
import { POPULAR_ORDER } from "@/lib/mm/popular";
import { analytics } from "@/lib/mm/analytics";
import { GATING_ENABLED, LOGOS_ENABLED, SIGN_IN_REQUIRED, TEXT_SIZE_CHOICE_ENABLED } from "@/lib/mm/config";
import { tk } from "@/lib/mm/i18n";
import { EMPTY_BODY, bodyProblems, planFromAnswers, readTargetFields, type BodyAnswers } from "@/lib/mm/onboardingPlan";
import { recipeShopSet } from "@/lib/mm/shopProducts";
import { macroTargets } from "@/lib/mm/targets";
import { coachAfterWelcome } from "@/lib/mm/coach";
import { coachStore, settingsStore, tourStore, updateSettings } from "@/lib/mm/stores";
import { TOUR_VERSION } from "@/lib/mm/tour";
import type { Goal, Preferences } from "@/lib/mm/types";
import { TEXT_SCALE, type TextSize, type UserSettings } from "@/lib/mm/user-data";
import { ALLERGEN_SHORT, DietPicker } from "../_components/DietPicker";
import {
  BoltIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, DotsIcon, FlameIcon, GiftIcon, LeafIcon,
  PillIcon, ScaleIcon, SearchIcon, ShieldIcon, TextSizeIcon, TrendDownIcon,
} from "../_components/icons";
import { LogoWall, type WallItem } from "../_components/LogoWall";
import { logoFor } from "@/lib/mm/logos";
import { RETAILERS } from "@/lib/mm/groceries";
import { site } from "@/site.config";
import { Pip, PipSays } from "../_components/Mascot";
import { ShopPicker } from "../_components/ShopPicker";
import { FRIENDS_APP_PATH } from "@/lib/community/friendCode";
import { SHARED_APP_PATH } from "@/lib/mm/shareList";
import { ActivityStep, AboutYouStep, YourSizeStep } from "./BodySteps";
import { CARD, FREE_PREMIUM_LINE, GOAL_REACTION, HEADLINE } from "./parts";
import { RecipeChoice } from "./RecipeChoice";
import { TargetsStep } from "./TargetsStep";
import { PipTour, TOUR_STOPS, TourRows } from "./Tour";
import { useTargetFields } from "./useTargetFields";
import { SignInSheet } from "../_components/SignIn";
import { SignInScreen } from "../_components/SignInScreen";
import { useAccountChecking, useAccountUser } from "../_lib/account";
import { radioKeyNav, Spinner } from "../_components/ui";
import { travelBack } from "../_lib/backNav";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useHydrated, useIsPro, useMenu, useSettings } from "../_lib/hooks";
import { recipeShopSetFor } from "../_lib/recipes";
import { loadShopFile, loadShopManifest, useShopManifest } from "../_lib/shopProducts";
import { TABS } from "../_lib/tabs";
import { applyTextSize } from "../_lib/textSize";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// SPEC §7.1 and §8, made friendlier at the founder's request (2026-10-10): Pip the mascot says what each step is for, buttons are big,
// one question per screen. The SPEC's step headings are kept. Skip skips that step only (defaults stay), except on the three questions about the person,
// where it skips all three. Step 2 asks about foods to leave out (the web app has no location step); step 7 asks which supermarkets they use (founder
// 2026-10-10: the app is for eating out, shopping and cooking).
// The numbers come late (founder 2026-10-16: "come to this screen later ... arrive on this screen with pre typed information which they can change"):
// goal (1), foods to avoid (2), about you (3), your height and weight (4), how active (5), then "Your daily targets" (6) arrive filled in from all of that
// (lib/mm/onboardingPlan.ts, targets.ts), and every number can still be changed. What was typed about the person lives in this page's state only and
// is gone when onboarding ends (CLAUDE.md rule 4).
// The look (founder 2026-10-14, from a reference picture: "make the screens look amazing like this"): the app's name and Skip at the top,
// the progress as segments, a very large headline with a small picture pill in it, one picture or card per screen, and a big plain pill
// button at the bottom (the words only: founder 2026-10-15, "get rid of those two circles ... it just looks weird"). No food photographs (CLAUDE.md rule 2): the pictures are Pip, the moving wall of the restaurants and
// shops in the app, and our own plate.
// Pip leads all of it (founder 2026-10-15, "Pip appears with a cool animation, then walks them through the app ... makes them excited,
// like Duolingo"): Pip jumps in on the first screen, then hops along a copy of the tab bar and says what each tab is for, and on every question Pip hops in,
// says a line and reacts to the answer.
// The welcome tour (2026-11-17, lib/mm/tour.ts): a first plain launch comes here. The text size is chosen first (so the rest is already readable), each stop
// of the walk is Pip's one line over a copy of the tab bar (Tour.tsx; "What you can do" on each tab is in the replay only, the onboarding meeting of 19 November),
// and the walk ends on a choice: "Set up my daily numbers" (the questions) or "Look around first" (Home, where the setup card waits). Reaching that choice, Skip on the welcome screen, "Look around first" and the end of the questions mark the tour as seen on
// this phone (mm.v1.tour, never synced). ?tour=1 replays only the stops (Settings › Help › "Show me around again"), writes nothing and returns to where it was opened.
// One honest counter (the onboarding meeting, 19 November: a 7-segment bar, then "Step 1 of 9", then "Tip 1 of 7" moved the finish line three times): the cover and
// the first-run walk show no bar and no counter (each stop's headline says "stop n of 4" to a screen reader only); the seven questions show "Step n of 7" and their
// bar; the last screen shows neither. The replay keeps its own "Step n of 4" and bar.

const GOALS: ReadonlyArray<{ value: Goal; label: string; hint: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { value: "lose", label: tk("Lose weight"), hint: tk("Meals and orders that fit a lower calorie target"), Icon: TrendDownIcon },
  { value: "maintain", label: tk("Maintain"), hint: tk("Keep my weight steady"), Icon: ScaleIcon },
  { value: "buildMuscle", label: tk("Build muscle"), hint: tk("Higher-protein meals and orders"), Icon: BoltIcon },
  { value: "glp1", label: tk("I'm on a GLP-1 medication"), hint: tk("Smaller, protein-first orders"), Icon: PillIcon },
  { value: "other", label: tk("Other"), hint: tk("Something else, or just here for the numbers"), Icon: DotsIcon },
];

const SIZES: ReadonlyArray<{ value: TextSize; label: string }> = [
  { value: "standard", label: tk("Standard") },
  { value: "large", label: tk("Large") },
  { value: "xlarge", label: tk("Extra large") },
];

// Step 0's screens, in order: the welcome cover (0), Pip's arrival (1), the text size, the five stops of Pip's walk (one per tab) and the choice at the end.
// With the text size choice off (founder 2026-11-19, "Just keep standard pls"; lib/mm/config.ts) there is no text size screen: the walk follows Pip's arrival.
const COVER = 0, TEXT = TEXT_SIZE_CHOICE_ENABLED ? 2 : -1, STOP0 = TEXT_SIZE_CHOICE_ENABLED ? 3 : 2, FORK = STOP0 + TOUR_STOPS.length;
// Seven questions (the counter's "Step n of 7": SHOPS is the last of them), then "You're all set!" (8), which also offers a first recipe (the onboarding meeting,
// 19 November: "all set" at step 8 of 9 wasn't true). The three about the person (3-5) are skipped together.
const GOAL = 1, AVOID = 2, ABOUT = 3, SIZE = 4, ACTIVE = 5, TARGETS = 6, SHOPS = 7, ALL_SET = 8;
// The four daily target boxes (not GLP-1's meal size): a change to any of them makes the targets the person's own (saveTargets).
const TARGET_BOXES = ["calories", "protein", "carbs", "fat"] as const;
// Logo files over about 60 KB: kept off the welcome wall so the first screen loads quickly (they still show everywhere else; a chain with
// its own small square icon is shown by that instead).
const HEAVY_LOGOS = new Set(["british-garden-centres", "daves-hot-chicken", "pubsmiths", "popeyes", "park-holidays-uk", "toby-carvery", "the-breakfast-club", "butcombe-inns", "parsons-bakery", "buzz-bingo", "greene-king", "giggling-squid", "joseph-holt", "castle-carvery"]);

const SCREEN = "flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col";
const LIME = "bg-[var(--sun)]"; // the brand's flat lime: no gradients (founder 2026-10-15)
// A round grey button like Home's calendar button: a 36 px circle inside a 44 px tap area.
const ROUND = "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const ROUND_IN = "inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-[color:var(--edge)] bg-soft transition-colors group-hover:bg-[var(--fill)]";
// Every headline takes the focus when its screen appears (so a screen reader starts there); the app's no-focus-box rule (17 Nov) keeps it unboxed.
const H1 = "outline-none";
// The line beside a grey Continue that says why it is grey (one screen at a time, so one id), linked to the button with aria-describedby.
const WHY_GREY = "welcome-why-grey";
const WHY_GREY_LINE = "mb-2 text-center text-[0.9375rem] font-semibold leading-snug";

/**
 * Where onboarding ends: the page the visitor first opened if it is inside the app (`?next=`), else Home. A shared shopping list's code travels in
 * the "#" of this page's own address (never in the query, which a server would see) and goes back onto the end of that page.
 */
function afterOnboarding(): string {
  const target = new URLSearchParams(window.location.search).get("next");
  if (!target || !/^\/app(?![\w-])/.test(target) || target.startsWith("//") || target.startsWith("/app/welcome")) return "/app";
  return target.includes("#") ? target : target + window.location.hash;
}

/** The welcome screens are a static shell (like the restaurant page): `?tour=1` is read once on the phone, with the loading line until then. */
export default function WelcomePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const router = useRouter();
  const accountUser = useAccountUser();
  const accountChecking = useAccountChecking();
  const params = useSearchParams();
  // ?tour=1: just the five stops again (Settings › Help, or the setup card's "Show me around"), "Step n of 5", with Close; nothing is saved.
  const [replay] = useState(() => params.get("tour") === "1");
  // Came to read a shopping list a friend sent, or to add a friend from an invite link: the last screen goes straight there (no recipe or restaurant to choose)
  const arrival = [SHARED_APP_PATH, FRIENDS_APP_PATH].some((p) => (params.get("next") ?? "").startsWith(p));
  const menu = useMenu();
  const initial = settingsStore.get();
  // The app is English only (founder 2026-10-16), so there is no language screen. Step 0 is the welcome cover, then Pip's arrival, the text size,
  // the walk through the app and the choice (intro 1-8), then the seven questions (steps 1-7) and "You're all set!" with a first recipe (8).
  const [step, setStep] = useState(0);
  // Back from Apple or Google sign-in on the website (it adds ?signin=ok to this page): carry on after the cover, where Get started led
  const [intro, setIntro] = useState(replay ? STOP0 : params.get("signin") === "ok" ? COVER + 1 : COVER);
  // set by "Skip tour", so the choice at the end doesn't say "That's the tour!" to someone who skipped it (the review of 2026-11-18)
  const [skippedTour, setSkippedTour] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  // Everyone signs in (founder 2026-11-17, SIGN_IN_REQUIRED): Get started on the cover opens the sign-in screen first; the tour and the questions follow it.
  const [signingUp, setSigningUp] = useState(false);
  const hydrated = useHydrated();
  // what has been saved so far: "You're all set!" shows this, so it is always what Home will show
  const settings = useSettings();
  const onboarded = settings.hasCompletedOnboarding;
  const [wasOnboarded] = useState(initial.hasCompletedOnboarding);
  // the supermarkets that have a full list in the app (Groceries' "Which shop?"), for the welcome wall's label
  const shopLists = useShopManifest();

  // Signed in from this screen (an account that has already been set up, on a new phone): the settings arrive with the sync during this
  // visit, so skip the questions. Someone who was already set up and opened this screen on purpose stays on it.
  useEffect(() => {
    if (!hydrated || wasOnboarded || !onboarded || step > 0) return;
    router.replace(afterOnboarding());
  }, [hydrated, wasOnboarded, onboarded, step, router]);
  const t = useT();
  const [goal, setGoal] = useState<Goal>(initial.goal);
  const target = useTargetFields(initial);
  const [prefs, setPrefs] = useState(initial.preferences);
  const [size, setSize] = useState<TextSize>(initial.textSize ?? "standard");
  const [shops, setShops] = useState<string[]>(initial.shops ?? []);
  // The answers about the person (steps 3-5): React state only, never saved or sent; dropped with this page when onboarding ends.
  const [body, setBody] = useState<BodyAnswers>(EMPTY_BODY);
  // Skip on any of the three: the targets screen has nothing filled in; and the step to go Back to when the questions were left by a jump (skip, or under 18)
  const [bodySkipped, setBodySkipped] = useState(false);
  const [jumpedFrom, setJumpedFrom] = useState<number | null>(null);
  // Nothing is picked for the person on "How active are you?" (eight testers flagged the pre-ticked Lightly active): no tile is ticked until one is tapped, on every
  // run (the answers are never stored, so a re-run has nothing real to show). Back keeps it; skipping the questions clears it. body.activity is only read once it is true.
  const [activityPicked, setActivityPicked] = useState(false);
  const answers = useMemo(() => planFromAnswers({ goal, prefs, body }), [goal, prefs, body]);
  const changeBody = (patch: Partial<BodyAnswers>) => setBody((b) => ({ ...b, ...patch }));
  const [goalTouched, setGoalTouched] = useState(false);
  // Nothing is picked for the person on a first run (the onboarding meeting: about twelve noticed the pre-ticked Maintain, and a VoiceOver user hears "selected"
  // and moves on): no goal is ticked until one is tapped. Someone already set up who runs this again sees their saved goal ticked. Skip keeps the saved goal.
  const goalShown = wasOnboarded || goalTouched;
  const [sizeTouched, setSizeTouched] = useState(false);
  const isPro = useIsPro();
  // Once a finish has started (a recipe card, the restaurant row, Go to Home), a second tap does nothing: it would open the page twice.
  const finishing = useRef(false);
  const pickGoal = (g: Goal) => {
    setGoal(g);
    setGoalTouched(true);
  };

  // Warm up the first recipe screen: by the last questions, start loading the full lists of the shops its recipes come from (a few hundred KB to a few MB each;
  // RecipeChoice loads the same set, recipeShopSetFor). Each is loaded once and cached, and a failure here only means the recipe screen loads it itself.
  useEffect(() => {
    if (step < SHOPS) return;
    void loadShopManifest().then((m) => Promise.all(recipeShopSetFor(m, null, settingsStore.get().shops).map((id) => loadShopFile(id).catch(() => undefined)))).catch(() => undefined);
  }, [step]);
  // Every new screen starts at the top with its headline focused, so a screen reader reads it first (a headline drawn by another file gets tabindex -1 here).
  // Done as the screen is put in place, before it is drawn, so it can never take the focus back from a box or a choice tapped straight after the screen appears.
  // Not when the page first opens on the welcome cover: a screen reader then starts at the top as usual (Back or Skip, then "Welcome to Numbite" above the headline).
  const firstScreen = useRef(true);
  useLayoutEffect(() => {
    const first = firstScreen.current;
    firstScreen.current = false;
    if (first && step === 0 && intro === COVER) return;
    window.scrollTo({ top: 0 });
    const h = document.querySelector<HTMLElement>("main h1");
    if (!h) return;
    if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  }, [step, intro]);
  // Reaching the choice at the end of the walk marks the tour as seen on this phone, so it never starts again by itself, even if the app is closed during the
  // questions. The replay writes nothing.
  useEffect(() => {
    if (!replay && step === 0 && intro === FORK) tourStore.set(TOUR_VERSION);
  }, [replay, step, intro]);

  const next = () => {
    if (step === 0) {
      if (SIGN_IN_REQUIRED && intro === COVER && !accountUser) setSigningUp(true);
      else if (intro < FORK) setIntro((i) => i + 1);
      else setStep(GOAL);
    } else setStep((s) => Math.min(ALL_SET, s + 1));
    window.scrollTo({ top: 0 });
  };
  // Back to the screen before; what was chosen is kept. The first question goes back to the choice at the end of the walk. The targets screen reached by a
  // jump (skip, or an age under 18) goes back to the screen the person jumped from. The replay's first stop leaves the tour.
  const back = () => {
    if (step === 0) {
      if (replay && intro <= STOP0) leave();
      else if (intro > COVER) setIntro((i) => i - 1);
    } else if (step === TARGETS && jumpedFrom !== null) {
      setStep(jumpedFrom);
      setJumpedFrom(null);
    } else setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0 });
  };
  // Out of the tour to the page it was opened from (Settings, or Home and Eat out for the setup card's "Show me around"); Settings when there is nothing before it.
  const leave = () => {
    if (!travelBack(router, "/app/settings")) router.replace("/app/settings");
  };
  // Skip on the welcome screen and "Look around first": straight to the app (the setup card waits on Home and Eat out); the tour counts as seen.
  const lookAround = () => {
    analytics.track({ name: "onboardingSkipped", step: 0 });
    tourStore.set(TOUR_VERSION);
    // Pip's tips on each tab's real buttons (lib/mm/coach.ts); after a walked tour they leave out what the walk already showed (the tab bar)
    coachStore.set(coachAfterWelcome(coachStore.get(), { walkedTour: !skippedTour }));
    router.replace(afterOnboarding());
  };
  // "Skip tour": to the choice at the end of the walk.
  const skipTour = () => {
    analytics.track({ name: "onboardingSkipped", step: 0 });
    setSkippedTour(true);
    setIntro(FORK);
    window.scrollTo({ top: 0 });
  };
  // On to "Your daily targets" with the plan for what was answered (null = nothing to fill in).
  const toTargets = (plan: typeof answers.plan | null, from: number | null) => {
    target.applyPlan(plan);
    setJumpedFrom(from);
    setStep(TARGETS);
    window.scrollTo({ top: 0 });
  };
  // Continue on the three questions about the person. An age under 18 goes straight to the targets (no numbers are worked out for it, and nobody under 18
  // is asked for their height and weight).
  const continueAbout = () => {
    setBodySkipped(false);
    if (answers.plan.kind === "under18") return toTargets(answers.plan, ABOUT);
    next();
  };
  const continueSize = () => { setBodySkipped(false); next(); };
  const continueActive = () => {
    if (!activityPicked) return;
    setBodySkipped(false);
    toTargets(answers.plan, null);
  };
  // Skip on any of the three questions skips all three: what was typed is thrown away and the targets screen starts empty. Back from there goes to the first of
  // the three (About you), not to the one skipped from, because all three are empty now and must be answered in order.
  const skipBody = () => {
    analytics.track({ name: "onboardingSkipped", step });
    setBody(EMPTY_BODY);
    setActivityPicked(false);
    setBodySkipped(true);
    toTargets(null, ABOUT);
  };
  // The end of onboarding: to the page the visitor first opened (a shared link) if it's inside the app, else Home; or, when a first recipe (or "Or look up a
  // restaurant") was chosen, Home underneath and that page on top of it (so its own Back button lands on Home, never on the welcome screens).
  const finish = (recipeHref?: string) => {
    if (finishing.current) return;
    finishing.current = true;
    updateSettings({ hasCompletedOnboarding: true });
    tourStore.set(TOUR_VERSION);
    coachStore.set(coachAfterWelcome(coachStore.get(), { walkedTour: !skippedTour })); // Pip's tips (lib/mm/coach.ts), as in lookAround
    analytics.track({ name: "onboardingCompleted", goal: settingsStore.get().goal });
    if (recipeHref) {
      // Replace this page with Home first and open the recipe only once Home is showing: asked in the same moment, the second navigation
      // swallows the first and the recipe's Back would return to these welcome screens.
      router.replace("/app");
      const started = Date.now();
      const open = () => {
        if (/^\/app\/?$/.test(window.location.pathname) || Date.now() - started > 1500) router.push(recipeHref);
        else window.setTimeout(open, 30);
      };
      window.setTimeout(open, 30);
      return;
    }
    router.replace(afterOnboarding());
  };
  const skip = () => {
    analytics.track({ name: "onboardingSkipped", step });
    next();
  };
  // The text size is the first thing chosen (so the rest is already readable): applied and saved on the tap.
  const chooseSize = (s: TextSize) => {
    setSize(s);
    setSizeTouched(true);
    applyTextSize(s);
    updateSettings({ textSize: s });
  };

  const targetReading = readTargetFields(target.fields, goal === "glp1");
  const problems = bodyProblems(body);
  // How many "things to avoid" are chosen, and what Pip says about them: nothing yet, diets only, or at least one allergy.
  const allergenCount = prefs.avoidAllergens?.length ?? 0;
  const avoidCount = [prefs.vegetarianOnly, prefs.veganOnly, prefs.pescatarianOnly, prefs.halalOnly, prefs.noPork, prefs.noBeef].filter(Boolean).length + allergenCount;
  const avoidPulse = allergenCount > 0 ? "allergen" : avoidCount > 0 ? "diet" : "none";
  // Until a shop is ticked, recipes use the first shop whose labels we have read (the manifest's order): named once the manifest has loaded.
  const defaultRecipeShop = recipeShopSet(shopLists, null, [])[0];
  // the chains only once the page has hydrated: the browser may already hold the menu list (cached) that the server didn't, and a different wall on the two
  // sides made React rebuild the screen ("Hydration failed" on every first visit)
  const real = useMemo(() => (hydrated ? menu.chains.filter((c) => !c.sample) : []), [menu.chains, hydrated]);
  const hiddenLogos = useHiddenLogos();
  const restaurants = real.length;
  // The welcome wall: restaurants in the app that have an official logo file (well-known ones first, then the rest; a few very large
  // files left out so the first screen stays quick), mixed with the supermarkets by name.
  const wallItems = useMemo<WallItem[]>(() => {
    // Logos on (the website, and the iPhone app while web/app-content.json says "appLogos": true; founder 2026-10-18: "it has to be the logos too"):
    // only chains whose logo file we hold. Logos off (appLogos false, the safe fallback for App Review 5.2.1): names only, so any well-known chain can be on the wall.
    const withLogo = !LOGOS_ENABLED ? real : real.filter((c) => { const l = logoFor(c.id); return !!l && (!!l.square || !HEAVY_LOGOS.has(c.id)); });
    const popular = POPULAR_ORDER.map((id) => withLogo.find((c) => c.id === id)).filter((c): c is (typeof withLogo)[number] => !!c);
    const rest = withLogo.filter((c) => !POPULAR_ORDER.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    const chains: WallItem[] = [...popular, ...rest].slice(0, 36).map((c) => ({ id: c.id, name: c.name, kind: "restaurant" }));
    const shops: WallItem[] = RETAILERS.map((r) => ({ id: r.id, name: r.name, kind: "shop" }));
    const out: WallItem[] = [];
    for (let i = 0, j = 0; i < chains.length || j < shops.length; ) {
      for (let k = 0; k < 3 && i < chains.length; k++) out.push(chains[i++]!);
      if (j < shops.length) out.push(shops[j++]!);
    }
    return out;
  }, [real, hiddenLogos]); // eslint-disable-line react-hooks/exhaustive-deps -- logoFor reads the taken-down list, which hiddenLogos tracks

  // Pip's arrival (intro 1), the text size (2), the walk along the tab bar (3-7) and the choice (8). "Skip tour" goes to the choice; the replay has Close.
  // No bar and no counter on the first run (the questions' "Step n of 7" is the only counter); the replay keeps its "Step n of 4" and bar.
  // Everyone signs in: Get started on the cover leads here, and nothing after the cover (the tour, the questions, a replay of the tour) shows to someone who isn't
  // signed in. Signing in carries on where Get started led; someone already set up is taken to the app by the effect above, once their settings arrive.
  if (SIGN_IN_REQUIRED && !accountUser && accountChecking && !(step === 0 && intro === COVER)) return <Spinner />; // finding out who just signed in
  if (SIGN_IN_REQUIRED && hydrated && !accountUser && (signingUp || !(step === 0 && intro === COVER))) {
    return (
      <SignInScreen
        onBack={signingUp ? () => setSigningUp(false) : undefined}
        onDone={() => {
          if (!signingUp) return;
          setSigningUp(false);
          // someone who signed out and signs in again (already set up on this phone) goes straight to the app; a new account carries on to the tour
          if (settingsStore.get().hasCompletedOnboarding) {
            router.replace(afterOnboarding());
            return;
          }
          setIntro(COVER + 1);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  if (step === 0 && intro > COVER) {
    const stopIndex = intro - STOP0; // 0-4 on the walk
    const stop = intro >= STOP0 && intro < FORK ? TOUR_STOPS[stopIndex] : undefined;
    const tab = stop ? TABS[stopIndex] : undefined;
    const top = replay ? (
      <TopBar onBack={back} end={<TopButton onClick={leave}>{t("Close")}</TopButton>} segments={TOUR_STOPS.length} current={stopIndex} status={t("Step {step} of {total}", { step: stopIndex + 1, total: TOUR_STOPS.length })} />
    ) : (
      <TopBar onBack={back} end={intro === FORK ? undefined : <TopButton onClick={skipTour}>{t("Skip tour")}</TopButton>} />
    );

    if (stop && tab) {
      const last = stopIndex === TOUR_STOPS.length - 1;
      return (
        // one screen for the whole walk, so Pip glides from tab to tab instead of the page starting again at each stop
        <div key="tour" className={SCREEN}>
          {top}
          <section data-tour-stop={stop.id}>
            {/* on the first run the stop's number is part of its headline for a screen reader only ("Home, stop 1 of 4, heading"): a separate live line is dropped by
                iOS when the focus moves to the headline */}
            <h1 key={stopIndex} tabIndex={-1} className={`rise mt-7 ${HEADLINE} ${H1}`}>
              {t(tab.label)}
              {!replay && <span className="sr-only">{t(", stop {n} of {total}", { n: stopIndex + 1, total: TOUR_STOPS.length })}</span>}
              <HeadPill Icon={tab.Icon} />
            </h1>
            <PipTour stop={stopIndex} />
            {/* the full lists of what each tab can do in the replay only (Settings › Help): on the first run Pip's line is enough, and his tips on each tab
                teach the buttons there */}
            {replay && <TourRows rows={stop.rows} />}
          </section>
          <Bottom>
            {replay && last ? <BottomButton key={intro} onClick={() => { coachStore.set(coachAfterWelcome(coachStore.get())); leave(); }}>{t("Done")}</BottomButton> : <BottomButton key={intro} onClick={next}>{t("Continue")}</BottomButton>}
          </Bottom>
        </div>
      );
    }

    if (intro === TEXT) {
      return (
        <div key="text" className={SCREEN}>
          {top}
          <section className="mt-7 flex flex-1 flex-col">
            <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}><Rich text={t("Easy to {read}")} values={{ read: t("read") }} /><HeadPill Icon={TextSizeIcon} /></h1>
            {/* a question and its answer: Pip listens (he cheers only for a finish), says it plainly with no "!", and pops up only when his words change (the
                onboarding meeting, 19 November) */}
            <div aria-live="polite" className="mt-4">
              <PipSays lively pulse={sizeTouched ? "picked" : "ask"} size={64} mood="listen">
                {sizeTouched ? t("Got it. You can change the size any time in Settings.") : t("Pick the size that's comfortable to read. You can change it any time in Settings.")}
              </PipSays>
            </div>
            <div role="radiogroup" aria-label={t("Text size")} className="mt-5 space-y-2.5">
              {SIZES.map((s, i) => {
                const on = size === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => chooseSize(s.value)}
                    onKeyDown={(e) => radioKeyNav(e, i, SIZES.length, (n) => chooseSize(SIZES[n]!.value))}
                    className={`${CARD} flex min-h-[4.5rem] w-full items-center gap-3.5 px-4 py-3 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-foreground text-background" : "glass hover:bg-soft-strong"}`}
                  >
                    <span aria-hidden className={`inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full font-[700] leading-none ${on ? "bg-white/10 text-background" : "bg-soft-strong"}`} style={{ fontSize: `${(TEXT_SCALE[s.value] / 100) * 1.15}rem` }}>Aa</span>
                    <span className="flex-1 text-[1.0625rem] font-[700] tracking-[-0.01em]">{t(s.label)}</span>
                    <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${on ? `${LIME} text-on-accent` : "border border-line"}`}>
                      {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <Bottom>
              <BottomButton onClick={next}>{t("Continue")}</BottomButton>
            </Bottom>
          </section>
        </div>
      );
    }

    if (intro === FORK) {
      return (
        <div key="fork" className={SCREEN}>
          {top}
          <section className="mt-7 flex flex-1 flex-col">
            <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Let's make it yours")}<HeadPill Icon={CheckIcon} /></h1>
            {/* {n} is SHOPS, the questions' own "Step n of 7", so the line and the counter can never disagree ("a few quick questions" turned out to be nine) */}
            <div className="mt-4">
              <PipSays size={64} mood="wave">
                {skippedTour
                  ? t("Next, {n} short steps. I'll work out your daily calories and protein, and put the dishes that fit you first.", { n: SHOPS })
                  : t("That's the tour. Next, {n} short steps. I'll work out your daily calories and protein, and put the dishes that fit you first.", { n: SHOPS })}
              </PipSays>
            </div>
            <p className="mt-4 text-[15px] leading-snug">{t("Rather look around first? You can set this up later from Home, and see the tour again in Settings.")}</p>
            <Bottom>
              {/* "plan" read as the Premium Meal plan or a phone plan */}
              <BottomButton onClick={() => setStep(GOAL)}>{t("Set up my daily numbers")}</BottomButton>
              <BottomButton light className="mt-2" onClick={lookAround}>{t("Look around first")}</BottomButton>
            </Bottom>
          </section>
        </div>
      );
    }

    return (
      <div key="meet" className={SCREEN}>
        {top}
        <h1 tabIndex={-1} className={`mt-7 ${HEADLINE} ${H1}`}>{t("Hi, I'm Pip!")}<HeadPill Icon={LeafIcon} /></h1>
        <PipArrives />
        <Bottom>
          <BottomButton onClick={next}>{t("Show me around")}</BottomButton>
        </Bottom>
      </div>
    );
  }

  if (step === 0) {
    // The cover's three promises (the onboarding meeting, 19 November): which numbers ("Know the numbers first" didn't say), and, in the build where everyone
    // signs in, "No ads, no tracking" (the same words as the sign-in screen) where "Free account · On all your devices" read as a warning or as spin.
    const promises = [
      { Icon: FlameIcon, text: t("Calories and protein") },
      { Icon: GiftIcon, text: t("Every menu free") },
      SIGN_IN_REQUIRED ? { Icon: ShieldIcon, text: t("No ads, no tracking") } : { Icon: ShieldIcon, text: t("No account needed") },
    ];
    // the wall's one sentence for a screen reader, true with logos on or off: the first five names on it
    const wallLabel = t("Restaurants and shops in the app, including {names}", { names: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(wallItems.slice(0, 5).map((i) => i.name)) });
    return (
      <div className={SCREEN}>
        {/* Someone already set up who opened this from Settings › Set up with Pip has a way back. No Skip here (founder 2026-11-17): a first-time visitor starts with
            Get started. The picture is drawn first and the writing under it (CSS `order`), but the writing comes first in the page, so a screen reader hears
            "Welcome to Numbite", the headline and the promises before the picture and its two labels. */}
        <div className="order-1">
          <TopBar onBack={hydrated && wasOnboarded ? leave : undefined} />
        </div>
        {/* the greeting, the line that sums the app up and the three promises (shown under the picture) */}
        <div className="order-3">
          {/* after Settings › Clear data (usability test 2026-11-19: there was no word that it had worked) */}
          {params.get("cleared") === "1" && <p role="status" className="mb-3 rounded-[1.25rem] bg-[var(--fill)] px-4 py-3 text-[0.9375rem] font-bold leading-snug">{t("Done: everything on this device was cleared.")}</p>}
          <p className="mt-2 flex items-center gap-3 text-[1.125rem] font-semibold leading-snug">
            <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full ${LIME}`}><Pip mood="wave" size={40} className="translate-y-0.5" /></span>
            <span className="min-w-0">{t("Welcome to {app}", { app: site.name })}</span>
          </p>
          <h1 tabIndex={-1} className={`mt-4 text-[2.65rem] font-[700] leading-[1.04] tracking-[-0.035em] ${H1}`}>
            {t("Eat out, shop and cook.")} {t("Know the numbers first.")}
          </h1>
          {/* in the page's own ink at 16 px (they were the faintest words on the screen) */}
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-base font-semibold text-foreground">
            {promises.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5"><Icon aria-hidden className="h-5 w-5 shrink-0 text-accent" />{text}</li>
            ))}
          </ul>
        </div>
        {/* the picture, at the top (founder 2026-11-17: "put the restaurants moving on the top and then the writing below"): the restaurants and shops in the app
            drifting by, with two labels floating over it, fading into the page at its top and bottom edges */}
        <div className="relative order-2 -mx-5 mt-1">
          <LogoWall hero items={wallItems} namesOnly={!LOGOS_ENABLED} label={wallLabel} />
          {restaurants > 0 && <span className="bob app-numbers absolute start-6 top-[22%] rounded-full bg-white px-3.5 py-2 text-sm font-bold text-foreground shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)]">{t("{n} UK restaurants", { n: restaurants })}</span>}
          {/* the supermarkets whose products are in the app (Groceries' list), once that list has loaded: not every shop named on the wall */}
          {shopLists && shopLists.retailers.length > 0 && <span className="bob-slow app-numbers absolute end-6 top-[52%] rounded-full bg-white px-3.5 py-2 text-sm font-bold text-foreground shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)]">{t("{n} supermarkets", { n: shopLists.retailers.length })}</span>}
        </div>
        <Bottom className="order-4">
          <BottomButton onClick={next}>{t("Get started")}</BottomButton>
          {/* A way in for someone coming back on a new phone, who would otherwise see only Get started. With sign-in required it opens the same one sign-in
              screen as Get started (it signs in and signs up), and an account already set up then goes straight to the app (onDone above, or the effect at the top
              once its settings arrive). This brings back the link taken off on 17 November (the onboarding meeting, 19 November). Without the requirement it opens
              the sign-in sheet, as before. */}
          {!accountUser && (
            <>
              <button type="button" onClick={() => (SIGN_IN_REQUIRED ? setSigningUp(true) : setSignInOpen(true))} className="mt-1 min-h-11 w-full text-center text-[15px] font-semibold text-accent underline-offset-2 hover:underline">{t("Already have an account? Sign in")}</button>
              {!SIGN_IN_REQUIRED && <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />}
            </>
          )}
          {/* the two links keep a 44 px tap area (padding pulled back with negative margins, so the line stays the same height); the words are CLAUDE.md rule 2's,
              in darker ink than before so they can be read */}
          <p className="mt-4 text-center text-sm text-foreground/80">
            <a href="/terms" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Terms")}</a> · <a href="/privacy" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Privacy")}</a> · {t("Not affiliated with any restaurant or shop shown.")}
          </p>
        </Bottom>
      </div>
    );
  }

  // Continue on "Your daily targets": all four numbers as they stand (typed or filled in) are saved. A protein, carbs or fat box left empty stays unset, so
  // Home works it out (macroTargets reads what is typed first, so the numbers here and on Home are the same).
  // The targets count as set only when they are the person's own: worked out from the questions, a suggestion they asked for, or a box they changed (read as
  // numbers, so "2,000" is still 2000). Untouched starting numbers stay marked as starting numbers (the last screen and Home say so; usability test 2026-11-19,
  // Harold). Never written as false, so someone who set targets before and runs Settings › Set up with Pip again keeps them.
  const saveTargets = () => {
    const r = targetReading;
    if (r.problems.length > 0 || r.calories === undefined) return;
    const workedOut = !bodySkipped && answers.plan.kind === "ok";
    const suggested = target.suggestedNotes !== null;
    const typed = TARGET_BOXES.some((k) => parseNumber(target.fields[k]) !== parseNumber(target.start[k]));
    updateSettings({
      dailyCalories: r.calories,
      ...(workedOut || suggested || typed ? { hasSetTargets: true } : {}),
      dailyProtein: r.protein,
      dailyCarbs: r.carbs,
      dailyFat: r.fat,
      ...(goal === "glp1" && r.mealCap !== undefined ? { glp1MealCap: r.mealCap } : {}),
    });
    next();
  };
  // Skip never saves, and never keeps what it was not asked to: a goal or a diet tapped and then skipped goes back to what is saved (the numbers on the targets
  // screen are worked out from the same choices, so they must be the saved ones); the targets screen's Skip changes nothing, so Back finds it as it was left.
  const onSkip = step >= ABOUT && step <= ACTIVE
    ? skipBody
    : step === GOAL
      ? () => { setGoal(settingsStore.get().goal); setGoalTouched(false); skip(); }
      : step === AVOID
        ? () => { setPrefs(settingsStore.get().preferences); skip(); }
        : skip;
  // The headline's key word, in the same ink as the rest (headings in one colour, like Home).
  const em = (word: string) => <>{word}</>;

  return (
    <div className={SCREEN}>
      {/* the seven questions: Skip, the bar and "Step n of 7"; the last screen has none of them */}
      {step <= SHOPS ? (
        <TopBar onBack={back} end={<TopButton onClick={onSkip}>{t("Skip")}</TopButton>} segments={SHOPS} current={step - 1} status={t("Step {step} of {total}", { step, total: SHOPS })} />
      ) : (
        <TopBar onBack={back} />
      )}

      {step === GOAL && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}><Rich text={t("What's your {goal}?")} values={{ goal: em(t("goal")) }} /></h1>
          <div aria-live="polite" className="mt-4">
            <PipSays lively pulse={goalTouched ? goal : "ask"} size={64} mood="listen">
              {goalTouched ? t(GOAL_REACTION[goal]) : t("I'll use your answer to set your daily calories and suggest meals and orders that fit.")}
            </PipSays>
          </div>
          <div role="radiogroup" aria-label={t("Your goal")} className="mt-5 space-y-2.5">
            {GOALS.map((g, i) => {
              const on = goalShown && goal === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  // with none ticked yet, the first goal takes the Tab key (and Switch Control), so the group can be reached
                  tabIndex={on || (!goalShown && i === 0) ? 0 : -1}
                  onClick={() => pickGoal(g.value)}
                  onKeyDown={(e) => radioKeyNav(e, i, GOALS.length, (n) => pickGoal(GOALS[n]!.value))}
                  className={`${CARD} flex min-h-[4.5rem] w-full items-center gap-3.5 px-4 py-3 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-foreground text-background" : "glass hover:bg-soft-strong"}`}
                >
                  <span aria-hidden className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${on ? "bg-white/10 text-background" : "bg-soft-strong"}`}><g.Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.0625rem] font-[700] leading-tight tracking-[-0.01em]">{t(g.label)}</span>
                    <span className={`mt-0.5 block text-sm leading-snug ${on ? "text-background/80" : "text-muted"}`}>{t(g.hint)}</span>
                  </span>
                  <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${on ? `${LIME} text-on-accent` : "border border-line"}`}>
                    {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <Bottom>
            {!goalShown && <p id={WHY_GREY} className={WHY_GREY_LINE}>{t("Pick one to go on, or tap Skip at the top.")}</p>}
            <BottomButton disabled={!goalShown} describedBy={goalShown ? undefined : WHY_GREY} onClick={() => { if (!goalShown) return; updateSettings({ goal }); next(); }}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {step === AVOID && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}><Rich text={t("Anything you {avoid}?")} values={{ avoid: em(t("avoid")) }} /></h1>
          {/* Pip pops up (and a screen reader reads him) only when his words change: re-reading on every tap was the low-vision tester's first complaint. The allergy
              line says what the filter does (Preferences.avoidAllergens: dishes that list them, and dishes with no allergy information, are hidden), not a promise. */}
          <div aria-live="polite" className="mt-4">
            <PipSays lively pulse={avoidPulse} size={64} mood="listen">
              {avoidPulse === "allergen"
                ? t("Got it. I'll hide dishes that list them, and dishes with no allergy information. Always check with staff, and check each pack.")
                : avoidPulse === "diet"
                  ? t("Got it. I'll leave those out where the menu or label says so.")
                  : t("Pick anything you don't eat. Nothing to pick? Tap Nothing to avoid.")}
            </PipSays>
          </div>
          <p className="mb-4 mt-4 text-[15px] text-muted">{t("Tap everything that applies. Change it any time.")}</p>
          {/* the allergy caution under "Allergies to avoid", read before anything is ticked and never under the bottom button */}
          <DietPicker value={prefs} onChange={setPrefs} allergyCautionFirst />
          <Bottom>
            <BottomButton onClick={() => { updateSettings({ preferences: prefs }); next(); }}>{avoidCount === 0 ? t("Nothing to avoid") : t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {/* The three questions about the person: why Continue is grey is said beside it and linked to it (usability test 2026-11-19: all ten testers met a grey
          button and no reason), and "Skip these questions" sits quietly under it. */}
      {step === ABOUT && (
        <section className="mt-5 flex flex-1 flex-col">
          <AboutYouStep body={body} change={changeBody} />
          <Bottom>
            {problems.includes("age") && <p id={WHY_GREY} className={WHY_GREY_LINE}>{body.age.trim() === "" ? t("Type your age above to go on, or skip these questions below.") : t("Check your age above: a whole number from 18 to 100.")}</p>}
            <BottomButton disabled={problems.includes("age")} describedBy={problems.includes("age") ? WHY_GREY : undefined} onClick={continueAbout}>{t("Continue")}</BottomButton>
            <SkipQuestions onClick={skipBody} />
          </Bottom>
        </section>
      )}

      {step === SIZE && (
        <section className="mt-5 flex flex-1 flex-col">
          <YourSizeStep body={body} change={changeBody} />
          <Bottom>
            {problems.some((p) => p !== "age") && <p id={WHY_GREY} className={WHY_GREY_LINE}>{t("Fill in your height and weight above to go on, or skip these questions below.")}</p>}
            <BottomButton disabled={problems.some((p) => p !== "age")} describedBy={problems.some((p) => p !== "age") ? WHY_GREY : undefined} onClick={continueSize}>{t("Continue")}</BottomButton>
            <SkipQuestions onClick={skipBody} />
          </Bottom>
        </section>
      )}

      {step === ACTIVE && (
        <section className="mt-5 flex flex-1 flex-col">
          <ActivityStep activity={activityPicked ? body.activity : null} pick={(activity) => { changeBody({ activity }); setActivityPicked(true); }} />
          <Bottom>
            {!activityPicked && <p id={WHY_GREY} className={WHY_GREY_LINE}>{t("Pick the one closest to your week to go on, or skip these questions below.")}</p>}
            <BottomButton disabled={!activityPicked} describedBy={activityPicked ? undefined : WHY_GREY} onClick={continueActive}>{t("Continue")}</BottomButton>
            <SkipQuestions onClick={skipBody} />
          </Bottom>
        </section>
      )}

      {step === TARGETS && (
        <>
          <TargetsStep
            goal={goal}
            prefs={prefs}
            answers={bodySkipped ? null : answers}
            skipped={bodySkipped || answers.plan.kind === "invalid"}
            fields={target.fields}
            setField={target.setField}
            reading={targetReading}
            suggestedNotes={target.suggestedNotes}
            applySuggestion={target.apply}
          />
          <Bottom>
            <BottomButton disabled={targetReading.problems.length > 0} onClick={saveTargets}>{t("Continue")}</BottomButton>
          </Bottom>
        </>
      )}

      {step === SHOPS && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}><Rich text={t("Where do you {shop}?")} values={{ shop: em(t("shop")) }} /></h1>
          <div aria-live="polite" className="mt-4">
            <PipSays lively pulse={shops.length > 0 ? "picked" : "ask"} size={64} mood="listen">
              {shops.length > 0 ? t("Got it. I'll show those shops first.") : t("Tick the ones you use and I'll show their products and recipes first. Not sure? Skip it.")}
            </PipSays>
          </div>
          <p className="mb-4 mt-4 text-[15px] text-muted">{t("Tap all that apply. Change it any time in Settings.")}</p>
          <ShopPicker value={shops} onChange={setShops} />
          {/* the review of 2026-11-18: with none ticked, Continue led to one shop's recipes without saying so; and the last shops sat under the Continue button.
              The shop is named once the list of shops has loaded (the onboarding meeting: "the supermarket we have the most labels for" told nobody which). */}
          {shops.length === 0 && (
            <p className="mt-4 text-[15px] leading-snug text-muted">
              {defaultRecipeShop
                ? t("Not sure yet? That's fine. Until you choose, recipes use {shop}.", { shop: retailerName(defaultRecipeShop) })
                : t("Not sure yet? That's fine: until you choose, recipes use the supermarket we have the most labels for.")}
            </p>
          )}
          <div aria-hidden className="h-8 shrink-0" />
          <Bottom>
            <BottomButton onClick={() => { updateSettings({ shops: shops.length ? shops : undefined }); next(); }}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {/* The one last screen (the onboarding meeting, 19 November: "all set" at step 8 of 9 wasn't true, and "Choose a recipe" above "Take me to Home" was two next
          steps): what was chosen, what is free, a first recipe and a way to a restaurant, then Go to Home. Someone who came to read a shopping list a friend sent, or
          to add a friend from an invite link, gets Continue and goes straight there (a recipe card would open the recipe and lose the list or the friend's code). */}
      {step === ALL_SET && (
        <section className="relative mt-4 flex flex-1 flex-col">
          <Confetti />
          {/* in front of the confetti, which falls behind the words */}
          <div className="relative z-[1]">
            <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("You're all set!")}<HeadPill Icon={CheckIcon} /></h1>
            <div aria-live="polite" className="mt-3">
              <PipSays lively size={64} mood="cheer">
                {arrival
                  ? t("Everything is ready for you. You can change any of this later in Settings.")
                  : t("Everything is ready. Tap a recipe to see how it's made, or go to Home. You can change any of this in Settings.")}
              </PipSays>
            </div>
            <Plan goal={settings.goal} settings={settings} prefs={settings.preferences} shops={settings.shops ?? []} />
            {/* said once, before Home, what is free (ten testers asked); "such as", because more is paid than fits here, and each of those buttons says so itself */}
            {GATING_ENABLED && !isPro && <p className="mt-3 text-[0.9375rem] font-medium leading-snug text-foreground">{t(FREE_PREMIUM_LINE)}</p>}
            {!arrival && (
              <>
                <h2 className="mt-4 text-xl font-[800] leading-tight tracking-[-0.01em]">{t("A recipe to start with")}</h2>
                <RecipeChoice bare onPick={(href) => finish(href)} />
                {/* the cover promised restaurants: one light row to them, with Home underneath as for a recipe card */}
                <button
                  type="button"
                  onClick={() => finish("/app/search")}
                  className={`glass ${CARD} mt-3 flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start transition active:scale-[0.99] hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
                >
                  <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft-strong"><SearchIcon className="h-[1.125rem] w-[1.125rem]" /></span>
                  <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug">{t("Or look up a restaurant")}</span>
                  <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted rtl:rotate-180" />
                </button>
              </>
            )}
            {/* with sign-in required this never shows: everyone here is signed in, and "It's optional" must never reach someone who was made to sign in */}
            {!SIGN_IN_REQUIRED && !accountUser && (
              <div className="mt-4 rounded-[1.25rem] bg-white p-4 shadow-[0_2px_14px_-6px_rgba(17,24,20,0.22)]">
                <p className="text-base font-bold leading-snug">{t("Keep your plan on every device")}</p>
                <p className="mt-1 text-[0.9375rem] leading-snug text-muted">
                  {arrival
                    ? t("Sign in with Apple, Google or an email code to save your plan, meals and lists and use them on another phone. It's optional: tap Continue to skip.")
                    : t("Sign in with Apple, Google or an email code to save your plan, meals and lists and use them on another phone. It's optional: tap Go to Home to skip.")}
                </p>
                <button type="button" onClick={() => setSignInOpen(true)} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--sun)] px-5 text-[0.9375rem] font-bold text-[var(--on-accent)] transition active:scale-95">{t("Sign in")}</button>
                <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
              </div>
            )}
          </div>
          <div aria-hidden className="h-4 shrink-0" />
          <Bottom>
            <BottomButton onClick={() => finish()}>{arrival ? t("Continue") : t("Go to Home")}</BottomButton>
          </Bottom>
        </section>
      )}
    </div>
  );
}

/** The app's name (with its icon) at the top of every screen, a back button and something at the far end, then the progress as segments. */
function TopBar({ onBack, end, segments, current = 0, status }: { onBack?: () => void; end?: React.ReactNode; segments?: number; current?: number; status?: string }) {
  const t = useT();
  return (
    <div>
      <div className="flex min-h-11 items-center gap-2.5">
        {onBack && (
          // a small grey circle like Home's calendar button, inside a full 44 px tap area
          <button type="button" onClick={onBack} aria-label={t("Back to the previous step")} className={`${ROUND} -ms-1`}>
            <span className={ROUND_IN}><ChevronLeftIcon className="h-5 w-5" /></span>
          </button>
        )}
        <span className="inline-flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
          <span className="truncate text-lg font-[800] tracking-[-0.02em]">{site.name}</span>
        </span>
        <span className="flex-1" />
        {end}
      </div>
      {segments ? (
        <div aria-hidden className="mt-4 flex gap-1.5">
          {Array.from({ length: segments }, (_, i) => (<span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= current ? "bg-[var(--bar)]" : "bg-[var(--line)]"}`} />))}
        </div>
      ) : null}
      {/* the size of Pip's "Tip 1 of 3" on Home (11 px capitals were too small for older eyes) */}
      {status && <p className="app-numbers mt-2.5 text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-muted" aria-live="polite">{status}</p>}
    </div>
  );
}

/** A quiet word at the top right: Skip, "Skip tour" or Close. */
function TopButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  // a real button, not faint text (usability test 2026-11-19: most testers never saw "Skip tour" or "Skip"); at the largest text its words wrap rather than run off the side
  return <button type="button" onClick={onClick} className="-me-1 inline-flex min-h-11 min-w-0 items-center rounded-full border-[1.5px] border-[color:var(--edge)] bg-soft px-4 py-1 text-center text-[1rem] font-bold leading-tight text-foreground transition hover:bg-[var(--fill)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{children}</button>;
}

/** A small round picture inside a headline (decorative). */
function HeadPill({ Icon }: { Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }) {
  return (
    <span aria-hidden className={`ms-2 inline-flex h-[0.86em] w-[1.5em] translate-y-[-0.06em] items-center justify-center rounded-full align-middle text-on-accent ${LIME}`}>
      <Icon className="h-[0.5em] w-[0.5em]" strokeWidth={2.4} />
    </span>
  );
}

/**
 * The bar that stays at the bottom of the screen (so the next step is never below the fold on small or notched phones). Solid behind its words and buttons, with
 * a 1.5rem fade at its top only (its top padding), so nothing on the page shows through behind a reason line or the button (usability test 2026-11-19: all 16
 * read the reason line printed over the privacy line as broken).
 */
function Bottom({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${className} sticky bottom-0 z-10 -mx-5 mt-auto w-[calc(100%+2.5rem)] bg-[linear-gradient(to_top,var(--color-background)_calc(100%-1.5rem),transparent)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6`}>{children}</div>;
}

/**
 * "Skip these questions" under Continue on the three questions about the person: a quiet underlined line of text in the page's ink with a 44 pt tap area, not a
 * second pill (a white pill under a grey Continue would be the most tappable thing on the screen). It does what the Skip at the top right does there.
 */
function SkipQuestions({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} className="mx-auto mt-1 flex min-h-11 items-center justify-center px-3 text-center text-[1rem] font-semibold text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {t("Skip these questions")}
    </button>
  );
}

/** How long after a screen appears a finger's tap on its button is ignored (see BottomButton). */
const SETTLE_MS = 600;

/**
 * The big pill at the bottom of a screen: a plain black pill with the words (white over the logo wall). Nothing else inside it: no circles or icons.
 * Every screen's button sits in the same place, so a quick second tap of a double tap would land on the next screen's button and skip that screen unseen
 * (the activity, the targets, the foods to avoid...). A tap or pen press on a button in its first 0.6 s on screen is therefore ignored. A mouse click, the
 * keyboard and a screen reader's activation are never held back (nobody double-clicks past a screen with those, and a screen reader takes longer anyway).
 */
function BottomButton({ children, onClick, disabled, light, describedBy, className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; light?: boolean; describedBy?: string; className?: string }) {
  const shownAt = useRef(0);
  const pointer = useRef("");
  useEffect(() => { shownAt.current = performance.now(); }, []);
  return (
    <button
      type="button"
      onPointerDown={(e) => { pointer.current = e.pointerType; }}
      onClick={() => {
        const finger = pointer.current === "touch" || pointer.current === "pen";
        pointer.current = "";
        if (finger && performance.now() - shownAt.current < SETTLE_MS) return;
        onClick();
      }}
      disabled={disabled}
      aria-describedby={describedBy}
      className={`${className} flex min-h-14 w-full items-center justify-center rounded-full px-6 py-3 text-center text-[1.0625rem] font-bold leading-snug transition active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${light ? "bg-white text-foreground shadow-[0_14px_30px_-16px_rgba(0,0,0,0.5)] hover:bg-soft-strong disabled:text-muted" : "bg-foreground text-background hover:not-disabled:bg-[var(--ink-pressed)] disabled:bg-soft-strong disabled:text-muted"}`}
    >
      <span className="min-w-0 text-balance">{children}</span>
    </button>
  );
}

/**
 * Pip's arrival, the first screen after Get started: a lime spotlight opens, Pip jumps up from below the edge and lands with a squash, a
 * burst of colour goes off, sparkles twinkle and the bubble pops up. The bubble says what the app shows and where the numbers come from (the onboarding
 * meeting, 19 November: the old line said nothing useful, and "I read the menus" could suggest numbers made by AI, which CLAUDE.md rule 1 allows only in Scan
 * your food). Pip is a picture with a name here, the only place he has one, so a VoiceOver user learns who Pip is; the spotlight, the sparkles and the burst
 * are decorative. Nothing moves for reduced motion (the burst and the animations are switched off in the stylesheet).
 */
function PipArrives() {
  const t = useT();
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    // Pip lands at about 0.8 s; the burst is taken away again once it has faded (its pieces end up outside the screen, and would
    // otherwise leave the page able to scroll sideways)
    const on = window.setTimeout(() => setLanded(true), 850);
    const off = window.setTimeout(() => setLanded(false), 2800);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, []);
  const sparkles = [
    { pos: "start-1 top-8", size: 18, delay: "0s", colour: "#a3e635" },
    { pos: "end-0 top-20", size: 22, delay: "0.7s", colour: "#fbbf24" },
    { pos: "start-4 bottom-28", size: 14, delay: "1.3s", colour: "#34d399" },
    { pos: "end-6 top-3", size: 12, delay: "0.4s", colour: "#a3e635" },
  ];
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-5">
      <p className="speech-down bubble-pop bubble-pop-late w-full max-w-[21rem] rounded-3xl px-5 py-4 text-center text-[1.0625rem] font-medium leading-snug">
        {t("I'll show you the calories and protein from restaurants' own menus and from food labels, before you order or buy. Let me show you around.")}
      </p>
      {/* the stage is in px, like Pip (the drawing is a fixed size), so larger text sizes never make it wider than the screen */}
      <div className="relative mt-7 grid h-[240px] w-[240px] place-items-end justify-items-center">
        <span aria-hidden className={`spot-in absolute inset-2 rounded-full ${LIME}`} />
        {sparkles.map((s) => (
          <svg key={s.pos} aria-hidden viewBox="0 0 24 24" width={s.size} height={s.size} focusable="false" className={`twinkle absolute ${s.pos}`} style={{ animationDelay: s.delay, color: s.colour }}>
            <path fill="currentColor" d="M12 1.5l2.4 8.1 8.1 2.4-8.1 2.4L12 22.5l-2.4-8.1L1.5 12l8.1-2.4z" />
          </svg>
        ))}
        <span className="pip-jump relative pb-3"><Pip mood="wave" size={190} label={t("Pip, a small round green character with a sprout on top.")} /></span>
        {landed && <Burst />}
      </div>
    </div>
  );
}

/**
 * What the user chose, in one compact card (the best part of this screen, the first recipe, must start above the fold): the goal, calories and protein on one
 * large line, carbs and fat on one smaller line, then whether these are starting numbers, the diet and the shops. No picture (the clipped plate read as a bug).
 */
function Plan({ goal, settings, prefs, shops }: { goal: Goal; settings: UserSettings; prefs: Preferences; shops: readonly string[] }) {
  const t = useT();
  // the four daily targets as Home shows them (typed ones first, the rest worked out from the calories)
  const calories = settings.dailyCalories;
  const macros = macroTargets(settings);
  const diets = [prefs.vegetarianOnly && t("Vegetarian"), prefs.veganOnly && t("Vegan"), prefs.pescatarianOnly && t("Pescatarian"), prefs.halalOnly && t("Halal"), prefs.noPork && t("No pork"), prefs.noBeef && t("No beef")].filter((d): d is string => Boolean(d));
  const avoid = (prefs.avoidAllergens ?? []).map((k) => t(ALLERGEN_SHORT[k]));
  const goalLabel = GOALS.find((g) => g.value === goal)?.label;
  const big = "text-[1.5rem] font-medium leading-none tracking-[-0.01em]";
  const small = "text-[1.0625rem] font-semibold text-foreground";
  return (
    <div className={`glass ${CARD} mt-3 p-3.5`}>
      <p className="text-lg font-[800] leading-tight tracking-[-0.01em]">{goalLabel ? t(goalLabel) : t("Your plan")}</p>
      {/* the literal spaces keep "1,530 kcal a day 100g protein" two phrases for a screen reader (a flex row doesn't draw them) */}
      <p className="app-numbers mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[15px] text-muted">
        <span><Rich text={t("{kcal} kcal a day")} values={{ kcal: <span className={`${big} text-foreground`}>{formatInt(calories)}</span> }} /></span>{" "}
        <span><Rich text={t("{eaten} protein")} values={{ eaten: <span className={`${big} text-foreground`}>{formatInt(macros.protein)}g</span> }} /></span>
      </p>
      <p className="app-numbers mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[15px] text-muted">
        <span><Rich text={t("{carbs} carbs")} values={{ carbs: <span className={small}>{formatInt(macros.carbs)}g</span> }} /></span>{" "}
        <span><Rich text={t("{fat} fat")} values={{ fat: <span className={small}>{formatInt(macros.fat)}g</span> }} /></span>
      </p>
      {/* numbers nobody worked out are said to be starting ones (usability test 2026-11-19: Harold skipped his size, and 2,000 kcal and 100 g read "as if worked out") */}
      {!settings.hasSetTargets && <p className="mt-2 text-[0.9375rem] font-semibold leading-snug">{t("These are starting numbers, not worked out for you. You can set your own any time in Settings.")}</p>}
      {/* the diet chips and the shops share one row (it wraps when there are many), so the card stays short and the first recipe stays above the fold */}
      {(diets.length > 0 || avoid.length > 0 || shops.length > 0) && (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {diets.map((d) => (<span key={d} className="rounded-full bg-soft-strong px-2.5 py-1 text-sm font-semibold">{d}</span>))}
          {avoid.length > 0 && <span className="rounded-full bg-soft-strong px-2.5 py-1 text-sm font-semibold">{t("No {allergens}", { allergens: avoid.join(", ").toLowerCase() })}</span>}{" "}
          {shops.length > 0 && <span className="text-sm text-muted"><Rich text={t("Shops at {shops}")} values={{ shops: <span className="font-semibold text-foreground">{shops.map(retailerName).join(", ")}</span> }} /></span>}
        </p>
      )}
    </div>
  );
}

/** A burst of colour when Pip lands: brand greens and a touch of gold (decorative; nothing for reduced motion). */
function Burst() {
  const colours = ["#a3e635", "#34d399", "#10b981", "#059669", "#fbbf24", "#86efac"];
  return (
    <div aria-hidden className="burst">
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2;
        const dist = 120 + (i % 4) * 28;
        return (
          <i
            key={i}
            style={{ background: colours[i % colours.length], animationDelay: `${(i % 5) * 0.04}s`, "--dx": `${Math.round(Math.cos(angle) * dist * 0.85)}px`, "--dy": `${Math.round(Math.sin(angle) * dist * 0.8 + 40)}px`, "--r": `${(i % 2 ? 1 : -1) * (180 + i * 23)}deg` } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

/** A little burst of colour on the last step: the same brand greens and touch of gold as Pip's burst (decorative; hidden for reduced motion). */
function Confetti() {
  const colours = ["#a3e635", "#34d399", "#10b981", "#059669", "#fbbf24", "#86efac"];
  return (
    <div aria-hidden className="confetti -mx-5">
      {Array.from({ length: 18 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 53) % 100}%`, background: colours[i % colours.length], animationDelay: `${(i % 6) * 0.12}s`, transform: `rotate(${i * 37}deg)` }} />
      ))}
    </div>
  );
}
