import { itemCode } from "./groceries";
import { sanitizeSavedRecipes } from "./aiRecipe";
import { sanitizeCompare } from "./compare";
import type { Store } from "./persist";
import { sanitizeFavorites, sanitizeLog, sanitizeRecipeSaves, sanitizeSavedOrders, sanitizeSettings, type Favorite, type LogEntry, type RecipeSave, type SavedOrder, type UserSettings } from "./user-data";
import { setAdapter, valueAdapter, type Adapter } from "./sync";
import { sanitizeShoppingList, type ShoppingItem } from "./groceries";
import type { SavedRecipe } from "./aiRecipe";
import type { CompareItem } from "./compare";

// What syncs, and how each store is identified and ordered (docs/ACCOUNTS_SYNC.md "What syncs").
// Not synced: recently viewed dishes (24 hours only), the offline menu cache, the outbox, the taken-down logos list, and the parts of the
// settings that belong to one device (text size, language, counters, "dismissed" cards, the testing switch).

const byTime = (when: (x: never) => string, direction: 1 | -1) => (a: { item: unknown; t: number }, b: { item: unknown; t: number }) =>
  direction * (Date.parse(when(a.item as never)) - Date.parse(when(b.item as never)) || a.t - b.t);

const ascending = <T>(entries: ReadonlyArray<{ item: T; t: number }>, when: (x: T) => string): T[] =>
  [...entries].sort(byTime(when as (x: never) => string, 1)).map((e) => e.item);
const descending = <T>(entries: ReadonlyArray<{ item: T; t: number }>, when: (x: T) => string): T[] =>
  [...entries].sort(byTime(when as (x: never) => string, -1)).map((e) => e.item);

/** The settings that follow the person from device to device. */
const SYNCED_SETTINGS = ["goal", "dailyCalories", "dailyProtein", "dailyCarbs", "dailyFat", "hasSetTargets", "glp1MealCap", "preferences", "hasCompletedOnboarding", "shops", "recipeMeal"] as const;

function pickSettings(s: UserSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTINGS) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

/** The stores a device has (the real ones in the browser, separate ones in tests). */
export interface SyncStores {
  settings: Store<UserSettings>;
  favorites: Store<Favorite[]>;
  saved: Store<SavedOrder[]>;
  log: Store<LogEntry[]>;
  shopping: Store<ShoppingItem[]>;
  savedRecipes: Store<RecipeSave[]>;
  myRecipes: Store<SavedRecipe[]>;
  cupboard: Store<string[]>;
  compare: Store<CompareItem[]>;
}

export const createSyncAdapters = (stores: SyncStores): Adapter[] => [
  valueAdapter<UserSettings>({
    name: "settings",
    kind: "value",
    store: stores.settings,
    pick: pickSettings,
    // checked like anything read from storage, and the per-device parts stay as they are
    apply: (local, synced) => sanitizeSettings({ ...local, ...(synced && typeof synced === "object" ? synced : {}), ...{ textSize: local.textSize, language: local.language } }),
    meaningful: (v) => typeof v === "object" && v !== null && ((v as Record<string, unknown>).hasCompletedOnboarding === true || (v as Record<string, unknown>).hasSetTargets === true),
  }),
  setAdapter({
    name: "favorites",
    kind: "set",
    store: stores.favorites,
    id: (f) => f.chainId,
    order: (e) => ascending(e, (f) => f.addedAt),
    sanitize: sanitizeFavorites,
  }),
  setAdapter({
    name: "saved",
    kind: "set",
    store: stores.saved,
    id: (o) => o.id,
    order: (e) => descending(e, (o) => o.createdAt),
    sanitize: sanitizeSavedOrders,
  }),
  setAdapter({
    name: "log",
    kind: "set",
    store: stores.log,
    id: (e) => e.id,
    age: (e) => Date.parse(e.loggedAt),
    order: (e) => ascending(e, (x) => x.loggedAt),
    sanitize: sanitizeLog,
  }),
  setAdapter({
    name: "shopping",
    kind: "set",
    store: stores.shopping,
    id: (i) => (itemCode(i) ? `${i.retailer}|${itemCode(i)}` : ""),
    order: (e) => ascending(e, (i) => i.addedAt),
    sanitize: sanitizeShoppingList,
  }),
  setAdapter({
    name: "savedRecipes",
    kind: "set",
    store: stores.savedRecipes,
    id: (r) => r.id,
    order: (e) => descending(e, (r) => r.savedAt),
    sanitize: sanitizeRecipeSaves,
  }),
  setAdapter({
    name: "myRecipes",
    kind: "set",
    store: stores.myRecipes,
    id: (r) => r.id,
    order: (e) => descending(e, (r) => r.savedAt),
    sanitize: sanitizeSavedRecipes,
  }),
  setAdapter<string>({
    name: "cupboard",
    kind: "set",
    store: stores.cupboard,
    id: (k) => k,
    order: (e) => [...e].sort((a, b) => a.t - b.t || a.item.localeCompare(b.item)).map((x) => x.item),
    sanitize: (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((k): k is string => typeof k === "string" && /^[a-z0-9-]{1,40}$/.test(k)))].slice(0, 200) : []),
  }),
  setAdapter({
    name: "compare",
    kind: "set",
    store: stores.compare,
    id: (c) => c.key,
    order: (e) => [...e].sort((a, b) => a.t - b.t).map((x) => x.item),
    sanitize: sanitizeCompare,
  }),
];
