// Meal plan's own planning, shared by the Meal plan screen (app/app/plan) and step 10 of the welcome screens, "Your week, planned" (the onboarding redesign
// meeting of 20 November 2026, build list 3; approved by the founder): so the preview and the real screen can never disagree. No AI: only our own recipes,
// fitted exactly as Meal plan fits them (lib/mm/mealPlan.ts), from a shop's real products and prices. Pure apart from the shop files, which the caller loads
// (`load`: app/app/_lib/shopProducts.ts loadShopFile in the app, the files on disk in the tests). Unit-tested in tests/planPreview.test.ts.
//
// The helpers Meal plan used to keep in its page (loadShops, workOut, recipesFor, betterFor, the slot targets) are here, with one cache of the worked-out
// recipes kept while the app is open: the week step 10 works out is the one Meal plan's first open finds already made.
//
// weekPreview is one person's week with exactly Meal plan's Just-me defaults: breakfast, lunch and dinner (DEFAULT_SHAPE), every cuisine, nothing left out,
// PER_MEAL_RECIPES, the person's own diet and allergies and their daily numbers, and no budget (the best week for their goal: what the first open's "Make my
// plan" makes, planForBudget with none; until 20 November the slider's green spot, the best bill rounded, which made another week whenever its pence were
// under 50). It plans from one shop only (the first ticked shop that is in recipes, otherwise the default recipe shop, which the screen then names), with
// none of Meal plan's pauses between shops, in chunks that hand control back to the screen. It is never saved; savedPlanFrom gives what Meal plan saves when
// the person makes it theirs. A week whose days come out more than NARROW_PREVIEW from the person's calories (a narrow diet with few recipes) isn't shown
// as "sized to your numbers": the screen shows its words-only form.

import { cleanDiet, cuisineRecipes, betterCandidate, DEFAULT_SHAPE, mergeCandidates, PER_MEAL_RECIPES, PLAN_DAYS, planCandidates, planForBudget, planSlots, slotTargets, type DayShape, type PlanCandidate, type PlanIds, type SavedPlan, type Variety, type WeekPlan } from "./mealPlan";
import type { DietPrefs } from "./pantry";
import { RECIPES } from "./recipeBook";
import type { CuisineId } from "./recipeBook/niches";
import type { MealTarget, MealType, Recipe } from "./recipes";
import { recipeShops, recipeShopSet, type ShopFile, type ShopManifest, type ShopProduct } from "./shopProducts";
import { macroTargets } from "./targets";
import type { Goal } from "./types";

export type Loaded = { id: string; file: ShopFile; products: ShopProduct[] };
export type Candidates = Map<MealType, PlanCandidate[]>;
export type Targets = Partial<Record<MealType, MealTarget>>;
/** Loads one shop's full list (cached by the caller; app/app/_lib/shopProducts.ts loadShopFile). */
export type ShopLoader = (id: string) => Promise<{ file: ShopFile; products: ShopProduct[] }>;

// ------------------------------------------------------------------------------------------------ Meal plan's helpers

/** A diet as a cache key: only what is on, in a fixed order (false and absent mean the same to the recipes). */
export function dietKey(diet: DietPrefs): Array<[string, unknown]> {
  return Object.entries(diet)
    .filter(([, v]) => v === true || (Array.isArray(v) && v.length > 0))
    .map(([k, v]): [string, unknown] => [k, Array.isArray(v) ? [...v].sort() : v])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The worked-out recipes for a set of answers, kept while the app is open, so opening the plan again (or after step 10) doesn't redo the sums. */
const worked = new Map<string, Candidates>();
export const workKey = (shops: readonly string[], diet: DietPrefs, targets: Targets, leaveOut: readonly string[], cuisines: readonly CuisineId[] = [], asWritten = false): string =>
  JSON.stringify([[...shops].sort(), dietKey(diet), targets, [...leaveOut].sort(), [...cuisines].sort(), asWritten]);

/** Our recipes for the kinds of food chosen (cuisineRecipes: a meal with too few of them for the diet takes any kind). */
export const recipesFor = (cuisines: readonly CuisineId[], diet: DietPrefs, leaveOut: readonly string[]) => cuisineRecipes(RECIPES, cuisines, diet, leaveOut).recipes;

/** Each shop's list (loaded once and cached by `load`). */
export async function loadShops(ids: readonly string[], load: ShopLoader): Promise<Loaded[]> {
  return Promise.all(ids.map(async (id) => ({ id, ...(await load(id)) })));
}

/** How many recipes are fitted between two hand-backs to the screen. */
export const PREVIEW_CHUNK = 16;
const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * One shop's recipes, fitted PREVIEW_CHUNK at a time with a hand-back to the screen between chunks (a phone's screen would otherwise freeze for seconds), the
 * chunks merged as planCandidates orders them (mergeCandidates within one shop keeps each recipe once and sorts the same way). Null when called off.
 */
