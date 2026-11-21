"use client";

import Link from "next/link";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { recipeNutrients } from "@/lib/mm/addFood";
import { analytics } from "@/lib/mm/analytics";
import { MEAL_LABEL } from "@/lib/mm/budget";
import { GATING_ENABLED } from "@/lib/mm/config";
import { formatDate, formatInt } from "@/lib/mm/format";
import { formatPrice, retailerName, withPhoto } from "@/lib/mm/groceries";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { DEFAULT_SHAPE, LEAVE_OUT, MAX_SNACKS, PLAN_DAYS, PLAN_MEALS, PER_MEAL_RECIPES, VARIETIES, betterForHousehold, forHousehold, budgetRange, buildWeek, capShortfall, cleanDiet, cuisineRecipes, forPeople, householdReference, keepEarlier, openEarlier, leavesOut, planDayIndex, planForBudget, planListKey, planShortfall, planSlots, sameDiet, setMeal, shapeOf, slotTargets, styleBetter, styleCandidates, styleShortfall, styleTargets, styleTooFew, withBetter, fitsStyle, weekCosts, showsWeekAfter, EATING_STYLES, STYLE_FIT, type StyleFit, type BudgetPlan, type BudgetRange, type DayShape, type EatingStyle, type PlanCandidate, type PlanIds, type SavedPlan, type ShopLine, type StyleShort, type Variety, type WeekCosts, type WeekPlan } from "@/lib/mm/mealPlan";
import { localDay } from "@/lib/mm/paid";
import { betterFor, loadShops as loadShopsWith, previewShop, recipesFor, weekPreview, workKey, workOut, type Candidates, type Loaded, type Targets } from "@/lib/mm/planPreview";
import { RECIPES } from "@/lib/mm/recipeBook";
import { CUISINES, type CuisineId } from "@/lib/mm/recipeBook/niches";
import { matchesNiche } from "@/lib/mm/recipeNiche";
import { recipeForDiet, type MealType } from "@/lib/mm/recipes";
import { recipeShops, recipeShopSet, shopPhotoSources } from "@/lib/mm/shopProducts";
import { addLogEntry, countProAction, deleteLogEntry, earlierPlansStore, householdStore, mealPlanStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { homeDiet, noMeatLeft, ownDiets, shareWords, withCount, type Household } from "@/lib/mm/household";
import { macroTargets } from "@/lib/mm/targets";
import type { DietPrefs } from "@/lib/mm/pantry";
import { NO_PREFERENCES, type Preferences } from "@/lib/mm/types";
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
import { addedNote, placeItems, targetList } from "../_lib/listRecipes";
import { Rich } from "../_lib/Rich";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { listHref } from "../groceries/ListChoice";
import { CARD, CHIP, CHIP_ON, HEADING, TITLE } from "../groceries/PageBits";
import { PhotoTile } from "../groceries/ProductPhoto";
import { RecipeThumb } from "../recipes/RecipeThumb";
import { TwoWeeks } from "./TwoWeeks";
import { AllergiesStep, CountStep, GROUP_LABEL, HOME_DIET_LABEL, HomeDietStep, STYLE_LABEL, StyleStep, WhoStep, allergyLine, homeDietLine, personName, whoWords } from "./HouseholdSteps";
import { SwapPicker } from "./SwapPicker";

// The meal plan (founder 2026-11-18; lib/mm/mealPlan.ts has the rules). Premium ("a third icon, which has meal plan, and that has pro on it"). Pip asks one thing
// a screen ("they just got to type in all their stuff, like Pip's guiding them through"): the daily numbers from the person's own plan, their diet and allergies,
// foods they'd rather not have, a budget for the week, and the shops they use, as many as they like ("it'll combine everything and then choose the best meal plan
// overall"). Then the week: each day's breakfast, lunch and dinner from our own recipes with its calories, protein, price and shop; any meal can be swapped for
// another from a list; what the shopping comes to against the budget; the shopping for each shop as whole packs, and one button that puts it all on the
// shopping list. The plan stays on the phone until a new one is made (mm.v1.mealPlan).
// The first open, with no plan yet (the onboarding meeting, 20 November 2026, build list 13): straight to the check screen, filled in from the person's own
// settings (their diet and allergies, daily numbers and shop) and Meal plan's Just-me defaults, "Who's eating: Just me" first, every line with its Change; its
// "Make my plan" makes the same week the onboarding preview and PremiumIntro show, and saves it as before.

/** Today's date on this phone (yyyy-mm-dd, the local day: a plan made at 00:30 starts today, not yesterday as the UTC date would say). */
const today = () => localDay(new Date());
/** The most servings the recipe page shows (RecipeDetail.tsx MAX_SERVINGS): a plan's link never asks for more. */
const RECIPE_MAX_SERVINGS = 12;
/** A diet as the diet picker's words read it (dietWords takes the settings' shape). */
const asPrefs = (d: DietPrefs): Preferences => ({ ...NO_PREFERENCES, ...d, avoidAllergens: d.avoidAllergens ? [...d.avoidAllergens] : undefined });
/** "£126" for a whole-pound budget (the slider's), "£126.40" otherwise. */
const pounds = (n: number) => (Number.isInteger(n) ? `£${n}` : formatPrice(n));
/**
 * Where the first shop and each week after sit against a budget (founder 2026-11-20: "even though their budget's like £65 a week, the week after they need to know
 * that'll probably be about £40"), in plain dark words: both within it, only the first shop over it, or both over it (how much the first is over, and why).
 * The plan still keeps the first shop's bill to the budget (planForBudget), as before.
 */
function twoWeeksBudget(t: ReturnType<typeof useT>, costs: WeekCosts, budget: number, swapped?: boolean): string {
  if (costs.first <= budget) return t("Both are within your {budget} budget.", { budget: pounds(budget) });
  if (costs.after <= budget) return t("Only your first shop is over your {budget} budget.", { budget: pounds(budget) });
  const values = { over: formatPrice(costs.first - budget), budget: pounds(budget) };
  return swapped ? t("{over} over your {budget} budget with your swaps.", values) : t("{over} over your {budget} budget: the cheapest week our recipes allow.", values);
}
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
// check screen before the plan is made (and a first open starts there). How they like to eat (founder 2026-11-20) comes after the diet, in both.
type StepId = "count" | "who" | "meals" | "shops" | "diet" | "style" | "cuisine" | "allergies" | "homeDiet" | "leaveOut" | "budget" | "check";
const JUST_ME: readonly StepId[] = ["count", "meals", "shops", "diet", "style", "cuisine", "leaveOut", "budget", "check"];
const HOUSEHOLD: readonly StepId[] = ["count", "who", "meals", "shops", "allergies", "homeDiet", "style", "leaveOut", "budget", "check"];
// Pip guides the questions but never stands beside a figure or a price (the Pip and Premium findings, 20 November 2026): the meals step (calories) and the
// budget step (£) carry his words as plain text, and so does the check screen once its budget row shows £; he waits ("listen") on the check screen rather
// than cheering before anything is made; the style step has no words at all (its picture tiles carry the figures, as in the founder's example)
const STEP_PIP: Partial<Record<StepId, PipMood>> = { count: "wave", who: "point", shops: "listen", diet: "listen", cuisine: "listen", allergies: "listen", homeDiet: "point", leaveOut: "point", check: "listen" };
/** A new person's id on this phone (letters and digits only). */
const personId = () => `p${Math.random().toString(36).slice(2, 10)}`;
const MEAL_PLURAL: Record<string, string> = { breakfast: tk("breakfasts"), lunch: tk("lunches"), dinner: tk("dinners"), snack: tk("snacks") };
const MEAL_ONE: Record<MealType, string> = { breakfast: tk("breakfast"), lunch: tk("lunch"), dinner: tk("dinner"), snack: tk("snack") };
/** The ways the eating styles size their meals (mealPlan.ts STYLE_FIT), each worked out once on the style step. */
const FITS: readonly StyleFit[] = [...new Set(Object.values(STYLE_FIT))];

/**
 * What a style leaves short at the shops chosen, in one short line (founder 2026-11-20: where a meal has too few, say so, and repeat rather than leave a gap;
 * mealPlan.ts styleShortfall): "High protein: no lunches or dinners yet, so they can be any recipe." or "Lower carb: only 3 lunches, so some days repeat."
 * `named` false: without the style's name, for the check screen, whose row already says it. Null when nothing is short.
 */
function styleShortLine(t: ReturnType<typeof useT>, style: EatingStyle, short: StyleShort, named = true): string | null {
  if (style === "balanced") return null;
  const name = t(STYLE_LABEL[style]);
  const meals = new Intl.ListFormat("en-GB", { type: "disjunction" }).format(short.none.map((m) => t(MEAL_PLURAL[m]!)));
  const list = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(short.few.map(({ meal, n }) => (n === 1 ? `1 ${t(MEAL_ONE[meal])}` : `${n} ${t(MEAL_PLURAL[meal]!)}`)));
  const lines: string[] = [];
  if (short.none.length) lines.push(named ? t("{style}: no {meals} yet, so they can be any recipe.", { style: name, meals }) : t("No {meals} yet, so they can be any recipe.", { meals }));
  if (short.few.length) lines.push(named ? t("{style}: only {list}, so some days repeat.", { style: name, list }) : t("Only {list}, so some days repeat.", { list }));
  return lines.join(" ") || null;
}

type Shop = { id: string; name: string };
const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

// The recipes worked out for a set of answers (workOut, workKey, recipesFor, betterFor) are lib/mm/planPreview.ts's, with its one cache kept while the app is
// open: the week the onboarding's step 10 and the Premium intro work out is the one "Make my plan" finds already made (the "not bait" finding, 20 November
// 2026), and the sums hand control back to the screen between chunks of recipes.
/** Each shop's list (loaded once and cached by loadShopFile). */
const loadShops = (ids: readonly string[]): Promise<Loaded[]> => loadShopsWith(ids, loadShopFile);

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
 * GLP-1 goal each meal is kept to the meal size the person set, so the day can't add up, and the plan says so with the way to change it, in the app's voice
 * (no goal name, no medication). `boxed`: on the page in its own white card; otherwise inside a card already.
 */
function CapNote({ gap, boxed, className = "" }: { gap: CapGap; boxed?: boolean; className?: string }) {
  const t = useT();
  if (!gap) return null;
  return (
    <div className={`${boxed ? `${CARD} p-4` : ""} ${className}`}>
      <p className="app-numbers text-[0.9375rem] leading-snug">{t("Your meal size is {cap} kcal, so your meals come to {sum} of your {daily} kcal.", { cap: formatInt(gap.cap), sum: formatInt(gap.sum), daily: formatInt(gap.daily) })}</p>
      <LinkButton href="/app/targets" variant="secondary" className="mt-3 px-4">{t("Change it")}</LinkButton>
    </div>
  );
}

const names = (shops: readonly Shop[], ids: readonly string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(ids.map((id) => shops.find((s) => s.id === id)?.name ?? id));

function PlanScreen() {
  const hydrated = useHydrated();
  const saved = useStore(mealPlanStore);
  const pro = useIsPro();
  const [editing, setEditing] = useState(false);
  if (!hydrated) return <Spinner />;
  if (GATING_ENABLED && !pro) return <PremiumIntro />;
  // a new plan is saved as soon as it is made (leaving "Making your plan" keeps it); `editing` holds the questions' screen until Making is over
  if (saved && !editing) return <Week key={saved.start} saved={saved} onChange={() => setEditing(true)} />;
  return <Questions saved={saved} onStart={() => setEditing(true)} onDone={() => setEditing(false)} onKeep={saved ? () => setEditing(false) : undefined} />;
}

/**
 * The week Meal plan's first open would make (useWeekPreview): working on it, ready, or none: `diet` when our recipes can't fill every meal for the
 * person's diet, otherwise (offline, no shop, a week far from their numbers) the words alone.
 */
type Preview = { state: "working" } | { state: "none"; diet: boolean } | { state: "ready"; meals: Array<{ meal: MealType; name: string; recipeId: string }>; day: number; kcal: number; protein: number; total: number; costs: WeekCosts; week: WeekPlan; checkedOn: string; gap: CapGap };

/**
 * The week the first open's "Make my plan" makes (the onboarding meeting, 20 November 2026: "not bait"): lib/mm/planPreview.ts weekPreview, the same sums
 * the onboarding's step 10 runs: one person with Meal plan's Just-me defaults (breakfast, lunch and dinner, any kind of food, nothing left out, no budget,
 * PER_MEAL_RECIPES), the person's own diet, allergies and daily numbers, from the first of their shops that recipes can use, else the shop recipes use until
 * they choose. Worked out on this phone in chunks (the screen keeps moving) and never saved.
 */
function useWeekPreview(): { shop: string | null; preview: Preview } {
  const settings = useSettings();
  const manifest = useShopManifest();
  const shop = manifest ? previewShop(manifest, settings.shops).shop : null;
  const targets = useSlotTargets(DEFAULT_SHAPE);
  const gap = useCapGap(DEFAULT_SHAPE, targets);
  const key = JSON.stringify([shop, settings.preferences, { goal: settings.goal, dailyCalories: settings.dailyCalories, dailyProtein: settings.dailyProtein, glp1MealCap: settings.glp1MealCap }]);
  const [result, setResult] = useState<{ key: string; preview: Preview } | null>(null);
  useEffect(() => {
    if (!shop) return;
    const stop = new AbortController();
    const [, diet, person] = JSON.parse(key) as [string, DietPrefs, Parameters<typeof weekPreview>[0]["person"]];
    void weekPreview({ shop, diet, person }, { load: loadShopFile, signal: stop.signal }).then((r) => {
      if (stop.signal.aborted) return;
      const dietOn = dietWords((x) => x, asPrefs(diet)).length > 0;
      setResult({ key, preview: r.ok
        ? { state: "ready", meals: r.firstDay, day: r.day, kcal: r.average.kcal, protein: r.average.protein, total: r.total, costs: weekCosts(r.week), week: r.week, checkedOn: r.checkedOn, gap: null }
        : { state: "none", diet: r.reason === "noRecipes" && dietOn } });
    });
    return () => stop.abort();
  }, [key, shop]);
  const preview: Preview = !manifest ? { state: "working" } : !shop ? { state: "none", diet: false } : result?.key === key ? (result.preview.state === "ready" ? { ...result.preview, gap } : result.preview) : { state: "working" };
  return { shop, preview };
}

const PREVIEW_ROW: Partial<Record<MealType, string>> = { breakfast: tk("Breakfast · {recipe}"), lunch: tk("Lunch · {recipe}"), dinner: tk("Dinner · {recipe}") };

/**
 * The week, shown before Premium (the onboarding meeting's "Meal plan honesty"): the first day's three meals by name, the day's average against the target, the
 * week's shopping as labelled lines at normal size (never a big £ figure that could be read as a charge): the first shop and each week after (founder
 * 2026-11-20), or the one line when they cost about the same, and the shelf-price line. While it is worked out,
 * grey bars with no figures and a status line saying what is happening; when no week can be made, the words alone.
 */
function WeekPreview({ shop, preview }: { shop: string | null; preview: Preview }) {
  const t = useT();
  const settings = useSettings();
  const language = useLanguage();
  const shopName = shop ? retailerName(shop) : "";
  // the plan starts the day it is made: the day shown is that many days from today
  const shownDay = preview.state === "ready" ? preview.day : 0;
  const dayName = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + shownDay);
    return new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "long" }).format(d);
  }, [language, shownDay]);
  return (
    <section aria-labelledby="preview-h" className={`${CARD} mt-4 min-h-[15rem] p-4`}>
      <h2 id="preview-h" className="text-lg font-[800] leading-snug">{t("Your week, planned")}</h2>
      {preview.state === "none" ? (
        <p className="mt-1.5 text-[0.9375rem] leading-snug">{preview.diet
          ? t("Not enough of our recipes fit your diet ({diet}) for a week yet.", { diet: dietWords(t, settings.preferences).join(", ") })
          : t("A week of meals from your shop, sized to your numbers.")}</p>
      ) : (
        <>
          <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("7 days from {shop}, sized to your numbers.", { shop: shopName })}</p>
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
                {preview.meals.map((c) => <li key={`${c.meal}-${c.recipeId}`} className="[overflow-wrap:anywhere]">{t(PREVIEW_ROW[c.meal] ?? "{recipe}", { recipe: t(c.name) })}</li>)}
              </ul>
              <p className="app-numbers mt-3 text-[0.9375rem] leading-snug">{t("About {kcal} kcal and {protein} g protein a day (your target is {target} kcal).", { kcal: formatInt(preview.kcal), protein: formatInt(preview.protein), target: formatInt(settings.dailyCalories) })}</p>
              <CapNote gap={preview.gap} className="mt-2" />
              {/* the first shop and each week after when the packs that keep make the first dearer (TwoWeeks), else the one line */}
              {showsWeekAfter(preview.costs) ? <TwoWeeks costs={preview.costs} week={preview.week} className="mt-2" />
                : <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("Shopping for the week at {shop}: about £{total}", { shop: shopName, total: formatInt(Math.round(preview.total)) })}</p>}
              <p className="mt-1.5 text-[0.9375rem] leading-snug">{t("With Premium, Meal plan makes this week for you.")}</p>
              <p className="mt-2 text-[0.8125rem] leading-snug text-muted">{t("Prices are {shop}'s shelf prices, checked {date}, and vary by store.", { shop: shopName, date: formatDate(preview.checkedOn, t) })}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * For someone without Premium: what the meal plan does, the week it would make them (the same one), and the way to Premium. No Pip here: the screen carries
 * the week's figures and its shopping. When our recipes can't fill a week for the person's diet, the screen says so instead of selling the plan.
 */
function PremiumIntro() {
  const t = useT();
  const { showPaywall } = useGate();
  const { shop, preview } = useWeekPreview();
  const cantPlan = preview.state === "none" && preview.diet;
  return (
    <div className="pb-6">
      <PageHeader back={{ href: "/app", label: t("Back to Home") }} />
      <h1 className={`mt-4 ${TITLE}`}>{t("Meal plan")}</h1>
      <WeekPreview shop={shop} preview={preview} />
      {!cantPlan && <ul className={`${CARD} mt-4 space-y-3 p-4 text-base leading-snug`}>
        {[t("Meals and snacks sized to your goal"), t("One shop or several"), t("What each meal costs, within your budget"), t("Swap any meal, then add it all to your shopping list")].map((line) => (
          <li key={line} className="flex items-start gap-3"><CheckIcon aria-hidden strokeWidth={2.6} className="mt-0.5 h-5 w-5 shrink-0 text-ink" />{line}</li>
        ))}
      </ul>}
      {/* the one main action, on a 16 px band of the page's grey above the tab bar, so it shows however long the week is */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-5 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-4">
        <Button full className="min-h-14 text-lg" onClick={() => showPaywall("mealPlan")}>{t("See Premium")}</Button>
      </div>
    </div>
  );
}

// ---------- Pip's questions, one a screen ----------

function Questions({ saved, onStart, onDone, onKeep }: { saved: SavedPlan | null; onStart: () => void; onDone: () => void; onKeep?: () => void }) {
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
  // no budget on the first open: the best week for the goal, as the preview made it (planForBudget with none); a budget only once the slider is moved (opening
  // the budget step no longer sets one: "No budget" was silently replaced by the slider's amount)
  const [noBudget, setNoBudget] = useState(!saved || saved.budget === null);
  const moveTo = (n: number) => {
    setDirect(false);
    setStep(n);
  };
  // a step opened from the check screen's Change: its button says Done and goes back to the check (one change, one screen; not every step after it)
  const [fromCheck, setFromCheck] = useState(false);
  const go = (to: StepId) => { setFromCheck(true); moveTo(steps.indexOf(to) + 1); };
  const backToCheck = () => { setFromCheck(false); moveTo(steps.length); };
  // the day's meals and snacks (founder 2026-11-18: "how many meals and how many snacks they want a day as well ... full personalization")
  const [shape, setShape] = useState<DayShape>(saved?.slots ? shapeOf(saved.slots) : DEFAULT_SHAPE);
  const slots = useMemo(() => planSlots(shape), [shape]);
  // how they like to eat (founder 2026-11-20): High protein and Lower carb fit every meal to more protein (mealPlan.ts styleTargets; Balanced: the same sizes,
  // so a first open makes the week the onboarding preview made) and the plan uses only that style's recipes (styleCandidates)
  const [style, setStyle] = useState<EatingStyle>(saved?.style ?? "balanced");
  const ownTargets = useSlotTargets(shape);
  const targets = useMemo(() => styleTargets(ownTargets, style), [ownTargets, style]);
  // how often a meal may come round (founder 2026-11-18: "they can choose if they want any foods repeated")
  const [variety, setVariety] = useState<Variety>(saved?.variety ?? PER_MEAL_RECIPES);
  // "Make my plan": the plan is made and saved, then "Making your plan" shows the work step by step before the week opens (leaving it keeps the plan)
  const [making, setMaking] = useState<string[] | null>(null);
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
  // why a meal has no recipes (the Jain finding, 20 November 2026: a dead end that never named the diet): the diet itself when even with nothing left out
  // there are none, else the foods left out
  const dietCause = useMemo(() => !!noneFor && recipesFor(cuisinesUsed, prefs, []).every((r) => r.meal !== noneFor.meal || !recipeForDiet(r, prefs)), [noneFor, cuisinesUsed, prefs]);
  const dietNamed = dietWords(t, asPrefs(prefs)).join(", ");
  const noneSay = !noneFor ? null
    : !dietCause ? t("No {meal} recipes left with these. Tap a food again to put it back.", { meal: mealWord(noneFor.meal) })
    : household ? t("No {meal} recipes fit the diets at home ({diet}) yet. Untick {meal} on Meals and snacks, or change the diets.", { diet: dietNamed, meal: mealWord(noneFor.meal) })
    : t("No {meal} recipes fit your diet ({diet}) yet. Untick {meal} on Meals and snacks, or change your diet.", { diet: dietNamed, meal: mealWord(noneFor.meal) });
  // the ways on from there, each to the step that changes it
  const noneWays = noneFor && (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="secondary" className="px-4" onClick={() => go("meals")}>{t("Change my meals")}</Button>
      {dietCause
        ? <Button variant="secondary" className="px-4" onClick={() => go(household ? "homeDiet" : "diet")}>{household ? t("Change the diets at home") : t("Change my diet")}</Button>
        : <Button variant="secondary" className="px-4" onClick={() => go("leaveOut")}>{t("Change the foods left out")}</Button>}
    </div>
  );

  // the prices for the budget step: worked out when it opens (and again if the shops, the diet or the foods changed); on the style step too, so it can say
  // which meals have few of the style at these shops
  const prepKey = workKey(chosen, prefs, targets, leaveOut, cuisinesUsed, household) + slots.join("|") + `|${variety}`;
  const prepping = useRef<string | null>(null);
  useEffect(() => {
    if ((id !== "budget" && id !== "check" && id !== "style") || !chosen.length || prep?.key === prepKey || prepping.current === prepKey) return;
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
  const shapeKey = JSON.stringify(shape);
  const sizing = useMemo(() => ({ targets, yourDailyKcal: settings.dailyCalories, others, referenceTargets: householdReference(JSON.parse(shapeKey) as DayShape) }), [targets, settings.dailyCalories, others, shapeKey]);
  const sized = (c: Candidates) => { const s = styleCandidates(c, style); return household ? forHousehold(s, sizing) : s; };
  const betterSized = (l: readonly Loaded[]) => styleBetter(household ? betterForHousehold(betterFor(l, {}), sizing) : betterFor(l, targets), style);
  const homeKey = JSON.stringify(others);
  // the meals with none or few of the style at these shops (mealPlan.ts styleShortfall), once their recipes are worked out
  const short = prep && prep.key === prepKey ? styleShortfall(prep.cands, style, slots, variety) : null;
  const styleNote = short ? styleShortLine(t, style, short) : null;
  // every style's recipes at these shops for this diet, for the style step (founder 2026-11-20: a style the diet or the shops leave too few recipes for is
  // greyed with the reason, never hidden): worked out once the chosen style's are, for each way the styles size their meals (mealPlan.ts STYLE_FIT; a
  // household's are as written, so the same for all), after the screen has drawn
  const styleKey = workKey(chosen, prefs, ownTargets, leaveOut, cuisinesUsed, household) + slots.join("|");
  const [byFit, setByFit] = useState<{ key: string; cands: Partial<Record<StyleFit, Candidates>> } | null>(null);
  const prepReady = !!prep && prep.key === prepKey;
  useEffect(() => {
    if (id !== "style" || !prep || !prepReady || byFit?.key === styleKey) return;
    let live = true;
    (async () => {
      const cands: Partial<Record<StyleFit, Candidates>> = {};
      for (const fit of FITS) {
        cands[fit] = household || fit === STYLE_FIT[style] ? prep.cands
          : await workOut(prep.loaded, prefs, styleTargets(ownTargets, EATING_STYLES.find((s) => STYLE_FIT[s] === fit)!), leaveOut, cuisinesUsed, undefined, false);
        if (!live) return;
      }
      setByFit({ key: styleKey, cands });
    })();
    return () => { live = false; };
  }, [id, prepReady, styleKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the keys hold the answers they depend on
  // each greyed style's reason: "Too few lunches for your diet", or with no diet "Too few lunches at Morrisons" (mealPlan.ts styleTooFew)
  const styleShort = (() => {
    const out: Partial<Record<EatingStyle, string>> = {};
    if (id !== "style" || !byFit || byFit.key !== styleKey) return out;
    const hasDiet = Object.keys(cleanDiet(prefs)).length > 0;
    const where = chosen.length === 1 ? names(shopsAll, chosen) : t("your shops");
    for (const s of EATING_STYLES) {
      const few = styleTooFew(byFit.cands[STYLE_FIT[s]] ?? new Map(), s, slots);
      if (!few.length) continue;
      const meals = new Intl.ListFormat("en-GB", { type: "disjunction" }).format(few.map((m) => t(MEAL_PLURAL[m]!)));
      out[s] = hasDiet ? t("Too few {meals} for your diet", { meals }) : t("Too few {meals} at {shop}", { meals, shop: where });
    }
    return out;
  })();
  const styleCheckNote = short ? styleShortLine(t, style, short, false) : null;
  // the slider's range for these prices and these people, worked out after the screen has drawn (the spinner shows meanwhile); on the budget step always
  // (the slider shows beside "No budget"), elsewhere only once there is a budget (with none, the week is the best fit)
  const rangeKey = prep && prep.key === prepKey && (!noBudget || id === "budget") ? `${prepKey}|${homeKey}|${style}` : null;
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
  // the check screen's budget row: what the week Make my plan makes would cost, the first shop and each week after (founder 2026-11-20, "the week after they need
  // to know that'll probably be about £40"); the same sums make() runs (planForBudget, memoised), worked out after the screen has drawn
  const checkKey = id === "check" && ready ? `${prepKey}|${homeKey}|${style}|${noBudget ? "none" : pick}` : null;
  const [checked, setChecked] = useState<{ key: string; plan: BudgetPlan | null } | null>(null);
  useEffect(() => {
    if (!checkKey || !prep || checked?.key === checkKey) return;
    const timer = setTimeout(() => setChecked({ key: checkKey, plan: planForBudget(sized(prep.cands), noBudget ? null : pick, betterSized(prep.loaded), slots, variety) }), 0);
    return () => clearTimeout(timer);
  }, [checkKey]); // eslint-disable-line react-hooks/exhaustive-deps -- checkKey holds the answers it depends on
  const checkWeek = checked && checked.key === checkKey ? checked.plan?.week ?? null : null;
  const checkCosts = checkWeek ? weekCosts(checkWeek) : null;
  const gap = useCapGap(shape, targets);
  const make = () => {
    if (!ready || !prep) return;
    const budget = noBudget ? null : pick;
    const plan = planForBudget(sized(prep.cands), budget, betterSized(prep.loaded), slots, variety);
    // no week: to what can change it (the foods left out, else the diet), with the reason there
    if (!plan) { setProblem("noPlan"); go(leaveOut.length ? "leaveOut" : household ? "homeDiet" : "diet"); return; }
    // what Pip did, each with its real figure (founder 2026-11-18: "show them what you're doing ... so you're showing them that you're properly working")
    const w = plan.week;
    const recipes = new Set([...prep.cands.values()].flat().map((c) => c.recipe.id)).size;
    // how many of them are of the style (its own recipes only, not a meal's any-recipe fallback)
    const ofStyle = new Set([...prep.cands.values()].flat().filter((c) => fitsStyle(c, style)).map((c) => c.recipe.id)).size;
    // the protein the meals are fitted to: the person's own, or more for High protein and Lower carb (styleTargets)
    const fitProtein = style === "balanced" ? daily.protein : slots.reduce((n, m) => n + (targets[m]?.protein ?? 0), 0);
    const products = prep.loaded.reduce((n, l) => n + l.products.length, 0);
    const meals = slots.filter((m) => m !== "snack").length * PLAN_DAYS;
    const snacks = slots.filter((m) => m === "snack").length * PLAN_DAYS;
    const eaten = w.fresh.bought > 0 ? Math.round((100 * w.fresh.eaten) / w.fresh.bought) : 100;
    const steps = [
      t("Reading {n} recipes that suit your diet", { n: formatInt(recipes) }),
      ...(style === "balanced" ? [] : [t("Keeping to {style}: {n} of them fit", { style: t(STYLE_LABEL[style]), n: formatInt(ofStyle) })]),
      t("Looking through {n} products at {shops}", { n: formatInt(products), shops: names(shopsAll, chosen) }),
      // under a GLP-1 meal cap the meals are sized to the meal size, not the day (CapNote says so)
      gap ? (household ? t("Sizing every meal for {n} of you: your own portion to your {cap} kcal meal size", { n: count, cap: formatInt(gap.cap) }) : t("Sizing every meal to your {cap} kcal meal size", { cap: formatInt(gap.cap) }))
        : household ? t("Sizing every meal for {n} of you: your own portion to your {kcal} kcal and {protein} g protein a day", { n: count, kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) })
        : t("Sizing every meal to your {kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(fitProtein) }),
      snacks ? t("Choosing {meals} meals and {snacks} snacks for your week", { meals, snacks }) : t("Choosing {meals} meals for your week", { meals }),
      t("Planning the packs so {pct}% of the fresh food gets eaten", { pct: eaten }),
      budget === null ? t("Pricing the best week for your goal: {cost}", { cost: formatPrice(w.shoppingCost) })
        : w.overBudget ? t("Finding the cheapest week your choices allow: {cost}", { cost: formatPrice(w.shoppingCost) }) : t("Keeping the week to {cost}, within your {budget}", { cost: formatPrice(w.shoppingCost), budget: pounds(budget) }),
      household ? t("Writing your shopping list for {people} people: {n} products", { people: count, n: w.shopping.length }) : t("Writing your shopping list: {n} products", { n: w.shopping.length }),
    ];
    // saved now, so leaving "Making your plan" keeps it; the plan this one replaces is kept among the earlier plans (founder 2026-11-19: "they can start
    // another meal plan"); the person's own diet is kept with it, so changing it later doesn't break the week
    onStart();
    if (saved) earlierPlansStore.update((l) => keepEarlier(l, saved));
    mealPlanStore.set({ shops: chosen, ids: plan.ids, slots, leaveOut, budget, start: today(), variety, ...(cuisinesUsed.length ? { cuisines: cuisinesUsed } : {}), ...(plan.better.length ? { better: plan.better } : {}), ...(household ? { home: { others, allergies: home.allergies, diets: home.diets } } : {}), diet: cleanDiet(settings.preferences), ...(style !== "balanced" ? { style } : {}) });
    setMaking(steps);
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
    diet: t("Your diet and allergies"), style: t("How do you like to eat?"), cuisine: t("The food you like"), allergies: t("Any food allergies at home?"), homeDiet: t("Any diets at home?"),
    leaveOut: household ? t("Anything someone won't eat?") : t("Foods you'd rather not have"), budget: t("Your budget for the week"), check: t("Ready to make your plan?"),
  };
  const title = TITLES[id];
  // the shops step says what the ticks mean as they change (founder 2026-11-18: "it needs to be clear to them")
  const chosenNames = shopsAll.filter((s) => chosen.includes(s.id)).map((s) => s.name);
  const shopsSay = chosenNames.length === 1
    ? t("Everything from {shop}. Pick another to share the meals.", { shop: chosenNames[0]! })
    : chosenNames.length > 1
      ? t("I'll share your meals between {shops}.", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(chosenNames) })
      : t("Pick one shop, or several to share the meals.");
  const SAYS: Record<StepId, string> = {
    count: t("Count yourself too."),
    who: t("So I can size each portion. Names stay on this phone."),
    // none: the title and the step's own headings say it (the words pass, 20 November 2026)
    meals: "",
    shops: shopsSay,
    diet: t("I'll leave out any recipe that doesn't fit."),
    // none: the title and the picture tiles say it (the founder's example, 20 November: a title, then the pictures), and the tiles carry figures (no Pip)
    style: "",
    cuisine: cuisines.length ? t("Lunches and dinners from {cuisines}. Breakfasts and snacks stay as usual.", { cuisines: new Intl.ListFormat("en-GB", { type: "disjunction" }).format(cuisines.map((c) => t(CUISINES.find((x) => x.id === c)!.label))) })
      : t("For lunch and dinner. Pick as many as you like."),
    allergies: t("Anything ticked is left out for everyone. Always check the label."),
    homeDiet: t("Tick every diet anyone follows. Every meal will fit them all."),
    leaveOut: household ? t("I'll leave them out for everyone.") : t("I'll leave them out."),
    budget: t("Keep No budget, or slide to set one. The green spot is the best fit."),
    check: direct ? t("I've filled this in from your settings.") : t("Here's what you picked."),
  };
  const says = SAYS[id];
  // the check screen keeps Pip until its budget row shows £
  const pipMood = id === "check" && !noBudget ? undefined : STEP_PIP[id];
  // the person's own shops can't make our recipes yet: the week uses the shop recipes use until they choose, and the check screen says so
  const ownShops = settings.shops ?? [];
  const shopNote = ownShops.length > 0 && chosen.length === 1 && !ownShops.some((o) => shopsAll.some((s) => s.id === o))
    ? (ownShops.length === 1 ? t("{left} isn't in recipes yet, so this week uses {shop}.", { left: retailerName(ownShops[0]!), shop: chosenNames[0] ?? "" })
      : t("{left} aren't in recipes yet, so this week uses {shop}.", { left: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(ownShops.map((o) => retailerName(o))), shop: chosenNames[0] ?? "" }))
    : undefined;
  // the allergies the plan leaves out: the home's and the person's own (a household plan applies both: household.ts homeDiet), or (Just me) the person's own
  const ownAllergies = settings.preferences.avoidAllergens ?? [];
  const allergiesSet = (prefs.avoidAllergens?.length ?? 0) > 0;
  if (making) return <Making steps={making} onDone={onDone} />;
  const canGo = !(id === "meals" && !shape.meals.length) && !(id === "leaveOut" && noneFor) && !(id === "shops" && !chosen.length) && !((id === "budget" || id === "check") && !ready) && !(id === "check" && noneFor);
  // the shops or their products couldn't be loaded (no connection): the check screen says so, with Try again
  const unloaded = problem === "offline" || (!!manifest && !shopsAll.length);
  // why the button can't be pressed yet, written above it (colour meeting, 19 November 2026: every tester met a grey Continue with no reason)
  const cantGo = canGo ? null
    : id === "meals" ? t("Pick at least one meal.")
    : id === "shops" ? t("Pick at least one shop.")
    // "Tap a food again" only when a food is ticked; else the meal the diet leaves without recipes
    : id === "leaveOut" ? (leaveOut.length && !dietCause ? t("Tap a food again to put it back.") : noneFor ? t("There are no {meal} recipes for your diet yet.", { meal: mealWord(noneFor.meal) }) : null)
    : id === "check" && noneFor ? null
    : unloaded || range === null ? null
    : t("Working out the prices at your shops…");
  // the bottom button says the usual answer until something is changed (the meeting: the button is the only way on, and a hurried person taps it once);
  // a step opened from the check screen says Done and goes back to it
  const nextLabel = id === "check" ? t("Make my plan")
    : fromCheck ? t("Done")
    : id === "allergies" && !home.allergies.length ? t("No allergies at home")
    : id === "homeDiet" && !home.diets.length ? t("No diets at home")
    : id === "leaveOut" && !leaveOut.length ? t("Nothing to leave out")
    : t("Continue");

  return (
    <div className="pb-6">
      <PageHeader
        back={fromCheck && id !== "check" ? { onPress: backToCheck, label: t("Back to the check screen") } : step > 1 && !direct ? { onPress: () => moveTo(step - 1), label: t("Back to the previous step") } : { href: "/app", label: t("Back to Home") }}
        action={onKeep && <Button variant="secondary" className="px-4" onClick={onKeep}>{t("Keep my plan")}</Button>}
      />
      {/* the steps done in the deep green on the line (progress on a light surface), the step in words for a screen reader; none on a first open's check screen,
          which is no step of a walk */}
      {!direct && (
        <>
          <div aria-hidden className="mt-4 flex gap-1.5">
            {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < step ? "bg-bar" : "bg-line"}`} />)}
          </div>
          {/* the bar alone on screen (the words pass, 20 November 2026: no "Step n of N" words, as on the welcome screens); a screen reader still hears it */}
          <p className="sr-only" aria-live="polite">{t("Step {step} of {total}", { step, total })}</p>
        </>
      )}

      <h1 ref={heading} tabIndex={-1} className={`mt-4 ${TITLE} outline-none`}>{title}</h1>
      {/* Pip on the questions; plain words where the screen carries calories or money (no Pip beside a figure or a price) */}
      {pipMood ? <div className="mt-4"><PipSays mood={pipMood} size={64} lively pulse={id === "shops" ? `shops-${chosenNames.length}` : id === "cuisine" ? `cuisine-${cuisines.join()}` : id}>{says}</PipSays></div>
        : says ? <p className="mt-4 text-base leading-snug">{says}</p> : null}

      <div className={says ? "mt-4" : "mt-6"}>
        {/* a household needs its people, allergies and diets: from Just me, the walk goes on through them rather than back to the check */}
        {id === "count" && <CountStep count={count} onChange={(n) => { if (n !== count) { if (n > 1 && count === 1) setFromCheck(false); householdStore.set(withCount(householdStore.get(), n, personId)); setPick(null); } }} />}

        {id === "who" && <WhoStep others={home.others} onChange={(o) => { setHome({ others: o }); setPick(null); }} />}

        {/* your numbers on the meals step's top line (the meeting: no screen of its own); in a household they size your own portion */}
        {id === "meals" && (
          <div className={`${CARD} mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-4`}>
            <p className="app-numbers min-w-0 text-[1rem] font-bold">{household ? t("Your portions: {kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) }) : t("{kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) })}</p>
            <LinkButton href="/app/targets" variant="secondary" className="px-4">{t("Change my numbers")}</LinkButton>
          </div>
        )}

        {id === "meals" && <MealsAndSnacks shape={shape} onChange={setShape} targets={targets} variety={variety} onVariety={setVariety} gap={gap} household={household} />}

        {id === "diet" && (
          <>
            {problem === "noPlan" && <InfoBanner heading={null} className="mb-3 font-semibold">{t("Not enough recipes for every meal with these choices. Leave out fewer foods, or pick another shop.")}</InfoBanner>}
            {noneFor && dietCause && <InfoBanner heading={null} className="mb-3 font-semibold">{noneSay}</InfoBanner>}
            <DietPicker value={settings.preferences} onChange={(p) => updateSettings({ preferences: p })} />
            {/* said plainly: this is the app-wide diet (the meal plan finding: the step changed it everywhere without saying so) */}
            <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("This is your diet across the app.")}</p>
            <div aria-live="polite">{noMeatLeft([], settings.preferences) && <InfoBanner heading={null} className="mt-3 font-semibold">{t("With Halal and No halal or kosher meat both ticked, meals have no meat.")}</InfoBanner>}</div>
          </>
        )}

        {/* the person's own diet, or the home's, picks each tile's picture (a recipe they'd eat) */}
        {id === "style" && <StyleStep value={style} onChange={setStyle} diet={prefs} note={styleNote} short={styleShort} />}

        {id === "cuisine" && <CuisinePicker value={cuisines} onChange={setCuisines} diet={prefs} leaveOut={leaveOut} slots={slots} />}

        {id === "allergies" && <AllergiesStep value={home.allergies} onChange={(a) => { setHome({ allergies: a }); setPick(null); }} />}

        {id === "homeDiet" && (
          <>
            {problem === "noPlan" && <InfoBanner heading={null} className="mb-3 font-semibold">{t("Not enough recipes for every meal with these choices. Leave out fewer foods, or pick another shop.")}</InfoBanner>}
            {noneFor && dietCause && <InfoBanner heading={null} className="mb-3 font-semibold">{noneSay}</InfoBanner>}
            <HomeDietStep value={home.diets} own={settings.preferences} onChange={(d) => { setHome({ diets: d }); setPick(null); }} />
          </>
        )}

        {id === "leaveOut" && (
          <>
            {/* can't go on yet: the calm notice (a white card with a grey bar), never red */}
            {problem === "noPlan" && <InfoBanner heading={null} className="mb-3 font-semibold">{t("Not enough recipes for every meal with these choices. Leave out fewer foods, or pick another shop.")}</InfoBanner>}
            {/* nothing left for a meal: said at the top, where it's seen (usability test 2026-11-19: at large text it sat under the sticky Continue), with the
                cause named (the diet, or the foods ticked) and the ways on */}
            {noneFor && <InfoBanner heading={null} className="mb-3 font-semibold">{noneSay}{dietCause && noneWays}</InfoBanner>}
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
                ? noneSay
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
              : !range ? <InfoBanner heading={null} className="font-semibold">{t("Not enough recipes for every meal with these choices. Leave out fewer foods, or pick another shop.")}</InfoBanner>
              : pick !== null && (
                <>
                  {/* no budget is a choice of its own (it was lost the moment this step opened); moving the slider sets one */}
                  <button type="button" role="checkbox" aria-checked={noBudget} onClick={() => setNoBudget((v) => !v)} className={`${CHOICE_ROW} mb-5 min-h-[3.75rem] px-4 py-3 ${noBudget ? CHOICE_ROW_ON : CHOICE_ROW_OFF}`}>
                    <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug">{t("No budget: the best week for my goal")}</span>
                    <ChoiceMark on={noBudget} kind="circle" />
                  </button>
                  <BudgetSlider range={range} value={pick} onChange={(v) => { setPick(v); setNoBudget(false); }} />
                </>
              )}
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
              // a household plan applies the person's own allergies and diet too (homeDiet): said here, marked as theirs
              household ? ["allergies", t("Allergies at home"), allergyLine(t, home.allergies, ownAllergies)] : ["diet", t("Your diet and allergies"), dietWords(t, settings.preferences).join(", ") || t("No diet or allergies.")],
              ...(household ? [["homeDiet", t("Diets at home"), homeDietLine(t, home.diets, ownDiets(settings.preferences))]] : []),
              ["style", t("How you like to eat"), t(STYLE_LABEL[style]), styleCheckNote ?? undefined],
              ["meals", t("Meals and snacks"), dayShape(t, shape)],
              ["shops", t("Where you shop"), chosenNames.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(chosenNames) : t("No shop chosen"), shopNote],
              ...(household ? [] : [["cuisine", t("The food you like"), cuisines.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(cuisines.map((c) => t(CUISINES.find((x) => x.id === c)!.label))) : t("Any")]]),
              ["leaveOut", household ? t("Left out for everyone") : t("Foods left out"), leaveOut.length ? leaveOut.map((x) => t(LEAVE_OUT.find((c) => c.id === x)?.label ?? x)).join(", ") : t("Nothing")],
              ["budget", t("Your budget"), noBudget ? t("No budget: the best week for your goal") : pick !== null ? t("{budget} a week", { budget: pounds(pick) }) : t("Not set yet"),
                checkWeek && checkCosts && showsWeekAfter(checkCosts) ? (
                  <>
                    <TwoWeeks costs={checkCosts} week={checkWeek} className="mt-2" />
                    {!noBudget && pick !== null && <span className="mt-1.5 block">{twoWeeksBudget(t, checkCosts, pick)}</span>}
                  </>
                ) : undefined],
            ] as Array<[StepId, string, string, React.ReactNode?]>).map(([to, label, value, note]) => {
              const row = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.8125rem] font-semibold text-muted">{label}</span>
                    <span className="mt-0.5 block text-[1rem] font-semibold leading-snug [overflow-wrap:anywhere]">{value}</span>
                    {note && (typeof note === "string" ? <span className="mt-1 block text-[0.9375rem] leading-snug">{note}</span> : <div className="text-[0.9375rem] leading-snug">{note}</div>)}
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

      {/* a 16 px band of the page's own grey above the button, so it never sits on a card; on the check screen, when a meal has no recipes, the reason and
          the ways on take the button's place */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-6 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-4">
        {id === "check" && noneFor ? (
          <div role="status" className={`${CARD} p-4`}>
            <p className="text-[0.9375rem] font-semibold leading-snug">{noneSay}</p>
            {noneWays}
          </div>
        ) : (
          <Button full className="min-h-14 text-lg" disabled={!canGo} reason={cantGo} onClick={() => (id === "check" ? make() : fromCheck ? backToCheck() : moveTo(step + 1))}>{nextLabel}</Button>
        )}
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
        t("Every ingredient is a real {shop} product, with its price.", { shop: names[0]! }),
        t("One shopping list."),
      ]
    : [
        t("Each meal comes from one shop: the best fit for your numbers, or the cheaper when they're as close."),
        t("Your shopping list is split by shop."),
        t("More shops means more recipes."),
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
      <p className="mt-2 text-[0.875rem] leading-snug text-muted">{t("Each number is how many lunches and dinners suit your diet.")}</p>
      {/* a kind with too few for this diet doesn't stop the plan: that meal takes any kind, and Pip says so (usability test 2026-11-19) */}
      {widened.length > 0 && <InfoBanner heading={null} className="mt-3 font-semibold">{t("Not enough {kinds} {meals} for your diet yet, so your {meals} can be any kind.", { kinds, meals })}</InfoBanner>}
    </div>
  );
}

/** Which meals the person eats (at least one) and how many snacks (none to three), with each one's size as the plan will make it. */
function MealsAndSnacks({ shape, onChange, targets, variety, onVariety, gap, household }: { shape: DayShape; onChange: (s: DayShape) => void; targets: Targets; variety: Variety; onVariety: (v: Variety) => void; gap: CapGap; household?: boolean }) {
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
      {/* a household's meals are cooked for everyone; its snacks are bought for the person alone (mealPlan.ts householdCandidate) */}
      {household && <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Snacks are just for you.")}</p>}
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
 * blah blah blah ... so you're showing them that you're properly working"): the screen goes through what was worked out for this plan, one step at a time,
 * each with its real figure (the recipes and products looked at, the sizes, the packs, the bill, the list), then the week opens. Nothing here is made up.
 * Presentation only: the plan is saved before it starts, so leaving keeps it. No Pip here (the steps carry calories and prices): a plain status line.
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
      <p className="mt-4 text-base leading-snug">{t("This takes about 20 seconds.")}</p>
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
  // "pricier", never "better" (CLAUDE.md rule 3: food is never called good or bad)
  const zone = value <= min ? t("The cheapest week for your goal: lower-cost recipes and everyday products.")
    : value < best - 1 ? t("Cheaper than the best fit: some meals are lower-cost recipes, still sized to your goal.")
    : value <= best + 1 ? t("The green spot: the best week for your goal.")
    : value < max ? t("More to spend: some meals are made with pricier products, like the shops' best ranges, organic or free range.")
    : t("Pricier products wherever your shops have them.");
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
        <span className="text-end"><span className="block font-bold">£{max}</span><span className="text-muted">{t("Pricier products")}</span></span>
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
    // followed again from today: its first day is today (an old start would open on a week long over)
    mealPlanStore.set(next.current ? { ...next.current, start: today() } : null);
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
      <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Kept on this phone.")}</p>
      <ul className="mt-3 space-y-2.5">
        {earlier.map((p, i) => {
          const shape = shapeOf(p.slots ?? [...PLAN_MEALS]);
          // who it was for: a household's people (you and the others), or an older plan's count
          const people = p.home ? p.home.others.length + 1 : p.people ?? 1;
          return (
            <li key={`${p.start}-${i}`} className={`${CARD} p-4`}>
              <p className="font-bold leading-snug">{t("From {day}", { day: from(p.start) })}</p>
              <p className="mt-0.5 text-[0.9375rem] leading-snug text-muted">
                {[...(p.style ? [t(STYLE_LABEL[p.style])] : []), p.cuisines?.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(p.cuisines.map((c) => t(CUISINES.find((x) => x.id === c)?.label ?? c))) : t("Any kind of food"),
                  names(shopsAll, p.shops), dayShape(t, shape), ...(people > 1 ? [t("for {n} people", { n: people })] : [])].join(" · ")}
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
  // the meal sizes and recipes of the style the plan was made with (Questions does the same)
  const style: EatingStyle = saved.style ?? "balanced";
  const ownTargets = useSlotTargets(shape);
  const targets = useMemo(() => styleTargets(ownTargets, style), [ownTargets, style]);
  const gap = useCapGap(shape, targets);
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  // which of the plan's days today is (the local date): the week opens on it, and only today's meals can be added to today's food diary
  const todayIndex = planDayIndex(saved.start, today());
  const ended = todayIndex >= PLAN_DAYS;
  const [day, setDay] = useState(() => Math.min(PLAN_DAYS - 1, Math.max(0, todayIndex)));
  const [swapping, setSwapping] = useState<number | null>(null);
  const [added, setAdded] = useState<{ text: string; href: string; at: number } | null>(null);
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
  // "you: 1¼, Sam: 1 and Person 3: ¾", each name in bold with a colon before the share (a name ending in a number never runs into it: "Person 3 ½" read
  // as "Person 3½"), in the language's own list order
  const plateList = (plates: readonly number[]) => {
    const people = plates.map((n, i) => ({ name: i === 0 ? t("you") : plateNames[i - 1] ?? "", share: shareWords(Math.max(0.25, Math.round(n * 4) / 4)) }));
    return new Intl.ListFormat("en-GB", { type: "conjunction" }).formatToParts(people.map((_, i) => `\u0000${i}\u0000`)).map((part, k) => {
      const who = part.type === "element" ? people[Number(part.value.replace(/\u0000/g, ""))] : undefined;
      return who ? <span key={k}><b className="font-bold">{t("{name}:", { name: who.name })}</b> {who.share}</span> : <span key={k}>{part.value}</span>;
    });
  };
  const logMine = (c: PlanCandidate, slot: MealType, key: string) => gate("log", () => {
    // the whole label where every product printed it (sugar, salt, fibre...: Home's third page), as Add food's recipes log it
    const nutrients = recipeNutrients({ perServing: c.perServing, label: c.label ?? { kj: null, saturates: null, sugars: null, fibre: null, salt: null } }, 1);
    const entry = addLogEntry({ chainId: "", chainName: t("Recipe"), name: t(c.recipe.name), source: "recipe", recipeId: c.recipe.id, meal: slot, nutrients });
    // counted like every other meal logged (AddFoodSheet)
    analytics.track({ name: "mealLogged" });
    countProAction();
    setLogged({ text: t("Added your portion of {name} to today.", { name: t(c.recipe.name) }), id: entry.id, key });
    setLoggedKeys((k) => new Set(k).add(key));
  });
  const undoLog = () => {
    if (!logged) return;
    deleteLogEntry(logged.id);
    setLoggedKeys((k) => { const next = new Set(k); next.delete(logged.key); return next; });
    setLogged(null);
  };
  // the week is rebuilt from the diet it was made with (a plan from before 20 November: today's), so changing the diet in Settings never breaks it; the
  // meals that don't suit today's diet are hidden below, and the plan says why
  const ownDiet = saved.diet ?? settings.preferences;
  const homeThen = useMemo(() => (savedHome ? { others: savedHome.others.map((o, i) => ({ ...o, id: `p${i}` })), allergies: savedHome.allergies, diets: savedHome.diets } : null), [savedHome]);
  const planDiet = useMemo(() => (homeThen ? homeDiet(ownDiet, homeThen) : ownDiet), [homeThen, ownDiet]);
  const dietNow = useMemo(() => (homeThen ? homeDiet(settings.preferences, homeThen) : settings.preferences), [homeThen, settings.preferences]);
  const dietChanged = !!saved.diet && !sameDiet(saved.diet, settings.preferences);
  const fitsNow = (recipeId: string) => { const r = RECIPE_BY_ID.get(recipeId); return !r || !!recipeForDiet(r, dietNow); };
  const dietKey = JSON.stringify(planDiet);
  const betterKey = (saved.better ?? []).join("|");
  const cuisineKey = (saved.cuisines ?? []).join("|");

  useEffect(() => {
    let live = true;
    setFailed(false); // eslint-disable-line react-hooks/set-state-in-effect -- a new try starts clean
    loadShops(shopKey.split("|"))
      .then(async (l) => {
        const c = await workOut(l, JSON.parse(dietKey) as DietPrefs, targets, leaveKey ? leaveKey.split("|") : [], cuisineKey ? (cuisineKey.split("|") as CuisineId[]) : [], undefined, !!savedHome);
        // the meals the budget made with better products (planForBudget), made the same way again (as written for a household), never out of the style
        const betterOf = styleBetter(betterFor(l, savedHome ? {} : targets), style);
        const upgraded = new Map<string, PlanCandidate>();
        for (const key of betterKey ? betterKey.split("|") : []) {
          const [meal, id] = key.split(":");
          const plain = c.get(meal as MealType)?.find((x) => x.recipe.id === id);
          const b = plain ? betterOf(plain) : null;
          if (b) upgraded.set(key, b);
        }
        if (live) { setLoaded(l); setCandidates(withBetter(styleCandidates(c, style), upgraded)); }
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [shopKey, leaveKey, dietKey, betterKey, cuisineKey, targets, retry, savedHome, style]);

  // a plan for several people: each meal cooked for everyone (forPeople), so the prices and the shopping are everyone's and the calories one person's
  // a household's plan: each recipe as written, sized for everyone (forHousehold), the user's own portion matching their meal and the others' a 2,000 kcal
  // day's (householdReference: a GLP-1 meal size never shrinks theirs); an older plan "for n people" bought the same for each (forPeople)
  const people = savedHome ? savedHome.others.length + 1 : saved.people ?? 1;
  const forAll = useMemo(() => {
    if (!candidates) return null;
    return savedHome ? forHousehold(candidates, { targets, yourDailyKcal: settings.dailyCalories, others: savedHome.others, referenceTargets: householdReference(shape) }) : forPeople(candidates, people);
  }, [candidates, people, savedHome, targets, settings.dailyCalories, shape]);
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
  const lastDay = useMemo(() => new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "long", day: "numeric", month: "long" }).format(new Date(new Date(`${saved.start}T12:00:00`).getTime() + (PLAN_DAYS - 1) * 86_400_000)), [saved.start, language]);
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
  }, [day, week]);

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
  const costs = weekCosts(week);
  const twoWeeks = showsWeekAfter(costs);
  // the person's own diet (as the plan was made), and a home's diets, as the picker names them; allergies are said in their own amber note
  const dietLine = [...dietWords(t, asPrefs({ ...ownDiet, avoidAllergens: [] })), ...(savedHome?.diets ?? []).map((d) => t(HOME_DIET_LABEL[d]))].filter((w, i, all) => all.indexOf(w) === i);
  const ownAllergies = ownDiet.avoidAllergens ?? [];
  const avg = (k: "kcal" | "protein") => Math.round(week.days.reduce((s, d) => s + d[k], 0) / week.days.length);
  // a week under the person's calories with no meal size to explain it: the recipes don't reach that far (the 3,400 kcal finding, 20 November 2026)
  const short = !gap && !savedHome ? planShortfall(week, settings.dailyCalories) : null;
  // "for 3" under a price shared by everyone; a household's snacks are the user's alone
  const forN = (meal: MealType) => (people > 1 && meal !== "snack" ? <span className="block text-[0.8125rem] font-semibold text-muted">{t("for {n}", { n: people })}</span>
    : savedHome && meal === "snack" ? <span className="block text-[0.8125rem] font-semibold text-muted">{t("Just for you")}</span> : null);
  const several = saved.shops.length > 1;
  const choose = (recipeId: string) => {
    if (swapping === null) return;
    const ids: PlanIds = setMeal(saved.ids, day, swapping, recipeId);
    mealPlanStore.set({ ...saved, ids, swapped: true });
    setSwapping(null);
  };
  const files = new Map(loaded.map((l) => [l.id, l.file]));
  // the recipe page for a meal, fitted to this slot exactly as the card says (team 6's recipe page reads these): the slot's calories and protein, the pricier
  // products when the plan used them, and for a household the plates cooked as written (the exact number, at most the page's 12)
  const recipeHref = (c: PlanCandidate, meal: MealType) => {
    const q = [`id=${encodeURIComponent(c.recipe.id)}`, `r=${encodeURIComponent(c.shop)}`];
    const tg = targets[meal];
    if (tg) q.push(`kcal=${tg.kcal}`, `p=${tg.protein}`);
    if (c.better || (saved.better ?? []).includes(`${meal}:${c.recipe.id}`)) q.push("better=1");
    if (savedHome && c.plates) q.push(`n=${Math.min(RECIPE_MAX_SERVINGS, Math.round(c.plates.reduce((a, b) => a + b, 0) * 100) / 100)}`, "w=1");
    return `/app/recipes/view?${q.join("&")}`;
  };
  // the shopping list: once for this week (planListKey), each line set to at least the packs the week needs (never doubled), on the shop's own list when the
  // person has one, else the main list; the cupboard things only when asked; the toast names the real lists and counts what really went on
  const listKey = planListKey(saved);
  const onList = saved.addedToList === listKey;
  const changedSince = !!saved.addedToList && !onList;
  const cupboardLines = week.shopping.filter((l) => l.cupboard);
  const listName = (id: string) => (id ? settings.shoppingLists?.find((l) => l.id === id)?.name ?? t("Shopping list") : t("Shopping list"));
  const firstList = week.shopping[0] ? targetList(undefined, settings.shoppingLists, files.get(week.shopping[0].shop)?.retailer ?? week.shopping[0].shop) : "";
  const addLines = (lines: readonly ShopLine[]) => {
    const items = lines.flatMap((line) => {
      const file = files.get(line.shop);
      return file ? [{ item: { gtin: line.product.gtin, shopId: line.product.id, retailer: file.retailer, name: line.product.name, brand: "", size: "", price: line.product.price, checkedOn: file.checkedOn, ...withPhoto(shopPhotoSources(file, line.product)) }, packs: line.packs }] : [];
    });
    let result = { lists: [] as Array<{ list: string; n: number }>, full: 0, tried: items.length };
    shoppingStore.update((list) => {
      const r = placeItems(items, list, settings.shoppingLists, undefined);
      result = r.placed;
      return r.list;
    });
    const note = addedNote(result, listName);
    setAdded((was) => ({ text: t(note.text, note.values), href: listHref(note.list ?? firstList), at: (was?.at ?? 0) + 1 })); // a new key each time, so the toast's time starts afresh
  };
  const addAll = () => {
    addLines(week.shopping.filter((l) => !l.cupboard));
    mealPlanStore.set({ ...saved, addedToList: listKey });
  };
  // prices as each shop's file was read (the oldest date when there are several)
  const checked = week.shops.map((sh) => files.get(sh)?.checkedOn).filter((d): d is string => !!d).sort()[0];

  return (
    <div className="pb-6">
      {header}
      <h1 className={`mt-4 ${TITLE}`}>{t("Your meal plan")}</h1>
      <p className="mt-2 text-base leading-snug text-muted">
        {snackCount ? t("{meals} meals and {snacks} snacks from {shops}.", { meals: mealCount, snacks: snackCount, shops: names(shopsAll, week.shops) })
          : t("{meals} meals from {shops}.", { meals: mealCount, shops: names(shopsAll, week.shops) })}
        {/* the diet said on the plan itself (usability test 2026-11-19: Raj looked for "all vegetarian" and didn't find it), with a home's diets */}
        {/* each diet as its picker names it, capitals kept (Jain, Kosher style; and German nouns) */}
        {dietLine.length > 0 && <> {t("Every meal fits your diet: {diet}.", { diet: dietLine.join(", ") })}</>}
      </p>
      {/* the plan's week is over: follow it again from today, or make a new one (an old plan used to open on its first day for ever) */}
      {ended && (
        <div className={`${CARD} mt-4 p-4`}>
          <p className="font-bold leading-snug">{t("This plan's week ended on {date}.", { date: lastDay })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="min-h-12 px-5" onClick={() => mealPlanStore.set({ ...saved, start: today() })}>{t("Follow it again from today")}</Button>
            <Button variant="secondary" className="min-h-12 px-5" onClick={onChange}>{t("Make a new plan")}</Button>
          </div>
        </div>
      )}
      {/* the diet changed since the plan was made: said plainly, and the meals that no longer fit are hidden below */}
      {dietChanged && (
        <div className="mt-4 space-y-3">
          <InfoBanner heading={null} className="font-semibold">{t("Your diet or allergies have changed, so some meals may not fit.")}</InfoBanner>
          {/* the ended card has its own; "Add all" stays the screen's one main action */}
          {!ended && <Button variant="secondary" className="min-h-12 gap-2 px-5" onClick={onChange}><CalendarIcon aria-hidden className="h-5 w-5" />{t("Make a new plan")}</Button>}
        </div>
      )}
      {/* another plan whenever they like, at the top where it's seen (founder 2026-11-19); this one is kept among the earlier plans */}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* secondary (colour meeting: lime is never a button); "Add all" stays the screen's one main action */}
        {!ended && !dietChanged && (
          <Button variant="secondary" className="min-h-12 gap-2 px-5" onClick={onChange}>
            <CalendarIcon aria-hidden className="h-5 w-5" />{t("Make a new plan")}
          </Button>
        )}
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
        {/* the first shop and each week after, as the headline, when the packs that keep make the first dearer (founder 2026-11-20: "how much it's going to cost
            the first food shop I need to buy, but then in coming weeks, how much it was going to cost me"); else the one figure, as before */}
        {twoWeeks ? <TwoWeeks costs={costs} week={week} large /> : (
          <>
            <p className="app-numbers text-[1.75rem] font-[800] leading-none">{formatPrice(week.shoppingCost)}</p>
            <p className="mt-1 text-[0.9375rem] font-semibold text-muted">{people > 1 ? t("for the week's shopping for {n} people", { n: people }) : t("for the week's shopping")}</p>
          </>
        )}
        {/* the budget in plain dark words, within it or over it alike (money is never green or red); a budget is whole pounds */}
        <p className="mt-3 text-[0.9375rem] leading-snug">
          {week.budget === null ? t("No budget set.")
            : twoWeeks ? twoWeeksBudget(t, costs, week.budget, saved.swapped)
            : week.overBudget && saved.swapped ? t("{over} over your {budget} budget with your swaps.", { over: formatPrice(week.shoppingCost - week.budget), budget: pounds(week.budget) })
            : week.overBudget ? t("{over} over your {budget} budget: the cheapest week our recipes allow.", { over: formatPrice(week.shoppingCost - week.budget), budget: pounds(week.budget) })
            : t("Within your {budget} budget.", { budget: pounds(week.budget) })}
        </p>
        {week.fresh.bought > 0 && <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("{pct}% of the fresh food you buy is eaten this week.", { pct: Math.round((100 * week.fresh.eaten) / week.fresh.bought) })}</p>}
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("About {kcal} kcal and {protein} g protein a day (your target is {target} kcal).", { kcal: formatInt(avg("kcal")), protein: formatInt(avg("protein")), target: formatInt(settings.dailyCalories) })}</p>
        {short && (
          <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{shape.snacks < MAX_SNACKS
            ? t("Our recipes go up to about {max} kcal a meal, so your days come to about {avg} of your {daily} kcal. Add snacks on the meals step to make up the rest.", { max: formatInt(short.max), avg: formatInt(short.avg), daily: formatInt(settings.dailyCalories) })
            : t("Our recipes go up to about {max} kcal a meal, so your days come to about {avg} of your {daily} kcal.", { max: formatInt(short.max), avg: formatInt(short.avg), daily: formatInt(settings.dailyCalories) })}</p>
        )}
        <CapNote gap={gap} className="mt-2" />
        {/* the allergies the plan leaves out, in the one amber note with "Always check the label" (never a promise): a home's and the person's own, or (Just
            me) the person's own; "No allergies at home." stays a plain line */}
        {savedHome ? (savedHome.allergies.length || ownAllergies.length
          ? <AllergyNote className="mt-3"><p>{allergyLine(t, savedHome.allergies, ownAllergies)}</p></AllergyNote>
          : <p className="mt-2 text-[0.9375rem] font-semibold leading-snug">{allergyLine(t, [])}</p>)
          : ownAllergies.length > 0 && <AllergyNote className="mt-3"><p>{allergyLine(t, ownAllergies)}</p></AllergyNote>}
        {savedHome ? <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("Cooked for {n} of you. The numbers are your own portion.", { n: people })}</p>
          : people > 1 && <p className="app-numbers mt-2 text-[0.9375rem] leading-snug">{t("The shopping is for {n} people: each has the same meals, sized to your numbers.", { n: people })}</p>}
      </div>

      {/* the days: big buttons, the one showing lime with the dark green edge and a dot (chosen, not "do this"); the others white with the edge */}
      <div className="relative -mx-5 mt-5">
        <div ref={dayStrip} role="radiogroup" aria-label={t("Day")} className="no-scrollbar flex gap-2 overflow-x-auto px-5 py-0.5">
          {dayNames.map((name, i) => (
            <button key={i} type="button" role="radio" aria-checked={day === i} onClick={() => setDay(i)}
              className={`inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-[0.9375rem] transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${day === i ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card font-semibold text-foreground hover:bg-background"}`}>
              <ChoiceMark on={day === i} kind="dot" />{i === todayIndex ? t("Today") : name}
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
        <h2 id="day-h" className={HEADING}>{day === todayIndex ? t("Today, {day}", { day: dayNames[day]! }) : dayNames[day]}</h2>
        {logged && <Toast key={logged.id} onUndo={undoLog} onClose={() => setLogged(null)}>{logged.text}</Toast>}
        <ul className="mt-3 space-y-3">
          {shown.meals.map((m, i) => {
            const addKey = `${day}-${i}-${m.candidate.recipe.id}`;
            const isAdded = loggedKeys.has(addKey);
            const meal = slotName(i).toLowerCase();
            // a meal that no longer suits the person's diet or allergies (changed since the plan was made) is hidden: Swap, or a new plan
            if (dietChanged && !fitsNow(m.candidate.recipe.id)) {
              return (
                <li key={`${m.meal}-${i}`} className={`${CARD} p-4`}>
                  <p className="text-[0.8125rem] font-semibold text-muted">{slotName(i)}</p>
                  <p className="mt-1 text-[0.9375rem] font-semibold leading-snug">{t("This meal doesn't fit your diet or allergies now, so it's hidden. Swap it, or make a new plan.")}</p>
                  <Button variant="secondary" onClick={() => setSwapping(i)} aria-label={t("Swap this meal: {meal}", { meal })} className="mt-3 gap-1.5 px-4"><SwapIcon aria-hidden className="h-4 w-4" />{t("Swap this meal")}</Button>
                </li>
              );
            }
            return (
            <li key={`${m.meal}-${i}`} className={`${CARD} p-3`}>
              <p className="px-1 text-[0.8125rem] font-semibold text-muted">{slotName(i)}</p>
              <div className="mt-2 flex items-center gap-3">
                <Link href={recipeHref(m.candidate, m.meal)} className="flex min-w-0 flex-1 items-center gap-3">
                  <RecipeThumb id={m.candidate.recipe.id} name={m.candidate.recipe.name} meal={m.meal} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{t(m.candidate.recipe.name)}</span>
                    <span className="app-numbers mt-0.5 block text-[0.875rem] text-muted">{formatInt(m.candidate.perServing.kcal)} kcal · {formatInt(m.candidate.perServing.protein)} g {t("protein")}</span>
                    {several && <span className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted"><ShopMark shopId={m.candidate.shop} size="xs" />{shopName(m.candidate.shop)}</span>}
                    {m.candidate.better && <span className="mt-1 block"><Badge>{t("Pricier products")}</Badge></span>}
                  </span>
                </Link>
                <span className="app-numbers shrink-0 text-end text-base font-[800]">{formatPrice(m.candidate.cost)}{forN(m.meal)}</span>
              </div>
              {/* who gets how much, in servings of the recipe as written (household plans; only the user's own numbers are shown) */}
              {savedHome && m.candidate.plates && m.meal !== "snack" && (
                <p className="app-numbers mt-2 px-1 text-[0.9375rem] leading-snug"><Rich text={t("Servings each: {list}.")} values={{ list: plateList(m.candidate.plates) }} /></p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
              {/* today's meals only go into today's food diary (another day's would be logged today); every add is a compact ink pill; once tapped it shows
                  Added (lime with the dark green edge and a tick) until the toast's Undo */}
              {day === todayIndex && (
                <button type="button" onClick={() => logMine(m.candidate, m.meal, addKey)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[0.9375rem] font-bold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isAdded ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-transparent bg-ink text-on-ink hover:bg-ink-pressed"}`}>
                  {isAdded ? <CheckIcon aria-hidden strokeWidth={3} className="h-4 w-4" /> : <PlusIcon aria-hidden className="h-4 w-4" />}
                  {isAdded ? t("Added to {meal}", { meal }) : t("Add my portion to {meal}", { meal })}
                </button>
              )}
              <Button variant="secondary" onClick={() => setSwapping(i)} aria-label={t("Swap this meal: {meal}, {recipe}", { meal, recipe: t(m.candidate.recipe.name) })} className="gap-1.5 px-4">
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
        <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("In whole packs.")}</p>
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
        <p className="mt-2 px-1 text-[0.8125rem] leading-snug text-muted">{checked
          ? week.shops.length === 1 ? t("Prices are {shop}'s shelf prices, checked {date}, and vary by store.", { shop: shopName(week.shops[0]!), date: formatDate(checked, t) }) : t("Prices are each shop's shelf prices, checked {date}, and vary by store.", { date: formatDate(checked, t) })
          : t("Prices are each shop's shelf prices and vary by store.")}</p>
        {/* the cupboard things (oil, salt, stock) only when asked: most people have them */}
        {cupboardLines.length > 0 && (
          <Button variant="secondary" full className="mt-4 min-h-12 gap-2" onClick={() => addLines(cupboardLines)}><PlusIcon aria-hidden className="h-5 w-5" />{t("Add the cupboard things too ({n})", { n: cupboardLines.length })}</Button>
        )}
      </section>

      <EarlierPlans shopsAll={shopsAll} />

      <div className="mt-6 space-y-2.5">
        <Button variant="secondary" full className="min-h-12 gap-2" onClick={onChange}><CalendarIcon aria-hidden className="h-5 w-5" />{t("Make a new plan")}</Button>
      </div>

      {/* the screen's one main action, full width on a 16 px band of the page's grey above the tab bar: "Add all" once for this week, then where it went,
          with "Add again" only after a meal was swapped (adding again sets each line to what the week needs, never doubles it) */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-4">
        {saved.addedToList ? (
          <div className="flex flex-wrap gap-2.5">
            <LinkButton href={listHref(firstList)} className="min-h-14 flex-[999_1_14rem] gap-2 text-lg"><CheckIcon aria-hidden strokeWidth={3} className="h-5 w-5" />{t("On your shopping list · See list")}</LinkButton>
            {changedSince && <Button variant="secondary" className="min-h-14 flex-[1_0_auto] gap-2 px-5 text-lg" onClick={addAll}><PlusIcon aria-hidden className="h-5 w-5" />{t("Add again")}</Button>}
          </div>
        ) : (
          <Button full className="min-h-14 gap-2 text-lg" onClick={addAll}><PlusIcon aria-hidden className="h-5 w-5" />{t("Add all to my shopping list")}</Button>
        )}
      </div>
      {added && (
        <Toast key={added.at} onClose={() => setAdded(null)}>
          {added.text} <Link href={added.href} className="font-bold text-on-ink underline underline-offset-2">{t("See list")}</Link>
        </Toast>
      )}

      <Sheet open={swapping !== null} onClose={() => setSwapping(null)} title={swapping === null ? t("Swap this meal") : t("Swap {meal}", { meal: slotName(swapping).toLowerCase() })}>
        {/* every recipe the plan priced for this meal, with the Recipes screen's search, filters and sorts (founder 2026-11-20) */}
        {swapping !== null && (
          <SwapPicker candidates={forAll ?? candidates} ids={saved.ids} day={day} mealIndex={swapping} slots={slots} style={style} fits={dietChanged ? fitsNow : undefined}
            people={people} several={several} shopName={shopName} priceNote={forN} dayName={dayNames[day]!} mealName={slotName(swapping).toLowerCase()} cuisinesChosen={!!saved.cuisines?.length}
            onChoose={choose} onNewPlan={() => { setSwapping(null); onChange(); }} />
        )}
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
