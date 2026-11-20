import type { AllergenKey, Nutrients, Goal, LogMeal, Preferences } from "./types";
import { isLocale, type Locale } from "./i18n";
import { ALLERGEN_KEYS, NO_PREFERENCES } from "./types";
import { DEFAULT_DAILY_CALORIES, DEFAULT_GLP1_MEAL_CAP, LOG_MEALS } from "./budget";
import type { OrderLine } from "./order";
import { MAX_WATER_GOAL_ML, MIN_WATER_GOAL_ML } from "./water";
import { sanitizeShoppingLists, validPhoto, type PhotoSource, type ShoppingList } from "./groceries";

// User data lives only in this browser (localStorage). Nutrient snapshots let history survive menu changes.

export interface SavedOrder {
  id: string;
  createdAt: string; // ISO
  chainId: string;
  chainName: string;
  name: string;
  lines: OrderLine[];
  nutrients: Nutrients; // snapshot at save time
  dataVersionAtSave: number;
}

/** Where a logged entry came from. "custom" = numbers the person typed, "recipe" = a serving of one of our recipes, "product" = a supermarket product by weight. */
export type LogSource = "item" | "combination" | "custom" | "savedOrder" | "recipe" | "product";

export interface LogEntry {
  id: string;
  loggedAt: string; // ISO
  chainId: string;
  chainName: string;
  name: string;
  nutrients: Nutrients;
  source: LogSource;
  /** The meal row it was added to (Home's + on Breakfast, Lunch, Dinner or Snacks). Absent = the meal its time falls in (budget.ts entryMeal, SPEC §6.3). */
  meal?: LogMeal;
  /**
   * The pictures shown beside it on Home and Today (founder 2026-11-17, "use images please when possible"), kept when it was logged; older entries
   * have none. `image`: the chain's own photo of the dish, or of the first dish in the order that has one, "<chain id>/<file>.webp" as in the menu
   * files (shown through images.ts, which applies the photo switch and the taken-down list). `recipeId`: the recipe book recipe it is a serving of
   * (its picture is ours, lib/mm/recipeImages.ts). `photo`: a supermarket product's picture, kept as a shopping list item keeps one (groceries.ts
   * validPhoto). A reference only: never a Make it at home photo, which stays on the phone.
   */
  image?: string;
  recipeId?: string;
  photo?: PhotoSource;
  /** How many portions of what was logged this is, when the person changed it (usability test 2026-11-19); absent = one. The figures are already scaled. */
  portion?: number;
  /** A Scan your food estimate from a photo (CLAUDE.md rule 1's one exception), so Home's week can say it includes estimates. Kept only when exactly true. */
  estimate?: true;
}

/** The portions a logged food can be changed to. */
export const PORTIONS = [0.5, 1, 1.5, 2, 3] as const;

/** A logged food as `portion` portions of what was logged: every figure scaled from the portion it is now, to one decimal place. */
export function withPortion(e: LogEntry, portion: number): LogEntry {
  const from = e.portion ?? 1;
  const f = portion / from;
  const nutrients = Object.fromEntries(Object.entries(e.nutrients).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * f * 10) / 10 : v])) as LogEntry["nutrients"];
  const { portion: _old, ...rest } = e; // eslint-disable-line @typescript-eslint/no-unused-vars -- the old portion is replaced
  return portion === 1 ? { ...rest, nutrients } : { ...rest, nutrients, portion };
}

export interface Favorite {
  chainId: string;
  addedAt: string;
}

/** A recipe from our recipe book the person saved ("My recipes"). */
export interface RecipeSave {
  id: string;
  savedAt: string;
}

export interface UserSettings {
  goal: Goal;
  dailyCalories: number;
  dailyProtein?: number;
  /** Typed in Settings; when absent, Home works the target out from calories and protein (targets.ts suggestCarbFat). */
  dailyCarbs?: number;
  dailyFat?: number;
  /** The water goal in millilitres, typed in Settings; when absent Home uses the starting goal (water.ts DEFAULT_WATER_GOAL_ML). */
  dailyWater?: number;
  hasSetTargets: boolean;
  glp1MealCap: number;
  preferences: Preferences;
  hasCompletedOnboarding: boolean;
  dismissedTargetsCard: boolean;
  paywallDismissCount: number;
  proActionCount: number;
  /** Testing only (see config.DEV_TOOLS_ENABLED): pretend to be Pro. */
  devProOverride: boolean;
  lastMenuSyncAt?: string;
  /** How big the app's text is (Settings and onboarding): standard 100%, large 115%, xlarge 130% of the browser's own size. */
  textSize?: TextSize;
  /** The supermarkets this person shops at (retailer ids, most used first): Groceries and Recipes open on the first one. */
  shops?: string[];
  /** What Recipes fits each recipe to: a meal size (or the person's own numbers), more protein or not, or the recipes as written. */
  recipeMeal?: RecipeMeal;
  /** The app's language (lib/mm/i18n.ts), chosen on the first screen; absent = English, not chosen yet. */
  language?: Locale;
  /** The person's extra shopping lists, each for one shop (founder 2026-11-18), oldest first; absent = only the main "Shopping list". Synced. */
  shoppingLists?: ShoppingList[];
}

