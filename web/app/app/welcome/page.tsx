"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatInt } from "@/lib/mm/format";
import { retailerName } from "@/lib/mm/groceries";
import { isAllHalal } from "@/lib/mm/halal";
import { lunchTeaser, TEASER_MIN_PROTEIN } from "@/lib/mm/onboarding";
import { POPULAR_ORDER } from "@/lib/mm/popular";
import { analytics } from "@/lib/mm/analytics";
import { APP_BUILD } from "@/lib/mm/config";
import { tk } from "@/lib/mm/i18n";
import { EMPTY_BODY, bodyProblems, planFromAnswers, readTargetFields, type BodyAnswers } from "@/lib/mm/onboardingPlan";
import { macroTargets } from "@/lib/mm/targets";
import { settingsStore, updateSettings } from "@/lib/mm/stores";
import type { Goal, Preferences, Profile } from "@/lib/mm/types";
import { TEXT_SCALE, type TextSize, type UserSettings } from "@/lib/mm/user-data";
import { ALLERGEN_SHORT, DietPicker } from "../_components/DietPicker";
import {
  BasketIcon, BoltIcon, CheckIcon, ChevronLeftIcon, DotsIcon, ForkIcon, GiftIcon, HomeIcon, LeafIcon,
  PeopleIcon, PillIcon, PotIcon, ScaleIcon, ShieldIcon, TextSizeIcon, TrendDownIcon,
} from "../_components/icons";
import { LogoWall, type WallItem } from "../_components/LogoWall";
import { logoFor } from "@/lib/mm/logos";
import { RETAILERS } from "@/lib/mm/groceries";
import { site } from "@/site.config";
import { Pip, PipSays, type PipMood } from "../_components/Mascot";
import { ShopPicker } from "../_components/ShopPicker";
import { FRIENDS_APP_PATH } from "@/lib/community/friendCode";
import { SHARED_APP_PATH } from "@/lib/mm/shareList";
import { ActivityStep, AboutYouStep, YourSizeStep } from "./BodySteps";
import { CAPS, CARD, HEADLINE, PlateArt } from "./parts";
import { RecipeChoice } from "./RecipeChoice";
import { TargetsStep } from "./TargetsStep";
import { useTargetFields } from "./useTargetFields";
import { SignInSheet } from "../_components/SignIn";
import { radioKeyNav } from "../_components/ui";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useChain, useHydrated, useMenu, useSettings } from "../_lib/hooks";
import { recipeShop } from "../_lib/recipes";
import { loadShopFile, loadShopManifest } from "../_lib/shopProducts";
import { applyTextSize } from "../_lib/textSize";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// SPEC §7.1 and §8, made friendlier at the founder's request (2026-10-10): Pip the mascot says what each step is for, buttons are big,
// one question per screen, and a text-size step so everyone can read it. The SPEC's step headings are kept. Skip skips that step only
// (defaults stay), except on the three questions about the person, where it skips all three. Step 2 asks about foods to leave out (the web app has
// no location step); step 7 asks which supermarkets they use (founder 2026-10-10: the app is for eating out, shopping and cooking).
// The numbers come last (founder 2026-10-16: "come to this screen later ... arrive on this screen with pre typed information which they can change"):
// goal (1), foods to avoid (2), about you (3), your size (4), how active (5), then "Your daily targets" (6) arrive filled in from all of that
// (lib/mm/onboardingPlan.ts, targets.ts), and every number can still be changed. What was typed about the person lives in this page's state only and
// is gone when onboarding ends (CLAUDE.md rule 4).
// The look (founder 2026-10-14, from a reference picture: "make the screens look amazing like this"): the app's name and Skip at the top,
// the progress as segments, a very large headline with a small picture pill in it, one picture or card per screen, and a big plain pill
// button at the bottom (the words only: founder 2026-10-15, "get rid of those two circles ... it just looks weird"). No food photographs (CLAUDE.md rule 2): the pictures are Pip, the moving wall of the restaurants and
// shops in the app, and our own plate.
// Pip leads all of it (founder 2026-10-15, "Pip appears with a cool animation, then walks them through the app ... makes them excited,
// like Duolingo"): Pip jumps in on the first screen, then hops along a little copy of the tab bar and says what each tab is for (the old
// "Example" preview of Home, with made-up figures, is gone), and on every question Pip hops in, says a line and reacts to the answer.

