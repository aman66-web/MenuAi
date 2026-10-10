import type { AllergenKey, Nutrients, Goal, Preferences } from "./types";
import { ALLERGEN_KEYS, NO_PREFERENCES } from "./types";
import { DEFAULT_DAILY_CALORIES, DEFAULT_GLP1_MEAL_CAP } from "./budget";
import type { OrderLine } from "./order";

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

export type LogSource = "item" | "combination" | "custom" | "savedOrder";

export interface LogEntry {
  id: string;
  loggedAt: string; // ISO
  chainId: string;
  chainName: string;
  name: string;
  nutrients: Nutrients;
  source: LogSource;
}

export interface Favorite {
  chainId: string;
  addedAt: string;
}

export interface UserSettings {
  goal: Goal;
  dailyCalories: number;
  dailyProtein?: number;
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
const GOALS: readonly Goal[] = ["lose", "maintain", "buildMuscle", "glp1"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Defensive parse of whatever is in storage: unknown/corrupt fields fall back to defaults. */
export function sanitizeSettings(raw: unknown): UserSettings {
  if (!isObject(raw)) return DEFAULT_SETTINGS;
  const prefs = isObject(raw.preferences) ? raw.preferences : {};
  const protein = typeof raw.dailyProtein === "number" && Number.isFinite(raw.dailyProtein) && raw.dailyProtein > 0 && raw.dailyProtein <= 1000 ? raw.dailyProtein : undefined;
  return {
    goal: GOALS.includes(raw.goal as Goal) ? (raw.goal as Goal) : DEFAULT_SETTINGS.goal,
    dailyCalories: num(raw.dailyCalories, DEFAULT_SETTINGS.dailyCalories, 500, 10000),
    ...(protein !== undefined ? { dailyProtein: protein } : {}),
    hasSetTargets: bool(raw.hasSetTargets, false),
    glp1MealCap: num(raw.glp1MealCap, DEFAULT_SETTINGS.glp1MealCap, 100, 2000),
    preferences: {
      vegetarianOnly: bool(prefs.vegetarianOnly, false),
      noPork: bool(prefs.noPork, false),
      noBeef: bool(prefs.noBeef, false),
      ...(prefs.veganOnly === true ? { veganOnly: true } : {}),
      ...(prefs.halalOnly === true ? { halalOnly: true } : {}),
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

export function sanitizeLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is LogEntry =>
      isObject(e) && typeof e.id === "string" && typeof e.loggedAt === "string" && !Number.isNaN(Date.parse(e.loggedAt)) &&
      typeof e.name === "string" && looksLikeNutrients(e.nutrients),
  );
}

export function sanitizeFavorites(raw: unknown): Favorite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is Favorite => isObject(f) && typeof f.chainId === "string" && typeof f.addedAt === "string");
}
