import { sanitizeShoppingList, type ShoppingItem } from "./groceries";
import { sanitizeSavedRecipes, type SavedRecipe } from "./aiRecipe";
import { createStore, requestPersistentStorage } from "./persist";
import { sanitizeOutbox, OutboxSender, type OutboxItem } from "./outbox";
import { indexedDbPhotos } from "./photo-store";
import {
  DEFAULT_SETTINGS, sanitizeFavorites, sanitizeLog, sanitizeRecipeSaves, sanitizeSavedOrders, sanitizeSettings,
  type Favorite, type LogEntry, type RecipeSave, type SavedOrder, type UserSettings,
} from "./user-data";

// The browser-only stores (SPEC §5 "User data"). Nothing here ever leaves the device except submissions
// the user chooses to send through the outbox.

export const settingsStore = createStore<UserSettings>("mm.v1.settings", DEFAULT_SETTINGS, { sanitize: sanitizeSettings });
export const favoritesStore = createStore<Favorite[]>("mm.v1.favorites", [], { sanitize: sanitizeFavorites });
export const savedStore = createStore<SavedOrder[]>("mm.v1.saved", [], { sanitize: sanitizeSavedOrders });
export const logStore = createStore<LogEntry[]>("mm.v1.log", [], { sanitize: sanitizeLog });
export const outboxStore = createStore<OutboxItem[]>("mm.v1.outbox", [], { sanitize: sanitizeOutbox });
/** Groceries the user wants to buy (barcode, retailer, name, quantity). On this device only. */
export const shoppingStore = createStore<ShoppingItem[]>("mm.v1.shopping", [], { sanitize: sanitizeShoppingList });
/** Recipes Pip wrote that the person saved (the pantry kinds and amounts, rebuilt from today's products when opened). On this device only. */
export const myRecipesStore = createStore<SavedRecipe[]>("mm.v1.myRecipes", [], { sanitize: sanitizeSavedRecipes });
/** Recipes from our book the person saved ("My recipes"), newest first. On this device only. */
export const savedRecipesStore = createStore<RecipeSave[]>("mm.v1.savedRecipes", [], { sanitize: sanitizeRecipeSaves });

/** Save a recipe from our book, or take it off "My recipes". */
export function toggleSavedRecipe(id: string) {
  savedRecipesStore.update((list) => (list.some((r) => r.id === id) ? list.filter((r) => r.id !== id) : [{ id, savedAt: new Date().toISOString() }, ...list]));
  requestPersistentStorage();
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let sender: OutboxSender | null = null;
/** Lazily created so server rendering never touches the browser APIs. */
export function outbox(): OutboxSender {
  sender ??= new OutboxSender({
    store: outboxStore,
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
    photos: indexedDbPhotos,
  });
  return sender;
}

export function toggleFavorite(chainId: string) {
  favoritesStore.update((list) =>
    list.some((f) => f.chainId === chainId) ? list.filter((f) => f.chainId !== chainId) : [...list, { chainId, addedAt: new Date().toISOString() }],
  );
}

export function updateSettings(patch: Partial<UserSettings>) {
  settingsStore.update((s) => ({ ...s, ...patch }));
}

export function addSavedOrder(order: Omit<SavedOrder, "id" | "createdAt">): SavedOrder {
  const saved: SavedOrder = { ...order, id: newId(), createdAt: new Date().toISOString() };
  savedStore.update((list) => [saved, ...list]);
  requestPersistentStorage();
  return saved;
}

/** Edit a saved order in place (the builder's "Save changes"): same id, same date, new lines/name/numbers. */
export function updateSavedOrder(id: string, patch: Partial<Pick<SavedOrder, "name" | "lines" | "nutrients" | "dataVersionAtSave">>) {
  savedStore.update((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
}

/** Undo a delete exactly: same id and original date, back at its place by date. */
export function restoreSavedOrder(order: SavedOrder) {
  savedStore.update((list) => (list.some((o) => o.id === order.id) ? list : [...list, order].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))));
}

export function deleteSavedOrder(id: string) {
  savedStore.update((list) => list.filter((o) => o.id !== id));
}

export function addLogEntry(entry: Omit<LogEntry, "id" | "loggedAt">): LogEntry {
  const logged: LogEntry = { ...entry, id: newId(), loggedAt: new Date().toISOString() };
  logStore.update((list) => [...list, logged]);
  requestPersistentStorage();
  return logged;
}

/** Undo a delete exactly: same id and the time it was originally logged. */
export function restoreLogEntry(entry: LogEntry) {
  logStore.update((list) => (list.some((e) => e.id === entry.id) ? list : [...list, entry]));
}

export function deleteLogEntry(id: string) {
  logStore.update((list) => list.filter((e) => e.id !== id));
}

/** Counts a successful save/log/share (drives the review-prompt style nudges later). */
export function countProAction() {
  settingsStore.update((s) => ({ ...s, proActionCount: s.proActionCount + 1 }));
}