const GOALS: ReadonlyArray<{ value: Goal; label: string; hint: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { value: "lose", label: tk("Lose weight"), hint: tk("Orders that fit a lower calorie target"), Icon: TrendDownIcon },
  { value: "maintain", label: tk("Maintain"), hint: tk("Stay where you are"), Icon: ScaleIcon },
  { value: "buildMuscle", label: tk("Build muscle"), hint: tk("More protein in every order"), Icon: BoltIcon },
  { value: "glp1", label: tk("I'm on a GLP-1 medication"), hint: tk("Smaller, protein-first orders"), Icon: PillIcon },
  { value: "other", label: tk("Other"), hint: tk("Something else, or just here for the numbers"), Icon: DotsIcon },
];

// What Pip says once a goal is picked (plain words, no health claims: CLAUDE.md rule 3).
const GOAL_REACTION: Record<Goal, string> = {
  lose: tk("Great choice. I'll look for orders that fit a lower calorie target."),
  maintain: tk("Nice and steady. I'll keep your orders around your target."),
  buildMuscle: tk("Protein it is! I'll put the highest-protein orders first."),
  glp1: tk("Got it: smaller, protein-first orders."),
  other: tk("No problem. I'll show you the numbers and keep your orders around your target."),
};

const SIZES: ReadonlyArray<{ value: TextSize; label: string }> = [
  { value: "standard", label: tk("Standard") },
  { value: "large", label: tk("Large") },
  { value: "xlarge", label: tk("Extra large") },
];

// Eight questions, then "You're all set!" (9) and the choice of a first recipe (10).
const STEPS = 10;
// The questions in order. The three about the person (3-5) are skipped together.
const AVOID = 2, ABOUT = 3, SIZE = 4, ACTIVE = 5, TARGETS = 6, SHOPS = 7, TEXT_SIZE = 8, ALL_SET = 9, RECIPE = 10;
// Intro 1 is Pip's arrival, intro 2-6 are the five stops of Pip's walk along the tab bar (TOUR).
const INTRO_SCREENS = 6;

// Pip's walk through the app, one stop per tab in the order of the tab bar. The name and the sentence under it are the tab's own words
// (the same as the bar and the app use); the line in Pip's bubble is the excited one. Nothing here shows a figure.
const TOUR: ReadonlyArray<{ name: string; line: string; says: string; mood: PipMood; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { name: tk("Home"), line: tk("Today's numbers, your shopping list and what you've saved. The gear at the top opens Settings."), says: tk("This is Home. It keeps track of your day, so you can always see what's left!"), mood: "wave", Icon: HomeIcon },
  { name: tk("Eat out"), line: tk("Every restaurant, café and pub, with the numbers for each dish."), says: tk("Going out to eat? Look the place up first and know the numbers before you order!"), mood: "point", Icon: ForkIcon },
  { name: tk("Groceries"), line: tk("Supermarket products with their labels and prices."), says: tk("Shopping? I'll show you the calories, protein and price of what's on the shelf!"), mood: "think", Icon: BasketIcon },
  { name: tk("Recipes"), line: tk("Meals made from your shop's products, with the cost per serving."), says: tk("Cooking at home? These recipes use real products, with the cost of each serving!"), mood: "point", Icon: PotIcon },
  { name: tk("Community"), line: tk("Short articles on eating out, shopping and cooking."), says: tk("Short articles to read, all in one place!"), mood: "wave", Icon: PeopleIcon },
];
// Logo files over about 60 KB: kept off the welcome wall so the first screen loads quickly (they still show everywhere else; a chain with
// its own small square icon is shown by that instead).
const HEAVY_LOGOS = new Set(["british-garden-centres", "daves-hot-chicken", "pubsmiths", "popeyes", "park-holidays-uk", "toby-carvery", "the-breakfast-club", "butcombe-inns", "parsons-bakery", "buzz-bingo", "greene-king", "giggling-squid", "joseph-holt", "castle-carvery"]);

const SCREEN = "flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col";
const LIME = "bg-[var(--sun)]"; // the brand's flat lime: no gradients (founder 2026-10-15)
// A round grey button like Home's calendar button: a 36 px circle inside a 44 px tap area.
const ROUND = "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const ROUND_IN = "inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]";

/**
 * Where onboarding ends: the page the visitor first opened if it is inside the app (`?next=`), else Home. A shared shopping list's code travels in
 * the "#" of this page's own address (never in the query, which a server would see) and goes back onto the end of that page.
 */
function afterOnboarding(): string {
  const target = new URLSearchParams(window.location.search).get("next");
  if (!target || !/^\/app(?![\w-])/.test(target) || target.startsWith("//") || target.startsWith("/app/welcome")) return "/app";
  return target.includes("#") ? target : target + window.location.hash;
}

