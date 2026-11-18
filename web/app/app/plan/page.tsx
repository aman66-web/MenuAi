"use client";

import Link from "next/link";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MEAL_LABEL } from "@/lib/mm/budget";
import { GATING_ENABLED } from "@/lib/mm/config";
import { formatInt } from "@/lib/mm/format";
import { addToList, formatPrice, withPhoto } from "@/lib/mm/groceries";
import { localeInfo } from "@/lib/mm/i18n";
import { LEAVE_OUT, PLAN_MEALS, buildWeek, makePlan, mergeCandidates, planCandidates, setMeal, swapChoices, type PlanCandidate, type PlanIds, type SavedPlan } from "@/lib/mm/mealPlan";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPES } from "@/lib/mm/recipeBook";
import { mealSizes, type MealTarget, type MealType } from "@/lib/mm/recipes";
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

const STEPS = 5;
const today = () => new Date().toISOString().slice(0, 10);
const BUDGETS = [30, 40, 50, 60, 80] as const;
const ROUND = "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95";
const ROUND_IN = "inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong";
const STEP_PIP: Record<number, PipMood> = { 1: "wave", 2: "think", 3: "point", 4: "think", 5: "point" };

type Shop = { id: string; name: string };
type Loaded = { id: string; file: ShopFile; products: ShopProduct[] };
type Candidates = Map<MealType, PlanCandidate[]>;

// The recipes worked out for a set of answers, kept while the app is open, so opening the plan again doesn't redo the sums.
const worked = new Map<string, Candidates>();
const workKey = (shops: readonly string[], diet: DietPrefs, target: MealTarget, leaveOut: readonly string[]) => JSON.stringify([[...shops].sort(), diet, target.kcal, target.protein ?? 0, [...leaveOut].sort()]);

/** Each shop's list (loaded once and cached by loadShopFile). */
async function loadShops(ids: readonly string[]): Promise<Loaded[]> {
  return Promise.all(ids.map(async (id) => ({ id, ...(await loadShopFile(id)) })));
}

/** The recipes for these answers, one shop at a time with a pause between, so the screen can say which shop Pip is on. */
async function workOut(shops: readonly Loaded[], diet: DietPrefs, target: MealTarget, leaveOut: readonly string[], onShop?: (id: string, done: string[]) => void): Promise<Candidates> {
  const key = workKey(shops.map((s) => s.id), diet, target, leaveOut);
  const known = worked.get(key);
  if (known) return known;
  const each: Candidates[] = [];
  const done: string[] = [];
  for (const sh of shops) {
    onShop?.(sh.id, [...done]);
    await new Promise((r) => setTimeout(r, 40));
    each.push(planCandidates(RECIPES, sh.products, diet, target, leaveOut, sh.id));
    done.push(sh.id);
  }
  onShop?.("", done);
  const merged = mergeCandidates(each);
  worked.set(key, merged);
  return merged;
}