export interface RecipeMeal {
  size: "small" | "normal" | "big" | "custom" | "written";
  moreProtein: boolean;
  /** Only for "custom": the person's own numbers per serving. */
  kcal?: number;
  protein?: number;
  carbsMax?: number;
  fatMax?: number;
}

export type TextSize = "standard" | "large" | "xlarge";
export const TEXT_SIZES: readonly TextSize[] = ["standard", "large", "xlarge"];
export const TEXT_SCALE: Record<TextSize, number> = { standard: 100, large: 115, xlarge: 130 };

export const DEFAULT_SETTINGS: UserSettings = {
  goal: "maintain",
  dailyCalories: DEFAULT_DAILY_CALORIES,
  hasSetTargets: false,
  glp1MealCap: DEFAULT_GLP1_MEAL_CAP,
  preferences: NO_PREFERENCES,
  hasCompletedOnboarding: false,
  dismissedTargetsCard: false,
  paywallDismissCount: 0,
  proActionCount: 0,
  devProOverride: false,
};

const SHOP_ID = /^[a-z0-9-]{2,30}$/;
const MEAL_SIZES = ["small", "normal", "big", "custom", "written"] as const;

function sanitizeRecipeMeal(raw: unknown): RecipeMeal | undefined {
  if (!isObject(raw) || !MEAL_SIZES.includes(raw.size as RecipeMeal["size"])) return undefined;
  const opt = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : undefined);
  const kcal = opt(raw.kcal, 100, 3000);
  const size = raw.size === "custom" && kcal === undefined ? "normal" : (raw.size as RecipeMeal["size"]);
  const protein = opt(raw.protein, 1, 300);
  const carbsMax = opt(raw.carbsMax, 1, 500);
  const fatMax = opt(raw.fatMax, 1, 300);
  return {
    size, moreProtein: raw.moreProtein === true,
    ...(size === "custom" ? { kcal, ...(protein ? { protein } : {}), ...(carbsMax ? { carbsMax } : {}), ...(fatMax ? { fatMax } : {}) } : {}),
  };
}
const GOALS: readonly Goal[] = ["lose", "maintain", "buildMuscle", "glp1", "other"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Defensive parse of whatever is in storage: unknown/corrupt fields fall back to defaults. */
export function sanitizeSettings(raw: unknown): UserSettings {
  if (!isObject(raw)) return DEFAULT_SETTINGS;
  const prefs = isObject(raw.preferences) ? raw.preferences : {};
  const protein = typeof raw.dailyProtein === "number" && Number.isFinite(raw.dailyProtein) && raw.dailyProtein > 0 && raw.dailyProtein <= 1000 ? raw.dailyProtein : undefined;
  const grams = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 2000 ? v : undefined);
  const carbs = grams(raw.dailyCarbs);
  const fat = grams(raw.dailyFat);
  const water = typeof raw.dailyWater === "number" && Number.isFinite(raw.dailyWater) && raw.dailyWater >= MIN_WATER_GOAL_ML && raw.dailyWater <= MAX_WATER_GOAL_ML ? Math.round(raw.dailyWater) : undefined;
  return {
    goal: GOALS.includes(raw.goal as Goal) ? (raw.goal as Goal) : DEFAULT_SETTINGS.goal,
    dailyCalories: num(raw.dailyCalories, DEFAULT_SETTINGS.dailyCalories, 500, 10000),
    ...(protein !== undefined ? { dailyProtein: protein } : {}),
    ...(carbs !== undefined ? { dailyCarbs: carbs } : {}),
    ...(fat !== undefined ? { dailyFat: fat } : {}),
    ...(water !== undefined ? { dailyWater: water } : {}),
    hasSetTargets: bool(raw.hasSetTargets, false),
    glp1MealCap: num(raw.glp1MealCap, DEFAULT_SETTINGS.glp1MealCap, 100, 2000),
    preferences: {
      vegetarianOnly: bool(prefs.vegetarianOnly, false),
      noPork: bool(prefs.noPork, false),
      noBeef: bool(prefs.noBeef, false),
      ...(prefs.veganOnly === true ? { veganOnly: true } : {}),
      ...(prefs.pescatarianOnly === true ? { pescatarianOnly: true } : {}),
      ...(prefs.halalOnly === true ? { halalOnly: true } : {}),
      ...(prefs.noRedMeat === true ? { noRedMeat: true } : {}),
      ...(prefs.noOnionGarlic === true ? { noOnionGarlic: true } : {}),
      ...(prefs.jain === true ? { jain: true } : {}),
      ...(prefs.kosherStyle === true ? { kosherStyle: true } : {}),
      ...(prefs.noAlcohol === true ? { noAlcohol: true } : {}),
      ...(prefs.noHalalKosherMeat === true ? { noHalalKosherMeat: true } : {}),
      ...(Array.isArray(prefs.avoidAllergens) && prefs.avoidAllergens.some((k) => ALLERGEN_KEYS.includes(k as AllergenKey))
        ? { avoidAllergens: ALLERGEN_KEYS.filter((k) => (prefs.avoidAllergens as unknown[]).includes(k)) }
        : {}),
    },
    hasCompletedOnboarding: bool(raw.hasCompletedOnboarding, false),
    dismissedTargetsCard: bool(raw.dismissedTargetsCard, false),
    paywallDismissCount: num(raw.paywallDismissCount, 0, 0, 1e6),
    proActionCount: num(raw.proActionCount, 0, 0, 1e6),
    devProOverride: bool(raw.devProOverride, false),
    ...(typeof raw.lastMenuSyncAt === "string" ? { lastMenuSyncAt: raw.lastMenuSyncAt } : {}),
    ...(TEXT_SIZES.includes(raw.textSize as TextSize) && raw.textSize !== "standard" ? { textSize: raw.textSize as TextSize } : {}),
    ...(Array.isArray(raw.shops) && raw.shops.some((x) => typeof x === "string" && SHOP_ID.test(x))
      ? { shops: [...new Set(raw.shops.filter((x): x is string => typeof x === "string" && SHOP_ID.test(x)))].slice(0, 12) }
      : {}),
    ...(sanitizeRecipeMeal(raw.recipeMeal) ? { recipeMeal: sanitizeRecipeMeal(raw.recipeMeal) } : {}),
    ...(isLocale(raw.language) ? { language: raw.language } : {}),
    ...(sanitizeShoppingLists(raw.shoppingLists).length ? { shoppingLists: sanitizeShoppingLists(raw.shoppingLists) } : {}),
  };
}

