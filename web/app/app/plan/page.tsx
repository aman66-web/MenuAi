"use client";

import Link from "next/link";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MEAL_LABEL } from "@/lib/mm/budget";
import { GATING_ENABLED } from "@/lib/mm/config";
import { formatInt } from "@/lib/mm/format";
import { addToList, formatPrice, listForShop, withPhoto } from "@/lib/mm/groceries";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { DEFAULT_SHAPE, LEAVE_OUT, MAX_SNACKS, PLAN_DAYS, PLAN_MEALS, PER_MEAL_RECIPES, VARIETIES, betterCandidate, betterForHousehold, forHousehold, budgetRange, buildWeek, cuisineRecipes, forPeople, keepEarlier, openEarlier, leavesOut, mergeCandidates, planCandidates, planForBudget, planSlots, setMeal, shapeOf, slotTargets, swapChoices, withBetter, type BudgetRange, type DayShape, type PlanCandidate, type PlanIds, type SavedPlan, type Variety } from "@/lib/mm/mealPlan";
import { RECIPES } from "@/lib/mm/recipeBook";
import { CUISINES, type CuisineId } from "@/lib/mm/recipeBook/niches";
import { matchesNiche } from "@/lib/mm/recipeNiche";
import { recipeForDiet, type MealTarget, type MealType } from "@/lib/mm/recipes";
import { recipeShops, shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { addLogEntry, earlierPlansStore, householdStore, mealPlanStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { homeDiet, shareWords, withCount, type Household } from "@/lib/mm/household";
import { macroTargets } from "@/lib/mm/targets";
import type { DietPrefs } from "@/lib/mm/pantry";
import { ShopMark } from "../_components/ChainMark";
import { DietPicker, dietWords } from "../_components/DietPicker";
import { CalendarIcon, CheckIcon, ChevronLeftIcon, PlusIcon, SwapIcon } from "../_components/icons";
import { Pip, PipSays, type PipMood } from "../_components/Mascot";
import { useGate } from "../_components/Paywall";
import { Button, ErrorBox, Sheet, Spinner, inputClass } from "../_components/ui";
import { useHydrated, useIsPro, useSettings, useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { BackLink, CARD, CHIP, CHIP_ON, HEADING, TITLE } from "../groceries/PageBits";
import { PhotoTile } from "../groceries/ProductPhoto";
import { RecipeThumb } from "../recipes/RecipeThumb";
import { AllergiesStep, CountStep, GROUP_LABEL, MeatStep, WhoStep, allergyLine, personName, whoWords } from "./HouseholdSteps";

// The meal plan (founder 2026-11-18; lib/mm/mealPlan.ts has the rules). Premium ("a third icon, which has meal plan, and that has pro on it"). Pip asks one thing
// a screen ("they just got to type in all their stuff, like Pip's guiding them through"): the daily numbers from the person's own plan, their diet and allergies,
// foods they'd rather not have, a budget for the week, and the shops they use, as many as they like ("it'll combine everything and then choose the best meal plan
// overall"). Then the week: each day's breakfast, lunch and dinner from our own recipes with its calories, protein, price and shop; any meal can be swapped for
// another from a list; what the shopping comes to against the budget; the shopping for each shop as whole packs, and one button that puts it all on the
// shopping list. The plan stays on the phone until a new one is made (mm.v1.mealPlan).

const today = () => new Date().toISOString().slice(0, 10);
const ROUND = "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95";
const ROUND_IN = "inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong";
// The steps, one question a screen (the 20-agent meeting, 2026-11-19): how many people first; a household then says who each person is, its allergies and
// whether anyone doesn't eat meat; Just me keeps its own diet and the food it likes; everyone ends on the check screen before the plan is made.
type StepId = "count" | "who" | "meals" | "shops" | "diet" | "cuisine" | "allergies" | "meat" | "leaveOut" | "budget" | "check";
const JUST_ME: readonly StepId[] = ["count", "meals", "shops", "diet", "cuisine", "leaveOut", "budget", "check"];
const HOUSEHOLD: readonly StepId[] = ["count", "who", "meals", "shops", "allergies", "meat", "leaveOut", "budget", "check"];
const STEP_PIP: Record<StepId, PipMood> = { count: "wave", who: "point", meals: "point", shops: "think", diet: "think", cuisine: "cheer", allergies: "think", meat: "point", leaveOut: "point", budget: "point", check: "cheer" };
/** A new person's id on this phone (letters and digits only). */
const personId = () => `p${Math.random().toString(36).slice(2, 10)}`;
const MEAL_PLURAL: Record<string, string> = { breakfast: tk("breakfasts"), lunch: tk("lunches"), dinner: tk("dinners"), snack: tk("snacks") };

type Shop = { id: string; name: string };
type Loaded = { id: string; file: ShopFile; products: ShopProduct[] };
type Candidates = Map<MealType, PlanCandidate[]>;
type Targets = Partial<Record<MealType, MealTarget>>;

// The recipes worked out for a set of answers, kept while the app is open, so opening the plan again doesn't redo the sums.
const worked = new Map<string, Candidates>();
const workKey = (shops: readonly string[], diet: DietPrefs, targets: Targets, leaveOut: readonly string[], cuisines: readonly CuisineId[] = [], asWritten = false) => JSON.stringify([[...shops].sort(), diet, targets, [...leaveOut].sort(), [...cuisines].sort(), asWritten]);

/** Our recipes for the kinds of food chosen (cuisineRecipes: a meal with too few of them for the diet takes any kind). */
const recipesFor = (cuisines: readonly CuisineId[], diet: DietPrefs, leaveOut: readonly string[]) => cuisineRecipes(RECIPES, cuisines, diet, leaveOut).recipes;

/** Each shop's list (loaded once and cached by loadShopFile). */
async function loadShops(ids: readonly string[]): Promise<Loaded[]> {
  return Promise.all(ids.map(async (id) => ({ id, ...(await loadShopFile(id)) })));
}

/** The recipes for these answers, one shop at a time with a pause between, so the screen can say which shop Pip is on. */
async function workOut(shops: readonly Loaded[], diet: DietPrefs, targets: Targets, leaveOut: readonly string[], cuisines: readonly CuisineId[], onShop?: (id: string, done: string[]) => void, asWritten = false): Promise<Candidates> {
  const key = workKey(shops.map((s) => s.id), diet, targets, leaveOut, cuisines, asWritten);
  const known = worked.get(key);
  if (known) return known;
  const each: Candidates[] = [];
  const done: string[] = [];
  for (const sh of shops) {
    onShop?.(sh.id, [...done]);
    await new Promise((r) => setTimeout(r, 40));
    each.push(planCandidates(recipesFor(cuisines, diet, leaveOut), sh.products, diet, targets, leaveOut, sh.id, asWritten));
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
        {[t("Your meals and snacks for seven days, sized to your goal"), t("From one shop or several: the best recipes across them"), t("What each meal costs, and the week's shopping within your budget"), t("Swap any meal you don't fancy, then add everything to your shopping list")].map((line) => (
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
  // the people cooked for (lib/mm/household.ts; on this phone only): Just me unless they say otherwise on the first screen
  const home = useStore(householdStore);
  const household = home.others.length > 0;
  const count = home.others.length + 1;
  const setHome = (patch: Partial<Household>) => householdStore.set({ ...householdStore.get(), ...patch });
  const steps = household ? HOUSEHOLD : JUST_ME;
  const id: StepId = steps[Math.min(step, steps.length) - 1] ?? "count";
  const total = steps.length;
  const go = (to: StepId) => setStep(steps.indexOf(to) + 1);
  // the day's meals and snacks (founder 2026-11-18: "how many meals and how many snacks they want a day as well ... full personalization")
  const [shape, setShape] = useState<DayShape>(saved?.slots ? shapeOf(saved.slots) : DEFAULT_SHAPE);
  const slots = useMemo(() => planSlots(shape), [shape]);
  const targets = useSlotTargets(shape);
  // how often a meal may come round (founder 2026-11-18: "they can choose if they want any foods repeated")
  const [variety, setVariety] = useState<Variety>(saved?.variety ?? PER_MEAL_RECIPES);
  // "Make my plan": the plan is made, then Pip shows the work step by step before the week opens
  const [making, setMaking] = useState<{ steps: string[]; plan: SavedPlan } | null>(null);
  const [leaveOut, setLeaveOut] = useState<string[]>(saved?.leaveOut ?? []);
  const [cuisines, setCuisines] = useState<CuisineId[]>(saved?.cuisines ?? []);
  const [typed, setTyped] = useState("");
  const [shops, setShops] = useState<string[] | null>(saved?.shops ?? null);
  // the budget step (founder 2026-11-18, a slider from the cheapest week to better products, a green spot for the best fit): the prices are worked out for the
  // chosen shops when the step opens, then the slider shows; `pick` is the pound amount on it
  const [prep, setPrep] = useState<{ key: string; loaded: Loaded[]; cands: Candidates } | null>(null);
  const [ranged, setRanged] = useState<{ key: string; range: BudgetRange | null } | null>(null);
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
  // a household's recipes suit the whole home: its allergies and meat answer added to the person's own diet (household.ts homeDiet)
  const prefs = useMemo(() => homeDiet(settings.preferences, home), [settings.preferences, home]);
  const cuisinesUsed = useMemo(() => (household ? [] : cuisines), [household, cuisines]);
  const left = useMemo(() => [...new Set(slots)].map((meal) => ({
    meal,
    n: recipesFor(cuisinesUsed, prefs, leaveOut).filter((r) => { if (r.meal !== meal) return false; const fit = recipeForDiet(r, prefs); return !!fit && !leavesOut(fit, leaveOut); }).length,
  })), [prefs, leaveOut, slots, cuisinesUsed]);
  const noneFor = left.find((l) => l.n === 0);
  const fewFor = left.filter((l) => l.n > 0 && l.n < variety * slots.filter((x) => x === l.meal).length);
  const mealWord = (m: MealType) => (m === "snack" ? t("snack") : t(MEAL_LABEL[m as "breakfast" | "lunch" | "dinner"]).toLowerCase());

  // the prices for the budget step: worked out when it opens (and again if the shops, the diet or the foods changed)
  const prepKey = workKey(chosen, prefs, targets, leaveOut, cuisinesUsed, household) + slots.join("|") + `|${variety}`;
  const prepping = useRef<string | null>(null);
  useEffect(() => {
    if ((id !== "budget" && id !== "check") || !chosen.length || prep?.key === prepKey || prepping.current === prepKey) return;
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
      const cands = await workOut(loaded, prefs, targets, leaveOut, cuisinesUsed, (on, done) => { if (live) setPreparing({ on, done }); }, household);
      if (!live) return;
      setPrep({ key: prepKey, loaded, cands });
      setPreparing(null);
    })();
    return () => { live = false; if (prepping.current === prepKey) prepping.current = null; };
  }, [id, prepKey]); // eslint-disable-line react-hooks/exhaustive-deps -- prepKey holds the answers it depends on

  // a household's meals: each recipe as written, sized for everyone (mealPlan.ts forHousehold); Just me: fitted to the person, as before
  const others = useMemo(() => home.others.map((o) => ({ group: o.group, portion: o.portion })), [home.others]);
  const sizing = useMemo(() => ({ targets, yourDailyKcal: settings.dailyCalories, others }), [targets, settings.dailyCalories, others]);
  const sized = (c: Candidates) => (household ? forHousehold(c, sizing) : c);
  const betterSized = (l: readonly Loaded[]) => (household ? betterForHousehold(betterFor(l, {}), sizing) : betterFor(l, targets));
  const homeKey = JSON.stringify(others);
  // the slider's range for these prices and these people, worked out after the screen has drawn (the spinner shows meanwhile)
  const rangeKey = prep && prep.key === prepKey ? `${prepKey}|${homeKey}` : null;
  useEffect(() => {
    if (!rangeKey || !prep || ranged?.key === rangeKey) return;
    const timer = setTimeout(() => {
      const range = budgetRange(sized(prep.cands), betterSized(prep.loaded), slots, variety);
      setRanged({ key: rangeKey, range });
      if (range) setPick((p) => {
        const want = p ?? (saved && JSON.stringify(saved.home?.others ?? []) === homeKey ? saved.budget : null) ?? Math.round(range.best);
        return Math.min(Math.ceil(range.max), Math.max(Math.floor(range.min), Math.round(want)));
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- rangeKey holds the answers it depends on
  const range = ranged && ranged.key === rangeKey ? ranged.range : undefined;

  const ready = !!prep && prep.key === prepKey && !!range && pick !== null;
  const make = () => {
    if (!ready || !prep || pick === null) return;
    const plan = planForBudget(sized(prep.cands), pick, betterSized(prep.loaded), slots, variety);
    if (!plan) { setProblem("noPlan"); go("leaveOut"); return; }
    // what Pip did, each with its real figure (founder 2026-11-18: "show them what you're doing ... so you're showing them that you're properly working")
    const w = plan.week;
    const recipes = new Set([...prep.cands.values()].flat().map((c) => c.recipe.id)).size;
    const products = prep.loaded.reduce((n, l) => n + l.products.length, 0);
    const meals = slots.filter((m) => m !== "snack").length * PLAN_DAYS;
    const snacks = slots.filter((m) => m === "snack").length * PLAN_DAYS;
    const eaten = w.fresh.bought > 0 ? Math.round((100 * w.fresh.eaten) / w.fresh.bought) : 100;
    const steps = [
      t("Reading {n} recipes that suit your diet", { n: formatInt(recipes) }),
      t("Looking through {n} products at {shops}", { n: formatInt(products), shops: names(shopsAll, chosen) }),
      household ? t("Sizing every meal for {n} of you: your own portion to your {kcal} kcal and {protein} g protein a day", { n: count, kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) })
        : t("Sizing every meal to your {kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) }),
      snacks ? t("Choosing {meals} meals and {snacks} snacks for your week", { meals, snacks }) : t("Choosing {meals} meals for your week", { meals }),
      t("Planning the packs so {pct}% of the fresh food gets eaten", { pct: eaten }),
      w.overBudget ? t("Finding the cheapest week your choices allow: {cost}", { cost: formatPrice(w.shoppingCost) }) : t("Keeping the week to {cost}, within your {budget}", { cost: formatPrice(w.shoppingCost), budget: formatPrice(pick) }),
      household ? t("Writing your shopping list for {people} people: {n} products", { people: count, n: w.shopping.length }) : t("Writing your shopping list: {n} products", { n: w.shopping.length }),
    ];
    setMaking({ steps, plan: { shops: chosen, ids: plan.ids, slots, leaveOut, budget: pick, start: today(), variety, ...(cuisinesUsed.length ? { cuisines: cuisinesUsed } : {}), ...(plan.better.length ? { better: plan.better } : {}), ...(household ? { home: { others, allergies: home.allergies, meat: home.meat } } : {}) } });
  };
  const finish = () => {
    if (!making) return;
    // the plan this one replaces is kept among the earlier plans (founder 2026-11-19: "they can start another meal plan")
    if (saved) earlierPlansStore.update((l) => keepEarlier(l, saved));
    mealPlanStore.set(making.plan);
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

  const TITLES: Record<StepId, string> = {
    count: t("How many people are you cooking for?"), who: t("Who's eating with you?"), meals: t("Your meals and snacks"), shops: t("Where you shop"),
    diet: t("Your diet and allergies"), cuisine: t("The food you like"), allergies: t("Any food allergies at home?"), meat: t("Does anyone not eat meat?"),
    leaveOut: household ? t("Anything someone won't eat?") : t("Foods you'd rather not have"), budget: t("Your budget for the week"), check: t("Ready to make your plan?"),
  };
  const title = TITLES[id];
  // the shops step says what the ticks mean as they change (founder 2026-11-18: "it needs to be clear to them")
  const chosenNames = shopsAll.filter((s) => chosen.includes(s.id)).map((s) => s.name);
  const shopsSay = chosenNames.length === 1
    ? t("Everything will come from {shop}: one shop, one shopping list. Pick another too, and I'll share the meals between them.", { shop: chosenNames[0]! })
    : chosenNames.length > 1
      ? t("I'll share your meals between {shops}, using the best shop for each meal.", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(chosenNames) })
      : t("Where do you shop? Pick one shop to buy everything there, or several and I'll share the meals between them.");
  const SAYS: Record<StepId, string> = {
    count: t("Hi! Let's plan your week. Count yourself: I'll size every meal for everyone who's eating."),
    who: t("Tell me who each person is, so I can size their portion. Names are optional and stay on this phone."),
    meals: t("How do you like to eat? Pick your meals and snacks, and how often a meal can come round. I'll size each one so your day adds up."),
    shops: shopsSay,
    diet: t("Do you follow a diet, or have any allergies? I'll leave out any recipe that doesn't fit."),
    cuisine: cuisines.length ? t("Lunches and dinners from {cuisines}. Breakfasts and snacks stay as usual.", { cuisines: new Intl.ListFormat("en-GB", { type: "disjunction" }).format(cuisines.map((c) => t(CUISINES.find((x) => x.id === c)!.label))) })
      : t("What kind of food do you like for lunch and dinner? Pick as many as you like, or Any."),
    allergies: t("Tick any food allergy anyone at home has. Recipes made with it are left out for everyone. Always check the label."),
    meat: t("I cook one meal for everyone, so if anyone doesn't eat meat, the whole home has the meat-free version."),
    leaveOut: household ? t("Any foods someone won't eat? Tap them, or type your own, and I'll leave them out for everyone.") : t("Any foods you don't like? Tap them, or type your own, and I'll leave them out."),
    budget: t("Slide to choose your budget. The green spot is the best week for your goal: left is cheaper, right buys better products."),
    check: t("Here's everything. Tap Change on anything you'd like to change, then I'll make your plan."),
  };
  const says = SAYS[id];
  if (making) return <Making steps={making.steps} onDone={finish} />;
  const canGo = !(id === "meals" && !shape.meals.length) && !(id === "leaveOut" && noneFor) && !(id === "shops" && !chosen.length) && !((id === "budget" || id === "check") && !ready);
  // the bottom button says the usual answer until something is changed (the meeting: the button is the only way on, and a hurried person taps it once)
  const nextLabel = id === "check" ? t("Make my plan")
    : id === "allergies" && !home.allergies.length ? t("No allergies at home")
    : id === "meat" && home.meat === "all" ? t("We all eat the same")
    : id === "leaveOut" && !leaveOut.length ? t("Nothing to leave out")
    : t("Continue");

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
        {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i < step ? "bg-foreground" : "bg-[var(--ring-track)]"}`} />)}
      </div>
      <p className="mt-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted" aria-live="polite">{t("Step {step} of {total}", { step, total })}</p>

      <h1 ref={heading} tabIndex={-1} className={`mt-3 ${TITLE} outline-none`}>{title}</h1>
      <div className="mt-4"><PipSays mood={STEP_PIP[id]} size={64} lively pulse={id === "shops" ? `shops-${chosenNames.length}` : id === "cuisine" ? `cuisine-${cuisines.join()}` : id}>{says}</PipSays></div>

      <div className="mt-4">
        {id === "count" && <CountStep count={count} onChange={(n) => { if (n !== count) { householdStore.set(withCount(householdStore.get(), n, personId)); setPick(null); } }} />}

        {id === "who" && <WhoStep others={home.others} onChange={(o) => { setHome({ others: o }); setPick(null); }} />}

        {/* your numbers on the meals step's top line (the meeting: no screen of its own); in a household they size your own portion */}
        {id === "meals" && (
          <div className={`${CARD} mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-4`}>
            <p className="app-numbers min-w-0 text-[1rem] font-bold">{household ? t("Your portions: {kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) }) : t("{kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) })}</p>
            <Link href="/app/settings#targets" className="inline-flex min-h-11 items-center rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold">{t("Change my numbers")}</Link>
          </div>
        )}

        {id === "meals" && <MealsAndSnacks shape={shape} onChange={setShape} targets={targets} variety={variety} onVariety={setVariety} />}

        {id === "diet" && <DietPicker value={settings.preferences} onChange={(p) => updateSettings({ preferences: p })} />}

        {id === "cuisine" && <CuisinePicker value={cuisines} onChange={setCuisines} diet={prefs} leaveOut={leaveOut} slots={slots} />}

        {id === "allergies" && <AllergiesStep value={home.allergies} onChange={(a) => { setHome({ allergies: a }); setPick(null); }} />}

        {id === "meat" && <MeatStep value={home.meat} onChange={(m) => { setHome({ meat: m }); setPick(null); }} />}

        {id === "leaveOut" && (
          <>
            {problem === "noPlan" && <p role="alert" className="glass mb-3 rounded-[1.25rem] p-4 font-semibold">{t("There aren't enough of our recipes left for every meal with these choices. Try leaving out fewer foods, or pick another shop.")}</p>}
            {/* nothing left for a meal: said at the top, where it's seen (usability test 2026-11-19: at large text it sat under the sticky Continue) */}
            {noneFor && <p role="alert" className="mb-3 rounded-[1.25rem] bg-[var(--fill)] p-4 text-[0.9375rem] font-semibold leading-snug">{t("With these, there are no {meal} recipes left, so I can't plan a week. Tap a food again to put it back.", { meal: mealWord(noneFor.meal) })}</p>}
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
                ? t("With these, there are no {meal} recipes left, so I can't plan a week. Tap a food again to put it back.", { meal: mealWord(noneFor.meal) })
                : <>
                    <span className="app-numbers">{t("I can choose from {list}.", { list: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(left.map((l) => `${l.n} ${t(MEAL_PLURAL[l.meal]!)}`)) })}</span>
                    {fewFor.length > 0 && <span className="mt-1 block font-semibold">{t("Only a few {meals} are left, so some days will repeat.", { meals: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(fewFor.map((f) => t(MEAL_PLURAL[f.meal]!))) })}</span>}
                  </>}
            </div>
          </>
        )}

        {id === "shops" && (
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
            <div className="mt-4"><ShopsNote names={chosenNames} /></div>
          </>
        )}

        {id === "budget" && (
          <>
            {problem === "offline" ? <ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => { setProblem(null); setPrep(null); go("shops"); }} />
              : preparing ? (<><p role="status" className="text-[1.0625rem] font-semibold">{t("Working out the prices at your shops…")}</p>{working}</>)
              : range === undefined ? <Spinner label={t("Working out the prices at your shops…")} />
              : !range ? <p role="alert" className="glass rounded-[1.25rem] p-4 font-semibold">{t("There aren't enough of our recipes left for every meal with these choices. Try leaving out fewer foods, or pick another shop.")}</p>
              : pick !== null && <BudgetSlider range={range} value={pick} onChange={setPick} />}
          </>
        )}

        {/* the check screen (the meeting: everyone sees it, Just me too; allergies first; anything can be changed from here) */}
        {id === "check" && (
          <ul className="space-y-2.5">
            {([
              household ? ["allergies", t("Allergies at home"), allergyLine(t, home.allergies)] : ["diet", t("Your diet and allergies"), dietWords(t, settings.preferences).join(", ") || t("No diet or allergies.")],
              ["count", t("Who's eating"), household ? whoWords(t, home) : t("Just you")],
              ...(household ? [["meat", t("Meat"), home.meat === "vegan" ? t("Every meal vegan, for everyone") : home.meat === "vegetarian" ? t("Every meal vegetarian, for everyone") : t("Meals can have meat or fish")]] : []),
              ["meals", t("Meals and snacks"), dayShape(t, shape)],
              ["shops", t("Where you shop"), chosenNames.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(chosenNames) : t("No shop chosen")],
              ...(household ? [] : [["cuisine", t("The food you like"), cuisines.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(cuisines.map((c) => t(CUISINES.find((x) => x.id === c)!.label))) : t("Any")]]),
              ["leaveOut", household ? t("Left out for everyone") : t("Foods left out"), leaveOut.length ? leaveOut.map((x) => t(LEAVE_OUT.find((c) => c.id === x)?.label ?? x)).join(", ") : t("Nothing")],
              ["budget", t("Your budget"), pick !== null ? t("{budget} a week", { budget: formatPrice(pick) }) : t("Not set yet")],
            ] as Array<[StepId, string, string]>).map(([to, label, value]) => (
              <li key={to} className={`${CARD} flex items-center gap-3 p-4`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
                  <span className="mt-0.5 block text-[1rem] font-semibold leading-snug [overflow-wrap:anywhere]">{value}</span>
                </span>
                <button type="button" onClick={() => go(to)} aria-label={t("Change: {what}", { what: label })} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold transition active:scale-95">{t("Change")}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-6 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
        {id === "shops" && !chosen.length && <p className="mb-2 text-center text-[0.9375rem] font-semibold text-muted">{t("Pick at least one shop.")}</p>}
        <Button full className="min-h-14 text-lg" disabled={!canGo} onClick={() => (step < total ? setStep(step + 1) : make())}>{nextLabel}</Button>
      </div>
    </div>
  );
}

// ---------- meals and snacks ----------

/**
 * What one shop or several means for the week, said as the person ticks (founder 2026-11-18: "if they choose one shop, all the ingredients can be bought from
 * one shop. If they choose two shops ... spaced over two shops, and will choose the best ingredients from the two shops ... it needs to be clear to them").
 * Under the list; Pip's line above says the same in short. True to planCandidatesAcross: each meal from one shop, the closest fit or the cheaper one when as close; the list split by shop.
 */
function ShopsNote({ names }: { names: string[] }) {
  const t = useT();
  if (!names.length) return null;
  const one = names.length === 1;
  const lines = one
    ? [
        t("Every ingredient for the whole week is a real {shop} product, with its price.", { shop: names[0]! }),
        t("One shop and one shopping list."),
      ]
    : [
        t("Each meal comes from the shop whose products fit your numbers best (the cheaper one when they're as close), and all its ingredients are bought there."),
        t("Your shopping list is split by shop, so you know what to buy where."),
        t("More shops also means more recipes to choose from."),
      ];
  return (
    <div role="status" aria-live="polite" className="glass rounded-[1.25rem] p-4">
      <p className="text-[1.0625rem] font-bold leading-snug">{one ? t("With one shop") : t("With {n} shops", { n: names.length })}</p>
      <ul className="mt-2 space-y-1.5">
        {lines.map((l) => (
          <li key={l} className="flex gap-2 text-[0.9375rem] leading-snug text-muted"><CheckIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />{l}</li>
        ))}
      </ul>
    </div>
  );
}

/** The cuisines for lunch and dinner (founder 2026-11-19): Any (none chosen), or as many as they like, each with how many of our lunches and dinners it has. */
/** "2 meals and 1 snack a day" (usability test 2026-11-19: "1 snacks"). */
function dayShape(t: ReturnType<typeof useT>, shape: DayShape): string {
  const meals = shape.meals.length;
  if (!shape.snacks) return meals === 1 ? t("1 meal a day") : t("{meals} meals a day", { meals });
  if (shape.snacks === 1) return meals === 1 ? t("1 meal and 1 snack a day") : t("{meals} meals and 1 snack a day", { meals });
  return meals === 1 ? t("1 meal and {snacks} snacks a day", { snacks: shape.snacks }) : t("{meals} meals and {snacks} snacks a day", { meals, snacks: shape.snacks });
}

/** The kinds of food for lunch and dinner, each with how many of its lunches and dinners suit the person's diet; a meal with too few takes any kind, said here. */
function CuisinePicker({ value, onChange, diet, leaveOut, slots }: { value: CuisineId[]; onChange: (v: CuisineId[]) => void; diet: DietPrefs; leaveOut: readonly string[]; slots: readonly MealType[] }) {
  const t = useT();
  const fits = (r: (typeof RECIPES)[number]) => { const d = recipeForDiet(r, diet); return !!d && !leavesOut(d, leaveOut); };
  const count = (id: CuisineId) => RECIPES.filter((r) => (r.meal === "lunch" || r.meal === "dinner") && slots.includes(r.meal) && matchesNiche(r.id, [id], []) && fits(r)).length;
  const widened = cuisineRecipes(RECIPES, value, diet, leaveOut).widened.filter((m) => slots.includes(m));
  const kinds = new Intl.ListFormat("en-GB", { type: "disjunction" }).format(value.map((c) => t(CUISINES.find((x) => x.id === c)?.label ?? c)));
  const meals = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(widened.map((m) => t(MEAL_PLURAL[m]!)));
  return (
    <div>
      <div role="group" aria-label={t("The food you like")} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={!value.length} onClick={() => onChange([])} className={`${!value.length ? CHIP_ON : CHIP} gap-1.5 px-5`}>
          {!value.length && <CheckIcon aria-hidden className="h-4 w-4" />}{t("Any")}
        </button>
        {CUISINES.map((c) => {
          const on = value.includes(c.id);
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])} className={`${on ? CHIP_ON : CHIP} gap-1.5 px-5`}>
              {on && <CheckIcon aria-hidden className="h-4 w-4" />}{t(c.label)}<span className={`app-numbers text-[0.8125rem] ${on ? "" : "text-muted"}`}>{count(c.id)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[0.875rem] leading-snug text-muted">{t("The numbers are how many lunches and dinners of each kind suit your diet.")}</p>
      {/* a kind with too few for this diet doesn't stop the plan: that meal takes any kind, and Pip says so (usability test 2026-11-19) */}
      {widened.length > 0 && <p role="status" className="mt-3 rounded-[1.25rem] bg-[var(--fill)] p-4 text-[0.9375rem] font-semibold leading-snug">{t("There aren't enough {kinds} {meals} for your diet yet, so your {meals} can be any kind of food.", { kinds, meals })}</p>}
    </div>
  );
}

/** Which meals the person eats (at least one) and how many snacks (none to three), with each one's size as the plan will make it. */
function MealsAndSnacks({ shape, onChange, targets, variety, onVariety }: { shape: DayShape; onChange: (s: DayShape) => void; targets: Targets; variety: Variety; onVariety: (v: Variety) => void }) {
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
      <h2 className="mt-6 text-lg font-[800]">{t("How often can a meal come round?")}</h2>
      <div role="radiogroup" aria-label={t("How often can a meal come round?")} className="mt-2 space-y-2">
        {VARIETIES.map((v) => {
          const on = variety === v;
          const [title, line] = v === 7 ? [t("A different meal every day"), t("The most variety, with a little more left in the packs.")]
            : v === 4 ? [t("Some repeats"), t("Each recipe comes round twice at most.")]
            : [t("Meal prep"), t("Two recipes for each meal, cooked in batches: the least left over.")];
          return (
            <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onVariety(v)}
              className={`flex min-h-[3.75rem] w-full items-center gap-3 rounded-[1.25rem] px-4 py-3 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-sun text-on-accent" : "glass hover:bg-soft-strong"}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.0625rem] font-bold leading-snug">{title}</span>
                <span className={`mt-0.5 block text-[0.875rem] leading-snug ${on ? "" : "text-muted"}`}>{line}</span>
              </span>
              <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${on ? "bg-foreground text-background" : "border border-line"}`}>{on && <CheckIcon className="h-4 w-4" />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** How long each of Pip's steps shows on "Making your plan" (seven steps: about ten seconds, as the founder asked on 18 November 2026). */
const MAKING_STEP_MS = 1400;

/**
 * "Making your plan" (founder 2026-11-18: "it should take about maybe 10 seconds ... make sure you show them what you're doing, analysing this, analysing
 * blah blah blah ... so you're showing them that you're properly working"): Pip goes through what was worked out for this plan, one step at a time, each
 * with its real figure (the recipes and products looked at, the sizes, the packs, the bill, the list), then the week opens. Nothing here is made up.
 */
function Making({ steps, onDone }: { steps: string[]; onDone: () => void }) {
  const t = useT();
  const [at, setAt] = useState(0);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useLayoutEffect(() => { window.scrollTo({ top: 0 }); }, []);
  useEffect(() => {
    const id = setTimeout(() => (at >= steps.length ? done.current() : setAt(at + 1)), at >= steps.length ? 600 : MAKING_STEP_MS);
    return () => clearTimeout(id);
  }, [at, steps.length]);
  const shown = Math.min(at, steps.length - 1);
  return (
    <div className="pb-6">
      <h1 className={`mt-11 ${TITLE}`}>{t("Making your plan")}</h1>
      <div className="mt-4"><PipSays mood="think" size={64} lively pulse={shown}>{t("Give me a moment: I'm working out your best week.")}</PipSays></div>
      <div aria-hidden className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--ring-track)]">
        <span className="block h-full rounded-full bg-[var(--sun)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.round((100 * Math.min(at + 1, steps.length)) / steps.length)}%` }} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">{steps[shown]}</p>
      <ul className={`${CARD} mt-5 space-y-3.5 p-4`}>
        {/* each step appears as Pip reaches it */}
        {steps.slice(0, shown + 1).map((s, i) => {
          const on = i === at;
          return (
            <li key={s} className="bubble-pop flex items-start gap-3 text-[1.0625rem] leading-snug">
              {on ? <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-[rgba(17,24,20,0.1)] border-t-[var(--bar)] motion-reduce:animate-none" />
                : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sun text-[var(--on-accent)]"><CheckIcon className="h-4 w-4" /></span>}
              <span className={`app-numbers pt-0.5 ${on ? "font-bold" : "font-semibold"}`}>{s}{on ? "…" : ""}</span>
            </li>
          );
        })}
      </ul>
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
      {/* "Best fit" stands over the green spot itself, wherever it is on the track (usability test 2026-11-19: in the middle of the row below, it was
          far from the spot when the best fit sat near one end) */}
      <div aria-hidden className="relative mt-5 h-7">
        <span className="app-numbers absolute bottom-0 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--fill)] px-2.5 py-0.5 text-[0.875rem] leading-snug"
          style={{ left: `clamp(4.5rem, ${along(best)}, calc(100% - 4.5rem))` }}>
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--sun)]" /><span className="text-muted">{t("Best fit")}</span><span className="font-bold">£{best}</span>
        </span>
      </div>
      <div className={`relative mt-1 h-12 ${onSpot ? "[&_input::-webkit-slider-thumb]:border-[var(--sun)] [&_input::-moz-range-thumb]:border-[var(--sun)]" : ""}`}>
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
        {/* the best fit is said over its spot above; for a screen reader, here */}
        <span className="sr-only">{t("Best fit")} £{best}</span>
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

/**
 * The plans made before this one (founder 2026-11-19: "they can start another meal plan ... or create multiple meal plans, whatever you think could be the
 * best"): one plan is followed at a time; the last MAX_EARLIER_PLANS are kept here, newest first. Open makes one the plan again (this one is kept in its
 * place); Remove takes one away, with Undo for 10 seconds.
 */
function EarlierPlans({ shopsAll }: { shopsAll: Shop[] }) {
  const t = useT();
  const language = useLanguage();
  const earlier = useStore(earlierPlansStore);
  const [removed, setRemoved] = useState<{ plan: SavedPlan; index: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!earlier.length && !removed) return null;
  const from = (start: string) => new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${start}T12:00:00`));
  const open = (i: number) => {
    const next = openEarlier(mealPlanStore.get(), earlier, i);
    earlierPlansStore.set(next.earlier);
    mealPlanStore.set(next.current);
    window.scrollTo({ top: 0 });
  };
  const remove = (i: number) => {
    const plan = earlier[i]!;
    earlierPlansStore.update((l) => l.filter((_, j) => j !== i));
    setRemoved({ plan, index: i });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRemoved(null), 10000);
  };
  const undo = () => {
    if (!removed) return;
    earlierPlansStore.update((l) => [...l.slice(0, removed.index), removed.plan, ...l.slice(removed.index)]);
    setRemoved(null);
  };
  return (
    <section aria-labelledby="earlier-h" className="mt-8">
      <h2 id="earlier-h" className={HEADING}>{t("Earlier plans")}</h2>
      <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Your last plans are kept on this phone. Open one to follow it again.")}</p>
      <ul className="mt-3 space-y-2.5">
        {earlier.map((p, i) => {
          const shape = shapeOf(p.slots ?? [...PLAN_MEALS]);
          return (
            <li key={`${p.start}-${i}`} className={`${CARD} p-4`}>
              <p className="font-bold leading-snug">{t("From {day}", { day: from(p.start) })}</p>
              <p className="mt-0.5 text-[0.9375rem] leading-snug text-muted">
                {[p.cuisines?.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(p.cuisines.map((c) => t(CUISINES.find((x) => x.id === c)?.label ?? c))) : t("Any kind of food"),
                  names(shopsAll, p.shops), dayShape(t, shape), ...(p.people && p.people > 1 ? [t("for {n} people", { n: p.people })] : [])].join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="min-h-12 px-5" onClick={() => open(i)}>{t("Open this plan")}</Button>
                <Button variant="ghost" className="min-h-12 px-4" onClick={() => remove(i)}>{t("Remove")}</Button>
              </div>
            </li>
          );
        })}
      </ul>
      {removed && (
        <p role="status" className="mt-3 flex items-center justify-between gap-3 rounded-[1.25rem] bg-foreground py-1.5 ps-4 pe-1.5 text-[0.9375rem] text-background">
          {t("Plan removed.")}
          <button type="button" onClick={undo} className="min-h-11 rounded-full px-4 font-bold text-[var(--sun)]">{t("Undo")}</button>
        </p>
      )}
    </section>
  );
}

function Week({ saved, onChange }: { saved: SavedPlan; onChange: () => void }) {
  const t = useT();
  const earlierCount = useStore(earlierPlansStore).length;
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
  // a household plan is rebuilt for the home it was made for (its allergies and meat answer then), each recipe as written
  const savedHome = saved.home;
  const homeNow = useStore(householdStore);
  const { gate } = useGate();
  const [logged, setLogged] = useState<string | null>(null);
  // each person's name for the plate line: the household's own when it still matches the plan, else their age group
  const plateNames = useMemo(() => {
    if (!savedHome) return [];
    const same = homeNow.others.length === savedHome.others.length && homeNow.others.every((o, i) => o.group === savedHome.others[i]!.group);
    return savedHome.others.map((o, i) => (same ? personName(t, homeNow.others[i]!, i) : t(GROUP_LABEL[o.group])));
  }, [savedHome, homeNow, t]);
  const plateList = (plates: readonly number[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(
    plates.map((n, i) => `${i === 0 ? t("you") : plateNames[i - 1] ?? ""} ${shareWords(Math.max(0.25, Math.round(n * 4) / 4))}`),
  );
  const logMine = (c: PlanCandidate, slot: MealType) => gate("log", () => {
    const n = c.perServing;
    addLogEntry({ chainId: "", chainName: t("Recipe"), name: t(c.recipe.name), source: "recipe", recipeId: c.recipe.id, meal: slot,
      nutrients: { calories: Math.round(n.kcal), protein: Math.round(n.protein * 10) / 10, carbs: Math.round(n.carbs * 10) / 10, fat: Math.round(n.fat * 10) / 10 } });
    setLogged(t("Added your portion of {name} to today.", { name: t(c.recipe.name) }));
  });
  const planDiet = useMemo(() => (savedHome ? homeDiet(settings.preferences, { others: savedHome.others.map((o, i) => ({ ...o, id: `p${i}` })), allergies: savedHome.allergies, meat: savedHome.meat }) : settings.preferences), [savedHome, settings.preferences]);
  const dietKey = JSON.stringify(planDiet);
  const betterKey = (saved.better ?? []).join("|");
  const cuisineKey = (saved.cuisines ?? []).join("|");

  useEffect(() => {
    let live = true;
    setFailed(false); // eslint-disable-line react-hooks/set-state-in-effect -- a new try starts clean
    loadShops(shopKey.split("|"))
      .then(async (l) => {
        const c = await workOut(l, JSON.parse(dietKey) as DietPrefs, targets, leaveKey ? leaveKey.split("|") : [], cuisineKey ? (cuisineKey.split("|") as CuisineId[]) : [], undefined, !!savedHome);
        // the meals the budget made with better products (planForBudget), made the same way again (as written for a household)
        const betterOf = betterFor(l, savedHome ? {} : targets);
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
  }, [shopKey, leaveKey, dietKey, betterKey, cuisineKey, targets, retry, savedHome]);

  // a plan for several people: each meal cooked for everyone (forPeople), so the prices and the shopping are everyone's and the calories one person's
  // a household's plan: each recipe as written, sized for everyone (forHousehold), the user's own portion matching their meal; an older plan "for n people"
  // bought the same for each (forPeople)
  const people = savedHome ? savedHome.others.length + 1 : saved.people ?? 1;
  const forAll = useMemo(() => {
    if (!candidates) return null;
    return savedHome ? forHousehold(candidates, { targets, yourDailyKcal: settings.dailyCalories, others: savedHome.others }) : forPeople(candidates, people);
  }, [candidates, people, savedHome, targets, settings.dailyCalories]);
  const week = useMemo(() => (forAll ? buildWeek(saved.ids, forAll, saved.budget, slots) : null), [forAll, saved, slots]);
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
  // the days run off the right edge at large text: the strip fades out there while there are more to see, and the day chosen scrolls into view
  // (usability test 2026-11-19: Irene didn't know the strip scrolled)
  const dayStrip = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  useEffect(() => {
    const el = dayStrip.current;
    if (!el) return;
    const check = () => setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => { el.removeEventListener("scroll", check); observer.disconnect(); };
  }, [week]);
  useEffect(() => {
    // sideways only (scrollIntoView would also move the page to the strip)
    const el = dayStrip.current;
    const b = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!el || !b) return;
    const r = b.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (r.right > box.right - 16) el.scrollBy({ left: r.right - box.right + 40, behavior: "smooth" });
    else if (r.left < box.left + 16) el.scrollBy({ left: r.left - box.left - 40, behavior: "smooth" });
  }, [day]);

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
  const choices = swapping === null ? [] : swapChoices(saved.ids, day, swapping, forAll ?? candidates, 10, slots);
  const forN = people > 1 && <span className="block text-[0.75rem] font-semibold text-muted">{t("for {n}", { n: people })}</span>;
  const several = saved.shops.length > 1;
  const choose = (recipeId: string) => {
    if (swapping === null) return;
    const ids: PlanIds = setMeal(saved.ids, day, swapping, recipeId);
    mealPlanStore.set({ ...saved, ids, swapped: true });
    setSwapping(null);
    setAdded(null);
  };
  const files = new Map(loaded.map((l) => [l.id, l.file]));
  const addAll = () => {
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
        {/* the diet said on the plan itself (usability test 2026-11-19: Raj looked for "all vegetarian" and didn't find it) */}
        {dietWords(t, settings.preferences).length > 0 && <> {t("Every meal fits your diet: {diet}.", { diet: dietWords(t, settings.preferences).join(", ").toLowerCase() })}</>}
      </p>
      {/* another plan whenever they like, at the top where it's seen (founder 2026-11-19); this one is kept among the earlier plans */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onChange} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-sun px-5 text-[0.9375rem] font-bold text-[var(--on-accent)] transition active:scale-95">
          <PlusIcon aria-hidden className="h-5 w-5" />{t("Make a new plan")}
        </button>
        {/* the plans kept from before, reachable from the top (usability test 2026-11-19: at the bottom, below the whole shopping list, they were nearly missed) */}
        {earlierCount > 0 && (
          <a href="#earlier-h" onClick={(e) => { e.preventDefault(); document.getElementById("earlier-h")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--fill)] px-5 text-[0.9375rem] font-bold transition active:scale-95">
            <CalendarIcon aria-hidden className="h-5 w-5" />{earlierCount === 1 ? t("Your earlier plan") : t("Your {n} earlier plans", { n: earlierCount })}
          </a>
        )}
      </div>

      {/* the money first: what the shopping comes to, against the budget */}
      <div className={`${CARD} mt-4 p-4`}>
        <div className="flex items-center gap-3">
          <Pip mood={week.overBudget ? "think" : "cheer"} size={56} />
          <div className="min-w-0">
            <p className="app-numbers text-[1.75rem] font-[800] leading-none">{formatPrice(week.shoppingCost)}</p>
            <p className="mt-1 text-[0.9375rem] font-semibold text-muted">{people > 1 ? t("for the week's shopping for {n} people", { n: people }) : t("for the week's shopping")}</p>
          </div>
        </div>
        <p className="mt-3 text-[0.9375rem] leading-snug">
          {week.budget === null ? t("No budget set.")
            : week.overBudget && saved.swapped ? t("That's {over} over your {budget} budget with the meals you swapped in.", { over: formatPrice(week.shoppingCost - week.budget), budget: formatPrice(week.budget) })
            : week.overBudget ? t("That's {over} over your {budget} budget: it's the cheapest week our recipes allow with your choices.", { over: formatPrice(week.shoppingCost - week.budget), budget: formatPrice(week.budget) })
            : t("Within your {budget} budget.", { budget: formatPrice(week.budget) })}
        </p>
        {week.fresh.bought > 0 && <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("{pct}% of the fresh food you buy is eaten this week. Oil, spices, dry goods like rice and pasta, jars and frozen food keep for longer.", { pct: Math.round((100 * week.fresh.eaten) / week.fresh.bought) })}</p>}
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("About {kcal} kcal and {protein} g protein a day (your target is {target} kcal).", { kcal: formatInt(avg("kcal")), protein: formatInt(avg("protein")), target: formatInt(settings.dailyCalories) })}</p>
        {savedHome && <p className="mt-2 text-[0.9375rem] font-semibold leading-snug">{allergyLine(t, savedHome.allergies)}</p>}
        {savedHome ? <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("Cooked for {n} of you: each recipe as written, with your own portion sized to your numbers. Only your numbers are shown.", { n: people })}</p>
          : people > 1 && <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("The shopping is for {n} people: each has the same meals, sized to your numbers.", { n: people })}</p>}
      </div>

      {/* the days: big buttons, the one showing is dark */}
      <div ref={dayStrip} role="radiogroup" aria-label={t("Day")} className={`no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 ${moreRight ? "[mask-image:linear-gradient(to_right,#000_82%,transparent)]" : ""}`}>
        {dayNames.map((name, i) => (
          <button key={i} type="button" role="radio" aria-checked={day === i} onClick={() => setDay(i)} className={`min-h-12 shrink-0 rounded-full px-4 text-[0.9375rem] font-bold transition active:scale-95 ${day === i ? "bg-foreground text-background" : "glass"}`}>{name}</button>
        ))}
      </div>

      <section aria-labelledby="day-h" className="mt-4">
        <h2 id="day-h" className={HEADING}>{dayNames[day]}</h2>
        {logged && <p role="status" className="mt-2 flex items-center gap-2 rounded-[1rem] bg-[#e4f0d0] px-3.5 py-2.5 text-[0.9375rem] font-semibold text-[#1d2320]"><CheckIcon aria-hidden className="h-4 w-4" />{logged}</p>}
        <ul className="mt-3 space-y-3">
          {shown.meals.map((m, i) => (
            <li key={`${m.meal}-${i}`} className={`${CARD} p-3`}>
              <p className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{slotName(i)}</p>
              <div className="mt-2 flex items-center gap-3">
                <Link href={`/app/recipes/view?id=${m.candidate.recipe.id}&r=${m.candidate.shop}${savedHome && m.candidate.plates ? `&n=${Math.min(20, Math.max(1, Math.ceil(m.candidate.plates.reduce((a, b) => a + b, 0) - 0.05)))}&w=1` : ""}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <RecipeThumb id={m.candidate.recipe.id} name={m.candidate.recipe.name} meal={m.meal} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{t(m.candidate.recipe.name)}</span>
                    <span className="app-numbers mt-0.5 block text-[0.875rem] text-muted">{formatInt(m.candidate.perServing.kcal)} kcal · {formatInt(m.candidate.perServing.protein)} g {t("protein")}</span>
                    {several && <span className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted"><ShopMark shopId={m.candidate.shop} size="xs" />{shopName(m.candidate.shop)}</span>}
                    {m.candidate.better && <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-bold text-accent">{t("Better products")}</span>}
                  </span>
                </Link>
                <span className="app-numbers shrink-0 text-end text-base font-[800]">{formatPrice(m.candidate.cost)}{forN}</span>
              </div>
              {/* who gets how much, in servings of the recipe as written (household plans; only the user's own numbers are shown) */}
              {savedHome && m.candidate.plates && m.meal !== "snack" && (
                <p className="app-numbers mt-2 px-1 text-[0.875rem] leading-snug text-muted">{t("Servings each: {list}.", { list: plateList(m.candidate.plates) })}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => logMine(m.candidate, m.meal)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#1d2320] px-4 text-[0.9375rem] font-bold text-white transition active:scale-95">
                <PlusIcon aria-hidden className="h-4 w-4" />{t("Add my portion to {meal}", { meal: slotName(i) })}
              </button>
              <button type="button" onClick={() => setSwapping(i)} aria-label={t("Swap this meal: {meal}, {recipe}", { meal: slotName(i).toLowerCase(), recipe: t(m.candidate.recipe.name) })} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--fill)] px-4 text-[0.875rem] font-bold transition active:scale-95">
                <SwapIcon aria-hidden className="h-4 w-4" />{t("Swap this meal")}
              </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="app-numbers mt-3 px-1 text-[0.9375rem] font-semibold">{savedHome
          ? t("{day}: your {kcal} kcal · {protein} g protein · {cost} for {n}", { day: dayNames[day]!, kcal: formatInt(shown.kcal), protein: formatInt(shown.protein), cost: formatPrice(shown.cost), n: people })
          : people > 1
          ? t("{day}: {kcal} kcal · {protein} g protein each · {cost} for {n}", { day: dayNames[day]!, kcal: formatInt(shown.kcal), protein: formatInt(shown.protein), cost: formatPrice(shown.cost), n: people })
          : t("{day}: {kcal} kcal · {protein} g protein · {cost}", { day: dayNames[day]!, kcal: formatInt(shown.kcal), protein: formatInt(shown.protein), cost: formatPrice(shown.cost) })}</p>
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
                {lines.map((l) => {
                  const file = files.get(l.shop);
                  const left = !l.keeps && l.cost > 0 ? Math.round((10 * (l.cost - l.used)) / l.cost) * 10 : 0;
                  const row = (
                    <>
                      <PhotoTile sources={file ? shopPhotoSources(file, l.product) : []} />
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                        <span className="block font-semibold leading-snug">{l.packs > 1 ? `${l.packs} × ` : ""}{l.product.name}</span>
                        {l.cupboard && <span className="mt-0.5 block text-[0.8125rem] text-muted">{t("You may have this already")}</span>}
                        {left >= 30 && <span className="app-numbers mt-0.5 block text-[0.8125rem] text-muted">{t("About {pct}% left at the end of the week", { pct: left })}</span>}
                      </span>
                      <span className="app-numbers shrink-0 font-bold">{formatPrice(l.cost)}</span>
                    </>
                  );
                  return (
                    <li key={l.product.id}>
                      {file ? <Link href={`/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(l.product.id)}`} className="flex min-h-[5rem] items-center gap-3 px-3 py-2.5 transition hover:bg-[var(--fill)] active:bg-soft-strong">{row}</Link>
                        : <div className="flex min-h-[5rem] items-center gap-3 px-3 py-2.5">{row}</div>}
                    </li>
                  );
                })}
                <li className="flex items-center justify-between gap-3 bg-[var(--fill)] px-4 py-3 font-[800]"><span>{t("{shop} total", { shop: shopName(sh) })}</span><span className="app-numbers">{formatPrice(sum)}</span></li>
              </ul>
            </div>
          );
        })}
        {week.shops.length > 1 && <p className="app-numbers mt-3 flex items-center justify-between px-1 text-lg font-[800]"><span>{t("Total")}</span><span>{formatPrice(week.shoppingCost)}</span></p>}
        <p className="mt-2 px-1 text-[0.8125rem] leading-snug text-muted">{t("Prices are each shop's shelf prices and vary by store.")}</p>
      </section>

      <EarlierPlans shopsAll={shopsAll} />

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
                <span className="app-numbers shrink-0 text-end font-[800]">{formatPrice(c.cost)}{forN}</span>
              </button>
            </li>
          ))}
          {/* why, and the way on (usability test 2026-11-19: Raj's Indian dinners were all in the plan already, and the sheet just said no) */}
          {!choices.length && (
            <li className="glass rounded-[1.25rem] p-4 text-[0.9375rem] leading-snug">
              <p className="font-semibold">{saved.cuisines?.length
                ? t("Every {meal} of the kinds of food you chose that fits your diet is in your plan already.", { meal: swapping === null ? "" : slotName(swapping).toLowerCase() })
                : t("Every {meal} that fits your diet and your choices is in your plan already.", { meal: swapping === null ? "" : slotName(swapping).toLowerCase() })}</p>
              <p className="mt-1">{saved.cuisines?.length ? t("For more choice, make a new plan with more kinds of food, or Any.") : t("For more choice, make a new plan leaving out fewer foods.")}</p>
              <Button variant="secondary" className="mt-3 min-h-12" onClick={() => { setSwapping(null); onChange(); }}>{t("Make a new plan")}</Button>
            </li>
          )}
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