export default function WelcomePage() {
  const router = useRouter();
  const menu = useMenu();
  const initial = settingsStore.get();
  // The app is English only (founder 2026-10-16), so there is no language screen. Step 0 is the welcome screen, then Pip's arrival
  // and walk through the app (intro 1-6), then the eight questions (steps 1-8), "You're all set!" (9) and the first recipe (10).
  const [step, setStep] = useState(0);
  const [intro, setIntro] = useState(0);
  const [signInOpen, setSignInOpen] = useState(false);
  const hydrated = useHydrated();
  // what has been saved so far: "You're all set!" shows this, so it is always what Home will show
  const settings = useSettings();
  const onboarded = settings.hasCompletedOnboarding;
  const wasOnboarded = useRef(initial.hasCompletedOnboarding);

  // Signed in from this screen (an account that has already been set up, on a new phone): the settings arrive with the sync during this
  // visit, so skip the questions. Someone who was already set up and opened this screen on purpose stays on it.
  useEffect(() => {
    if (!hydrated || wasOnboarded.current || !onboarded || step > 0) return;
    router.replace(afterOnboarding());
  }, [hydrated, onboarded, step, router]);
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
  const answers = useMemo(() => planFromAnswers({ goal, prefs, body }), [goal, prefs, body]);
  const changeBody = (patch: Partial<BodyAnswers>) => setBody((b) => ({ ...b, ...patch }));
  const [goalTouched, setGoalTouched] = useState(false);
  const [sizeTouched, setSizeTouched] = useState(false);
  const pickGoal = (g: Goal) => {
    setGoal(g);
    setGoalTouched(true);
  };

  // Warm up the first recipe screen: by the last questions, start loading the full list of the shop its recipes come from (it is a few hundred KB).
  useEffect(() => {
    if (step < TEXT_SIZE) return;
    void loadShopManifest().then((m) => { const id = recipeShop(m, null, settingsStore.get().shops); return id ? loadShopFile(id) : undefined; }).catch(() => undefined);
  }, [step]);
  const next = () => {
    if (step === 0 && intro < INTRO_SCREENS) setIntro((i) => i + 1);
    // Someone who came to read a shopping list a friend sent, or to add a friend from an invite link, goes straight there after "You're all set!" (no recipe to choose
    // first: a recipe card would open the recipe and lose the list or the friend's code)
    else if (step === ALL_SET && [SHARED_APP_PATH, FRIENDS_APP_PATH].some((p) => (new URLSearchParams(window.location.search).get("next") ?? "").startsWith(p))) finish();
    else setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  };
  // Back to the screen before (step 1 goes back to Pip's last intro screen); what was chosen is kept. The targets screen reached by a jump (skip, or an
  // age under 18) goes back to the screen the person jumped from.
  const back = () => {
    if (step === 0 && intro > 0) setIntro((i) => i - 1);
    else if (step === TARGETS && jumpedFrom !== null) {
      setStep(jumpedFrom);
      setJumpedFrom(null);
    } else setStep((s) => Math.max(0, s - 1));
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
    setBodySkipped(false);
    toTargets(answers.plan, null);
  };
  // Skip on any of the three questions skips all three: what was typed is thrown away and the targets screen starts empty. Back from there goes to the first of
  // the three (About you), not to the one skipped from, because all three are empty now and must be answered in order.
  const skipBody = () => {
    analytics.track({ name: "onboardingSkipped", step });
    setBody(EMPTY_BODY);
    setBodySkipped(true);
    toTargets(null, ABOUT);
  };
  // The end of onboarding: to the page the visitor first opened (a shared link) if it's inside the app, else Home; or, when a first recipe was
  // chosen, Home underneath and the recipe on top of it (so the recipe page's own Back button lands on Home, never on the welcome screens).
  const finish = (recipeHref?: string) => {
    updateSettings({ hasCompletedOnboarding: true });
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
  // Skip on Pip's intro screens goes straight to the first question.
  const skipIntro = () => {
    analytics.track({ name: "onboardingSkipped", step: 0 });
    setIntro(0);
    setStep(1);
    window.scrollTo({ top: 0 });
  };
  const chooseSize = (s: TextSize) => {
    setSize(s);
    setSizeTouched(true);
    applyTextSize(s); // preview straight away
  };

  const targetReading = readTargetFields(target.fields, goal === "glp1");
  const problems = bodyProblems(body);
  // How many "things to avoid" are chosen (Pip reacts to each change on that step).
  const avoidCount = [prefs.vegetarianOnly, prefs.veganOnly, prefs.pescatarianOnly, prefs.halalOnly, prefs.noPork, prefs.noBeef].filter(Boolean).length + (prefs.avoidAllergens?.length ?? 0);
  const real = useMemo(() => menu.chains.filter((c) => !c.sample), [menu.chains]);
  const hiddenLogos = useHiddenLogos();
  const restaurants = real.length;
  // The welcome wall: restaurants in the app that have an official logo file (well-known ones first, then the rest; a few very large
  // files left out so the first screen stays quick), mixed with the supermarkets by name.
  const wallItems = useMemo<WallItem[]>(() => {
    // the iPhone app shows names only (LogoWall namesOnly), so any well-known chain can be on its wall
    const withLogo = APP_BUILD ? real : real.filter((c) => { const l = logoFor(c.id); return !!l && (!!l.square || !HEAVY_LOGOS.has(c.id)); });
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
  // One well-known restaurant to show a real example at the end (a halal one if the user asked for halal).
  const teaserChainId = useMemo(() => {
    const full = real.filter((c) => (c.nutritionLevel ?? "full") === "full");
    const pool = prefs.halalOnly ? full.filter((c) => isAllHalal(c.id)) : full;
    const byPopularity = POPULAR_ORDER.map((id) => pool.find((c) => c.id === id)).find(Boolean);
    return (byPopularity ?? pool[0])?.id ?? "";
  }, [real, prefs.halalOnly]);

  // Pip arrives (intro 1), then walks along a little tab bar and says what each tab is for (intro 2-6); Skip goes straight to the questions.
  if (step === 0 && intro > 0) {
    const tour = intro - 2; // 0-4 on the walk, -1 on Pip's arrival
    const stop = TOUR[tour];
    return (
      // one screen for the whole walk, so Pip glides from tab to tab instead of the page starting again at each stop
      <div key={stop ? "tour" : "meet"} className={SCREEN}>
        <TopBar onBack={back} end={<SkipButton onClick={skipIntro} />} segments={INTRO_SCREENS + 1} current={intro} />
        {stop ? (
          <>
            <div aria-live="polite" key={tour} className="rise">
              <h1 className={`mt-7 ${HEADLINE}`}>{t(stop.name)}<HeadPill Icon={stop.Icon} /></h1>
              <p className="mt-3 text-[1.0625rem] leading-snug text-muted">{t(stop.line)}</p>
            </div>
            <PipTour stop={tour} />
          </>
        ) : (
          <>
            <h1 className={`mt-7 ${HEADLINE}`}>{t("Hi, I'm Pip!")}<HeadPill Icon={LeafIcon} /></h1>
            <PipArrives />
          </>
        )}
        <Bottom>
          <BottomButton onClick={next}>{!stop ? t("Show me around") : tour === TOUR.length - 1 ? t("Let's go!") : t("Continue")}</BottomButton>
        </Bottom>
      </div>
    );
  }

  if (step === 0) {
    return (
      <div className={SCREEN}>
        <TopBar
          segments={INTRO_SCREENS + 1}
          current={0}
        />
        {/* the greeting comes first, then the line that sums the app up, then the picture (founder, 2026-10-15) */}
        <p className="mt-6 flex items-center gap-3 text-[1.125rem] font-semibold leading-snug">
          <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full ${LIME}`}><Pip mood="wave" size={40} className="translate-y-0.5" /></span>
          <span className="min-w-0">{t("Welcome to {app}", { app: site.name })}</span>
        </p>
        <h1 className="mt-4 text-[2.65rem] font-[700] leading-[1.04] tracking-[-0.035em]">
          {t("Eat out, shop and cook.")} {t("Know the numbers first.")}
        </h1>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-semibold text-muted">
          {[
            { Icon: ShieldIcon, text: t("No account needed") },
            { Icon: CheckIcon, text: t("Stays on your phone") },
            { Icon: GiftIcon, text: t("Every menu free") },
          ].map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-1.5"><Icon aria-hidden className="h-4 w-4 text-accent" />{text}</li>
          ))}
        </ul>
        {/* the picture: the restaurants and shops in the app drifting by, with two labels floating over it */}
        <div className="relative -mx-5 mt-2 flex-1">
          <LogoWall hero items={wallItems} namesOnly={APP_BUILD} label={APP_BUILD ? t("Names of restaurants and shops in the app") : t("Logos of restaurants and shops in the app")} />
          {restaurants > 0 && (
            <>
              <span className="bob app-numbers absolute start-6 top-[22%] rounded-full bg-white px-3.5 py-2 text-sm font-bold text-foreground shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)]">{t("{n} UK restaurants", { n: restaurants })}</span>
              <span className="bob-slow app-numbers absolute end-6 top-[48%] rounded-full bg-white px-3.5 py-2 text-sm font-bold text-foreground shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)]">{t("{n} supermarkets", { n: RETAILERS.length })}</span>
            </>
          )}
        </div>
        <Bottom>
          <BottomButton light onClick={next}>{t("Get started")}</BottomButton>
          <button type="button" onClick={() => setSignInOpen(true)} className="mt-1 min-h-11 w-full text-center text-[15px] font-semibold text-accent underline-offset-2 hover:underline">{t("Already have an account? Sign in")}</button>
          <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
          {/* the two links keep a 44 px tap area (padding pulled back with negative margins, so the line stays the same height) */}
          <p className="mt-4 text-center text-xs text-muted">
            <a href="/terms" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Terms")}</a> · <a href="/privacy" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Privacy")}</a> · {t("Not affiliated with any restaurant or shop shown.")}
          </p>
        </Bottom>
      </div>
    );
  }

  // Continue on "Your daily targets": all four numbers as they stand (typed or filled in) are saved. A protein, carbs or fat box left empty stays unset, so
  // Home works it out (macroTargets reads what is typed first, so the numbers here and on Home are the same).
  const saveTargets = () => {
    const r = targetReading;
    if (r.problems.length > 0 || r.calories === undefined) return;
    updateSettings({
      dailyCalories: r.calories,
      hasSetTargets: true,
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
    : step === 1
      ? () => { setGoal(settingsStore.get().goal); setGoalTouched(false); skip(); }
      : step === AVOID
        ? () => { setPrefs(settingsStore.get().preferences); skip(); }
        : step === TEXT_SIZE
          ? () => { chooseSize(initial.textSize ?? "standard"); skip(); }
          : skip;
  // The headline's key word, in the same ink as the rest (headings in one colour, like Home).
  const em = (word: string) => <>{word}</>;

  return (
    <div className={SCREEN}>
      <TopBar onBack={back} end={step <= TEXT_SIZE ? <SkipButton onClick={onSkip} /> : undefined} segments={STEPS} current={step - 1} status={t("Step {step} of {total}", { step, total: STEPS })} />

      {step === 1 && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 className={HEADLINE}><Rich text={t("What's your {goal}?")} values={{ goal: em(t("goal")) }} /></h1>
          <div aria-live="polite" className="mt-4">
            <PipSays lively pulse={goalTouched ? goal : "ask"} size={64} mood={goalTouched ? (goal === "buildMuscle" ? "cheer" : "wave") : "think"}>
              {goalTouched ? t(GOAL_REACTION[goal]) : <>{t("First, what are you aiming for? I'll use it to suggest orders for you.")}</>}
            </PipSays>
          </div>
          <div role="radiogroup" aria-label={t("Your goal")} className="mt-5 space-y-2.5">
            {GOALS.map((g, i) => {
              const on = goal === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
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
            <BottomButton onClick={() => { updateSettings({ goal }); next(); }}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {step === AVOID && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 className={HEADLINE}><Rich text={t("Anything you {avoid}?")} values={{ avoid: em(t("avoid")) }} /></h1>
          <div aria-live="polite" className="mt-4">
            <PipSays lively pulse={avoidCount} size={56} mood={avoidCount > 0 ? "cheer" : "wave"}>
              {avoidCount > 0 ? t("Noted! I'll leave those out of your top picks.") : t("Tell me what you don't eat. I'll leave it out of your top picks.")}
            </PipSays>
          </div>
          <p className="mb-4 mt-4 text-[15px] text-muted">{t("Tap everything that applies. Change it any time.")}</p>
          <DietPicker value={prefs} onChange={setPrefs} />
          <Bottom>
            <BottomButton onClick={() => { updateSettings({ preferences: prefs }); next(); }}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {step === ABOUT && (
        <section className="mt-5 flex flex-1 flex-col">
          <AboutYouStep body={body} change={changeBody} />
          <Bottom>
            <BottomButton disabled={problems.includes("age")} onClick={continueAbout}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {step === SIZE && (
        <section className="mt-5 flex flex-1 flex-col">
          <YourSizeStep body={body} change={changeBody} />
          <Bottom>
            <BottomButton disabled={problems.some((p) => p !== "age")} onClick={continueSize}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {step === ACTIVE && (
        <section className="mt-5 flex flex-1 flex-col">
          <ActivityStep body={body} change={changeBody} />
          <Bottom>
            <BottomButton onClick={continueActive}>{t("Continue")}</BottomButton>
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
          <h1 className={HEADLINE}><Rich text={t("Where do you {shop}?")} values={{ shop: em(t("shop")) }} /></h1>
          <div aria-live="polite" className="mt-4">
            <PipSays lively pulse={shops.length} size={56} mood={shops.length > 0 ? "cheer" : "think"}>
              {shops.length > 0 ? t("Lovely! I'll show those shops first.") : t("Which supermarkets do you use? I'll show their products and recipes first.")}
            </PipSays>
          </div>
          <p className="mb-4 mt-4 text-[15px] text-muted">{t("Tap all that apply. Change it any time in Settings.")}</p>
          <ShopPicker value={shops} onChange={setShops} />
          <Bottom>
            <BottomButton onClick={() => { updateSettings({ shops: shops.length ? shops : undefined }); next(); }}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {step === TEXT_SIZE && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 className={HEADLINE}><Rich text={t("Easy to {read}")} values={{ read: em(t("read")) }} /><HeadPill Icon={TextSizeIcon} /></h1>
          <div aria-live="polite" className="mt-4">
            <PipSays lively pulse={sizeTouched ? size : "ask"} size={56} mood={sizeTouched ? "cheer" : "point"}>
              {sizeTouched ? t("Perfect, that's easy on the eyes!") : t("Pick the size that's comfortable to read. You can change it any time in Settings.")}
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
            <BottomButton onClick={() => { updateSettings({ textSize: size }); next(); }}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {step === ALL_SET && (
        <section className="relative mt-5 flex flex-1 flex-col">
          <Confetti />
          <h1 className={HEADLINE}>{t("You're all set!")}<HeadPill Icon={CheckIcon} /></h1>
          <div aria-live="polite" className="mt-4">
            <PipSays lively size={64} mood="cheer">
              {teaserChainId ? (
                <TeaserText
                  chainId={teaserChainId}
                  profile={{ goal: settings.goal, dailyCalories: settings.dailyCalories, glp1MealCap: settings.glp1MealCap }}
                  prefs={settings.preferences}
                />
              ) : (
                <>{t("Everything is ready for you.")}</>
              )}
            </PipSays>
          </div>
          <Plan goal={settings.goal} settings={settings} prefs={settings.preferences} shops={settings.shops ?? []} />
          <Bottom>
            <BottomButton onClick={next}>{t("Continue")}</BottomButton>
          </Bottom>
        </section>
      )}

      {step === RECIPE && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 className={HEADLINE}>{t("Choose a recipe to start with")}<HeadPill Icon={PotIcon} /></h1>
          <RecipeChoice onPick={(href) => finish(href)} />
          <Bottom>
            <BottomButton onClick={() => finish()}>{t("Take me to Home")}</BottomButton>
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
          {Array.from({ length: segments }, (_, i) => (<span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= current ? "bg-foreground" : "bg-[var(--ring-track)]"}`} />))}
        </div>
      ) : null}
      {status && <p className={`mt-2.5 ${CAPS}`} aria-live="polite">{status}</p>}
    </div>
  );
}

function SkipButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return <button type="button" onClick={onClick} className="-me-1 inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[15px] font-semibold text-muted transition hover:bg-soft-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{t("Skip")}</button>;
}

/** A small round picture inside a headline (decorative). */
function HeadPill({ Icon }: { Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }) {
  return (
    <span aria-hidden className={`ms-2 inline-flex h-[0.86em] w-[1.5em] translate-y-[-0.06em] items-center justify-center rounded-full align-middle text-on-accent ${LIME}`}>
      <Icon className="h-[0.5em] w-[0.5em]" strokeWidth={2.4} />
    </span>
  );
}

/** The bar that stays at the bottom of the screen (so the next step is never below the fold on small or notched phones). */
function Bottom({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-5 mt-auto w-[calc(100%+2.5rem)] bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">{children}</div>;
}

/** How long after a screen appears a finger's tap on its button is ignored (see BottomButton). */
const SETTLE_MS = 600;

/**
 * The big pill at the bottom of a screen: a plain black pill with the words (white over the logo wall). Nothing else inside it: no circles or icons.
 * Every screen's button sits in the same place, so a quick second tap of a double tap would land on the next screen's button and skip that screen unseen
 * (the activity, the targets, the foods to avoid...). A tap or pen press on a button in its first 0.6 s on screen is therefore ignored. A mouse click, the
 * keyboard and a screen reader's activation are never held back (nobody double-clicks past a screen with those, and a screen reader takes longer anyway).
 */
function BottomButton({ children, onClick, disabled, light }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; light?: boolean }) {
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
      className={`flex min-h-14 w-full items-center justify-center rounded-full px-6 py-3 text-center text-[1.0625rem] font-bold leading-snug transition active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${light ? "bg-white text-foreground shadow-[0_14px_30px_-16px_rgba(0,0,0,0.5)] hover:bg-soft-strong disabled:text-muted" : "bg-foreground text-background hover:not-disabled:bg-[color-mix(in_srgb,var(--foreground)_86%,white)] disabled:bg-soft-strong disabled:text-muted"}`}
    >
      <span className="min-w-0 text-balance">{children}</span>
    </button>
  );
}