const looksLikeNutrients = (n: unknown): n is Nutrients =>
  isObject(n) && ["calories", "protein", "carbs", "fat"].every((k) => typeof n[k] === "number" && Number.isFinite(n[k] as number));

export function sanitizeSavedOrders(raw: unknown): SavedOrder[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (o): o is SavedOrder =>
      isObject(o) && typeof o.id === "string" && typeof o.chainId === "string" && typeof o.name === "string" &&
      Array.isArray(o.lines) && looksLikeNutrients(o.nutrients) && typeof o.createdAt === "string",
  );
}

/** A logged entry needs calories; protein, carbs and fat are there when the source printed them (typed numbers can leave them out), and are never filled in. */
const looksLikeLoggedNutrients = (n: unknown): n is Nutrients =>
  isObject(n) && typeof n.calories === "number" && Number.isFinite(n.calories) &&
  ["protein", "carbs", "fat"].every((k) => n[k] === undefined || (typeof n[k] === "number" && Number.isFinite(n[k] as number)));

/** A menu photo's "<chain id>/<file>.webp", the shape the menu files write (lib/mm/images.ts checks it again before showing it). */
const LOG_IMAGE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;
/** A recipe book id, as saved recipes are checked (sanitizeRecipeSaves); a name every object already has ("constructor") is never one. */
const RECIPE_ID = /^[a-z0-9-]{1,80}$/;

export function sanitizeLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is LogEntry =>
        isObject(e) && typeof e.id === "string" && typeof e.loggedAt === "string" && !Number.isNaN(Date.parse(e.loggedAt)) &&
        typeof e.name === "string" && looksLikeLoggedNutrients(e.nutrients),
    )
    .map((e) => {
      // A meal row this app doesn't know: the entry falls back to its time. A picture reference that isn't one we would show is dropped
      // (it comes back from this phone's storage and from the sync server); the entry itself stays.
      const { meal, image, recipeId, photo, portion, estimate, ...rest } = e;
      const kept = validPhoto(photo);
      return {
        ...rest,
        ...(typeof portion === "number" && Number.isFinite(portion) && portion >= 0.25 && portion <= 10 && portion !== 1 ? { portion } : {}),
        ...(meal !== undefined && LOG_MEALS.includes(meal) ? { meal } : {}),
        ...(typeof image === "string" && image.length <= 200 && LOG_IMAGE.test(image) ? { image } : {}),
        ...(typeof recipeId === "string" && RECIPE_ID.test(recipeId) && !(recipeId in Object.prototype) ? { recipeId } : {}),
        ...(kept ? { photo: kept } : {}),
        ...(estimate === true ? { estimate: true as const } : {}),
      };
    });
}

export function sanitizeFavorites(raw: unknown): Favorite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is Favorite => isObject(f) && typeof f.chainId === "string" && typeof f.addedAt === "string");
}

export function sanitizeRecipeSaves(raw: unknown): RecipeSave[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter((r): r is RecipeSave => {
    if (!isObject(r) || typeof r.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(r.id) || typeof r.savedAt !== "string" || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).slice(0, 500);
}
