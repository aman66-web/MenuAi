"use client";

import Link from "next/link";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MEAL_LABEL } from "@/lib/mm/budget";
import { GATING_ENABLED } from "@/lib/mm/config";
import { formatInt } from "@/lib/mm/format";
import { addToList, formatPrice, listForShop, withPhoto } from "@/lib/mm/groceries";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { DEFAULT_SHAPE, LEAVE_OUT, MAX_SNACKS, PLAN_MEALS, PER_MEAL_RECIPES, betterCandidate, budgetRange, buildWeek, leavesOut, mergeCandidates, planCandidates, planForBudget, planSlots, setMeal, shapeOf, slotTargets, swapChoices, withBetter, type BudgetRange, type DayShape, type PlanCandidate, type PlanIds, type SavedPlan } from "@/lib/mm/mealPlan";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeForDiet, type MealTarget, type MealType } from "@/lib/mm/recipes";
import { recipeShops, shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { mealPlanStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { macroTargets } from "@/lib/mm/targets";
import type { DietPrefs } from "@/lib/mm/pantry";
import { ShopMark } from "../_components/ChainMark";
import { DietPicker } from "../_components/DietPicker";
import { CalendarIcon, CheckIcon, ChevronLeftIcon, PlusIcon, SwapIcon } from "../_components/icons";
import { Pip, PipSays, type PipMood } from "../_components/Mascot";
import { useGate } from "../_components/Paywall";
import { Button, ErrorBox, Sheet, Spinner, inputClass } from "../_components/ui";
import { useHydrated, useIsPro, useSettings, useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { BackLink, CARD, CHIP, CHIP_ON, HEADING, TITLE } from "../groceries/PageBits";
import { RecipeThumb } from "../recipes/RecipeThumb";

// The meal plan (founder 2026-11-18; lib/mm/mealPlan.ts has the rules). Premium ("a third icon, which has meal plan, and that has pro on it"). Pip asks one thing
// a screen ("they just got to type in all their stuff, like Pip's guiding them through"): the daily numbers from the person's own plan, their diet and allergies,
// foods they'd rather not have, a budget for the week, and the shops they use, as many as they like ("it'll combine everything and then choose the best meal plan
// overall"). Then the week: each day's breakfast, lunch and dinner from our own recipes with its calories, protein, price and shop; any meal can be swapped for
// another from a list; what the shopping comes to against the budget; the shopping for each shop as whole packs, and one button that puts it all on the
// shopping list. The plan stays on the phone until a new one is made (mm.v1.mealPlan).

const STEPS = 6;
const today = () => new Date().toISOString().slice(0, 10);
const ROUND = "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95";
const ROUND_IN = "inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong";
const STEP_PIP: Record<number, PipMood> = { 1: "wave", 2: "point", 3: "think", 4: "point", 5: "think", 6: "point" };
const MEAL_PLURAL: Record<string, string> = { breakfast: tk("breakfasts"), lunch: tk("lunches"), dinner: tk("dinners"), snack: tk("snacks") };

type Shop = { id: string; name: string };
type Loaded = { id: string; file: ShopFile; products: ShopProduct[] };
type Candidates = Map<MealType, PlanCandidate[]>;
type Targets = Partial<Record<MealType, MealTarget>>;

// The recipes worked out for a set of answers, kept while the app is open, so opening the plan again doesn't redo the sums.
const worked = new Map<string, Candidates>();
const workKey = (shops: readonly string[], diet: DietPrefs, targets: Targets, leaveOut: readonly string[]) => JSON.stringify([[...shops].sort(), diet, targets, [...leaveOut].sort()]);

/** Each shop's list (loaded once and cached by loadShopFile). */
async function loadShops(ids: readonly string[]): Promise<Loaded[]> {
  return Promise.all(ids.map(async (id) => ({ id, ...(await loadShopFile(id)) })));
}

/** The recipes for these answers, one shop at a time with a pause between, so the screen can say which shop Pip is on. */
async function workOut(shops: readonly Loaded[], diet: DietPrefs, targets: Targets, leaveOut: readonly string[], onShop?: (id: string, done: string[]) => void): Promise<Candidates> {
  const key = workKey(shops.map((s) => s.id), diet, targets, leaveOut);
  const known = worked.get(key);
  if (known) return known;
  const each: Candidates[] = [];
  const done: string[] = [];
  for (const sh of shops) {
    onShop?.(sh.id, [...done]);
    await new Promise((r) => setTimeout(r, 40));
    each.push(planCandidates(RECIPES, sh.products, diet, targets, leaveOut, sh.id));
    done.push(sh.id);
  }
  onShop?.("", done);
  const merged = mergeCandidates(each);
  worked.set(key, merged);
  return merged;
}

/** Each meal's and snack's size for this day's shape (lib/mm/mealPlan.ts slotTargets): from the person's own daily calories and protein, under a GLP-1 cap. */
function useSlotTargets(shape: DayShape): Targets {
  const settings = useSettings();
  const daily = macroTargets(settings);
  const cap = settings.goal === "glp1" ? settings.glp1MealCap : null;
  const key = JSON.stringify(shape);
  return useMemo(() => slotTargets(JSON.parse(key) as DayShape, { kcal: settings.dailyCalories, protein: daily.protein }, cap), [key, settings.dailyCalories, daily.protein, cap]);
}

/** Each candidate's better-products version (betterCandidate), worked out once per recipe and shop while the app is open. */
const betterMemo = new Map<string, PlanCandidate | null>();
function betterFor(loaded: readonly Loaded[], targets: Targets): (c: PlanCandidate) => PlanCandidate | null {
  const products = new Map(loaded.map((l) => [l.id, l.products]));
  return (c) => {
    const target = targets[c.meal] ?? null;
    const key = `${c.shop}|${c.meal}|${c.recipe.id}|${target?.kcal ?? 0}|${target?.protein ?? 0}|${c.cost}`;
    if (!betterMemo.has(key)) {
      const p = products.get(c.shop);
      betterMemo.set(key, p ? betterCandidate(c, p, target) : null);
    }
    return betterMemo.get(key)!;
  };
}

const names = (shops: readonly Shop[], ids: readonly string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(ids.map((id) => shops.find((s) => s.id === id)?.name ?? id));

function PlanScreen() {
  const hydrated = useHydrated();
  const saved = useStore(mealPlanStore);
  const pro = useIsPro();
  const [editing, setEditing] = useState(false);
  if (!hydrated) return <Spinner />;
  if (GATING_ENABLED && !pro) return <PremiumIntro />;
  if (saved && !editing) return <Week saved={saved} onChange={() => setEditing(true)} />;
  return <Questions saved={saved} onDone={() => setEditing(false)} onKeep={saved ? () => setEditing(false) : undefined} />;
}

/** For someone without Premium: what the meal plan does, and the way to Premium. */
function PremiumIntro() {
  const t = useT();
  const { showPaywall } = useGate();
  return (
    <div className="pb-6">
      <BackLink href="/app" label={t("Back to Home")} />
      <h1 className={`mt-4 ${TITLE}`}>{t("Meal plan")}</h1>
      <div className="mt-4"><PipSays mood="wave" size={64}>{t("Tell me your goal, your diet and where you shop, and I'll plan a whole week of meals for you, with the shopping list.")}</PipSays></div>
      <ul className={`${CARD} mt-4 space-y-3 p-4 text-base leading-snug`}>
        {[t("Breakfast, lunch and dinner for seven days, sized to your goal"), t("From one shop or several: the best recipes across them"), t("What each meal costs, and the week's shopping within your budget"), t("Swap any meal you don't fancy, then add everything to your shopping list")].map((line) => (
          <li key={line} className="flex items-start gap-3"><span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun text-[var(--on-accent)]"><CheckIcon className="h-4 w-4" /></span>{line}</li>
        ))}
      </ul>
      <Button full className="mt-5 min-h-14 text-lg" onClick={() => showPaywall("mealPlan")}>{t("Get Premium")}</Button>
    </div>
  );
}

// ---------- Pip's questions, one a screen ----------

function Questions({ saved, onDone, onKeep }: { saved: SavedPlan | null; onDone: () => void; onKeep?: () => void }) {
  const t = useT();
  const settings = useSettings();
  const manifest = useShopManifest();
  const shopsAll: Shop[] = useMemo(() => recipeShops(manifest).map((r) => ({ id: r.id, name: r.name })), [manifest]);
  const daily = macroTargets(settings);
  const [step, setStep] = useState(1);
  // the day's meals and snacks (founder 2026-11-18: "how many meals and how many snacks they want a day as well ... full personalization")
  const [shape, setShape] = useState<DayShape>(saved?.slots ? shapeOf(saved.slots) : DEFAULT_SHAPE);
  const slots = useMemo(() => planSlots(shape), [shape]);
  const targets = useSlotTargets(shape);
  const [leaveOut, setLeaveOut] = useState<string[]>(saved?.leaveOut ?? []);
  const [typed, setTyped] = useState("");
  const [shops, setShops] = useState<string[] | null>(saved?.shops ?? null);
  // the budget step (founder 2026-11-18, a slider from the cheapest week to better products, a green spot for the best fit): the prices are worked out for the
  // chosen shops when the step opens, then the slider shows; `pick` is the pound amount on it
  const [prep, setPrep] = useState<{ key: string; loaded: Loaded[]; cands: Candidates; range: BudgetRange | null } | null>(null);
  const [preparing, setPreparing] = useState<{ on: string; done: string[] } | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [problem, setProblem] = useState<"noPlan" | "offline" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // the shops start as the person's own (those that can make our recipes), else none chosen
  useEffect(() => {
    if (shops !== null || !shopsAll.length) return;
    setShops(shopsAll.filter((s) => (settings.shops ?? []).includes(s.id)).map((s) => s.id)); // eslint-disable-line react-hooks/set-state-in-effect -- the answer starts from the person's shops once the list arrives
  }, [shopsAll, shops, settings.shops]);
  useLayoutEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }); }, [step]);

  const chosen = (shops ?? []).filter((id) => shopsAll.some((s) => s.id === id) || !shopsAll.length);
  const flip = (id: string) => setLeaveOut((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const addTyped = () => {
    const w = typed.trim().toLowerCase().slice(0, 40);
    if (w.length >= 3 && !leaveOut.includes(w)) setLeaveOut((l) => [...l, w]);
    setTyped("");
  };
  const typedWords = leaveOut.filter((x) => !LEAVE_OUT.some((c) => c.id === x));
  // how many of our recipes each meal still has with this diet and these foods left out (founder 2026-11-18: "we won't be able to give them a plan if they
  // are so picky?"): no limit on how many foods, but Pip says what's left as they tap, warns when a meal is down to a few (they repeat), and won't go on
  // with none. Before the shops are chosen, so a shop that lacks an ingredient can still leave fewer.
  const prefs = settings.preferences;
  const left = useMemo(() => [...new Set(slots)].map((meal) => ({
    meal,
    n: RECIPES.filter((r) => { if (r.meal !== meal) return false; const fit = recipeForDiet(r, prefs); return !!fit && !leavesOut(fit, leaveOut); }).length,
  })), [prefs, leaveOut, slots]);
  const noneFor = left.find((l) => l.n === 0);
  const fewFor = left.filter((l) => l.n > 0 && l.n < PER_MEAL_RECIPES);
  const mealWord = (m: MealType) => (m === "snack" ? t("snack") : t(MEAL_LABEL[m as "breakfast" | "lunch" | "dinner"]).toLowerCase());

  // the prices for the budget step: worked out when it opens (and again if the shops, the diet or the foods changed)
  const prepKey = workKey(chosen, settings.preferences, targets, leaveOut) + slots.join("|");
  const prepping = useRef<string | null>(null);
  useEffect(() => {
    if (step !== 6 || !chosen.length || prep?.key === prepKey || prepping.current === prepKey) return;
    prepping.current = prepKey;
    let live = true;
    (async () => {
      setProblem(null);
      setPreparing({ on: chosen[0]!, done: [] });
      let loaded: Loaded[];
      try {
        loaded = await loadShops(chosen);
      } catch {
        if (live) { setPreparing(null); setProblem("offline"); prepping.current = null; }
        return;
      }
      const cands = await workOut(loaded, settings.preferences, targets, leaveOut, (on, done) => { if (live) setPreparing({ on, done }); });
      const range = budgetRange(cands, betterFor(loaded, targets), slots);
      if (!live) return;
      setPrep({ key: prepKey, loaded, cands, range });
      setPreparing(null);
      if (range) setPick((p) => {
        const want = p ?? saved?.budget ?? Math.round(range.best);
        return Math.min(Math.ceil(range.max), Math.max(Math.floor(range.min), Math.round(want)));
      });
    })();
    return () => { live = false; if (prepping.current === prepKey) prepping.current = null; };
  }, [step, prepKey]); // eslint-disable-line react-hooks/exhaustive-deps -- prepKey holds the answers it depends on

  const ready = !!prep && prep.key === prepKey && !!prep.range && pick !== null;
  const make = () => {
    if (!ready || !prep || pick === null) return;
    const plan = planForBudget(prep.cands, pick, betterFor(prep.loaded, targets), slots);
    if (!plan) { setProblem("noPlan"); setStep(4); return; }
    mealPlanStore.set({ shops: chosen, ids: plan.ids, slots, leaveOut, budget: pick, start: today(), ...(plan.better.length ? { better: plan.better } : {}) } satisfies SavedPlan);
    onDone();
  };

  const working = preparing && (
        <ul className="mt-5 space-y-3" aria-label={t("Working out the prices")}>
          {chosen.map((id) => {
            const done = preparing.done.includes(id);
            const on = preparing.on === id && !done;
            return (
              <li key={id} className="flex items-center gap-3 text-[1.0625rem] font-semibold">
                {done ? <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sun text-[var(--on-accent)]"><CheckIcon className="h-4 w-4" /></span>
                  : on ? <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-[rgba(17,24,20,0.1)] border-t-[var(--bar)] motion-reduce:animate-none" />
                  : <span className="h-7 w-7 shrink-0 rounded-full border-[3px] border-[rgba(17,24,20,0.1)]" />}
                <ShopMark shopId={id} size="xs" />
                <span className={done || on ? "" : "text-muted"}>{shopsAll.find((s) => s.id === id)?.name ?? id}</span>
              </li>
            );
          })}
        </ul>
  );

  const title = [t("Your daily numbers"), t("Your meals and snacks"), t("Your diet and allergies"), t("Foods you'd rather not have"), t("Where you shop"), t("Your budget for the week")][step - 1]!;
  const says = [
    t("Hi! Let's plan your week. First, your daily numbers: I'll size every meal to them."),
    t("How do you like to eat? Pick your meals and how many snacks, and I'll size each one so your day adds up."),
    t("Do you follow a diet, or have any allergies? I'll leave out any recipe that doesn't fit."),
    t("Any foods you don't like? Tap them, or type your own, and I'll leave them out."),
    t("Where do you shop? Pick as many as you like, and I'll find the best recipes across them."),
    t("Slide to choose your budget. The green spot is the best week for your goal: left is cheaper, right buys better products."),
  ][step - 1]!;
  const canGo = !(step === 2 && !shape.meals.length) && !(step === 4 && noneFor) && !(step === 5 && !chosen.length) && !(step === 6 && !ready);

  return (
    <div className="pb-6">
      <div className="flex min-h-11 items-center gap-2.5">
        {step > 1 ? (
          <button type="button" onClick={() => setStep(step - 1)} aria-label={t("Back to the previous step")} className={`${ROUND} -ms-1`}><span className={ROUND_IN}><ChevronLeftIcon className="h-5 w-5" /></span></button>
        ) : (
          <BackLink href="/app" label={t("Back to Home")} />
        )}
        <span className="flex-1" />
        {onKeep && <button type="button" onClick={onKeep} className="inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] font-semibold text-muted">{t("Keep my plan")}</button>}
      </div>
      <div aria-hidden className="mt-4 flex gap-1.5">
        {Array.from({ length: STEPS }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i < step ? "bg-foreground" : "bg-[var(--ring-track)]"}`} />)}
      </div>
      <p className="mt-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted" aria-live="polite">{t("Step {step} of {total}", { step, total: STEPS })}</p>

      <h1 ref={heading} tabIndex={-1} className={`mt-3 ${TITLE} outline-none`}>{title}</h1>
      <div className="mt-4"><PipSays mood={STEP_PIP[step]} size={64} lively pulse={step}>{says}</PipSays></div>

      <div className="mt-4">
        {step === 1 && (
          <div className={`${CARD} p-4`}>
            <p className="app-numbers text-[1.0625rem] font-bold">{t("{kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) })}</p>
            <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Next, you'll choose your meals and snacks, and I'll share these out between them.")}</p>
            <Link href="/app/settings#targets" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold">{t("Change my numbers")}</Link>
          </div>
        )}

        {step === 2 && <MealsAndSnacks shape={shape} onChange={setShape} targets={targets} />}

        {step === 3 && <DietPicker value={settings.preferences} onChange={(p) => updateSettings({ preferences: p })} />}

        {step === 4 && (
          <>
            {problem === "noPlan" && <p role="alert" className="glass mb-3 rounded-[1.25rem] p-4 font-semibold">{t("There aren't enough of our recipes left for every meal with these choices. Try leaving out fewer foods, or pick another shop.")}</p>}
            <div role="group" aria-label={t("Foods you'd rather not have")} className="flex flex-wrap gap-2">
              {LEAVE_OUT.map((c) => (
                <button key={c.id} type="button" aria-pressed={leaveOut.includes(c.id)} onClick={() => flip(c.id)} className={`${leaveOut.includes(c.id) ? CHIP_ON : CHIP} gap-1.5 px-4`}>
                  {leaveOut.includes(c.id) && <CheckIcon aria-hidden className="h-4 w-4" />}{t(c.label)}
                </button>
              ))}
              {typedWords.map((w) => (
                <button key={w} type="button" aria-pressed onClick={() => flip(w)} className={`${CHIP_ON} gap-1.5 px-4`}><CheckIcon aria-hidden className="h-4 w-4" />{w}</button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }} placeholder={t("Something else, like sweetcorn")} aria-label={t("Another food to leave out")} className={`${inputClass} min-w-[12rem] flex-1`} maxLength={40} />
              <Button variant="secondary" onClick={addTyped} disabled={typed.trim().length < 3}>{t("Add")}</Button>
            </div>
            {/* what's left to choose from, said plainly as they tap */}
            <div role="status" aria-live="polite" className={`mt-4 rounded-[1.25rem] p-4 text-[0.9375rem] leading-snug ${noneFor ? "bg-[var(--fill)] font-semibold" : "glass"}`}>
              {noneFor
                ? t("With these, there are no {meal} recipes left, so I can't plan a week. Leave out fewer foods.", { meal: mealWord(noneFor.meal) })
                : <>
                    <span className="app-numbers">{t("I can choose from {list}.", { list: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(left.map((l) => `${l.n} ${t(MEAL_PLURAL[l.meal]!)}`)) })}</span>
                    {fewFor.length > 0 && <span className="mt-1 block font-semibold">{t("Only a few {meals} are left, so some days will repeat.", { meals: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(fewFor.map((f) => t(MEAL_PLURAL[f.meal]!))) })}</span>}
                  </>}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            {!manifest ? <Spinner label={t("Loading the shops")} /> : (
              <div role="group" aria-label={t("Where you shop")} className="space-y-2">
                {shopsAll.map((s) => {
                  const on = chosen.includes(s.id);
                  return (
                    <button key={s.id} type="button" role="checkbox" aria-checked={on} onClick={() => setShops(on ? chosen.filter((x) => x !== s.id) : [...chosen, s.id])}
                      className={`flex min-h-[3.75rem] w-full items-center gap-3 rounded-[1.25rem] p-2.5 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-sun text-on-accent" : "glass hover:bg-soft-strong"}`}>
                      <ShopMark shopId={s.id} size="sm" />
                      <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug [overflow-wrap:anywhere]">{s.name}</span>
                      <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${on ? "bg-foreground text-background" : "border border-line"}`}>{on && <CheckIcon className="h-4 w-4" />}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("Every ingredient is a real product at one of these shops, with its price. Each meal's ingredients all come from one shop.")}</p>
          </>
        )}

        {step === 6 && (
          <>
            {problem === "offline" ? <ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => { setProblem(null); setPrep(null); setStep(5); }} />
              : preparing ? (<><p role="status" className="text-[1.0625rem] font-semibold">{t("Working out the prices at your shops…")}</p>{working}</>)
              : !prep || prep.key !== prepKey ? <Spinner label={t("Working out the prices at your shops…")} />
              : !prep.range ? <p role="alert" className="glass rounded-[1.25rem] p-4 font-semibold">{t("There aren't enough of our recipes left for every meal with these choices. Try leaving out fewer foods, or pick another shop.")}</p>
              : pick !== null && <BudgetSlider range={prep.range} value={pick} onChange={setPick} />}
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-6 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
        {step === 5 && !chosen.length && <p className="mb-2 text-center text-[0.9375rem] font-semibold text-muted">{t("Pick at least one shop.")}</p>}
        <Button full className="min-h-14 text-lg" disabled={!canGo} onClick={() => (step < STEPS ? setStep(step + 1) : make())}>
          {step < STEPS ? t("Continue") : t("Make my plan")}
        </Button>
      </div>
    </div>
  );
}

// ---------- meals and snacks ----------

/** Which meals the person eats (at least one) and how many snacks (none to three), with each one's size as the plan will make it. */
function MealsAndSnacks({ shape, onChange, targets }: { shape: DayShape; onChange: (s: DayShape) => void; targets: Targets }) {
  const t = useT();
  const flip = (m: MealType) => onChange({ ...shape, meals: shape.meals.includes(m) ? shape.meals.filter((x) => x !== m) : PLAN_MEALS.filter((x) => x === m || shape.meals.includes(x)) });
  return (
    <div>
      <h2 className="text-lg font-[800]">{t("Meals")}</h2>
      <div role="group" aria-label={t("Meals")} className="mt-2 flex flex-wrap gap-2">
        {PLAN_MEALS.map((m) => {
          const on = shape.meals.includes(m);
          return (
            <button key={m} type="button" aria-pressed={on} onClick={() => flip(m)} className={`${on ? CHIP_ON : CHIP} gap-1.5 px-5`}>
              {on && <CheckIcon aria-hidden className="h-4 w-4" />}{t(MEAL_LABEL[m as "breakfast" | "lunch" | "dinner"])}
            </button>
          );
        })}
      </div>
      <h2 className="mt-6 text-lg font-[800]">{t("Snacks a day")}</h2>
      <div role="radiogroup" aria-label={t("Snacks a day")} className="mt-2 flex flex-wrap gap-2">
        {Array.from({ length: MAX_SNACKS + 1 }, (_, n) => (
          <button key={n} type="button" role="radio" aria-checked={shape.snacks === n} onClick={() => onChange({ ...shape, snacks: n })} className={`${shape.snacks === n ? CHIP_ON : CHIP} app-numbers min-w-[3.5rem] justify-center px-5`}>
            {n === 0 ? t("None") : n}
          </button>
        ))}
      </div>
      {!shape.meals.length ? (
        <p role="alert" className="mt-5 rounded-[1.25rem] bg-[var(--fill)] p-4 font-semibold">{t("Pick at least one meal.")}</p>
      ) : (
        <div className={`${CARD} mt-5 p-4`}>
          <p className="font-bold">{t("Each day:")}</p>
          <ul className="app-numbers mt-2 space-y-1 text-[0.9375rem]">
            {planSlots(shape).filter((m, i, all) => m !== "snack" || all.indexOf("snack") === i).map((m) => (
              <li key={m} className="flex justify-between gap-3">
                <span>{m === "snack" ? (shape.snacks > 1 ? t("{n} snacks", { n: shape.snacks }) : t("Snack")) : t(MEAL_LABEL[m as "breakfast" | "lunch" | "dinner"])}</span>
                <span className="text-muted">{m === "snack" && shape.snacks > 1 ? t("about {kcal} kcal each", { kcal: formatInt(targets.snack?.kcal ?? 0) }) : t("about {kcal} kcal", { kcal: formatInt(targets[m]?.kcal ?? 0) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- the budget slider ----------

/**
 * The budget as a slider (founder 2026-11-18: "an ... sideways arrow ... from a to z ... a green spot based on what to choose to be perfect, higher than the
 * green part is a higher budget to afford better produce. And lower on the scale is lower value produce but still to fit what they want they can't go lower
 * than what they want"): from the cheapest week that still fits the person's goal to the best fit made with better products, in whole pounds, a green spot
 * at the best fit, a head at each end of the track, and a plain line saying what the spot on the slider means. A native range input, so it works with a
 * finger, the arrow keys and VoiceOver (which reads "£42 a week").
 */
function BudgetSlider({ range, value, onChange }: { range: BudgetRange; value: number; onChange: (v: number) => void }) {
  const t = useT();
  const min = Math.floor(range.min);
  const max = Math.max(min + 1, Math.ceil(range.max));
  const best = Math.min(max, Math.max(min, Math.round(range.best)));
  const at = (v: number) => (v - min) / (max - min);
  // the thumb is 2.25rem wide, so its middle runs from 1.125rem in from each end: the spot and the track line up with it
  const along = (v: number) => `calc(1.125rem + (100% - 2.25rem) * ${at(v)})`;
  const onSpot = Math.abs(value - best) <= 1;
  const zone = value <= min ? t("The cheapest week for your goal: lower-cost recipes and everyday products.")
    : value < best - 1 ? t("Cheaper than the best fit: some meals are lower-cost recipes, still sized to your goal.")
    : value <= best + 1 ? t("The green spot: the best week for your goal.")
    : value < max ? t("More to spend: some meals are made with better products, like the shops' best ranges, organic or free range.")
    : t("Better products wherever your shops have them.");
  return (
    <div>
      <p className="app-numbers text-center text-[2.75rem] font-[800] leading-none tracking-[-0.02em]">£{value}</p>
      <p className="mt-1 text-center text-[0.9375rem] font-semibold text-muted">{t("for the week's shopping")}</p>
      <div className={`relative mt-6 h-12 ${onSpot ? "[&_input::-webkit-slider-thumb]:border-[var(--sun)] [&_input::-moz-range-thumb]:border-[var(--sun)]" : ""}`}>
        {/* the arrow: a track with a head at each end */}
        <span aria-hidden className="absolute inset-x-[1.125rem] top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ring-track)]" />
        <ChevronLeftIcon aria-hidden className="absolute start-0 top-1/2 h-5 w-5 -translate-y-1/2 text-muted rtl:rotate-180" />
        <ChevronLeftIcon aria-hidden className="absolute end-0 top-1/2 h-5 w-5 -translate-y-1/2 rotate-180 text-muted rtl:rotate-0" />
        {/* the green spot: the best fit, a short green stretch of the track that shows either side of the handle when the handle is on it */}
        <span aria-hidden className="absolute top-1/2 h-3 w-[4.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--sun)]" style={{ left: along(best) }} />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={t("Budget for the week")}
          aria-valuetext={t("£{n} a week", { n: value })}
          className="absolute inset-0 h-12 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:h-9 [&::-moz-range-thumb]:w-9 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:h-9 [&::-webkit-slider-thumb]:w-9 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-[0_4px_12px_rgba(0,0,0,0.3)] focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-accent"
        />
      </div>
      <div className="app-numbers mt-1 flex justify-between gap-3 text-[0.875rem] leading-snug">
        <span><span className="block font-bold">£{min}</span><span className="text-muted">{t("Cheapest")}</span></span>
        <span className="text-center"><span className="block font-bold">£{best}</span><span className="inline-flex items-center gap-1 text-muted"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--sun)]" />{t("Best fit")}</span></span>
        <span className="text-end"><span className="block font-bold">£{max}</span><span className="text-muted">{t("Better products")}</span></span>
      </div>
      <p aria-live="polite" className="glass mt-4 rounded-[1.25rem] p-4 text-[0.9375rem] leading-snug">{zone}</p>
      {Math.abs(value - best) > 1 && (
        <button type="button" onClick={() => onChange(best)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold">
          <span aria-hidden className="h-3 w-3 rounded-full bg-[var(--sun)]" />{t("Back to the green spot (£{n})", { n: best })}
        </button>
      )}
    </div>
  );
}

// ---------- the week ----------

function Week({ saved, onChange }: { saved: SavedPlan; onChange: () => void }) {
  const t = useT();
  const language = useLanguage();
  const settings = useSettings();
  const manifest = useShopManifest();
  const shopsAll: Shop[] = useMemo(() => recipeShops(manifest).map((r) => ({ id: r.id, name: r.name })), [manifest]);
  const slots = useMemo(() => saved.slots ?? [...PLAN_MEALS], [saved.slots]);
  const targets = useSlotTargets(shapeOf(slots));
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [day, setDay] = useState(0);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const shopKey = saved.shops.join("|");
  const leaveKey = saved.leaveOut.join("|");
  const dietKey = JSON.stringify(settings.preferences);
  const betterKey = (saved.better ?? []).join("|");

  useEffect(() => {
    let live = true;
    setFailed(false); // eslint-disable-line react-hooks/set-state-in-effect -- a new try starts clean
    loadShops(shopKey.split("|"))
      .then(async (l) => {
        const c = await workOut(l, JSON.parse(dietKey) as DietPrefs, targets, leaveKey ? leaveKey.split("|") : []);
        // the meals the budget made with better products (planForBudget), made the same way again
        const betterOf = betterFor(l, targets);
        const upgraded = new Map<string, PlanCandidate>();
        for (const key of betterKey ? betterKey.split("|") : []) {
          const [meal, id] = key.split(":");
          const plain = c.get(meal as MealType)?.find((x) => x.recipe.id === id);
          const b = plain ? betterOf(plain) : null;
          if (b) upgraded.set(key, b);
        }
        if (live) { setLoaded(l); setCandidates(withBetter(c, upgraded)); }
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [shopKey, leaveKey, dietKey, betterKey, targets, retry]);

  const week = useMemo(() => (candidates ? buildWeek(saved.ids, candidates, saved.budget, slots) : null), [candidates, saved, slots]);
  // each slot's name: "Breakfast", "Snack", or "Snack 2" when there are several
  const slotName = (i: number) => {
    const m = slots[i]!;
    if (m !== "snack") return t(MEAL_LABEL[m as "breakfast" | "lunch" | "dinner"]);
    const n = slots.filter((x) => x === "snack").length;
    return n > 1 ? t("Snack {n}", { n: slots.slice(0, i + 1).filter((x) => x === "snack").length }) : t("Snack");
  };
  const mealCount = slots.filter((m) => m !== "snack").length * 7;
  const snackCount = slots.filter((m) => m === "snack").length * 7;
  const dayNames = useMemo(() => {
    const start = new Date(`${saved.start}T12:00:00`);
    const f = new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "long" });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(start.getTime() + i * 86_400_000)));
  }, [saved.start, language]);
  const shopName = (id: string) => shopsAll.find((s) => s.id === id)?.name ?? id;

  if (failed) return <div><BackLink href="/app" label={t("Back to Home")} /><h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1><div className="mt-4"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>;
  if (!candidates || !loaded) return <div><BackLink href="/app" label={t("Back to Home")} /><h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1><Spinner label={t("Opening your plan")} /></div>;
  if (!week) {
    return (
      <div>
        <BackLink href="/app" label={t("Back to Home")} />
        <h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1>
        <div className="mt-4 space-y-3"><p className="glass rounded-[1.25rem] p-4">{t("Some recipes in your plan can't be made at your shops any more. Make a new plan.")}</p><Button full onClick={onChange}>{t("Make a new plan")}</Button></div>
      </div>
    );
  }

  const shown = week.days[day]!;
  const avg = (k: "kcal" | "protein") => Math.round(week.days.reduce((s, d) => s + d[k], 0) / week.days.length);
  const choices = swapping === null ? [] : swapChoices(saved.ids, day, swapping, candidates, 10, slots);
  const several = saved.shops.length > 1;
  const choose = (recipeId: string) => {
    if (swapping === null) return;
    const ids: PlanIds = setMeal(saved.ids, day, swapping, recipeId);
    mealPlanStore.set({ ...saved, ids });
    setSwapping(null);
    setAdded(null);
  };
  const addAll = () => {
    const files = new Map(loaded.map((l) => [l.id, l.file]));
    // each shop's packs go on that shop's own list if the person has made one (the newest), else on the main shopping list
    let ownLists = 0;
    shoppingStore.update((list) => week.shopping.reduce((l, line) => {
      const file = files.get(line.shop);
      if (!file) return l;
      const onList = listForShop(settings, file.retailer);
      if (onList) ownLists++;
      return addToList(l, { gtin: line.product.gtin, shopId: line.product.id, retailer: file.retailer, name: line.product.name, brand: "", size: "", price: line.product.price, checkedOn: file.checkedOn, ...withPhoto(shopPhotoSources(file, line.product)), ...(onList ? { list: onList } : {}) }, new Date(), line.packs);
    }, list));
    setAdded(ownLists ? t("Added {n} products to your shopping lists.", { n: week.shopping.length }) : t("Added {n} products to your shopping list.", { n: week.shopping.length }));
  };

  return (
    <div className="pb-6">
      <BackLink href="/app" label={t("Back to Home")} />
      <h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1>
      <p className="mt-2 text-base leading-snug text-muted">
        {snackCount ? t("{meals} meals and {snacks} snacks from our recipes, with ingredients from {shops}.", { meals: mealCount, snacks: snackCount, shops: names(shopsAll, week.shops) })
          : t("{meals} meals from our recipes, with ingredients from {shops}.", { meals: mealCount, shops: names(shopsAll, week.shops) })}
      </p>

      {/* the money first: what the shopping comes to, against the budget */}
      <div className={`${CARD} mt-4 p-4`}>
        <div className="flex items-center gap-3">
          <Pip mood={week.overBudget ? "think" : "cheer"} size={56} />
          <div className="min-w-0">
            <p className="app-numbers text-[1.75rem] font-[800] leading-none">{formatPrice(week.shoppingCost)}</p>
            <p className="mt-1 text-[0.9375rem] font-semibold text-muted">{t("for the week's shopping")}</p>
          </div>
        </div>
        <p className="mt-3 text-[0.9375rem] leading-snug">
          {week.budget === null ? t("No budget set.")
            : week.overBudget ? t("That's {over} over your {budget} budget: it's the cheapest week our recipes allow with your choices.", { over: formatPrice(week.shoppingCost - week.budget), budget: formatPrice(week.budget) })
            : t("Within your {budget} budget.", { budget: formatPrice(week.budget) })}
        </p>
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("The week's food uses {meals} of it; the rest is food left over in the packs.", { meals: formatPrice(week.mealsCost) })}</p>
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("About {kcal} kcal and {protein} g protein a day (your target is {target} kcal).", { kcal: formatInt(avg("kcal")), protein: formatInt(avg("protein")), target: formatInt(settings.dailyCalories) })}</p>
      </div>

      {/* the days: big buttons, the one showing is dark */}
      <div role="radiogroup" aria-label={t("Day")} className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5">
        {dayNames.map((name, i) => (
          <button key={i} type="button" role="radio" aria-checked={day === i} onClick={() => setDay(i)} className={`min-h-12 shrink-0 rounded-full px-4 text-[0.9375rem] font-bold transition active:scale-95 ${day === i ? "bg-foreground text-background" : "glass"}`}>{name}</button>
        ))}
      </div>

      <section aria-labelledby="day-h" className="mt-4">
        <h2 id="day-h" className={HEADING}>{dayNames[day]}</h2>
        <ul className="mt-3 space-y-3">
          {shown.meals.map((m, i) => (
            <li key={`${m.meal}-${i}`} className={`${CARD} p-3`}>
              <p className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{slotName(i)}</p>
              <div className="mt-2 flex items-center gap-3">
                <Link href={`/app/recipes/view?id=${m.candidate.recipe.id}&r=${m.candidate.shop}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <RecipeThumb id={m.candidate.recipe.id} name={m.candidate.recipe.name} meal={m.meal} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{t(m.candidate.recipe.name)}</span>
                    <span className="app-numbers mt-0.5 block text-[0.875rem] text-muted">{formatInt(m.candidate.perServing.kcal)} kcal · {formatInt(m.candidate.perServing.protein)} g {t("protein")}</span>
                    {several && <span className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted"><ShopMark shopId={m.candidate.shop} size="xs" />{shopName(m.candidate.shop)}</span>}
                    {m.candidate.better && <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-bold text-accent">{t("Better products")}</span>}
                  </span>
                </Link>
                <span className="app-numbers shrink-0 text-end text-base font-[800]">{formatPrice(m.candidate.cost)}</span>
              </div>
              <button type="button" onClick={() => setSwapping(i)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--fill)] px-4 text-[0.875rem] font-bold transition active:scale-95">
                <SwapIcon aria-hidden className="h-4 w-4" />{t("Swap this meal")}
              </button>
            </li>
          ))}
        </ul>
        <p className="app-numbers mt-3 px-1 text-[0.9375rem] font-semibold">{t("{day}: {kcal} kcal · {protein} g protein · {cost}", { day: dayNames[day]!, kcal: formatInt(shown.kcal), protein: formatInt(shown.protein), cost: formatPrice(shown.cost) })}</p>
      </section>

      <section aria-labelledby="buy-h" className="mt-8">
        <h2 id="buy-h" className={HEADING}>{t("What to buy for the week")}</h2>
        <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Every meal's amounts added up, as whole packs.")}</p>
        {week.shops.map((sh) => {
          const lines = week.shopping.filter((l) => l.shop === sh);
          const sum = lines.reduce((s, l) => s + l.cost, 0);
          return (
            <div key={sh} className="mt-4">
              <h3 className="flex items-center gap-2 px-1 text-lg font-[800]"><ShopMark shopId={sh} size="xs" />{shopName(sh)}</h3>
              <ul className={`${CARD} mt-2 divide-y divide-line overflow-hidden`}>
                {lines.map((l) => (
                  <li key={l.product.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block font-semibold leading-snug">{l.packs > 1 ? `${l.packs} × ` : ""}{l.product.name}</span>
                      {l.cupboard && <span className="mt-0.5 block text-[0.8125rem] text-muted">{t("You may have this already")}</span>}
                    </span>
                    <span className="app-numbers shrink-0 font-bold">{formatPrice(l.cost)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 bg-[var(--fill)] px-4 py-3 font-[800]"><span>{t("{shop} total", { shop: shopName(sh) })}</span><span className="app-numbers">{formatPrice(sum)}</span></li>
              </ul>
            </div>
          );
        })}
        {week.shops.length > 1 && <p className="app-numbers mt-3 flex items-center justify-between px-1 text-lg font-[800]"><span>{t("Total")}</span><span>{formatPrice(week.shoppingCost)}</span></p>}
        <p className="mt-2 px-1 text-[0.8125rem] leading-snug text-muted">{t("Prices are each shop's shelf prices and vary by store.")}</p>
      </section>

      <div className="mt-6 space-y-2.5">
        <Button variant="secondary" full className="min-h-12 gap-2" onClick={onChange}><CalendarIcon aria-hidden className="h-5 w-5" />{t("Make a new plan")}</Button>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
        <Button full className="min-h-14 gap-2 text-lg" onClick={addAll}><PlusIcon aria-hidden className="h-5 w-5" />{t("Add all to my shopping list")}</Button>
        <p role="status" aria-live="polite" className="px-2 text-center text-[0.875rem] font-semibold text-accent">
          {added && <span className="mt-2 block">{added} <Link href="/app/groceries/list" className="underline underline-offset-2">{t("See list")}</Link></span>}
        </p>
      </div>

      <Sheet open={swapping !== null} onClose={() => setSwapping(null)} title={swapping === null ? t("Swap this meal") : t("Swap {meal}", { meal: slotName(swapping).toLowerCase() })}>
        <p className="text-[0.9375rem] leading-snug text-muted">{t("Other recipes sized for this meal. Tap one to have it on {day}.", { day: dayNames[day]! })}</p>
        <ul className="mt-3 space-y-2">
          {choices.map((c) => (
            <li key={c.recipe.id}>
              <button type="button" onClick={() => choose(c.recipe.id)} className="glass flex min-h-[4.5rem] w-full items-center gap-3 rounded-[1.25rem] p-3 text-start transition hover:bg-soft-strong active:scale-[0.99]">
                <RecipeThumb id={c.recipe.id} name={c.recipe.name} meal={c.meal} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{t(c.recipe.name)}</span>
                  <span className="app-numbers mt-0.5 block text-[0.875rem] text-muted">{formatInt(c.perServing.kcal)} kcal · {formatInt(c.perServing.protein)} g {t("protein")}{several ? ` · ${shopName(c.shop)}` : ""}</span>
                </span>
                <span className="app-numbers shrink-0 font-[800]">{formatPrice(c.cost)}</span>
              </button>
            </li>
          ))}
          {!choices.length && <li className="glass rounded-[1.25rem] p-4">{t("No other recipes fit this meal with your choices.")}</li>}
        </ul>
      </Sheet>
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PlanScreen />
    </Suspense>
  );
}