/**
 * Pip's arrival, the first screen after Get started: a lime spotlight opens, Pip jumps up from below the edge and lands with a squash, a
 * burst of colour goes off, sparkles twinkle and the bubble pops up. Everything but the bubble's words is decorative; nothing moves for
 * reduced motion (the burst and the animations are switched off in the stylesheet).
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
        {t("I'm your guide to the numbers in your food. Let me show you around!")}
      </p>
      {/* the stage is in px, like Pip (the drawing is a fixed size), so larger text sizes never make it wider than the screen */}
      <div aria-hidden className="relative mt-7 grid h-[240px] w-[240px] place-items-end justify-items-center">
        <span className={`spot-in absolute inset-2 rounded-full ${LIME}`} />
        {sparkles.map((s) => (
          <svg key={s.pos} viewBox="0 0 24 24" width={s.size} height={s.size} focusable="false" className={`twinkle absolute ${s.pos}`} style={{ animationDelay: s.delay, color: s.colour }}>
            <path fill="currentColor" d="M12 1.5l2.4 8.1 8.1 2.4-8.1 2.4L12 22.5l-2.4-8.1L1.5 12l8.1-2.4z" />
          </svg>
        ))}
        <span className="pip-jump relative pb-3"><Pip mood="wave" size={190} /></span>
        {landed && <Burst />}
      </div>
    </div>
  );
}