/** The person's meal size: the Recipes tab's, and a share of the day's protein (three meals at 30% each), so the week reaches their protein too. */
function useMealTarget(): MealTarget {
  const settings = useSettings();
  const daily = macroTargets(settings);
  const meal = mealTargetFor(settings) ?? { kcal: mealSizes(settings.dailyCalories).normal };
  return useMemo(() => ({ ...meal, protein: meal.protein ?? Math.round(daily.protein * 0.3) }), [meal.kcal, meal.protein, daily.protein]); // eslint-disable-line react-hooks/exhaustive-deps -- the numbers
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
  const target = useMealTarget();
  const daily = macroTargets(settings);
  const [step, setStep] = useState(1);
  const [leaveOut, setLeaveOut] = useState<string[]>(saved?.leaveOut ?? []);
  const [typed, setTyped] = useState("");
  const [budgetText, setBudgetText] = useState(saved?.budget ? String(saved.budget) : "");
  const [shops, setShops] = useState<string[] | null>(saved?.shops ?? null);
  const [making, setMaking] = useState<{ on: string; done: string[] } | null>(null);
  const [problem, setProblem] = useState<"noPlan" | "offline" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // the shops start as the person's own (those that can make our recipes), else none chosen
  useEffect(() => {
    if (shops !== null || !shopsAll.length) return;
    setShops(shopsAll.filter((s) => (settings.shops ?? []).includes(s.id)).map((s) => s.id)); // eslint-disable-line react-hooks/set-state-in-effect -- the answer starts from the person's shops once the list arrives
  }, [shopsAll, shops, settings.shops]);
  const isMaking = making !== null;
  useLayoutEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }); }, [step, isMaking]);

  const budget = (() => { const v = Number(budgetText.replace(/[£,\s]/g, "")); return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null; })();
  const chosen = (shops ?? []).filter((id) => shopsAll.some((s) => s.id === id) || !shopsAll.length);
  const flip = (id: string) => setLeaveOut((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const addTyped = () => {
    const w = typed.trim().toLowerCase().slice(0, 40);
    if (w.length >= 3 && !leaveOut.includes(w)) setLeaveOut((l) => [...l, w]);
    setTyped("");
  };
  const typedWords = leaveOut.filter((x) => !LEAVE_OUT.some((c) => c.id === x));

  const make = async () => {
    if (!chosen.length) return;
    setProblem(null);
    setMaking({ on: chosen[0]!, done: [] });
    let loaded: Loaded[];
    try {
      loaded = await loadShops(chosen);
    } catch {
      setMaking(null);
      setProblem("offline");
      return;
    }
    const candidates = await workOut(loaded, settings.preferences, target, leaveOut, (on, done) => setMaking({ on, done }));
    const plan = makePlan(candidates, budget);
    setMaking(null);
    if (!plan) { setProblem("noPlan"); setStep(3); return; }
    mealPlanStore.set({ shops: chosen, ids: plan.ids, leaveOut, budget, start: today() } satisfies SavedPlan);
    onDone();
  };

  if (making) {
    return (
      <div className="pb-6">
        <h1 ref={heading} tabIndex={-1} className={`mt-4 ${TITLE} outline-none`}>{t("Making your plan")}</h1>
        <div className="mt-4"><PipSays mood="think" size={72} lively pulse={making.on}>{t("I'm checking every recipe at your shops and picking the best week for you.")}</PipSays></div>
        <ul className="mt-5 space-y-3">
          {chosen.map((id) => {
            const done = making.done.includes(id);
            const on = making.on === id && !done;
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
        <p role="status" className="sr-only">{t("Making your plan")}</p>
      </div>
    );
  }

  const title = [t("Your daily numbers"), t("Your diet and allergies"), t("Foods you'd rather not have"), t("Your budget for the week"), t("Where you shop")][step - 1]!;
  const says = [
    t("Hi! Let's plan your week. First, your daily numbers: I'll size every meal to them."),
    t("Do you follow a diet, or have any allergies? I'll leave out any recipe that doesn't fit."),
    t("Any foods you don't like? Tap them, or type your own, and I'll leave them out."),
    t("How much would you like the week's food shopping to cost? Leave it empty for no limit."),
    t("Where do you shop? Pick as many as you like, and I'll find the best recipes across them."),
  ][step - 1]!;
  const canGo = step < STEPS || chosen.length > 0;

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
            <p className="app-numbers mt-1 text-[0.9375rem] leading-snug text-muted">{t("So each meal is about {kcal} kcal.", { kcal: formatInt(target.kcal) })}</p>
            <Link href="/app/settings#targets" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold">{t("Change my numbers")}</Link>
          </div>
        )}

        {step === 2 && <DietPicker value={settings.preferences} onChange={(p) => updateSettings({ preferences: p })} />}

        {step === 3 && (
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
          </>
        )}

        {step === 4 && (
          <>
            <div role="group" aria-label={t("Budget for the week")} className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <button key={b} type="button" aria-pressed={budget === b} onClick={() => setBudgetText(String(b))} className={`${budget === b ? CHIP_ON : CHIP} app-numbers px-5`}>£{b}</button>
              ))}
              <button type="button" aria-pressed={budget === null} onClick={() => setBudgetText("")} className={`${budget === null ? CHIP_ON : CHIP} px-5`}>{t("No limit")}</button>
            </div>
            <label className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{t("Or type an amount")}</span>
              <span className="flex items-center gap-1.5"><span className="text-xl font-bold">£</span>
                <input inputMode="decimal" value={budgetText} onChange={(e) => setBudgetText(e.target.value.slice(0, 8))} placeholder="50" aria-label={t("Budget for the week in pounds")} className={`${inputClass} app-numbers w-32`} />
              </span>
            </label>
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
            {problem === "offline" && <div className="mt-3"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => void make()} /></div>}
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-6 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
        {step === STEPS && !chosen.length && <p className="mb-2 text-center text-[0.9375rem] font-semibold text-muted">{t("Pick at least one shop.")}</p>}
        <Button full className="min-h-14 text-lg" disabled={!canGo} onClick={() => (step < STEPS ? setStep(step + 1) : void make())}>
          {step < STEPS ? t("Continue") : t("Make my plan")}
        </Button>
      </div>
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
  const target = useMealTarget();
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

  useEffect(() => {
    let live = true;
    setFailed(false); // eslint-disable-line react-hooks/set-state-in-effect -- a new try starts clean
    loadShops(shopKey.split("|"))
      .then(async (l) => {
        const c = await workOut(l, JSON.parse(dietKey) as DietPrefs, target, leaveKey ? leaveKey.split("|") : []);
        if (live) { setLoaded(l); setCandidates(c); }
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [shopKey, leaveKey, dietKey, target, retry]);

  const week = useMemo(() => (candidates ? buildWeek(saved.ids, candidates, saved.budget) : null), [candidates, saved]);
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
  const choices = swapping === null ? [] : swapChoices(saved.ids, day, swapping, candidates);
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
    shoppingStore.update((list) => week.shopping.reduce((l, line) => {
      const file = files.get(line.shop);
      if (!file) return l;
      return addToList(l, { gtin: line.product.gtin, shopId: line.product.id, retailer: file.retailer, name: line.product.name, brand: "", size: "", price: line.product.price, checkedOn: file.checkedOn, ...withPhoto(shopPhotoSources(file, line.product)) }, new Date(), line.packs);
    }, list));
    setAdded(t("Added {n} products to your shopping list.", { n: week.shopping.length }));
  };

  return (
    <div className="pb-6">
      <BackLink href="/app" label={t("Back to Home")} />
      <h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1>
      <p className="mt-2 text-base leading-snug text-muted">{t("21 meals from our recipes, with ingredients from {shops}.", { shops: names(shopsAll, week.shops) })}</p>

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
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("The 21 meals use {meals} of it; the rest is food left over in the packs.", { meals: formatPrice(week.mealsCost) })}</p>
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("About {kcal} kcal and {protein} g protein a day from the three meals (your target is {target} kcal).", { kcal: formatInt(avg("kcal")), protein: formatInt(avg("protein")), target: formatInt(settings.dailyCalories) })}</p>
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
            <li key={m.meal} className={`${CARD} p-3`}>
              <p className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t(MEAL_LABEL[m.meal as "breakfast" | "lunch" | "dinner"])}</p>
              <div className="mt-2 flex items-center gap-3">
                <Link href={`/app/recipes/view?id=${m.candidate.recipe.id}&r=${m.candidate.shop}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <RecipeThumb id={m.candidate.recipe.id} name={m.candidate.recipe.name} meal={m.meal} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{t(m.candidate.recipe.name)}</span>
                    <span className="app-numbers mt-0.5 block text-[0.875rem] text-muted">{formatInt(m.candidate.perServing.kcal)} kcal · {formatInt(m.candidate.perServing.protein)} g {t("protein")}</span>
                    {several && <span className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted"><ShopMark shopId={m.candidate.shop} size="xs" />{shopName(m.candidate.shop)}</span>}
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

      <Sheet open={swapping !== null} onClose={() => setSwapping(null)} title={swapping === null ? t("Swap this meal") : t("Swap {meal}", { meal: t(MEAL_LABEL[PLAN_MEALS[swapping] as "breakfast" | "lunch" | "dinner"]).toLowerCase() })}>
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
