"use client";

import Link from "next/link";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { recipeNutrients } from "@/lib/mm/addFood";
import { MEAL_LABEL } from "@/lib/mm/budget";
import { GATING_ENABLED } from "@/lib/mm/config";
import { formatInt } from "@/lib/mm/format";
import { addToList, formatPrice, listForShop, retailerName, withPhoto } from "@/lib/mm/groceries";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { DEFAULT_SHAPE, LEAVE_OUT, MAX_SNACKS, PLAN_DAYS, PLAN_MEALS, PER_MEAL_RECIPES, VARIETIES, betterCandidate, betterForHousehold, forHousehold, budgetRange, buildWeek, capShortfall, cuisineRecipes, forPeople, keepEarlier, openEarlier, leavesOut, mergeCandidates, planCandidates, planForBudget, planSlots, setMeal, shapeOf, slotTargets, swapChoices, withBetter, type BudgetRange, type DayShape, type PlanCandidate, type PlanIds, type SavedPlan, type Variety } from "@/lib/mm/mealPlan";
import { RECIPES } from "@/lib/mm/recipeBook";
import { CUISINES, type CuisineId } from "@/lib/mm/recipeBook/niches";
import { matchesNiche } from "@/lib/mm/recipeNiche";
import { recipeForDiet, type MealTarget, type MealType } from "@/lib/mm/recipes";
import { recipeShops, recipeShopSet, shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { addLogEntry, deleteLogEntry, earlierPlansStore, householdStore, mealPlanStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { homeDiet, shareWords, withCount, type Household } from "@/lib/mm/household";
import { macroTargets } from "@/lib/mm/targets";
import type { DietPrefs } from "@/lib/mm/pantry";
import { ShopMark } from "../_components/ChainMark";
import { DietPicker, dietWords } from "../_components/DietPicker";
import { CalendarIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SwapIcon } from "../_components/icons";
import { PipSays, type PipMood } from "../_components/Mascot";
import { InfoBanner } from "../_components/Note";
import { PageHeader } from "../_components/PageHeader";
import { useGate } from "../_components/Paywall";
import { Toast } from "../_components/Toast";
import { AllergyNote, Badge, Button, ChoiceMark, ErrorBox, LinkButton, Sheet, Spinner, inputClass } from "../_components/ui";
import { useHydrated, useIsPro, useSettings, useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { CARD, CHIP, CHIP_ON, HEADING, TITLE } from "../groceries/PageBits";
import { PhotoTile } from "../groceries/ProductPhoto";
import { RecipeThumb } from "../recipes/RecipeThumb";
import { AllergiesStep, CountStep, GROUP_LABEL, HOME_DIET_LABEL, HomeDietStep, WhoStep, allergyLine, homeDietLine, personName, whoWords } from "./HouseholdSteps";

// The meal plan (founder 2026-11-18; lib/mm/mealPlan.ts has the rules). Premium ("a third icon, which has meal plan, and that has pro on it"). Pip asks one thing
// a screen ("they just got to type in all their stuff, like Pip's guiding them through"): the daily numbers from the person's own plan, their diet and allergies,
// foods they'd rather not have, a budget for the week, and the shops they use, as many as they like ("it'll combine everything and then choose the best meal plan
// overall"). Then the week: each day's breakfast, lunch and dinner from our own recipes with its calories, protein, price and shop; any meal can be swapped for
// another from a list; what the shopping comes to against the budget; the shopping for each shop as whole packs, and one button that puts it all on the
// shopping list. The plan stays on the phone until a new one is made (mm.v1.mealPlan).
// The first open, with no plan yet (the onboarding meeting, 20 November 2026, build list 13): straight to the check screen, filled in from the person's own
// settings (their diet and allergies, daily numbers and shop) and Meal plan's Just-me defaults, "Who's eating: Just me" first, every line with its Change; its
// "Make my plan" makes the same week the onboarding preview and PremiumIntro show, and saves it as before.

const today = () => new Date().toISOString().slice(0, 10);
/**
 * A row you choose from a list (a shop, a kind of week, the meat answer), in the choice look of the colour meeting (19 November 2026, approved by the founder
 * that day): unchosen, white with the 1.5 px edge and an empty ring; chosen, lime with the 2 px dark green edge (a 1.5 px border plus a half-pixel ring, so
 * nothing moves), bold dark green words and the ring filled with a tick. Never a dark disc (dark means "do this").
 */
const CHOICE_ROW = "flex w-full items-center gap-3 rounded-[1.25rem] border-[1.5px] text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CHOICE_ROW_OFF = "border-edge bg-card text-foreground hover:bg-background";
const CHOICE_ROW_ON = "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]";
/** A done step on Pip's working lists: lime with the 2 px dark green edge and a dark green tick (done, on a light surface). */
const DONE_TICK = "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-on-sun bg-sun text-on-sun";
// The steps, one question a screen (the 20-agent meeting, 2026-11-19): how many people first; a household then says who each person is, its allergies and
// the diets anyone at home follows (until 20 November, whether anyone doesn't eat meat); Just me keeps its own diet and the food it likes; everyone ends on the
// check screen before the plan is made (and a first open starts there).
type StepId = "count" | "who" | "meals" | "shops" | "diet" | "cuisine" | "allergies" | "homeDiet" | "leaveOut" | "budget" | "check";
const JUST_ME: readonly StepId[] = ["count", "meals", "shops", "diet", "cuisine", "leaveOut", "budget", "check"];
const HOUSEHOLD: readonly StepId[] = ["count", "who", "meals", "shops", "allergies", "homeDiet", "leaveOut", "budget", "check"];
const STEP_PIP: Record<StepId, PipMood> = { count: "wave", who: "point", meals: "point", shops: "listen", diet: "listen", cuisine: "listen", allergies: "listen", homeDiet: "point", leaveOut: "point", budget: "point", check: "cheer" };
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

/** The day's shortfall under a GLP-1 meal cap (mealPlan.ts capShortfall) with the figures to say it; null when the day adds up (no cap, or a cap it fits under). */
type CapGap = { cap: number; sum: number; daily: number } | null;
function useCapGap(shape: DayShape, targets: Targets): CapGap {
  const settings = useSettings();
  const gap = capShortfall(shape, targets, settings.dailyCalories);
  const cap = settings.goal === "glp1" ? settings.glp1MealCap : undefined;
  return gap > 0 && cap ? { cap, sum: settings.dailyCalories - gap, daily: settings.dailyCalories } : null;
}

/**
 * Why the meals come to less than the day (founder 2026-11-20, "clearly they all have to be ... 3,400 divided by 3"; lib/mm/mealPlan.ts slotTargets): with the
 * GLP-1 goal each meal is kept to the meal size the person set, so the day can't add up, and the plan says so with the way to change it. Pip never says the
 * day adds up then. `boxed`: on the page in its own white card; otherwise inside a card already.
 */
function CapNote({ gap, boxed, className = "" }: { gap: CapGap; boxed?: boolean; className?: string }) {
  const t = useT();
  if (!gap) return null;
  return (
    <div className={`${boxed ? `${CARD} p-4` : ""} ${className}`}>
      <p className="app-numbers text-[0.9375rem] leading-snug">{t("Your goal is 'I'm on a GLP-1 medication', so I keep each meal to {cap} kcal: your meals come to {sum} of your {daily} kcal.", { cap: formatInt(gap.cap), sum: formatInt(gap.sum), daily: formatInt(gap.daily) })}</p>
      <LinkButton href="/app/settings#targets" variant="secondary" className="mt-3 px-4">{t("Change it in Settings")}</LinkButton>
    </div>
  );
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

/** The week Meal plan's first open would make (useWeekPreview): working on it, ready, or none (offline, no shop, or too few recipes for the diet). */
type Preview = { state: "working" } | { state: "none" } | { state: "ready"; meals: PlanCandidate[]; kcal: number; protein: number; total: number; gap: CapGap };

/**
 * The week the first open's "Make my plan" makes (the onboarding meeting, 20 November 2026: "not bait"): one person with Meal plan's Just-me defaults
 * (breakfast, lunch and dinner, any kind of food, nothing left out, no budget, PER_MEAL_RECIPES), the person's own diet, allergies and daily numbers, from the
 * first of their shops that recipes can use, else the shop recipes use until they choose (recipeShopSet). The same sums, in the same order, as the check
 * screen's "Make my plan" (workOut, then planForBudget with no budget), so the week is the same one; worked out on this phone and never saved.
 */
function useWeekPreview(): { shop: string | null; preview: Preview } {
  const settings = useSettings();
  const manifest = useShopManifest();
  const shop = manifest ? recipeShopSet(manifest, null, settings.shops)[0] ?? null : null;
  const targets = useSlotTargets(DEFAULT_SHAPE);
  const gap = useCapGap(DEFAULT_SHAPE, targets);
  const key = JSON.stringify([shop, settings.preferences, targets]);
  const [result, setResult] = useState<{ key: string; preview: Preview } | null>(null);
  useEffect(() => {
    if (!shop) return;
    let live = true;
    const [, diet, tg] = JSON.parse(key) as [string, DietPrefs, Targets];
    // after the screen has drawn: the sums take a moment on a phone
    const timer = setTimeout(() => {
      (async () => {
        const loaded = await loadShops([shop]);
        const cands = await workOut(loaded, diet, tg, [], []);
        const plan = planForBudget(cands, null, betterFor(loaded, tg), planSlots(DEFAULT_SHAPE), PER_MEAL_RECIPES);
        const first = plan?.week.days[0];
        if (!live) return;
        if (!plan || !first) { setResult({ key, preview: { state: "none" } }); return; }
        const avg = (k: "kcal" | "protein") => Math.round(plan.week.days.reduce((n, d) => n + d[k], 0) / plan.week.days.length);
        setResult({ key, preview: { state: "ready", meals: first.meals.map((m) => m.candidate), kcal: avg("kcal"), protein: avg("protein"), total: plan.week.shoppingCost, gap: null } });
      })().catch(() => { if (live) setResult({ key, preview: { state: "none" } }); });
    }, 0);
    return () => { live = false; clearTimeout(timer); };
  }, [key, shop]);
  const preview: Preview = !manifest ? { state: "working" } : !shop ? { state: "none" } : result?.key === key ? (result.preview.state === "ready" ? { ...result.preview, gap } : result.preview) : { state: "working" };
  return { shop, preview };
}

const PREVIEW_ROW: Partial<Record<MealType, string>> = { breakfast: tk("Breakfast · {recipe}"), lunch: tk("Lunch · {recipe}"), dinner: tk("Dinner · {recipe}") };

/**
 * The week, shown before Premium (the onboarding meeting's "Meal plan honesty"): the first day's three meals by name, the day's average against the target, the
 * week's shopping as a labelled line at normal size (never a big £ figure that could be read as a charge), and the shelf-price line. While it is worked out,
 * grey bars with no figures and a status line saying what is happening; when no week can be made, the words alone.
 */
function WeekPreview({ shop, preview }: { shop: string | null; preview: Preview }) {
  const t = useT();
  const settings = useSettings();
  const language = useLanguage();
  const shopName = shop ? retailerName(shop) : "";
  const dayName = useMemo(() => new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "long" }).format(new Date()), [language]);
  return (
    <section aria-labelledby="preview-h" className={`${CARD} mt-4 min-h-[15rem] p-4`}>
      <h2 id="preview-h" className="text-lg font-[800] leading-snug">{t("Your week, planned")}</h2>
      {preview.state === "none" ? (
        <p className="mt-1.5 text-[0.9375rem] leading-snug">{t("Meal plan plans a week of meals from your shop, sized to your numbers, with one shopping list.")}</p>
      ) : (
        <>
          <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Breakfast, lunch and dinner for 7 days from {shop}, sized to your numbers.", { shop: shopName })}</p>
          {preview.state === "working" ? (
            <>
              <p role="status" className="mt-3 text-[0.9375rem] font-semibold leading-snug">{t("Planning your week from {shop}'s recipes…", { shop: shopName })}</p>
              <div aria-hidden className="mt-3 space-y-2.5">
                {["w-1/3", "w-11/12", "w-10/12", "w-9/12", "w-2/3"].map((w, i) => <span key={i} className={`block h-4 ${w} animate-pulse rounded-full bg-line motion-reduce:animate-none`} />)}
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 font-bold">{dayName}</p>
              <ul className="mt-1.5 space-y-1.5 text-[1rem] leading-snug">
                {preview.meals.map((c) => <li key={`${c.meal}-${c.recipe.id}`} className="[overflow-wrap:anywhere]">{t(PREVIEW_ROW[c.meal] ?? "{recipe}", { recipe: t(c.recipe.name) })}</li>)}
              </ul>
              <p className="app-numbers mt-3 text-[0.9375rem] leading-snug">{t("About {kcal} kcal and {protein} g protein a day (your target is {target} kcal).", { kcal: formatInt(preview.kcal), protein: formatInt(preview.protein), target: formatInt(settings.dailyCalories) })}</p>
              <CapNote gap={preview.gap} className="mt-2" />
              <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("Shopping for the week at {shop}: about £{total}", { shop: shopName, total: formatInt(Math.round(preview.total)) })}</p>
              <p className="mt-1.5 text-[0.9375rem] leading-snug">{t("Everything goes on one shopping list.")}</p>
              <p className="mt-1.5 text-[0.9375rem] leading-snug">{t("With Premium, Meal plan makes you this week. You can change any answer first, and swap any meal after.")}</p>
              <p className="mt-2 text-[0.8125rem] leading-snug text-muted">{t("Prices are {shop}'s shelf prices and vary by store.", { shop: shopName })}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** For someone without Premium: what the meal plan does, the week it would make them (the same one), and the way to Premium. */
function PremiumIntro() {
  const t = useT();
  const { showPaywall } = useGate();
  const { shop, preview } = useWeekPreview();
  return (
    <div className="pb-6">
      <PageHeader back={{ href: "/app", label: t("Back to Home") }} />
      <h1 className={`mt-4 ${TITLE}`}>{t("Meal plan")}</h1>
      <div className="mt-4"><PipSays mood="wave" size={64}>{t("Tell me your goal, your diet and where you shop, and I'll plan a whole week of meals for you, with the shopping list.")}</PipSays></div>
      <WeekPreview shop={shop} preview={preview} />
      <ul className={`${CARD} mt-4 space-y-3 p-4 text-base leading-snug`}>
        {[t("Your meals and snacks for seven days, sized to your goal"), t("From one shop or several: the best recipes across them"), t("What each meal costs, and the week's shopping within your budget"), t("Swap any meal you don't fancy, then add everything to your shopping list")].map((line) => (
          <li key={line} className="flex items-start gap-3"><CheckIcon aria-hidden strokeWidth={2.6} className="mt-0.5 h-5 w-5 shrink-0 text-ink" />{line}</li>
        ))}
      </ul>
      {/* the one main action, on a 16 px band of the page's grey above the tab bar, so it shows however long the week is */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-5 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-4">
        <Button full className="min-h-14 text-lg" onClick={() => showPaywall("mealPlan")}>{t("Get Premium")}</Button>
      </div>
    </div>
  );
}

// ---------- Pip's questions, one a screen ----------

function Questions({ saved, onDone, onKeep }: { saved: SavedPlan | null; onDone: () => void; onKeep?: () => void }) {
  const t = useT();
  const settings = useSettings();
  // tried again from the check screen's "Try again" when the shops or their products couldn't be loaded
  const [attempt, setAttempt] = useState(0);
  const manifest = useShopManifest(attempt);
  const shopsAll: Shop[] = useMemo(() => recipeShops(manifest).map((r) => ({ id: r.id, name: r.name })), [manifest]);
  const daily = macroTargets(settings);
  // the people cooked for (lib/mm/household.ts; on this phone only): Just me unless they say otherwise on the first screen
  const home = useStore(householdStore);
  const household = home.others.length > 0;
  const count = home.others.length + 1;
  const setHome = (patch: Partial<Household>) => householdStore.set({ ...householdStore.get(), ...patch });
  const steps = household ? HOUSEHOLD : JUST_ME;
  // the first open, with no plan yet, starts on the check screen ("direct": not walked through the steps yet, so there is no step count and Back goes Home);
  // Make a new plan walks the steps from the first, as before
  const [direct, setDirect] = useState(!saved);
  const [step, setStep] = useState(() => (saved ? 1 : steps.length));
  const id: StepId = steps[Math.min(step, steps.length) - 1] ?? "count";
  const total = steps.length;
  // no budget on the first open: the best week for the goal, as the preview made it (planForBudget with none); the slider's amount once its step has shown
  const [noBudget, setNoBudget] = useState(!saved || saved.budget === null);
  const moveTo = (n: number) => {
    if (steps[Math.min(n, steps.length) - 1] === "budget") setNoBudget(false);
    setDirect(false);
    setStep(n);
  };
  const go = (to: StepId) => moveTo(steps.indexOf(to) + 1);
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
  const typedBox = useRef<HTMLInputElement>(null);

  // with no plan yet, the shop is the first of the person's own that can make our recipes, else the one recipes use until they choose (recipeShopSet): the one
  // shop the onboarding preview used, so Make my plan makes that week; more can be ticked on the shops step
  useEffect(() => {
    if (shops !== null || !shopsAll.length) return;
    setShops(recipeShopSet(manifest, null, settings.shops)); // eslint-disable-line react-hooks/set-state-in-effect -- the answer starts from the person's shops once the list arrives
  }, [shopsAll, shops, settings.shops, manifest]);
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
  }, [id, prepKey, attempt]); // eslint-disable-line react-hooks/exhaustive-deps -- prepKey holds the answers it depends on

  // a household's meals: each recipe as written, sized for everyone (mealPlan.ts forHousehold); Just me: fitted to the person, as before
  const others = useMemo(() => home.others.map((o) => ({ group: o.group, portion: o.portion })), [home.others]);
  const sizing = useMemo(() => ({ targets, yourDailyKcal: settings.dailyCalories, others }), [targets, settings.dailyCalories, others]);
  const sized = (c: Candidates) => (household ? forHousehold(c, sizing) : c);
  const betterSized = (l: readonly Loaded[]) => (household ? betterForHousehold(betterFor(l, {}), sizing) : betterFor(l, targets));
  const homeKey = JSON.stringify(others);
  // the slider's range for these prices and these people, worked out after the screen has drawn (the spinner shows meanwhile)
  // (not needed while there is no budget: the week is the best fit)
  const rangeKey = prep && prep.key === prepKey && !noBudget ? `${prepKey}|${homeKey}` : null;
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

  const ready = !!prep && prep.key === prepKey && (noBudget || (!!range && pick !== null));
  const gap = useCapGap(shape, targets);
  const make = () => {
    if (!ready || !prep) return;
    const budget = noBudget ? null : pick;
    const plan = planForBudget(sized(prep.cands), budget, betterSized(prep.loaded), slots, variety);
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
      // under a GLP-1 meal cap the meals are sized to the meal size, not the day (CapNote says so)
      gap ? (household ? t("Sizing every meal for {n} of you: your own portion to your {cap} kcal meal size", { n: count, cap: formatInt(gap.cap) }) : t("Sizing every meal to your {cap} kcal meal size", { cap: formatInt(gap.cap) }))
        : household ? t("Sizing every meal for {n} of you: your own portion to your {kcal} kcal and {protein} g protein a day", { n: count, kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) })
        : t("Sizing every meal to your {kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) }),
      snacks ? t("Choosing {meals} meals and {snacks} snacks for your week", { meals, snacks }) : t("Choosing {meals} meals for your week", { meals }),
      t("Planning the packs so {pct}% of the fresh food gets eaten", { pct: eaten }),
      budget === null ? t("Pricing the best week for your goal: {cost}", { cost: formatPrice(w.shoppingCost) })
        : w.overBudget ? t("Finding the cheapest week your choices allow: {cost}", { cost: formatPrice(w.shoppingCost) }) : t("Keeping the week to {cost}, within your {budget}", { cost: formatPrice(w.shoppingCost), budget: formatPrice(budget) }),
      household ? t("Writing your shopping list for {people} people: {n} products", { people: count, n: w.shopping.length }) : t("Writing your shopping list: {n} products", { n: w.shopping.length }),
    ];
    setMaking({ steps, plan: { shops: chosen, ids: plan.ids, slots, leaveOut, budget, start: today(), variety, ...(cuisinesUsed.length ? { cuisines: cuisinesUsed } : {}), ...(plan.better.length ? { better: plan.better } : {}), ...(household ? { home: { others, allergies: home.allergies, diets: home.diets } } : {}) } });
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
                {done ? <span className={DONE_TICK}><CheckIcon strokeWidth={3} className="h-4 w-4" /></span>
                  : on ? <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-ink motion-reduce:animate-none" />
                  : <span className="h-7 w-7 shrink-0 rounded-full border-[3px] border-line" />}
                <ShopMark shopId={id} size="xs" />
                <span className={done || on ? "" : "text-muted"}>{shopsAll.find((s) => s.id === id)?.name ?? id}</span>
              </li>
            );
          })}
        </ul>
  );

  const TITLES: Record<StepId, string> = {
    count: t("How many people are you cooking for?"), who: t("Who's eating with you?"), meals: t("Your meals and snacks"), shops: t("Where you shop"),
    diet: t("Your diet and allergies"), cuisine: t("The food you like"), allergies: t("Any food allergies at home?"), homeDiet: t("Any diets at home?"),
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
    // under a GLP-1 meal cap the day can't add up, so Pip doesn't say it does (CapNote under "Each day:" says why)
    meals: gap ? t("How do you like to eat? Pick your meals and snacks, and how often a meal can come round.") : t("How do you like to eat? Pick your meals and snacks, and how often a meal can come round. I'll size each one so your day adds up."),
    shops: shopsSay,
    diet: t("Do you follow a diet, or have any allergies? I'll leave out any recipe that doesn't fit."),
    cuisine: cuisines.length ? t("Lunches and dinners from {cuisines}. Breakfasts and snacks stay as usual.", { cuisines: new Intl.ListFormat("en-GB", { type: "disjunction" }).format(cuisines.map((c) => t(CUISINES.find((x) => x.id === c)!.label))) })
      : t("What kind of food do you like for lunch and dinner? Pick as many as you like, or Any."),
    allergies: t("Tick any food allergy anyone at home has. Recipes made with it are left out for everyone. Always check the label."),
    homeDiet: t("I cook one meal for everyone, so tick every diet anyone at home follows. Every meal will fit all of them, for everyone."),
    leaveOut: household ? t("Any foods someone won't eat? Tap them, or type your own, and I'll leave them out for everyone.") : t("Any foods you don't like? Tap them, or type your own, and I'll leave them out."),
    budget: t("Slide to choose your budget. The green spot is the best week for your goal: left is cheaper, right buys better products."),
    check: direct ? t("I've filled this in from your settings. Tap Change on anything you'd like to change, then I'll make your plan.") : t("Here's everything. Tap Change on anything you'd like to change, then I'll make your plan."),
  };
  const says = SAYS[id];
  // the person's own shops can't make our recipes yet: the week uses the shop recipes use until they choose, and the check screen says so
  const ownShops = settings.shops ?? [];
  const shopNote = ownShops.length > 0 && chosen.length === 1 && !ownShops.some((o) => shopsAll.some((s) => s.id === o))
    ? (ownShops.length === 1 ? t("{left} isn't in recipes yet, so this week uses {shop}.", { left: retailerName(ownShops[0]!), shop: chosenNames[0] ?? "" })
      : t("{left} aren't in recipes yet, so this week uses {shop}.", { left: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(ownShops.map((o) => retailerName(o))), shop: chosenNames[0] ?? "" }))
    : undefined;
  // the allergies the plan leaves out: the home's, or (Just me) the person's own
  const allergiesSet = household ? home.allergies.length > 0 : (settings.preferences.avoidAllergens?.length ?? 0) > 0;
  if (making) return <Making steps={making.steps} onDone={finish} />;
  const canGo = !(id === "meals" && !shape.meals.length) && !(id === "leaveOut" && noneFor) && !(id === "shops" && !chosen.length) && !((id === "budget" || id === "check") && !ready);
  // the shops or their products couldn't be loaded (no connection): the check screen says so, with Try again
  const unloaded = problem === "offline" || (!!manifest && !shopsAll.length);
  // why the button can't be pressed yet, written above it (colour meeting, 19 November 2026: every tester met a grey Continue with no reason)
  const cantGo = canGo ? null
    : id === "meals" ? t("Pick at least one meal.")
    : id === "shops" ? t("Pick at least one shop.")
    : id === "leaveOut" ? t("Tap a food again to put it back.")
    : unloaded || range === null ? null
    : t("Working out the prices at your shops…");
  // the bottom button says the usual answer until something is changed (the meeting: the button is the only way on, and a hurried person taps it once)
  const nextLabel = id === "check" ? t("Make my plan")
    : id === "allergies" && !home.allergies.length ? t("No allergies at home")
    : id === "homeDiet" && !home.diets.length ? t("No diets at home")
    : id === "leaveOut" && !leaveOut.length ? t("Nothing to leave out")
    : t("Continue");

  return (
    <div className="pb-6">
      <PageHeader
        back={step > 1 && !direct ? { onPress: () => moveTo(step - 1), label: t("Back to the previous step") } : { href: "/app", label: t("Back to Home") }}
        action={onKeep && <Button variant="secondary" className="px-4" onClick={onKeep}>{t("Keep my plan")}</Button>}
      />
      {/* the steps done in the deep green on the line (progress on a light surface), the step in words beside it; none on a first open's check screen,
          which is no step of a walk */}
      {!direct && (
        <>
          <div aria-hidden className="mt-4 flex gap-1.5">
            {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < step ? "bg-bar" : "bg-line"}`} />)}
          </div>
          <p className="mt-2.5 text-[0.8125rem] font-semibold text-muted" aria-live="polite">{t("Step {step} of {total}", { step, total })}</p>
        </>
      )}

      <h1 ref={heading} tabIndex={-1} className={`${direct ? "mt-4" : "mt-3"} ${TITLE} outline-none`}>{title}</h1>
      <div className="mt-4"><PipSays mood={STEP_PIP[id]} size={64} lively pulse={id === "shops" ? `shops-${chosenNames.length}` : id === "cuisine" ? `cuisine-${cuisines.join()}` : id}>{says}</PipSays></div>

      <div className="mt-4">
        {id === "count" && <CountStep count={count} onChange={(n) => { if (n !== count) { householdStore.set(withCount(householdStore.get(), n, personId)); setPick(null); } }} />}

        {id === "who" && <WhoStep others={home.others} onChange={(o) => { setHome({ others: o }); setPick(null); }} />}

        {/* your numbers on the meals step's top line (the meeting: no screen of its own); in a household they size your own portion */}
        {id === "meals" && (
          <div className={`${CARD} mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-4`}>
            <p className="app-numbers min-w-0 text-[1rem] font-bold">{household ? t("Your portions: {kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) }) : t("{kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) })}</p>
            <LinkButton href="/app/settings#targets" variant="secondary" className="px-4">{t("Change my numbers")}</LinkButton>
          </div>
        )}

        {id === "meals" && <MealsAndSnacks shape={shape} onChange={setShape} targets={targets} variety={variety} onVariety={setVariety} gap={gap} />}

        {id === "diet" && <DietPicker value={settings.preferences} onChange={(p) => updateSettings({ preferences: p })} />}

        {id === "cuisine" && <CuisinePicker value={cuisines} onChange={setCuisines} diet={prefs} leaveOut={leaveOut} slots={slots} />}

        {id === "allergies" && <AllergiesStep value={home.allergies} onChange={(a) => { setHome({ allergies: a }); setPick(null); }} />}

        {id === "homeDiet" && <HomeDietStep value={home.diets} onChange={(d) => { setHome({ diets: d }); setPick(null); }} />}

        {id === "leaveOut" && (
          <>
            {/* can't go on yet: the calm notice (a white card with a grey bar), never red */}
            {problem === "noPlan" && <InfoBanner heading={null} className="mb-3 font-semibold">{t("There aren't enough of our recipes left for every meal with these choices. Try leaving out fewer foods, or pick another shop.")}</InfoBanner>}
            {/* nothing left for a meal: said at the top, where it's seen (usability test 2026-11-19: at large text it sat under the sticky Continue) */}
            {noneFor && <InfoBanner heading={null} className="mb-3 font-semibold">{t("With these, there are no {meal} recipes left, so I can't plan a week. Tap a food again to put it back.", { meal: mealWord(noneFor.meal) })}</InfoBanner>}
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
              <input ref={typedBox} value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }} placeholder={t("Something else, like sweetcorn")} aria-label={t("Another food to leave out")} className={`${inputClass} min-w-[12rem] flex-1`} maxLength={40} />
              {/* always on (colour meeting: a grey Add looked broken): with too little typed it puts the cursor in the box */}
              <Button variant="secondary" onClick={() => (typed.trim().length < 3 ? typedBox.current?.focus() : addTyped())}>{t("Add")}</Button>
            </div>
            {/* what's left to choose from, said plainly as they tap */}
            <div role="status" aria-live="polite" className={`glass mt-4 rounded-[1.25rem] p-4 text-[0.9375rem] leading-snug ${noneFor ? "font-semibold" : ""}`}>
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
                      className={`${CHOICE_ROW} min-h-[3.75rem] p-2.5 ${on ? CHOICE_ROW_ON : CHOICE_ROW_OFF}`}>
                      <ShopMark shopId={s.id} size="sm" />
                      <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug [overflow-wrap:anywhere]">{s.name}</span>
                      <ChoiceMark on={on} kind="circle" className="me-1" />
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
            {unloaded ? <ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => { setProblem(null); setPrep(null); go("shops"); }} />
              : preparing ? (<><p role="status" className="text-[1.0625rem] font-semibold">{t("Working out the prices at your shops…")}</p>{working}</>)
              : range === undefined ? <Spinner label={t("Working out the prices at your shops…")} />
              : !range ? <InfoBanner heading={null} className="font-semibold">{t("There aren't enough of our recipes left for every meal with these choices. Try leaving out fewer foods, or pick another shop.")}</InfoBanner>
              : pick !== null && <BudgetSlider range={range} value={pick} onChange={setPick} />}
          </>
        )}

        {/* the check screen (the meeting: everyone sees it, Just me too; anything can be changed from here). Who's eating first (the onboarding meeting,
            20 November 2026: the first open starts here, and the old first question became this line), then the allergies */}
        {id === "check" && unloaded && (
          <div className="mb-3"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => { setProblem(null); setPrep(null); prepping.current = null; setAttempt((n) => n + 1); }} /></div>
        )}
        {id === "check" && (
          <ul className="space-y-2.5">
            {([
              ["count", t("Who's eating"), household ? whoWords(t, home) : t("Just me")],
              household ? ["allergies", t("Allergies at home"), allergyLine(t, home.allergies)] : ["diet", t("Your diet and allergies"), dietWords(t, settings.preferences).join(", ") || t("No diet or allergies.")],
              ...(household ? [["homeDiet", t("Diets at home"), homeDietLine(t, home.diets)]] : []),
              ["meals", t("Meals and snacks"), dayShape(t, shape)],
              ["shops", t("Where you shop"), chosenNames.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(chosenNames) : t("No shop chosen"), shopNote],
              ...(household ? [] : [["cuisine", t("The food you like"), cuisines.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(cuisines.map((c) => t(CUISINES.find((x) => x.id === c)!.label))) : t("Any")]]),
              ["leaveOut", household ? t("Left out for everyone") : t("Foods left out"), leaveOut.length ? leaveOut.map((x) => t(LEAVE_OUT.find((c) => c.id === x)?.label ?? x)).join(", ") : t("Nothing")],
              ["budget", t("Your budget"), noBudget ? t("No budget: the best week for your goal") : pick !== null ? t("{budget} a week", { budget: formatPrice(pick) }) : t("Not set yet")],
            ] as Array<[StepId, string, string, string?]>).map(([to, label, value, note]) => {
              const row = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.8125rem] font-semibold text-muted">{label}</span>
                    <span className="mt-0.5 block text-[1rem] font-semibold leading-snug [overflow-wrap:anywhere]">{value}</span>
                    {note && <span className="mt-1 block text-[0.9375rem] leading-snug">{note}</span>}
                  </span>
                  <Button variant="secondary" onClick={() => go(to)} aria-label={t("Change: {what}", { what: label })} className="shrink-0 px-4">{t("Change")}</Button>
                </>
              );
              // the allergies in the one amber note when there are any (the card a parent must not miss); "No allergies at home." stays a plain card
              return (
                <li key={to}>
                  {(to === "diet" || to === "allergies") && allergiesSet ? <AllergyNote><div className="mt-1 flex items-center gap-3">{row}</div></AllergyNote> : <div className={`${CARD} flex items-center gap-3 p-4`}>{row}</div>}
                </li>
              );
            })}
          </ul>
        )}
        {id === "check" && <CapNote gap={gap} boxed className="mt-2.5" />}
      </div>

      {/* a 16 px band of the page's own grey above the button, so it never sits on a card */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-6 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-4">
        <Button full className="min-h-14 text-lg" disabled={!canGo} reason={cantGo} onClick={() => (step < total ? moveTo(step + 1) : make())}>{nextLabel}</Button>
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
          <li key={l} className="flex gap-2 text-[0.9375rem] leading-snug"><CheckIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink" />{l}</li>
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
      {widened.length > 0 && <InfoBanner heading={null} className="mt-3 font-semibold">{t("There aren't enough {kinds} {meals} for your diet yet, so your {meals} can be any kind of food.", { kinds, meals })}</InfoBanner>}
    </div>
  );
}

/** Which meals the person eats (at least one) and how many snacks (none to three), with each one's size as the plan will make it. */
function MealsAndSnacks({ shape, onChange, targets, variety, onVariety, gap }: { shape: DayShape; onChange: (s: DayShape) => void; targets: Targets; variety: Variety; onVariety: (v: Variety) => void; gap: CapGap }) {
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
        <InfoBanner heading={null} className="mt-5 font-semibold">{t("Pick at least one meal.")}</InfoBanner>
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
          {/* under a GLP-1 meal cap: why the meals come to less than the day */}
          <CapNote gap={gap} className="mt-3 border-t border-line pt-3" />
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
              className={`${CHOICE_ROW} min-h-[3.75rem] px-4 py-3 ${on ? CHOICE_ROW_ON : CHOICE_ROW_OFF}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.0625rem] font-bold leading-snug">{title}</span>
                <span className={`mt-0.5 block text-[0.9375rem] leading-snug ${on ? "" : "text-muted"}`}>{line}</span>
              </span>
              <ChoiceMark on={on} kind="circle" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How long each of Pip's steps shows on "Making your plan": seven steps, about 20 seconds (founder 2026-11-20: "think for longer during this, maybe like 20
 * seconds or so"; until then about ten, as asked on 18 November). With Reduce Motion the time is the same, with nothing moving.
 */
const MAKING_STEP_MS = 2800;

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
      <div aria-hidden className="mt-5 h-2 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-bar transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.round((100 * Math.min(at + 1, steps.length)) / steps.length)}%` }} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">{steps[shown]}</p>
      <ul className={`${CARD} mt-5 space-y-3.5 p-4`}>
        {/* each step appears as Pip reaches it */}
        {steps.slice(0, shown + 1).map((s, i) => {
          const on = i === at;
          return (
            <li key={s} className="bubble-pop flex items-start gap-3 text-[1.0625rem] leading-snug">
              {on ? <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-ink motion-reduce:animate-none" />
                : <span className={DONE_TICK}><CheckIcon strokeWidth={3} className="h-4 w-4" /></span>}
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
        {/* a tag you can't tap, on the page: white with the card line and 6 px corners */}
        <span className="app-numbers absolute bottom-0 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-[0.375rem] border border-line bg-card px-2.5 py-0.5 text-[0.875rem] leading-snug"
          style={{ left: `clamp(4.5rem, ${along(best)}, calc(100% - 4.5rem))` }}>
          <span className="h-2.5 w-2.5 rounded-full bg-bar" /><span className="text-muted">{t("Best fit")}</span><span className="font-bold">£{best}</span>
        </span>
      </div>
      <div className="relative mt-1 h-12">
        {/* the arrow: a track with a head at each end */}
        <span aria-hidden className="absolute inset-x-[1.125rem] top-1/2 h-2 -translate-y-1/2 rounded-full bg-line" />
        <ChevronLeftIcon aria-hidden className="absolute start-0 top-1/2 h-5 w-5 -translate-y-1/2 text-muted rtl:rotate-180" />
        <ChevronLeftIcon aria-hidden className="absolute end-0 top-1/2 h-5 w-5 -translate-y-1/2 rotate-180 text-muted rtl:rotate-0" />
        {/* the green spot: the best fit, a short green stretch of the track that shows either side of the handle when the handle is on it */}
        <span aria-hidden className="absolute top-1/2 h-3 w-[4.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bar" style={{ left: along(best) }} />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={t("Budget for the week")}
          aria-valuetext={t("£{n} a week", { n: value })}
          className="absolute inset-0 h-12 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:h-9 [&::-moz-range-thumb]:w-9 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:bg-ink [&::-webkit-slider-thumb]:h-9 [&::-webkit-slider-thumb]:w-9 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-[var(--shadow-lift)] focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-accent"
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
        <Button variant="secondary" onClick={() => onChange(best)} className="mt-3 px-4">
          <span aria-hidden className="h-3 w-3 rounded-full bg-bar" />{t("Back to the green spot (£{n})", { n: best })}
        </Button>
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
  const [removed, setRemoved] = useState<{ plan: SavedPlan; index: number; at: number } | null>(null);
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
    setRemoved((was) => ({ plan, index: i, at: (was?.at ?? 0) + 1 }));
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
                <Button variant="secondary" className="min-h-12 px-4" onClick={() => remove(i)}>{t("Remove")}</Button>
              </div>
            </li>
          );
        })}
      </ul>
      {/* the one toast, with Undo for 10 seconds (longer while a finger or the keyboard is on it) */}
      {removed && <Toast key={removed.at} duration={10000} onUndo={undo} onClose={() => setRemoved(null)}>{t("Plan removed.")}</Toast>}
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
  const shape = useMemo(() => shapeOf(slots), [slots]);
  const targets = useSlotTargets(shape);
  const gap = useCapGap(shape, targets);
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [day, setDay] = useState(0);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [added, setAdded] = useState<{ text: string; at: number } | null>(null);
  const shopKey = saved.shops.join("|");
  const leaveKey = saved.leaveOut.join("|");
  // a household plan is rebuilt for the home it was made for (its allergies and meat answer then), each recipe as written
  const savedHome = saved.home;
  const homeNow = useStore(householdStore);
  const { gate } = useGate();
  // "Added your portion of ... to today.": the toast (with Undo), and the add button that was tapped shows Added
  const [logged, setLogged] = useState<{ text: string; id: string; key: string } | null>(null);
  const [loggedKeys, setLoggedKeys] = useState<ReadonlySet<string>>(() => new Set());
  // each person's name for the plate line: the household's own when it still matches the plan, else their age group
  const plateNames = useMemo(() => {
    if (!savedHome) return [];
    const same = homeNow.others.length === savedHome.others.length && homeNow.others.every((o, i) => o.group === savedHome.others[i]!.group);
    return savedHome.others.map((o, i) => (same ? personName(t, homeNow.others[i]!, i) : t(GROUP_LABEL[o.group])));
  }, [savedHome, homeNow, t]);
  // "you 1¼, Sam 1 and Alex ¾", each name in bold (the line a parent dishes up from), in the language's own list order
  const plateList = (plates: readonly number[]) => {
    const people = plates.map((n, i) => ({ name: i === 0 ? t("you") : plateNames[i - 1] ?? "", share: shareWords(Math.max(0.25, Math.round(n * 4) / 4)) }));
    return new Intl.ListFormat("en-GB", { type: "conjunction" }).formatToParts(people.map((_, i) => `\u0000${i}\u0000`)).map((part, k) => {
      const who = part.type === "element" ? people[Number(part.value.replace(/\u0000/g, ""))] : undefined;
      return who ? <span key={k}><b className="font-bold">{who.name}</b> {who.share}</span> : <span key={k}>{part.value}</span>;
    });
  };
  const logMine = (c: PlanCandidate, slot: MealType, key: string) => gate("log", () => {
    // the whole label where every product printed it (sugar, salt, fibre...: Home's third page), as Add food's recipes log it
    const nutrients = recipeNutrients({ perServing: c.perServing, label: c.label ?? { kj: null, saturates: null, sugars: null, fibre: null, salt: null } }, 1);
    const entry = addLogEntry({ chainId: "", chainName: t("Recipe"), name: t(c.recipe.name), source: "recipe", recipeId: c.recipe.id, meal: slot, nutrients });
    setLogged({ text: t("Added your portion of {name} to today.", { name: t(c.recipe.name) }), id: entry.id, key });
    setLoggedKeys((k) => new Set(k).add(key));
  });
  const undoLog = () => {
    if (!logged) return;
    deleteLogEntry(logged.id);
    setLoggedKeys((k) => { const next = new Set(k); next.delete(logged.key); return next; });
    setLogged(null);
  };
  const planDiet = useMemo(() => (savedHome ? homeDiet(settings.preferences, { others: savedHome.others.map((o, i) => ({ ...o, id: `p${i}` })), allergies: savedHome.allergies, diets: savedHome.diets }) : settings.preferences), [savedHome, settings.preferences]);
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
  // the days run off the right edge at large text: while there are more to see, a pinned "›" button on the page's own grey says so and scrolls on (no fade
  // over the words: a faded Sunday looked switched off), and the day chosen scrolls into view (usability test 2026-11-19: Irene didn't know the strip scrolled)
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

  const header = <PageHeader back={{ href: "/app", label: t("Back to Home") }} />;
  if (failed) return <div>{header}<h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1><div className="mt-4"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>;
  if (!candidates || !loaded) return <div>{header}<h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1><Spinner label={t("Opening your plan")} /></div>;
  if (!week) {
    return (
      <div>
        {header}
        <h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1>
        <div className="mt-4 space-y-3"><InfoBanner heading={null}>{t("Some recipes in your plan can't be made at your shops any more. Make a new plan.")}</InfoBanner><Button full onClick={onChange}>{t("Make a new plan")}</Button></div>
      </div>
    );
  }

  const shown = week.days[day]!;
  // the person's own diet, and a home's diets as the plan was made for them
  const dietLine = [...dietWords(t, settings.preferences), ...(savedHome?.diets ?? []).map((d) => t(HOME_DIET_LABEL[d]))].filter((w, i, all) => all.indexOf(w) === i);
  const avg = (k: "kcal" | "protein") => Math.round(week.days.reduce((s, d) => s + d[k], 0) / week.days.length);
  const choices = swapping === null ? [] : swapChoices(saved.ids, day, swapping, forAll ?? candidates, 10, slots);
  const forN = people > 1 && <span className="block text-[0.8125rem] font-semibold text-muted">{t("for {n}", { n: people })}</span>;
  const several = saved.shops.length > 1;
  const choose = (recipeId: string) => {
    if (swapping === null) return;
    const ids: PlanIds = setMeal(saved.ids, day, swapping, recipeId);
    mealPlanStore.set({ ...saved, ids, swapped: true });
    setSwapping(null);
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
    const text = ownLists ? t("Added {n} products to your shopping lists.", { n: week.shopping.length }) : t("Added {n} products to your shopping list.", { n: week.shopping.length });
    setAdded((was) => ({ text, at: (was?.at ?? 0) + 1 })); // a new key each time, so the toast's time starts afresh
  };

  return (
    <div className="pb-6">
      {header}
      <h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1>
      <p className="mt-2 text-base leading-snug text-muted">
        {snackCount ? t("{meals} meals and {snacks} snacks from our recipes, with ingredients from {shops}.", { meals: mealCount, snacks: snackCount, shops: names(shopsAll, week.shops) })
          : t("{meals} meals from our recipes, with ingredients from {shops}.", { meals: mealCount, shops: names(shopsAll, week.shops) })}
        {/* the diet said on the plan itself (usability test 2026-11-19: Raj looked for "all vegetarian" and didn't find it), with a home's diets */}
        {/* each diet as its picker names it, capitals kept (Jain, Kosher style; and German nouns) */}
        {dietLine.length > 0 && <> {t("Every meal fits your diet: {diet}.", { diet: dietLine.join(", ") })}</>}
      </p>
      {/* another plan whenever they like, at the top where it's seen (founder 2026-11-19); this one is kept among the earlier plans */}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* secondary (colour meeting: lime is never a button); "Add all" stays the screen's one main action */}
        <Button variant="secondary" className="min-h-12 gap-2 px-5" onClick={onChange}>
          <CalendarIcon aria-hidden className="h-5 w-5" />{t("Make a new plan")}
        </Button>
        {/* the plans kept from before, reachable from the top (usability test 2026-11-19: at the bottom, below the whole shopping list, they were nearly missed) */}
        {earlierCount > 0 && (
          <a href="#earlier-h" onClick={(e) => { e.preventDefault(); document.getElementById("earlier-h")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            className="inline-flex min-h-12 items-center gap-2 rounded-full border-[1.5px] border-edge bg-card px-5 text-[0.9375rem] font-semibold text-foreground transition active:scale-[0.97] hover:bg-background">
            {earlierCount === 1 ? t("Your earlier plan") : t("Your {n} earlier plans", { n: earlierCount })}
          </a>
        )}
      </div>

      {/* the money first: what the shopping comes to, against the budget. No Pip on it (founder 2026-11-20, "keep him as the guide, not the decoration";
          the onboarding meeting: no Pip near money) */}
      <div className={`${CARD} mt-4 p-4`}>
        <p className="app-numbers text-[1.75rem] font-[800] leading-none">{formatPrice(week.shoppingCost)}</p>
        <p className="mt-1 text-[0.9375rem] font-semibold text-muted">{people > 1 ? t("for the week's shopping for {n} people", { n: people }) : t("for the week's shopping")}</p>
        {/* the budget in plain dark words, within it or over it alike (money is never green or red) */}
        <p className="mt-3 text-[0.9375rem] leading-snug">
          {week.budget === null ? t("No budget set.")
            : week.overBudget && saved.swapped ? t("That's {over} over your {budget} budget with the meals you swapped in.", { over: formatPrice(week.shoppingCost - week.budget), budget: formatPrice(week.budget) })
            : week.overBudget ? t("That's {over} over your {budget} budget: it's the cheapest week our recipes allow with your choices.", { over: formatPrice(week.shoppingCost - week.budget), budget: formatPrice(week.budget) })
            : t("Within your {budget} budget.", { budget: formatPrice(week.budget) })}
        </p>
        {week.fresh.bought > 0 && <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("{pct}% of the fresh food you buy is eaten this week. Oil, spices, dry goods like rice and pasta, jars and frozen food keep for longer.", { pct: Math.round((100 * week.fresh.eaten) / week.fresh.bought) })}</p>}
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("About {kcal} kcal and {protein} g protein a day (your target is {target} kcal).", { kcal: formatInt(avg("kcal")), protein: formatInt(avg("protein")), target: formatInt(settings.dailyCalories) })}</p>
        <CapNote gap={gap} className="mt-2" />
        {/* the home's allergies: the one amber note, the same words as the check screen; "No allergies at home." stays a plain line */}
        {savedHome && (savedHome.allergies.length
          ? <AllergyNote className="mt-3"><p>{allergyLine(t, savedHome.allergies)}</p></AllergyNote>
          : <p className="mt-2 text-[0.9375rem] font-semibold leading-snug">{allergyLine(t, savedHome.allergies)}</p>)}
        {savedHome ? <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("Cooked for {n} of you: each recipe as written, with your own portion sized to your numbers. Only your numbers are shown.", { n: people })}</p>
          : people > 1 && <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("The shopping is for {n} people: each has the same meals, sized to your numbers.", { n: people })}</p>}
      </div>

      {/* the days: big buttons, the one showing lime with the dark green edge and a dot (chosen, not "do this"); the others white with the edge */}
      <div className="relative -mx-5 mt-5">
        <div ref={dayStrip} role="radiogroup" aria-label={t("Day")} className="no-scrollbar flex gap-2 overflow-x-auto px-5 py-0.5">
          {dayNames.map((name, i) => (
            <button key={i} type="button" role="radio" aria-checked={day === i} onClick={() => setDay(i)}
              className={`inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-[0.9375rem] transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${day === i ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card font-semibold text-foreground hover:bg-background"}`}>
              <ChoiceMark on={day === i} kind="dot" />{name}
            </button>
          ))}
          {/* room at the end so the last day can scroll clear of the pinned button */}
          {moreRight && <span aria-hidden className="w-12 shrink-0" />}
        </div>
        {moreRight && (
          <span className="absolute inset-y-0 end-0 flex items-center bg-background pe-5 ps-2">
            <button type="button" onClick={() => dayStrip.current?.scrollBy({ left: (dayStrip.current.clientWidth * 0.6) * (document.dir === "rtl" ? -1 : 1), behavior: "smooth" })} aria-label={t("More days")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink transition active:scale-95 hover:bg-background">
              <ChevronRightIcon aria-hidden className="h-5 w-5" />
            </button>
          </span>
        )}
      </div>

      <section aria-labelledby="day-h" className="mt-4">
        <h2 id="day-h" className={HEADING}>{dayNames[day]}</h2>
        {logged && <Toast key={logged.id} onUndo={undoLog} onClose={() => setLogged(null)}>{logged.text}</Toast>}
        <ul className="mt-3 space-y-3">
          {shown.meals.map((m, i) => {
            const addKey = `${day}-${i}-${m.candidate.recipe.id}`;
            const isAdded = loggedKeys.has(addKey);
            return (
            <li key={`${m.meal}-${i}`} className={`${CARD} p-3`}>
              <p className="px-1 text-[0.8125rem] font-semibold text-muted">{slotName(i)}</p>
              <div className="mt-2 flex items-center gap-3">
                <Link href={`/app/recipes/view?id=${m.candidate.recipe.id}&r=${m.candidate.shop}${savedHome && m.candidate.plates ? `&n=${Math.min(20, Math.max(1, Math.ceil(m.candidate.plates.reduce((a, b) => a + b, 0) - 0.05)))}&w=1` : ""}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <RecipeThumb id={m.candidate.recipe.id} name={m.candidate.recipe.name} meal={m.meal} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{t(m.candidate.recipe.name)}</span>
                    <span className="app-numbers mt-0.5 block text-[0.875rem] text-muted">{formatInt(m.candidate.perServing.kcal)} kcal · {formatInt(m.candidate.perServing.protein)} g {t("protein")}</span>
                    {several && <span className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted"><ShopMark shopId={m.candidate.shop} size="xs" />{shopName(m.candidate.shop)}</span>}
                    {m.candidate.better && <span className="mt-1 block"><Badge>{t("Better products")}</Badge></span>}
                  </span>
                </Link>
                <span className="app-numbers shrink-0 text-end text-base font-[800]">{formatPrice(m.candidate.cost)}{forN}</span>
              </div>
              {/* who gets how much, in servings of the recipe as written (household plans; only the user's own numbers are shown) */}
              {savedHome && m.candidate.plates && m.meal !== "snack" && (
                <p className="app-numbers mt-2 px-1 text-[0.9375rem] leading-snug"><Rich text={t("Servings each: {list}.")} values={{ list: plateList(m.candidate.plates) }} /></p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
              {/* every add is a compact ink pill; once tapped it shows Added (lime with the dark green edge and a tick) until the toast's Undo */}
              <button type="button" onClick={() => logMine(m.candidate, m.meal, addKey)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[0.9375rem] font-bold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isAdded ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-transparent bg-ink text-on-ink hover:bg-ink-pressed"}`}>
                {isAdded ? <CheckIcon aria-hidden strokeWidth={3} className="h-4 w-4" /> : <PlusIcon aria-hidden className="h-4 w-4" />}
                {isAdded ? t("Added to {meal}", { meal: slotName(i) }) : t("Add my portion to {meal}", { meal: slotName(i) })}
              </button>
              <Button variant="secondary" onClick={() => setSwapping(i)} aria-label={t("Swap this meal: {meal}, {recipe}", { meal: slotName(i).toLowerCase(), recipe: t(m.candidate.recipe.name) })} className="gap-1.5 px-4">
                <SwapIcon aria-hidden className="h-4 w-4" />{t("Swap this meal")}
              </Button>
              </div>
            </li>
            );
          })}
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
                      {file ? <Link href={`/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(l.product.id)}`} className="flex min-h-[5rem] items-center gap-3 px-3 py-2.5 transition hover:bg-background active:bg-background">{row}</Link>
                        : <div className="flex min-h-[5rem] items-center gap-3 px-3 py-2.5">{row}</div>}
                    </li>
                  );
                })}
                <li className="flex items-center justify-between gap-3 bg-fill px-4 py-3 font-[800]"><span>{t("{shop} total", { shop: shopName(sh) })}</span><span className="app-numbers">{formatPrice(sum)}</span></li>
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

      {/* the screen's one main action, full width on a 16 px band of the page's grey above the tab bar */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-4">
        <Button full className="min-h-14 gap-2 text-lg" onClick={addAll}><PlusIcon aria-hidden className="h-5 w-5" />{t("Add all to my shopping list")}</Button>
      </div>
      {added && (
        <Toast key={added.at} onClose={() => setAdded(null)}>
          {added.text} <Link href="/app/groceries/list" className="font-bold text-on-ink underline underline-offset-2">{t("See list")}</Link>
        </Toast>
      )}

      <Sheet open={swapping !== null} onClose={() => setSwapping(null)} title={swapping === null ? t("Swap this meal") : t("Swap {meal}", { meal: slotName(swapping).toLowerCase() })}>
        <p className="text-[0.9375rem] leading-snug text-muted">{t("Other recipes sized for this meal. Tap one to have it on {day}.", { day: dayNames[day]! })}</p>
        <ul className="mt-3 space-y-2">
          {choices.map((c) => (
            <li key={c.recipe.id}>
              <button type="button" onClick={() => choose(c.recipe.id)} className="glass flex min-h-[4.5rem] w-full items-center gap-3 rounded-[1.25rem] p-3 text-start transition hover:bg-background active:scale-[0.99]">
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