/**
 * Pip's walk through the app: a small copy of the tab bar (decorative), Pip standing on the open tab, hopping to the next one at each stop,
 * and a bubble over Pip whose tail follows. Only the bubble's words and the headline above are for screen readers.
 */
function PipTour({ stop }: { stop: number }) {
  const t = useT();
  const here = TOUR[stop]!;
  // Where Pip stands: over the open tab, but never so near the edge that Pip's 108 px box leaves the screen (the bubble's tail follows).
  const at = `clamp(54px, ${((stop + 0.5) / TOUR.length) * 100}%, calc(100% - 54px))`;
  return (
    <div className="flex flex-1 flex-col justify-center py-5">
      <div className="mx-auto w-full max-w-[22rem]">
        {/* the same height at every stop (room for three lines), so Pip and the bar stay where they are while the words change */}
        <p className="speech-tour bubble-pop flex min-h-[6.5rem] items-center rounded-3xl px-5 py-4 text-[1.0625rem] font-medium leading-snug" style={{ "--tail": at } as React.CSSProperties}>
          <span key={stop} className="rise block">{t(here.says)}</span>
        </p>
        <div aria-hidden className="relative mt-8 h-[120px]">
          {/* Pip is 108 px wide (px, not rem: the drawing doesn't grow with the text size): -ms-[54px] puts the middle of Pip on the tab; inset-inline-start follows the reading direction */}
          <span className="pip-walk absolute bottom-0 -ms-[54px] w-[108px]" style={{ insetInlineStart: at }}>
            <span key={stop} className="pip-hop block"><Pip mood={here.mood} size={108} /></span>
          </span>
        </div>
        <ul aria-hidden className="flex rounded-[2rem] bg-[#1d2320] p-[6px] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)]">
          {TOUR.map(({ Icon, name }, i) => (
            <li key={name} className="flex min-h-14 min-w-0 flex-1 items-center justify-center">
              <span className={`inline-flex h-9 w-12 items-center justify-center rounded-full transition-colors duration-500 ${i === stop ? "bg-[#d6efa0] text-[#0b1a12]" : "text-[#c2c9c4]"}`}><Icon className="h-5 w-5" /></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A real example from a well-known menu: how many main dishes have 20 g+ protein and fit the user's lunch (counts only). */
function TeaserText({ chainId, profile, prefs }: { chainId: string; profile: Profile; prefs: Preferences }) {
  const { index } = useChain(chainId);
  const t = useT();
  if (!index) return <>{t("Everything is ready for you.")}</>;
  const { count, budget } = lunchTeaser(index.chain, profile, prefs);
  if (count === 0) return <>{t("Everything is ready for you.")}</>;
  return (
    <Rich
      text={t("At {chain} alone I found {dishes} with {protein}g+ protein that fit a {budget} kcal lunch.", { protein: TEASER_MIN_PROTEIN })}
      values={{
        chain: index.chain.name,
        dishes: <strong className="app-numbers">{count === 1 ? t("1 dish") : t("{n} dishes", { n: count })}</strong>,
        budget: <span className="app-numbers">{formatInt(budget)}</span>,
      }}
    />
  );
}

/** What the user chose, in one card with our plate beside it, so the end of onboarding feels like "your plan". */
function Plan({ goal, settings, prefs, shops }: { goal: Goal; settings: UserSettings; prefs: Preferences; shops: readonly string[] }) {
  const t = useT();
  // the four daily targets as Home shows them (typed ones first, the rest worked out from the calories)
  const calories = settings.dailyCalories;
  const macros = macroTargets(settings);
  const diets = [prefs.vegetarianOnly && t("Vegetarian"), prefs.veganOnly && t("Vegan"), prefs.pescatarianOnly && t("Pescatarian"), prefs.halalOnly && t("Halal"), prefs.noPork && t("No pork"), prefs.noBeef && t("No beef")].filter((d): d is string => Boolean(d));
  const avoid = (prefs.avoidAllergens ?? []).map((k) => t(ALLERGEN_SHORT[k]));
  const goalLabel = GOALS.find((g) => g.value === goal)?.label;
  return (
    <div className={`glass ${CARD} relative mt-4 overflow-hidden p-4`}>
      <PlateArt className="pointer-events-none absolute -end-9 -top-7 h-32 w-32" />
      <p className={CAPS}>{t("Your plan")}</p>
      <p className="mt-1 pe-20 text-xl font-[800] tracking-[-0.01em]">{goalLabel ? t(goalLabel) : null}</p>
      <div className="app-numbers mt-3 space-y-2">
        <p className="flex items-baseline gap-3"><span aria-hidden className="h-6 w-1.5 shrink-0 self-center rounded-full bg-[var(--bar)]" /><span className="text-[15px] text-muted"><Rich text={t("{kcal} kcal a day")} values={{ kcal: <span className="text-[1.5rem] font-medium leading-none tracking-[-0.01em] text-foreground">{formatInt(calories)}</span> }} /></span></p>
        <p className="flex items-baseline gap-3"><span aria-hidden className="h-6 w-1.5 shrink-0 self-center rounded-full bg-accent" /><span className="text-[15px] text-muted"><Rich text={t("{eaten} protein")} values={{ eaten: <span className="text-[1.5rem] font-medium leading-none tracking-[-0.01em] text-accent">{formatInt(macros.protein)}g</span> }} /></span></p>
        <p className="flex items-baseline gap-3"><span aria-hidden className="h-6 w-1.5 shrink-0 self-center rounded-full bg-[var(--bar)]" /><span className="text-[15px] text-muted"><Rich text={t("{carbs} carbs")} values={{ carbs: <span className="text-[1.5rem] font-medium leading-none tracking-[-0.01em] text-foreground">{formatInt(macros.carbs)}g</span> }} /></span></p>
        <p className="flex items-baseline gap-3"><span aria-hidden className="h-6 w-1.5 shrink-0 self-center rounded-full bg-[var(--bar)]" /><span className="text-[15px] text-muted"><Rich text={t("{fat} fat")} values={{ fat: <span className="text-[1.5rem] font-medium leading-none tracking-[-0.01em] text-foreground">{formatInt(macros.fat)}g</span> }} /></span></p>
      </div>
      {(diets.length > 0 || avoid.length > 0) && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {diets.map((d) => (<span key={d} className="rounded-full bg-soft-strong px-2.5 py-1 text-sm font-semibold">{d}</span>))}
          {avoid.length > 0 && <span className="rounded-full bg-soft-strong px-2.5 py-1 text-sm font-semibold">{t("No {allergens}", { allergens: avoid.join(", ").toLowerCase() })}</span>}
        </p>
      )}
      {shops.length > 0 && <p className="mt-2.5 text-sm text-muted"><Rich text={t("Shops at {shops}")} values={{ shops: <span className="font-semibold text-foreground">{shops.map(retailerName).join(", ")}</span> }} /></p>}
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