async function fitShop(recipes: readonly Recipe[], sh: Loaded, diet: DietPrefs, targets: Targets, leaveOut: readonly string[], asWritten: boolean, pause: () => Promise<void>, stopped: () => boolean): Promise<Candidates | null> {
  const parts: Candidates[] = [];
  for (let i = 0; i < recipes.length; i += PREVIEW_CHUNK) {
    await pause();
    if (stopped()) return null;
    parts.push(planCandidates(recipes.slice(i, i + PREVIEW_CHUNK), sh.products, diet, targets, leaveOut, sh.id, asWritten));
  }
  return mergeCandidates(parts);
}

/**
 * The recipes for these answers, one shop at a time (so Meal plan's screen can say which shop Pip is on), each in chunks that hand control back to the screen
 * between them (the meeting's speed finding, 20 November 2026: 3.2 s with nothing moving on a slow phone). The same candidates as fitting every recipe at
 * once; kept while the app is open.
 */
export async function workOut(shops: readonly Loaded[], diet: DietPrefs, targets: Targets, leaveOut: readonly string[], cuisines: readonly CuisineId[], onShop?: (id: string, done: string[]) => void, asWritten = false, yieldToScreen: () => Promise<void> = nextTick): Promise<Candidates> {
  const key = workKey(shops.map((s) => s.id), diet, targets, leaveOut, cuisines, asWritten);
  const known = worked.get(key);
  if (known) return known;
  const each: Candidates[] = [];
  const done: string[] = [];
  const recipes = recipesFor(cuisines, diet, leaveOut);
  for (const sh of shops) {
    onShop?.(sh.id, [...done]);
    each.push((await fitShop(recipes, sh, diet, targets, leaveOut, asWritten, yieldToScreen, () => false))!);
    done.push(sh.id);
  }
  onShop?.("", done);
  const merged = mergeCandidates(each);
  worked.set(key, merged);
  return merged;
}

