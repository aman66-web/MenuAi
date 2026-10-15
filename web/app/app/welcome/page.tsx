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
import { guessLocale, localeInfo, tk, type Locale } from "@/lib/mm/i18n";
import { GLP1_NOTE, isLowCalories, LOW_CALORIES_NOTE, SUGGESTION_NOTE } from "@/lib/mm/targets";
import { settingsStore, updateSettings } from "@/lib/mm/stores";
import type { Goal, Preferences, Profile } from "@/lib/mm/types";
import { TEXT_SCALE, type TextSize } from "@/lib/mm/user-data";
import { ALLERGEN_SHORT, DietPicker } from "../_components/DietPicker";
import { Gauge } from "../_components/Gauge";
import {
  BasketIcon, BoltIcon, CheckIcon, ChevronLeftIcon, ChevronsRightIcon, DotsIcon, FlameIcon, ForkIcon, GiftIcon, GlobeIcon, HomeIcon, LeafIcon,
  MinusIcon, PillIcon, PlusIcon, PotIcon, ScaleIcon, ShieldIcon, TextSizeIcon, TrendDownIcon,
} from "../_components/icons";
import { LanguageList } from "../_components/LanguageList";
import { LogoWall, type WallItem } from "../_components/LogoWall";
import { logoFor } from "@/lib/mm/logos";
import { RETAILERS } from "@/lib/mm/groceries";
import { site } from "@/site.config";
import { Pip, PipSays } from "../_components/Mascot";
import { ShopPicker } from "../_components/ShopPicker";
import { SignInSheet } from "../_components/SignIn";
import { TargetSuggestForm } from "../_components/TargetSuggestForm";
import { inputClass, radioKeyNav } from "../_components/ui";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useChain, useHydrated, useMenu, useSettings } from "../_lib/hooks";
import { applyTextSize } from "../_lib/textSize";
import { setLanguage, useLanguage, useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// SPEC §7.1 and §8, made friendlier at the founder's request (2026-10-10): Pip the mascot says what each step is for, buttons are big,
// one question per screen, and a text-size step so everyone can read it. The SPEC's step headings are kept. Skip on steps 1–5 skips
// that step only (defaults stay); the last step has only Start. Step 3 asks about foods to leave out (the web app has no location step);
// step 4 asks which supermarkets they use (founder 2026-10-10: the app is for eating out, shopping and cooking).
// The look (founder 2026-10-14, from a reference picture: "make the screens look amazing like this"): the app's name and Skip at the top,
// the progress as segments, a very large headline with a small picture pill in it, one picture or card per screen, and a big pill button
// at the bottom with a » knob and a tick. No food photographs (CLAUDE.md rule 2): the pictures are Pip, the moving wall of the restaurants and
// shops in the app, our own plate, and a preview of Home marked "Example".

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

const STEPS = 6;
const INTRO_SCREENS = 3;
// Logo files over about 60 KB: kept off the welcome wall so the first screen loads quickly (they still show everywhere else; a chain with
// its own small square icon is shown by that instead).
const HEAVY_LOGOS = new Set(["british-garden-centres", "daves-hot-chicken", "pubsmiths", "popeyes", "park-holidays-uk", "toby-carvery", "the-breakfast-club", "butcombe-inns", "parsons-bakery", "buzz-bingo", "greene-king", "giggling-squid", "joseph-holt", "castle-carvery"]);

const SCREEN = "flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col";
const HEADLINE = "text-[2.55rem] font-bold leading-[1.04] tracking-[-0.035em]";
const LIME = "bg-[var(--sun)]"; // the brand's flat lime: no gradients (founder 2026-10-15)

export default function WelcomePage() {
  const router = useRouter();
  const menu = useMenu();
  const initial = settingsStore.get();
  // Step -1 is the language screen: the very first thing anyone sees (founder 2026-10-10). Step 0 is the welcome screen, then three short
  // screens where Pip introduces itself (intro 1-3), then the questions (steps 1-6).
  const [step, setStep] = useState(-1);
  const [intro, setIntro] = useState(0);
  const [picked, setPicked] = useState<Locale | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const hydrated = useHydrated();
  const onboarded = useSettings().hasCompletedOnboarding;
  const wasOnboarded = useRef(initial.hasCompletedOnboarding);

  // Signed in from this screen (an account that has already been set up, on a new phone): the settings arrive with the sync during this
  // visit, so skip the questions. Someone who was already set up and opened this screen on purpose stays on it.
  useEffect(() => {
    if (!hydrated || wasOnboarded.current || !onboarded || step > 0) return;
    const target = new URLSearchParams(window.location.search).get("next");
    router.replace(target && /^\/app(?![\w-])/.test(target) && !target.startsWith("//") && !target.startsWith("/app/welcome") ? target : "/app");
  }, [hydrated, onboarded, step, router]);
  // Pre-selected: the language chosen before, else the browser's own language if we have it (nothing is sent anywhere), else English.
  const guess: Locale = hydrated ? guessLocale(navigator.languages) : "en";
  const language: Locale = picked ?? initial.language ?? guess;
  const t = useT();
  const [goal, setGoal] = useState<Goal>(initial.goal);
  const [calories, setCalories] = useState(String(initial.dailyCalories));
  const [protein, setProtein] = useState(initial.dailyProtein ? String(initial.dailyProtein) : "");
  const [mealCap, setMealCap] = useState(String(initial.glp1MealCap));
  const [prefs, setPrefs] = useState(initial.preferences);
  const [size, setSize] = useState<TextSize>(initial.textSize ?? "standard");
  const [shops, setShops] = useState<string[]>(initial.shops ?? []);
  const [showSuggest, setShowSuggest] = useState(false);
  const [goalTouched, setGoalTouched] = useState(false);
  const pickGoal = (g: Goal) => {
    setGoal(g);
    setGoalTouched(true);
  };

  // Show the pre-selected language straight away (the person still chooses).
  useEffect(() => {
    if (!picked && !settingsStore.get().language && guess !== "en") void setLanguage(guess);
  }, [picked, guess]);
  const chooseLanguage = (l: Locale) => {
    setPicked(l);
    void setLanguage(l); // the screen switches to it straight away
  };

  const next = () => {
    if (step === 0 && intro < INTRO_SCREENS) setIntro((i) => i + 1);
    else setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  };
  // Back to the screen before (step 1 goes back to Pip's last intro screen); what was chosen is kept.
  const back = () => {
    if (step === 0 && intro > 0) setIntro((i) => i - 1);
    else setStep((s) => Math.max(-1, s - 1));
    window.scrollTo({ top: 0 });
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
    applyTextSize(s); // preview straight away
  };

  const caloriesNumber = Number(calories);
  const caloriesValid = Number.isFinite(caloriesNumber) && caloriesNumber >= 500 && caloriesNumber <= 10000;
  const proteinNumber = protein.trim() === "" ? undefined : Number(protein);
  const proteinValid = proteinNumber === undefined || (Number.isFinite(proteinNumber) && proteinNumber > 0 && proteinNumber <= 1000);
  const capNumber = Number(mealCap);
  const capValid = Number.isFinite(capNumber) && capNumber >= 100 && capNumber <= 2000;
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

  if (step === -1) {
    return (
      <div className={SCREEN}>
        <TopBar />
        <h1 className={`mt-8 ${HEADLINE}`}>{t("Choose your language")}<HeadPill Icon={GlobeIcon} /></h1>
        <div className="mt-5 rounded-[1.6rem] bg-accent-soft p-4">
          <p className="text-[15px] leading-snug">{t("This is the language the app speaks to you in: its buttons, menus, help and recipes.")}</p>
          <p className="mt-2 text-[15px] font-semibold leading-snug text-accent">{t("Restaurant, dish and product names stay as each restaurant and shop writes them, in English.")}</p>
        </div>
        <div className="mt-5">
          <LanguageList value={language} onChange={chooseLanguage} label={t("Choose your language")} />
        </div>
        <p className="mt-4 px-1 text-sm text-muted">{t("You can change it any time in Settings.")}</p>
        <Bottom>
          <SlideButton onClick={() => { updateSettings({ language }); void setLanguage(language); next(); }}>{t("Continue")}</SlideButton>
        </Bottom>
      </div>
    );
  }

  // Pip introduces itself in three short screens (founder 2026-10-10, after Mental Stint's sign-up): calm and plain, for adults.
  if (step === 0 && intro > 0) {
    const screens = [
      { big: t("Hi, I'm Pip."), line: t("I'll show you the calories, protein and price of what you eat, before you order, buy or cook it."), Icon: LeafIcon },
      { big: t("A few quick questions and a short tour, and you're ready."), line: t("It only takes a minute."), Icon: FlameIcon },
      { big: t("Let's go!"), line: t("First up: what you're aiming for."), Icon: ChevronsRightIcon },
    ];
    const screen = screens[intro - 1]!;
    return (
      <div key={intro} className={SCREEN}>
        <TopBar onBack={back} end={<SkipButton onClick={skipIntro} />} segments={INTRO_SCREENS + 1} current={intro} />
        <div aria-live="polite" className="rise">
          <h1 className={`mt-7 ${HEADLINE}`}>{screen.big}<HeadPill Icon={screen.Icon} /></h1>
          <p className="mt-3 text-lg leading-snug text-muted">{screen.line}</p>
        </div>
        <div className="relative flex flex-1 items-center justify-center py-6">
          {intro === 1 && <PipPicture />}
          {intro === 2 && <TodayPreview calories={caloriesValid ? caloriesNumber : initial.dailyCalories} />}
          {intro === 3 && (
            <div className="relative grid place-items-center">
              <Burst />
              <div className="pop-in relative"><Pip mood="cheer" size={170} /></div>
            </div>
          )}
        </div>
        <Bottom>
          <SlideButton onClick={next}>{t("Continue")}</SlideButton>
        </Bottom>
      </div>
    );
  }

  if (step === 0) {
    const name = localeInfo(language);
    return (
      <div className={SCREEN}>
        <TopBar
          end={
            <button type="button" onClick={back} aria-label={t("Change language")} className="glass inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition active:scale-95 hover:bg-soft-strong">
              <GlobeIcon className="h-4 w-4 text-accent" /><span lang={name.htmlLang}>{name.name}</span>
            </button>
          }
          segments={INTRO_SCREENS + 1}
          current={0}
        />
        <h1 className="mt-7 text-[2.75rem] font-bold leading-[1.02] tracking-[-0.04em]">
          {t("Eat out, shop and cook.")}{" "}
          <span aria-hidden className="mx-0.5 inline-flex -rotate-6 items-center gap-1.5 rounded-full bg-soft-strong py-1 pe-3 ps-1 align-middle text-[0.95rem] font-semibold tracking-normal text-muted shadow-[0_8px_18px_-12px_rgba(0,0,0,0.45)]">
            <span className={`grid h-8 w-8 place-items-center overflow-hidden rounded-full ${LIME}`}><Pip mood="wave" size={30} className="translate-y-0.5" /></span>
            {t("Welcome to {app}", { app: site.name })}
          </span>{" "}
          <span className="sun-text">{t("Know the numbers first.")}</span>
        </h1>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted">
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
              <span className="bob app-numbers absolute start-6 top-[22%] rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-[#0b1a12] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.5)]">{t("{n} UK restaurants", { n: restaurants })}</span>
              <span className="bob-slow app-numbers absolute end-6 top-[48%] rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-[#0b1a12] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.5)]">{t("{n} supermarkets", { n: RETAILERS.length })}</span>
            </>
          )}
        </div>
        <Bottom>
          <SlideButton light onClick={next}>{t("Get started")}</SlideButton>
          <button type="button" onClick={() => setSignInOpen(true)} className="mt-1 min-h-11 w-full text-center text-[15px] font-semibold text-accent underline-offset-2 hover:underline">{t("Already have an account? Sign in")}</button>
          <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
          <p className="mt-1 text-center text-xs text-muted">
            <a href="/terms" className="underline underline-offset-2">{t("Terms")}</a> · <a href="/privacy" className="underline underline-offset-2">{t("Privacy")}</a> · {t("Not affiliated with any restaurant or shop shown.")}
          </p>
        </Bottom>
      </div>
    );
  }

  const onSkip = step === 5 ? () => { chooseSize(initial.textSize ?? "standard"); skip(); } : skip;
  const em = (word: string) => <span className="text-accent">{word}</span>;

  return (
    <div className={SCREEN}>
      <TopBar onBack={back} end={step < STEPS ? <SkipButton onClick={onSkip} /> : undefined} segments={STEPS} current={step - 1} status={t("Step {step} of {total}", { step, total: STEPS })} />

      {step === 1 && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 className={HEADLINE}><Rich text={t("What's your {goal}?")} values={{ goal: em(t("goal")) }} /></h1>
          <div aria-live="polite" className="mt-4">
            <PipSays size={64} mood={goalTouched ? (goal === "buildMuscle" ? "cheer" : "wave") : "think"}>
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
                  className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-[1.6rem] border px-4 py-3 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-transparent bg-foreground text-background shadow-[0_14px_28px_-16px_rgba(0,0,0,0.6)]" : "glass hover:bg-soft-strong"}`}
                >
                  <span aria-hidden className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${on ? `${LIME} text-[#0b1a12]` : "bg-soft-strong"}`}><g.Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold leading-tight">{t(g.label)}</span>
                    <span className={`block text-sm ${on ? "opacity-75" : "text-muted"}`}>{t(g.hint)}</span>
                  </span>
                  <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${on ? `${LIME} border-transparent text-[#0b1a12]` : "border-line"}`}>
                    {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <Bottom>
            <SlideButton onClick={() => { updateSettings({ goal }); next(); }}>{t("Continue")}</SlideButton>
          </Bottom>
        </section>
      )}

      {step === 2 && (
        <section className="relative mt-5 flex flex-1 flex-col">
          {/* the plate runs off the edge of the screen, like the reference's photo; its box is clipped so the page never scrolls sideways */}
          <div aria-hidden className="pointer-events-none absolute -end-5 -top-5 h-44 w-36 overflow-hidden">
            <PlateArt className="absolute -end-10 top-0 h-44 w-44" />
          </div>
          <h1 className={`${HEADLINE} pe-24`}><Rich text={t("Your daily {targets}")} values={{ targets: em(t("targets")) }} /></h1>
          {/* the plan as it stands, like the reference's coloured bars: it follows the numbers below as they change */}
          <div aria-hidden className="app-numbers mt-5 space-y-2.5 pe-24">
            <p className="flex items-center gap-3"><span className="h-8 w-2 rounded-full bg-[#a3e635]" /><span className="text-[1.6rem] font-bold leading-none">{caloriesValid ? formatInt(caloriesNumber) : "–"}</span><span className="text-sm font-semibold text-muted">kcal</span></p>
            <p className="flex items-center gap-3"><span className="h-8 w-2 rounded-full bg-accent" /><span className="text-[1.6rem] font-bold leading-none">{proteinNumber !== undefined && proteinValid ? `${formatInt(proteinNumber)}g` : "–"}</span><span className="text-sm font-semibold text-muted">{t("protein")}</span></p>
          </div>
          <PipSays size={56} mood="point">{t("Not sure of your numbers? Tap “Suggest targets for me” and I'll help.")}</PipSays>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3">
            <StepperCard id="target-calories" label={t("Calories")} Icon={FlameIcon} value={calories} onChange={setCalories} step={50} min={500} max={10000} />
            <StepperCard id="target-protein" label={t("Protein (g)")} Icon={BoltIcon} value={protein} onChange={setProtein} step={5} min={5} max={1000} placeholder={t("Optional")} />
          </div>
          {isLowCalories(calories) && <p role="status" className="mt-3 text-sm font-medium">{t(LOW_CALORIES_NOTE)}</p>}
          {goal === "glp1" && <p className="mt-3 text-sm text-muted">{t(GLP1_NOTE, { app: site.name })}</p>}
          {goal === "glp1" && (
            <div className="mt-4">
              <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
                <span>{t("Comfortable meal size:")}</span>
                <input className={`${inputClass} w-24`} inputMode="numeric" aria-label={t("Comfortable meal size in calories")} value={mealCap} onChange={(e) => setMealCap(e.target.value)} />
                <span>{t("calories")}</span>
              </label>
              <p className="mt-1 text-xs text-muted">{t("Orders are capped at this size. The default is 450.")}</p>
            </div>
          )}
          <button type="button" className="mt-4 min-h-12 text-start text-base font-semibold text-accent underline underline-offset-4" onClick={() => setShowSuggest((v) => !v)} aria-expanded={showSuggest}>
            {t("Not sure? Suggest targets for me")}
          </button>
          {showSuggest && (
            <div className="mt-2">
              <TargetSuggestForm goal={goal} onApply={(c, p) => { setCalories(String(c)); setProtein(String(p)); setShowSuggest(false); }} />
            </div>
          )}
          <p className="mt-4 text-xs text-muted">{t(SUGGESTION_NOTE)}</p>
          {(!caloriesValid || !proteinValid || (goal === "glp1" && !capValid)) && (
            <p role="alert" className="mt-3 text-sm font-medium text-accent">{t("Calories should be 500–10,000, protein above 0, and the meal size 100–2,000.")}</p>
          )}
          <Bottom>
            <SlideButton
              disabled={!caloriesValid || !proteinValid || (goal === "glp1" && !capValid)}
              onClick={() => {
                updateSettings({
                  dailyCalories: caloriesNumber,
                  hasSetTargets: true,
                  ...(proteinNumber !== undefined ? { dailyProtein: proteinNumber } : { dailyProtein: undefined }),
                  ...(goal === "glp1" ? { glp1MealCap: capNumber } : {}),
                });
                next();
              }}
            >
              {t("Continue")}
            </SlideButton>
          </Bottom>
        </section>
      )}

      {step === 3 && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 className={HEADLINE}><Rich text={t("Anything you {avoid}?")} values={{ avoid: em(t("avoid")) }} /></h1>
          <div className="mt-4"><PipSays size={56} mood="wave">{t("Tell me what you don't eat. I'll leave it out of your top picks.")}</PipSays></div>
          <p className="mb-4 mt-4 text-muted">{t("Tap everything that applies. Change it any time.")}</p>
          <DietPicker value={prefs} onChange={setPrefs} />
          <Bottom>
            <SlideButton onClick={() => { updateSettings({ preferences: prefs }); next(); }}>{t("Continue")}</SlideButton>
          </Bottom>
        </section>
      )}

      {step === 4 && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 className={HEADLINE}><Rich text={t("Where do you {shop}?")} values={{ shop: em(t("shop")) }} /></h1>
          <div className="mt-4"><PipSays size={56} mood="think">{t("Which supermarkets do you use? I'll show their products and recipes first.")}</PipSays></div>
          <p className="mb-4 mt-4 text-muted">{t("Tap all that apply. Change it any time in Settings.")}</p>
          <ShopPicker value={shops} onChange={setShops} />
          <Bottom>
            <SlideButton onClick={() => { updateSettings({ shops: shops.length ? shops : undefined }); next(); }}>{t("Continue")}</SlideButton>
          </Bottom>
        </section>
      )}

      {step === 5 && (
        <section className="mt-5 flex flex-1 flex-col">
          <h1 className={HEADLINE}><Rich text={t("Easy to {read}")} values={{ read: em(t("read")) }} /><HeadPill Icon={TextSizeIcon} /></h1>
          <div className="mt-4"><PipSays size={56} mood="point">{t("Pick the size that's comfortable to read. You can change it any time in Settings.")}</PipSays></div>
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
                  className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-[1.6rem] border px-5 py-3 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-transparent bg-foreground text-background shadow-[0_14px_28px_-16px_rgba(0,0,0,0.6)]" : "glass hover:bg-soft-strong"}`}
                >
                  <span aria-hidden className="w-14 shrink-0 font-extrabold leading-none" style={{ fontSize: `${(TEXT_SCALE[s.value] / 100) * 1.6}rem` }}>Aa</span>
                  <span className="flex-1 text-lg font-bold">{t(s.label)}</span>
                  <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${on ? `${LIME} border-transparent text-[#0b1a12]` : "border-line"}`}>
                    {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <Bottom>
            <SlideButton onClick={() => { updateSettings({ textSize: size }); next(); }}>{t("Continue")}</SlideButton>
          </Bottom>
        </section>
      )}

      {step === 6 && (
        <section className="relative mt-5 flex flex-1 flex-col">
          <Confetti />
          <div aria-live="polite">
            <PipSays size={64} mood="cheer">
              {teaserChainId ? (
                <TeaserText
                  chainId={teaserChainId}
                  profile={{ goal, dailyCalories: caloriesValid ? caloriesNumber : initial.dailyCalories, glp1MealCap: capValid ? capNumber : initial.glp1MealCap }}
                  prefs={prefs}
                />
              ) : (
                <>{t("You're all set! Here's how it works.")}</>
              )}
            </PipSays>
          </div>
          <Plan goal={goal} calories={caloriesValid ? caloriesNumber : initial.dailyCalories} protein={proteinValid ? proteinNumber : initial.dailyProtein} prefs={prefs} shops={shops} />
          <h1 className={`mt-6 ${HEADLINE}`}><Rich text={t("Here's how it {works}")} values={{ works: em(t("works")) }} /></h1>
          {/* the short tour: the tab bar, tab by tab, with the same icons */}
          <p className="mt-2 text-muted">{t("Everything is in the bar at the bottom of the screen:")}</p>
          <ol className="stagger mt-4 space-y-2.5">
            {[
              { Icon: HomeIcon, name: t("Home"), text: t("Today's numbers, your shopping list and what you've saved.") },
              { Icon: ForkIcon, name: t("Eat out"), text: t("Every restaurant, café and pub, with the numbers for each dish.") },
              { Icon: BasketIcon, name: t("Groceries"), text: t("Supermarket products with their labels and prices.") },
              { Icon: PotIcon, name: t("Recipes"), text: t("Meals made from your shop's products, with the cost per serving.") },
            ].map(({ Icon, name, text }) => (
              <li key={name} className="glass flex min-h-16 items-center gap-4 rounded-[1.6rem] px-4 py-3 leading-snug">
                <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-foreground text-background"><Icon className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><span className="block text-lg font-bold">{name}</span><span className="block text-[15px] text-muted">{text}</span></span>
              </li>
            ))}
          </ol>
          <Bottom>
            <SlideButton
              onClick={() => {
                updateSettings({ hasCompletedOnboarding: true });
                analytics.track({ name: "onboardingCompleted", goal: settingsStore.get().goal });
                // Back to the page the visitor first opened (a shared link), if it's inside the app.
                const target = new URLSearchParams(window.location.search).get("next");
                router.replace(target && /^\/app(?![\w-])/.test(target) && !target.startsWith("//") && !target.startsWith("/app/welcome") ? target : "/app");
              }}
            >
              {t("Start")}
            </SlideButton>
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
          <button type="button" onClick={onBack} aria-label={t("Back to the previous step")} className="glass -ms-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <ChevronLeftIcon />
          </button>
        )}
        <span className="inline-flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
          <span className="truncate text-lg font-extrabold tracking-tight">{site.name}</span>
        </span>
        <span className="flex-1" />
        {end}
      </div>
      {segments ? (
        <div aria-hidden className="mt-4 flex gap-1.5">
          {Array.from({ length: segments }, (_, i) => (<span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i <= current ? "bg-foreground" : "bg-[var(--ring-track)]"}`} />))}
        </div>
      ) : null}
      {status && <p className="mt-2 text-sm font-semibold text-muted" aria-live="polite">{status}</p>}
    </div>
  );
}

function SkipButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center rounded-full px-3 text-base font-semibold text-muted transition hover:bg-soft-strong hover:text-foreground">{t("Skip")}</button>;
}

/** A small round picture inside a headline (decorative). */
function HeadPill({ Icon }: { Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }) {
  return (
    <span aria-hidden className={`ms-2 inline-flex h-[0.86em] w-[1.5em] translate-y-[-0.06em] items-center justify-center rounded-full align-middle text-[#0b1a12] ${LIME}`}>
      <Icon className="h-[0.5em] w-[0.5em]" strokeWidth={2.4} />
    </span>
  );
}

/** The bar that stays at the bottom of the screen (so the next step is never below the fold on small or notched phones). */
function Bottom({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-5 mt-auto w-[calc(100%+2.5rem)] bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">{children}</div>;
}

/** The big pill button: a green knob with », the words, and a tick. A tap does it (nothing to drag, so it's easy for everyone). */
function SlideButton({ children, onClick, disabled, light }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; light?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex min-h-[4.25rem] w-full items-center rounded-full p-1.5 text-lg font-bold shadow-[0_16px_32px_-16px_rgba(0,0,0,0.55)] transition active:scale-[0.99] disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${light ? "bg-white text-[#0b1a12] ring-1 ring-black/5" : "bg-foreground text-background"}`}
    >
      <span aria-hidden className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-[#0b1a12] transition-transform duration-300 group-active:translate-x-3 rtl:group-active:-translate-x-3 ${LIME}`}><ChevronsRightIcon className="h-6 w-6" strokeWidth={2.2} /></span>
      <span className="min-w-0 flex-1 px-2 text-center">{children}</span>
      <span aria-hidden className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${light ? "bg-[#eef6f1] text-[#0b1a12]" : "bg-background text-foreground"}`}><CheckIcon className="h-6 w-6" strokeWidth={2.4} /></span>
    </button>
  );
}

/** A number with − and + either side, for the daily targets. The words on the buttons don't name the number, so the label stays the card's. */
function StepperCard({ id, label, Icon, value, onChange, step, min, max, placeholder }: { id: string; label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode; value: string; onChange: (v: string) => void; step: number; min: number; max: number; placeholder?: string }) {
  const t = useT();
  const n = Number(value);
  const bump = (d: number) => {
    const start = value.trim() === "" || !Number.isFinite(n) ? (d > 0 ? min - step : min + step) : Math.round(n / step) * step;
    onChange(String(Math.min(max, Math.max(min, start + d))));
  };
  const round = "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-soft transition active:scale-90 hover:bg-soft-strong";
  return (
    <div className="glass min-w-0 rounded-[1.6rem] p-3">
      <div className="flex items-start justify-between gap-2 ps-0.5">
        <label htmlFor={id} id={`${id}-label`} className="text-base font-bold leading-tight">{label}</label>
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft-strong"><Icon className="h-5 w-5" /></span>
      </div>
      <div className="mt-3 flex items-center gap-1">
        <button type="button" aria-label={t("Decrease")} aria-describedby={`${id}-label`} onClick={() => bump(-step)} className={round}><MinusIcon className="h-5 w-5" /></button>
        <input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="app-numbers w-full min-w-0 flex-1 rounded-xl bg-transparent px-0 py-2 text-center text-lg font-bold placeholder:text-sm placeholder:font-semibold placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent" />
        <button type="button" aria-label={t("Increase")} aria-describedby={`${id}-label`} onClick={() => bump(step)} className={round}><PlusIcon className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

/** Our own plate and fork (the app icon's mark), as the picture beside a headline: never a photo of food. */
function PlateArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 220" aria-hidden focusable="false" className={className}>
      <defs>
        <filter id="plate-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#111814" floodOpacity="0.2" />
        </filter>
      </defs>
      <g filter="url(#plate-shadow)">
        <circle cx="110" cy="110" r="84" fill="#ffffff" />
        <circle cx="110" cy="110" r="64" fill="none" stroke="#ecfccb" strokeWidth="5" />
        <g fill="#15803d" transform="translate(110 110) scale(0.5) translate(-256 -266)">
          <rect x="213" y="156" width="18" height="90" rx="9" />
          <rect x="247" y="156" width="18" height="90" rx="9" />
          <rect x="281" y="156" width="18" height="90" rx="9" />
          <path d="M213 226 H299 V244 C299 264 286 276 271 280 V360 C271 369 264 376 256 376 C248 376 241 369 241 360 V280 C226 276 213 264 213 244 Z" />
        </g>
      </g>
    </svg>
  );
}

/** Pip in a big green card, with the three things the app shows floating round it (decorative). */
function PipPicture() {
  const t = useT();
  const chip = "absolute inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-bold text-[#0b1a12] shadow-[0_12px_26px_-12px_rgba(0,0,0,0.5)]";
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[21rem]">
      <span className={`absolute inset-[9%] rounded-[2.75rem] ${LIME} shadow-[0_24px_48px_-28px_rgba(17,24,20,0.35)]`} />
      <span className="absolute inset-0 flex items-end justify-center pb-[9%]"><Pip mood="wave" size={200} /></span>
      <span className={`bob ${chip} start-0 top-[12%]`}><FlameIcon className="h-4 w-4 text-[#ea580c]" />{t("Calories")}</span>
      <span className={`bob-slow ${chip} end-0 top-[36%]`}><BoltIcon className="h-4 w-4 text-accent" />{t("Protein")}</span>
      <span className={`bob ${chip} bottom-[18%] start-[1%]`}><span className="text-base font-extrabold leading-none text-[#0e7490]">£</span>{t("Price")}</span>
    </div>
  );
}

/** What Home looks like, marked "Example" (the week, today's calories as a dial, protein, carbs and fat): decorative, so hidden from screen readers. */
function TodayPreview({ calories }: { calories: number }) {
  const t = useT();
  const language = useLanguage();
  const lang = localeInfo(language).htmlLang;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const eaten = Math.round(calories * 0.43);
  return (
    <div aria-hidden className="w-full max-w-sm space-y-3">
      <div className="glass rounded-[1.75rem] p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-bold">{new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(now)}</p>
          <span className="rounded-full bg-soft-strong px-2.5 py-1 text-xs font-bold text-muted">{t("Example")}</span>
        </div>
        <div className="app-numbers mt-3 grid grid-cols-7 gap-1 text-center">
          {week.map((d) => {
            const today = d.getDate() === now.getDate();
            return (
              <span key={d.getDate()} className={`flex flex-col items-center gap-1 rounded-full py-2 ${today ? "bg-foreground text-background" : ""}`}>
                <span className={`text-xs font-semibold ${today ? "opacity-75" : "text-muted"}`}>{new Intl.DateTimeFormat(lang, { weekday: "narrow" }).format(d)}</span>
                <span className="text-base font-bold">{d.getDate()}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className={`flex items-center gap-4 rounded-[1.75rem] p-4 text-[#0b1a12] [--ring-track:rgba(11,26,18,0.1)] ${LIME}`}>
        <Gauge id="preview" label={t("Calories")} fraction={0.43} size={124}>
          <span className="app-numbers flex flex-col items-center leading-none"><span className="text-2xl font-extrabold">{formatInt(eaten)}</span><span className="mt-1 text-sm font-semibold opacity-70">43%</span></span>
        </Gauge>
        <div className="app-numbers min-w-0 flex-1 space-y-2.5">
          {[{ v: "64g", l: t("Protein"), c: "#059669" }, { v: "98g", l: t("Carbs"), c: "#0284c7" }, { v: "31g", l: t("Fat"), c: "#9333ea" }].map((m) => (
            <p key={m.l} className="flex items-center gap-2.5">
              <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: m.c }} />
              <span className="min-w-0 font-mono"><span className="block text-lg font-medium leading-none">{m.v}</span><span className="mt-0.5 block text-xs font-medium uppercase tracking-[0.06em] opacity-70">{m.l}</span></span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A real example from a well-known menu: how many main dishes have 20 g+ protein and fit the user's lunch (counts only). */
function TeaserText({ chainId, profile, prefs }: { chainId: string; profile: Profile; prefs: Preferences }) {
  const { index } = useChain(chainId);
  const t = useT();
  if (!index) return <>{t("You're all set! Here's how it works.")}</>;
  const { count, budget } = lunchTeaser(index.chain, profile, prefs);
  if (count === 0) return <>{t("You're all set! Here's how it works.")}</>;
  return (
    <Rich
      text={t("You're all set! At {chain} alone I found {dishes} with {protein}g+ protein that fit a {budget} kcal lunch.", { protein: TEASER_MIN_PROTEIN })}
      values={{
        chain: index.chain.name,
        dishes: <strong className="app-numbers">{count === 1 ? t("1 dish") : t("{n} dishes", { n: count })}</strong>,
        budget: <span className="app-numbers">{formatInt(budget)}</span>,
      }}
    />
  );
}

/** What the user chose, in one card with our plate beside it, so the end of onboarding feels like "your plan". */
function Plan({ goal, calories, protein, prefs, shops }: { goal: Goal; calories: number; protein: number | undefined; prefs: Preferences; shops: readonly string[] }) {
  const t = useT();
  const diets = [prefs.vegetarianOnly && t("Vegetarian"), prefs.veganOnly && t("Vegan"), prefs.halalOnly && t("Halal"), prefs.noPork && t("No pork"), prefs.noBeef && t("No beef")].filter((d): d is string => Boolean(d));
  const avoid = (prefs.avoidAllergens ?? []).map((k) => t(ALLERGEN_SHORT[k]));
  const goalLabel = GOALS.find((g) => g.value === goal)?.label;
  return (
    <div className="glass relative mt-4 overflow-hidden rounded-[1.75rem] p-5">
      <PlateArt className="pointer-events-none absolute -end-10 -top-8 h-36 w-36" />
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{t("Your plan")}</p>
      <p className="mt-1 pe-20 text-xl font-bold">{goalLabel ? t(goalLabel) : null}</p>
      <div className="app-numbers mt-3 space-y-2">
        <p className="flex items-center gap-3"><span aria-hidden className="h-7 w-1.5 shrink-0 rounded-full bg-[#a3e635]" /><span className="text-base"><Rich text={t("{kcal} kcal a day")} values={{ kcal: <span className="text-2xl font-bold">{formatInt(calories)}</span> }} /></span></p>
        {protein ? <p className="flex items-center gap-3"><span aria-hidden className="h-7 w-1.5 shrink-0 rounded-full bg-accent" /><span className="text-base"><Rich text={t("{eaten} protein")} values={{ eaten: <span className="text-2xl font-bold text-accent">{formatInt(protein)}g</span> }} /></span></p> : null}
      </div>
      {(diets.length > 0 || avoid.length > 0) && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {diets.map((d) => (<span key={d} className="tile rounded-full px-2.5 py-0.5 text-sm font-semibold">{d}</span>))}
          {avoid.length > 0 && <span className="tile rounded-full px-2.5 py-0.5 text-sm font-semibold">{t("No {allergens}", { allergens: avoid.join(", ").toLowerCase() })}</span>}
        </p>
      )}
      {shops.length > 0 && <p className="mt-2 text-sm text-muted"><Rich text={t("Shops at {shops}")} values={{ shops: <span className="font-semibold text-foreground">{shops.map(retailerName).join(", ")}</span> }} /></p>}
    </div>
  );
}

/** A short, quiet burst from behind Pip's "Let's go!": brand greens and a touch of gold (decorative; nothing for reduced motion). */
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
            style={{ background: colours[i % colours.length], animationDelay: `${(i % 5) * 0.04}s`, "--dx": `${Math.round(Math.cos(angle) * dist * 1.2)}px`, "--dy": `${Math.round(Math.sin(angle) * dist * 0.8 + 40)}px`, "--r": `${(i % 2 ? 1 : -1) * (180 + i * 23)}deg` } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

/** A little burst of colour on the last step (decorative; hidden for reduced motion). */
function Confetti() {
  const colours = ["#a3e635", "#34d399", "#10b981", "#38bdf8", "#c084fc", "#fbbf24"];
  return (
    <div aria-hidden className="confetti -mx-5">
      {Array.from({ length: 18 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 53) % 100}%`, background: colours[i % colours.length], animationDelay: `${(i % 6) * 0.12}s`, transform: `rotate(${i * 37}deg)` }} />
      ))}
    </div>
  );
}
