"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatInt } from "@/lib/mm/format";
import { retailerName } from "@/lib/mm/groceries";
import { isAllHalal } from "@/lib/mm/halal";
import { lunchTeaser, TEASER_MIN_PROTEIN } from "@/lib/mm/onboarding";
import { POPULAR_ORDER, splitChains } from "@/lib/mm/popular";
import { analytics } from "@/lib/mm/analytics";
import { guessLocale, localeInfo, tk, type Locale } from "@/lib/mm/i18n";
import { SUGGESTION_NOTE } from "@/lib/mm/targets";
import { settingsStore, updateSettings } from "@/lib/mm/stores";
import type { Goal, Preferences, Profile } from "@/lib/mm/types";
import { TEXT_SCALE, type TextSize } from "@/lib/mm/user-data";
import { ALLERGEN_SHORT, DietPicker } from "../_components/DietPicker";
import { ArrowRightIcon, BasketIcon, BoltIcon, CheckIcon, ChevronLeftIcon, DotsIcon, ForkIcon, GiftIcon, GlobeIcon, PillIcon, PotIcon, ScaleIcon, ShieldIcon, TrendDownIcon } from "../_components/icons";
import { LanguageList } from "../_components/LanguageList";
import { Pip, PipSays } from "../_components/Mascot";
import { ShopPicker } from "../_components/ShopPicker";
import { TargetSuggestForm } from "../_components/TargetSuggestForm";
import { Button, Field, inputClass, radioKeyNav } from "../_components/ui";
import { useChain, useHydrated, useMenu } from "../_lib/hooks";
import { applyTextSize } from "../_lib/textSize";
import { setLanguage, useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// SPEC §7.1 and §8, made friendlier at the founder's request (2026-10-10): Pip the mascot says what each step is for, buttons are big,
// one question per screen, and a text-size step so everyone can read it. The SPEC's step headings are kept. Skip on steps 1–5 skips
// that step only (defaults stay); the last step has only Start. Step 3 asks about foods to leave out (the web app has no location step);
// step 4 asks which supermarkets they use (founder 2026-10-10: the app is for eating out, shopping and cooking).

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

export default function WelcomePage() {
  const router = useRouter();
  const menu = useMenu();
  const initial = settingsStore.get();
  // Step -1 is the language screen: the very first thing anyone sees (founder 2026-10-10).
  const [step, setStep] = useState(-1);
  const [picked, setPicked] = useState<Locale | null>(null);
  const hydrated = useHydrated();
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
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  };
  // Back to the step before (step 1 goes back to the welcome screen); what was chosen is kept.
  const back = () => {
    setStep((s) => Math.max(-1, s - 1));
    window.scrollTo({ top: 0 });
  };
  const skip = () => {
    analytics.track({ name: "onboardingSkipped", step });
    next();
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
  const restaurants = real.length;
  const known = useMemo(() => splitChains(real, 6).popular, [real]);
  // One well-known restaurant to show a real example at the end (a halal one if the user asked for halal).
  const teaserChainId = useMemo(() => {
    const full = real.filter((c) => (c.nutritionLevel ?? "full") === "full");
    const pool = prefs.halalOnly ? full.filter((c) => isAllHalal(c.id)) : full;
    const byPopularity = POPULAR_ORDER.map((id) => pool.find((c) => c.id === id)).find(Boolean);
    return (byPopularity ?? pool[0])?.id ?? "";
  }, [real, prefs.halalOnly]);

  if (step === -1) {
    return (
      <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col">
        <div className="mt-3 flex items-end justify-between gap-3">
          <span aria-hidden className="icon-bubble h-14 w-14 shrink-0 rounded-[1.25rem]"><GlobeIcon className="h-7 w-7" /></span>
          <div className="pop-in -mb-1"><Pip mood="wave" size={64} /></div>
        </div>
        <h1 className="mt-5 text-[2.3rem] font-extrabold leading-[1.05] tracking-tight">{t("Choose your language")}</h1>
        <div className="mt-4 rounded-3xl bg-accent-soft p-4">
          <p className="text-[15px] leading-snug">{t("This is the language the app speaks to you in: its buttons, menus, help and recipes.")}</p>
          <p className="mt-2 text-[15px] font-semibold leading-snug text-accent">{t("Restaurant, dish and product names stay as each restaurant and shop writes them, in English.")}</p>
        </div>
        <div className="mt-5">
          <LanguageList value={language} onChange={chooseLanguage} label={t("Choose your language")} />
        </div>
        <p className="mt-4 px-1 text-sm text-muted">{t("You can change it any time in Settings.")}</p>
        <div className="sticky bottom-0 -mx-5 mt-auto w-[calc(100%+2.5rem)] bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
          <Button full className="min-h-14 text-lg" onClick={() => { updateSettings({ language }); void setLanguage(language); next(); }}>
            {t("Continue")}
            <span aria-hidden className="ms-1 grid h-8 w-8 place-items-center rounded-full bg-black/10"><ArrowRightIcon className="h-4 w-4" /></span>
          </Button>
        </div>
      </div>
    );
  }

  if (step === 0) {
    return (
      <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col items-center text-center">
        <div className="flex w-full justify-start">
          <button type="button" onClick={back} aria-label={t("Change language")} className="glass inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition active:scale-95 hover:bg-soft-strong">
            <ChevronLeftIcon className="h-5 w-5" /><GlobeIcon className="h-4 w-4 text-accent" /><span lang={localeInfo(language).htmlLang}>{localeInfo(language).name}</span>
          </button>
        </div>
        <div className="relative mt-2 flex w-full justify-center">
          <span aria-hidden className="absolute top-6 h-40 w-40 rounded-full opacity-70 blur-3xl [background:var(--sun)]" />
          <div className="pop-in relative"><Pip mood="wave" size={150} /></div>
        </div>
        <h1 className="mt-3 text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.03em]"><Rich text={t("Hi, I'm {name}!")} values={{ name: <span className="serif-em sun-text pe-0.5">Pip</span> }} /></h1>
        <p className="mt-2 max-w-[22rem] text-lg leading-snug text-muted">{t("I'll help you eat out, shop and cook with the calories, protein and prices in front of you.")}</p>
        <ul className="stagger mt-5 w-full space-y-2 text-start">
          {[
            { Icon: ForkIcon, title: t("Eat out"), text: <Rich text={t("Every dish at {count}, from each one's own guide")} values={{ count: restaurants > 0 ? <strong className="app-numbers text-foreground">{t("{n} UK restaurants", { n: restaurants })}</strong> : t("UK restaurants") }} /> },
            { Icon: BasketIcon, title: t("Shop"), text: <>{t("Supermarket products with their labels and prices")}</> },
            { Icon: PotIcon, title: t("Cook"), text: <>{t("Recipes made from your shop's products, with the cost per serving")}</> },
          ].map(({ Icon, title, text }) => (
            <li key={title} className="glass flex items-center gap-3 rounded-3xl p-3 pe-4">
              <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 rounded-2xl"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 leading-snug"><span className="block text-base font-extrabold">{title}</span><span className="block text-sm text-muted">{text}</span></span>
            </li>
          ))}
        </ul>
        {known.length > 0 && (
          <p className="mt-4 flex max-w-[22rem] flex-wrap justify-center gap-1.5" aria-label={t("Including")}>
            {known.map((c) => (<span key={c.id} className="glass rounded-full px-3 py-1 text-sm font-semibold">{c.name}</span>))}
            {restaurants > known.length && <span className="app-numbers rounded-full bg-foreground px-3 py-1 text-sm font-bold text-background">{t("+{n} more", { n: restaurants - known.length })}</span>}
          </p>
        )}
        <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm font-semibold text-muted">
          {[
            { Icon: ShieldIcon, text: t("No account needed") },
            { Icon: CheckIcon, text: t("Stays on your phone") },
            { Icon: GiftIcon, text: t("Every menu free") },
          ].map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-1.5"><Icon aria-hidden className="h-4 w-4 text-accent" />{text}</li>
          ))}
        </ul>
        {/* stays in view on small screens, so the next step is never below the fold */}
        <div className="sticky bottom-0 -mx-5 mt-auto w-[calc(100%+2.5rem)] bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
          <Button full className="min-h-14 text-lg" onClick={next}>{t("Let's go")}</Button>
          <p className="mt-2 text-sm text-muted">{t("Takes about a minute.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col">
      <div className="flex items-center gap-3">
        <button type="button" onClick={back} aria-label={step === 1 ? t("Back to the start") : t("Back to the previous step")} className="glass -ms-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <ChevronLeftIcon />
        </button>
        <p className="text-sm font-semibold text-muted" aria-live="polite">{t("Step {step} of {total}", { step, total: STEPS })}</p>
        <div aria-hidden className="relative flex-1 py-3">
          <div className="h-2.5 overflow-hidden rounded-full bg-soft-strong">
            <div className="bg-sun h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${(step / STEPS) * 100}%` }} />
          </div>
          <span className="absolute top-1/2 -translate-x-1/2 -translate-y-[62%] transition-[inset-inline-start] duration-500 ease-out rtl:translate-x-1/2" style={{ insetInlineStart: `${(step / STEPS) * 100}%` }}>
            <Pip mood={step === STEPS ? "cheer" : "wave"} size={30} />
          </span>
        </div>
      </div>

      {step === 1 && (
        <section className="mt-4 flex flex-1 flex-col">
          <div aria-live="polite">
            <PipSays mood={goalTouched ? (goal === "buildMuscle" ? "cheer" : "wave") : "think"}>
              {goalTouched ? t(GOAL_REACTION[goal]) : <>{t("First, what are you aiming for? I'll use it to suggest orders for you.")}</>}
            </PipSays>
          </div>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight"><Rich text={t("What's your {goal}?")} values={{ goal: <span className="serif-em sun-text pe-0.5">{t("goal")}</span> }} /></h1>
          <div role="radiogroup" aria-label={t("Your goal")} className="mt-6 space-y-3">
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
                  className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-3xl border px-4 py-3 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "hero-card" : "glass hover:bg-soft-strong"}`}
                >
                  <span aria-hidden className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${on ? "icon-bubble" : "icon-bubble-soft"}`}><g.Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold leading-tight">{t(g.label)}</span>
                    <span className="block text-sm text-muted">{t(g.hint)}</span>
                  </span>
                  <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${on ? "bg-sun border-transparent text-on-accent" : "border-line"}`}>
                    {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <Actions onContinue={() => { updateSettings({ goal }); next(); }} onSkip={skip} />
        </section>
      )}

      {step === 2 && (
        <section className="mt-4 flex flex-1 flex-col">
          <PipSays mood="point">{t("Not sure of your numbers? Tap “Suggest targets for me” and I'll help.")}</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Your daily {targets}")} values={{ targets: <span className="serif-em sun-text pe-0.5">{t("targets")}</span> }} /></h1>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Field label={t("Calories")}><input className={`${inputClass} min-h-14 text-lg`} inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} /></Field>
            <Field label={t("Protein (g)")}><input className={`${inputClass} min-h-14 text-lg`} inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder={t("Optional")} /></Field>
          </div>
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
          <Actions
            continueDisabled={!caloriesValid || !proteinValid || (goal === "glp1" && !capValid)}
            onContinue={() => {
              updateSettings({
                dailyCalories: caloriesNumber,
                hasSetTargets: true,
                ...(proteinNumber !== undefined ? { dailyProtein: proteinNumber } : { dailyProtein: undefined }),
                ...(goal === "glp1" ? { glp1MealCap: capNumber } : {}),
              });
              next();
            }}
            onSkip={skip}
          />
        </section>
      )}

      {step === 3 && (
        <section className="mt-4 flex flex-1 flex-col">
          <PipSays mood="wave">{t("Tell me what you don't eat. I'll leave it out of your top picks.")}</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Anything you {avoid}?")} values={{ avoid: <span className="serif-em sun-text pe-0.5">{t("avoid")}</span> }} /></h1>
          <p className="mb-4 mt-2 text-muted">{t("Tap everything that applies. Change it any time.")}</p>
          <DietPicker value={prefs} onChange={setPrefs} />
          <Actions onContinue={() => { updateSettings({ preferences: prefs }); next(); }} onSkip={skip} />
        </section>
      )}

      {step === 4 && (
        <section className="mt-4 flex flex-1 flex-col">
          <PipSays mood="think">{t("Which supermarkets do you use? I'll show their products and recipes first.")}</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Where do you {shop}?")} values={{ shop: <span className="serif-em sun-text pe-0.5">{t("shop")}</span> }} /></h1>
          <p className="mb-4 mt-2 text-muted">{t("Tap all that apply. Change it any time in Settings.")}</p>
          <ShopPicker value={shops} onChange={setShops} />
          <Actions onContinue={() => { updateSettings({ shops: shops.length ? shops : undefined }); next(); }} onSkip={skip} />
        </section>
      )}

      {step === 5 && (
        <section className="mt-4 flex flex-1 flex-col">
          <PipSays mood="point">{t("Pick the size that's comfortable to read. You can change it any time in Settings.")}</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Easy to {read}")} values={{ read: <span className="serif-em sun-text pe-0.5">{t("read")}</span> }} /></h1>
          <div role="radiogroup" aria-label={t("Text size")} className="mt-6 space-y-3">
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
                  className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-3xl border px-5 py-3 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "hero-card" : "glass hover:bg-soft-strong"}`}
                >
                  <span aria-hidden className="w-14 shrink-0 font-extrabold leading-none" style={{ fontSize: `${(TEXT_SCALE[s.value] / 100) * 1.6}rem` }}>Aa</span>
                  <span className="flex-1 text-lg font-bold">{t(s.label)}</span>
                  <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${on ? "bg-sun border-transparent text-on-accent" : "border-line"}`}>
                    {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <Actions onContinue={() => { updateSettings({ textSize: size }); next(); }} onSkip={() => { chooseSize(initial.textSize ?? "standard"); skip(); }} />
        </section>
      )}

      {step === 6 && (
        <section className="relative mt-4 flex flex-1 flex-col">
          <Confetti />
          <div aria-live="polite">
            <PipSays mood="cheer">
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
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Here's how it {works}")} values={{ works: <span className="serif-em sun-text pe-0.5">{t("works")}</span> }} /></h1>
          <ol className="stagger mt-6 space-y-3">
            {[
              { Icon: ForkIcon, text: t("Eating out? Pick a restaurant and build the order that fits your day") },
              { Icon: BasketIcon, text: t("Shopping? See each product's calories, protein and price") },
              { Icon: PotIcon, text: t("Cooking? Get recipes made from your shop's products") },
            ].map(({ Icon, text }, i) => (
              <li key={text} className="glass flex min-h-16 items-center gap-4 rounded-3xl px-4 py-3 text-lg font-semibold leading-snug">
                <span aria-hidden className="icon-bubble relative h-12 w-12 shrink-0"><Icon className="h-6 w-6" /><span className="absolute -end-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[11px] font-extrabold text-background">{i + 1}</span></span>
                {text}
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-8">
            <Button
              full
              className="min-h-14 text-lg"
              onClick={() => {
                updateSettings({ hasCompletedOnboarding: true });
                analytics.track({ name: "onboardingCompleted", goal: settingsStore.get().goal });
                // Back to the page the visitor first opened (a shared link), if it's inside the app.
                const target = new URLSearchParams(window.location.search).get("next");
                router.replace(target && /^\/app(?![\w-])/.test(target) && !target.startsWith("//") && !target.startsWith("/app/welcome") ? target : "/app");
              }}
            >
              {t("Start")}
            </Button>
          </div>
        </section>
      )}
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

/** What the user chose, in one card, so the end of onboarding feels like "your plan". */
function Plan({ goal, calories, protein, prefs, shops }: { goal: Goal; calories: number; protein: number | undefined; prefs: Preferences; shops: readonly string[] }) {
  const t = useT();
  const diets = [prefs.vegetarianOnly && t("Vegetarian"), prefs.veganOnly && t("Vegan"), prefs.halalOnly && t("Halal"), prefs.noPork && t("No pork"), prefs.noBeef && t("No beef")].filter((d): d is string => Boolean(d));
  const avoid = (prefs.avoidAllergens ?? []).map((k) => t(ALLERGEN_SHORT[k]));
  const goalLabel = GOALS.find((g) => g.value === goal)?.label;
  const kcal = <span className="sun-text text-2xl font-extrabold">{formatInt(calories)}</span>;
  return (
    <div className="hero-card mt-4 rounded-3xl p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{t("Your plan")}</p>
      <p className="mt-1 text-lg font-bold">{goalLabel ? t(goalLabel) : null}</p>
      <p className="app-numbers mt-1 text-base">
        {protein ? (
          <Rich text={t("{kcal} kcal · {protein} protein a day")} values={{ kcal, protein: <span className="text-2xl font-extrabold text-accent">{formatInt(protein)}g</span> }} />
        ) : (
          <Rich text={t("{kcal} kcal a day")} values={{ kcal }} />
        )}
      </p>
      {(diets.length > 0 || avoid.length > 0) && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {diets.map((d) => (<span key={d} className="tile rounded-full px-2.5 py-0.5 text-sm font-semibold">{d}</span>))}
          {avoid.length > 0 && <span className="tile rounded-full px-2.5 py-0.5 text-sm font-semibold">{t("No {allergens}", { allergens: avoid.join(", ").toLowerCase() })}</span>}
        </p>
      )}
      {shops.length > 0 && <p className="mt-2 text-sm text-muted"><Rich text={t("Shops at {shops}")} values={{ shops: <span className="font-semibold text-foreground">{shops.map(retailerName).join(", ")}</span> }} /></p>}
    </div>
  );
}

function Actions({ onContinue, onSkip, continueDisabled }: { onContinue: () => void; onSkip: () => void; continueDisabled?: boolean }) {
  const t = useT();
  return (
    // stays in view on small screens and notched iPhones (five goals can run past the fold), like the welcome screen's button
    <div className="sticky bottom-0 -mx-5 mt-auto w-[calc(100%+2.5rem)] space-y-2 bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6">
      <Button full className="min-h-14 text-lg" onClick={onContinue} disabled={continueDisabled}>{t("Continue")}</Button>
      <Button full variant="ghost" className="min-h-12 text-base" onClick={onSkip}>{t("Skip")}</Button>
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