/** Each candidate's better-products version (betterCandidate), worked out once per recipe and shop while the app is open. */
const betterMemo = new Map<string, PlanCandidate | null>();
export function betterFor(loaded: readonly Loaded[], targets: Targets): (c: PlanCandidate) => PlanCandidate | null {
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

/** The settings each meal's size is worked out from. */
export interface PlanPerson {
  goal: Goal;
  dailyCalories: number;
  dailyProtein?: number;
  glp1MealCap?: number;
}

/** Each meal's and snack's size for a day's shape (lib/mm/mealPlan.ts slotTargets): from the person's own daily calories and protein, under a GLP-1 cap. */
export function mealTargets(person: PlanPerson, shape: DayShape = DEFAULT_SHAPE): Targets {
  return slotTargets(shape, { kcal: person.dailyCalories, protein: macroTargets(person).protein }, person.goal === "glp1" ? person.glp1MealCap : null);
}

// ------------------------------------------------------------------------------------------------ step 10's week

/**
 * The shop a preview plans from: the first ticked shop that is in recipes, otherwise the default recipe shop (null while the manifest isn't known or no shop is
 * ready). `left`: the first shop ticked when none of them is in recipes yet ("{left} isn't in recipes yet, so this week uses {shop}."); `picked`: whether any
 * shop was ticked ("You didn't pick a shop, so these use {shop}...").
 */
export function previewShop(manifest: ShopManifest | null, ticked: readonly string[] | undefined): { shop: string | null; left: string | null; leftAll: string[]; picked: boolean } {
  const shop = recipeShopSet(manifest, null, ticked)[0] ?? null;
  const mine = ticked ?? [];
  const inRecipes = new Set(recipeShops(manifest).map((r) => r.id));
  const leftAll = shop && mine.length > 0 && !mine.some((id) => inRecipes.has(id)) ? [...mine] : [];
  return { shop, left: leftAll[0] ?? null, leftAll, picked: mine.length > 0 };
}

export interface WeekPreviewInputs {
  /** The shop to plan from (previewShop). */
  shop: string;
  /** The foods avoided (step 2): the person's own diet and allergies. */
  diet: DietPrefs;
  /** The daily numbers (step 9). */
  person: PlanPerson;
  /** The age typed was under 18: nothing is worked out, and the screen shows its words-only form. */
  under18?: boolean;
}

export interface WeekPreviewDeps {
  load: ShopLoader;
  /** Hands control back to the screen between chunks (default: a zero-length timer). */
  yieldToScreen?: () => Promise<void>;
  /** Stops the work between chunks (the person changed a number, or left the screen). */
  signal?: AbortSignal;
}

export interface WeekPreviewMeal {
  meal: MealType;
  recipeId: string;
  name: string;
}

export type WeekPreview =
  | {
      ok: true;
      shop: string;
      slots: MealType[];
      variety: Variety;
      targets: Targets;
      /** The budget the week was made for: none (the best week for the goal), as Meal plan's first open makes it. */
      budget: null;
      /** The diet the week was made for (cleanDiet), kept with the plan when the person makes it theirs. */
      diet: DietPrefs;
      /** The day the screen shows (0 = the plan's first): the first whose lunch and dinner aren't the same dish (pickShownDay). */
      day: number;
      /** The date the shop's prices were read (its list's checkedOn), said under the week. */
      checkedOn: string;
      ids: PlanIds;
      /** The meals made with the shop's better products, by "meal:id" (planForBudget). */
      better: string[];
      week: WeekPlan;
      /** The day shown (`day`), meal by meal (the screen heads it with that day's name). */
      firstDay: WeekPreviewMeal[];
      /** The seven days' average, rounded, from the recipes' own labels. */
      average: { kcal: number; protein: number };
      /** The week's shopping at the shop's shelf prices (whole packs). */
      total: number;
    }
  | {
      ok: false;
      /**
       * under18: nothing is worked out; offline: the shop's list couldn't be loaded; noRecipes: too few of our recipes for every meal; narrow: the days come out
       * more than NARROW_PREVIEW from the person's calories (too few recipes near their meal size for the diet); stopped: called off.
       */
      reason: "under18" | "offline" | "noRecipes" | "narrow" | "stopped";
    };

/** The preview is only "sized to your numbers" when its average day is within this share of the day its meals are sized to (else reason "narrow"). */
export const NARROW_PREVIEW = 0.15;

const previews = new Map<string, WeekPreview & { ok: true }>();
const narrow = new Set<string>();

/** The first two words of a dish's name, for telling two dishes apart ("Tuna and sweetcorn pasta" and "Tuna and sweetcorn pasta bake" are one dish). */
const firstWords = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");

/** The day a preview shows: the first whose lunch and dinner don't share the first two words of their names (the same dish twice reads as a mistake), else the first. */
export function pickShownDay(days: ReadonlyArray<{ meals: ReadonlyArray<{ meal: MealType; candidate: { recipe: { name: string } } }> }>): number {
  const i = days.findIndex((d) => {
    const lunch = d.meals.find((m) => m.meal === "lunch");
    const dinner = d.meals.find((m) => m.meal === "dinner");
    return !lunch || !dinner || firstWords(lunch.candidate.recipe.name) !== firstWords(dinner.candidate.recipe.name);
  });
  return i < 0 ? 0 : i;
}

/** The answers Meal plan's first open starts from: one person, Just me's defaults (see the top of this file). */
const JUST_ME = { shape: DEFAULT_SHAPE, cuisines: [] as CuisineId[], leaveOut: [] as string[], variety: PER_MEAL_RECIPES as Variety, asWritten: false };

/** One person's week from one shop, as Meal plan would make it first (see the top of this file). Never throws. */
export async function weekPreview(inputs: WeekPreviewInputs, deps: WeekPreviewDeps): Promise<WeekPreview> {
  if (inputs.under18) return { ok: false, reason: "under18" };
  const pause = deps.yieldToScreen ?? nextTick;
  const stopped = () => deps.signal?.aborted === true;
  const slots = planSlots(JUST_ME.shape);
  const targets = mealTargets(inputs.person, JUST_ME.shape);
  const key = workKey([inputs.shop], inputs.diet, targets, JUST_ME.leaveOut, JUST_ME.cuisines, JUST_ME.asWritten);
  const previewKey = `${key}|${slots.join(",")}|${JUST_ME.variety}`;
  const known = previews.get(previewKey);
  if (known) return known;
  if (narrow.has(previewKey)) return { ok: false, reason: "narrow" };

  let loaded: Loaded[];
  try {
    loaded = await loadShops([inputs.shop], deps.load);
  } catch {
    return { ok: false, reason: "offline" };
  }
  if (stopped()) return { ok: false, reason: "stopped" };

  // the recipes, fitted a chunk at a time (as workOut does for one shop), into the shared cache
  let cands = worked.get(key);
  if (!cands) {
    const fitted = await fitShop(recipesFor(JUST_ME.cuisines, inputs.diet, JUST_ME.leaveOut), loaded[0]!, inputs.diet, targets, JUST_ME.leaveOut, JUST_ME.asWritten, pause, stopped);
    if (!fitted) return { ok: false, reason: "stopped" };
    cands = fitted;
    worked.set(key, cands);
  }

  await pause();
  if (stopped()) return { ok: false, reason: "stopped" };
  // no budget: the best week for the goal, exactly as Meal plan's first open makes it (its check screen starts at "No budget")
  const plan = planForBudget(cands, null, betterFor(loaded, targets), slots, JUST_ME.variety);
  if (!plan || plan.week.days.length !== PLAN_DAYS) return { ok: false, reason: "noRecipes" };

  const days = plan.week.days;
  const average = { kcal: Math.round(days.reduce((s, d) => s + d.kcal, 0) / days.length), protein: Math.round(days.reduce((s, d) => s + d.protein, 0) / days.length) };
  // against the day the meals are sized to (the person's calories, or less under a GLP-1 meal size, which the screen explains)
  const sizedTo = slots.reduce((n, m) => n + (targets[m]?.kcal ?? 0), 0);
  if (Math.abs(average.kcal - sizedTo) > NARROW_PREVIEW * sizedTo) {
    narrow.add(previewKey);
    return { ok: false, reason: "narrow" };
  }
  const day = pickShownDay(days);
  const result: WeekPreview & { ok: true } = {
    ok: true,
    shop: inputs.shop,
    slots,
    variety: JUST_ME.variety,
    targets,
    budget: null,
    diet: cleanDiet(inputs.diet),
    day,
    checkedOn: loaded[0]!.file.checkedOn,
    ids: plan.ids,
    better: plan.better,
    week: plan.week,
    firstDay: days[day]!.meals.map((m) => ({ meal: m.meal, recipeId: m.candidate.recipe.id, name: m.candidate.recipe.name })),
    average,
    total: plan.week.shoppingCost,
  };
  previews.set(previewKey, result);
  return result;
}

/** What Meal plan saves (mm.v1.mealPlan) when the person makes the previewed week theirs: the same answers and ids its own "Make my plan" saves. */
export function savedPlanFrom(p: WeekPreview & { ok: true }, start: string): SavedPlan {
  return { shops: [p.shop], ids: p.ids, slots: p.slots, leaveOut: [], budget: p.budget, start, variety: p.variety, ...(p.better.length ? { better: p.better } : {}), diet: p.diet };
}

/** Tests only: forget the worked-out recipes and previews (each test starts from a cold cache). */
export function forgetPlanWork(): void {
  worked.clear();
  previews.clear();
  narrow.clear();
  betterMemo.clear();
}
