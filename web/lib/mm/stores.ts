import { sanitizeShoppingList, type ShoppingItem } from "./groceries";
import { sanitizeSavedRecipes, type SavedRecipe } from "./aiRecipe";
import { createStore, requestPersistentStorage } from "./persist";
import { sanitizeOutbox, OutboxSender, type OutboxItem } from "./outbox";
import { indexedDbPhotos } from "./photo-store";
import { recordView, sanitizeRecent, type RecentView } from "./recent";
import { sanitizeCompare, type CompareItem } from "./compare";
import { sanitizeHiddenLogos, setHiddenLogos } from "./logos";
import { addWater, lastWaterToday, removeWater, sanitizeWater, type WaterEntry } from "./water";
import {
  isDoneToday, localDateString, markDone, MAX_REMINDERS, sanitiseReminders, undoDone, validateDraft,
  type DraftResult, type Reminder, type ReminderDraft,
} from "./reminders";
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
/** Water drunk (lib/mm/water.ts). On this device only: not one of the synced stores. */
export const waterStore = createStore<WaterEntry[]>("mm.v1.water", [], { sanitize: sanitizeWater });
/** The person's own reminders (lib/mm/reminders.ts), e.g. a weekly or daily one for medication. On this device only, never synced, never sent anywhere. */
export const remindersStore = createStore<Reminder[]>("mm.v1.reminders", [], { sanitize: sanitiseReminders });
export const outboxStore = createStore<OutboxItem[]>("mm.v1.outbox", [], { sanitize: sanitizeOutbox });
/** Groceries the user wants to buy (barcode, retailer, name, quantity). On this device only. */
export const shoppingStore = createStore<ShoppingItem[]>("mm.v1.shopping", [], { sanitize: sanitizeShoppingList });
/** Recipes Pip wrote that the person saved (the pantry kinds and amounts, rebuilt from today's products when opened). On this device only. */
export const myRecipesStore = createStore<SavedRecipe[]>("mm.v1.myRecipes", [], { sanitize: sanitizeSavedRecipes });
/** Recipes from our book the person saved ("My recipes"), newest first. On this device only. */
export const savedRecipesStore = createStore<RecipeSave[]>("mm.v1.savedRecipes", [], { sanitize: sanitizeRecipeSaves });

/** Store-cupboard ingredients (pantry kinds: salt, cumin, oil...) the person says they already have: left off a recipe's basket and shopping list,
 *  never out of its price a serving or its numbers. On this device only. */
export const cupboardStore = createStore<string[]>("mm.v1.cupboard", [], {
  sanitize: (x) => (Array.isArray(x) ? [...new Set(x.filter((k): k is string => typeof k === "string" && /^[a-z0-9-]{1,40}$/.test(k)))].slice(0, 200) : []),
});

/** Dishes opened in the last day ("Recently viewed" on the restaurant's page; lib/mm/recent.ts). On this device only. */
export const recentStore = createStore<RecentView[]>("mm.v1.recentItems", [], { sanitize: sanitizeRecent });

/** Products and dishes picked to compare side by side (lib/mm/compare.ts): copies of the figures shown. On this device only. */
export const compareStore = createStore<CompareItem[]>("mm.v1.compare", [], { sanitize: sanitizeCompare });

/** The device's copy of the website's taken-down logos list (public/logos/hidden.json; lib/mm/logos.ts). Not personal data. */
export const hiddenLogosStore = createStore<string[]>("mm.v1.hiddenLogos", [], { sanitize: sanitizeHiddenLogos });
if (typeof window !== "undefined") {
  setHiddenLogos(hiddenLogosStore.get());
  hiddenLogosStore.subscribe(() => setHiddenLogos(hiddenLogosStore.get()));
}

export function noteItemViewed(chainId: string, itemId: string) {
  recentStore.update((list) => recordView(list, chainId, itemId));
}

export function toggleCupboard(key: string) {
  cupboardStore.update((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
}

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

/** A drink of water, now. */
export function addWaterEntry(ml: number): void {
  waterStore.update((list) => addWater(list, ml, new Date(), newId()));
  requestPersistentStorage();
}

/** Take back the drink added last today (Home's Undo). */
export function undoWaterEntry(): void {
  waterStore.update((list) => {
    const last = lastWaterToday(list, new Date());
    return last ? removeWater(list, last.id) : list;
  });
}

// ---- reminders (lib/mm/reminders.ts)

/** What saving a reminder gives back: the saved reminder, whether it is new, and whether it is the first enabled one (when the phone's notification
 *  permission is asked for: only then, never at launch), or the reason it was refused (the same errors as validateDraft). */
export type SaveReminderResult = { ok: true; reminder: Reminder; created: boolean; firstEnabled: boolean } | { ok: false; error: Extract<DraftResult, { ok: false }>["error"] };

/** Add a reminder, or (the draft has the id of an existing one) change it in place: same id and date made, and today's "done" tick is kept unless the time or the repeat changed. */
export function saveReminder(draft: ReminderDraft): SaveReminderResult {
  const before = remindersStore.get();
  const result = validateDraft(draft, { existing: before, now: new Date(), newId });
  if (!result.ok) return result;
  const saved = result.reminder;
  const index = before.findIndex((r) => r.id === saved.id);
  const created = index < 0;
  const firstEnabled = saved.enabled && !before.some((r) => r.enabled); // none was ringing before this save (changing the only one that rings is not 'the first')
  remindersStore.set(created ? [...before, saved] : before.map((r) => (r.id === saved.id ? saved : r)));
  requestPersistentStorage();
  return { ok: true, reminder: saved, created, firstEnabled };
}

/** Take a reminder away; gives it back so the screen can offer Undo (restoreReminder). */
export function deleteReminder(id: string): Reminder | null {
  const found = remindersStore.get().find((r) => r.id === id) ?? null;
  if (found) remindersStore.update((list) => list.filter((r) => r.id !== id));
  return found;
}

/** Undo a delete exactly: same id, same settings, back at its place by the date it was made. False when it is already there or the limit has been reached since. */
export function restoreReminder(reminder: Reminder): boolean {
  const [clean] = sanitiseReminders([reminder]);
  const list = remindersStore.get();
  if (!clean || list.some((r) => r.id === clean.id) || list.length >= MAX_REMINDERS) return false;
  const at = list.findIndex((r) => Date.parse(r.createdAt) > Date.parse(clean.createdAt));
  remindersStore.set(at < 0 ? [...list, clean] : [...list.slice(0, at), clean, ...list.slice(at)]);
  return true;
}

/** Pause (false) or turn back on (true). A paused reminder stays in the list but is not in the plan sent to the phone. */
export function setReminderEnabled(id: string, enabled: boolean): void {
  remindersStore.update((list) => list.map((r) => (r.id === id && r.enabled !== enabled ? { ...r, enabled } : r)));
}

/** The round tick: marks the reminder done for today, or takes the tick back. Yesterday's tick no longer counts, so it resets itself. */
export function toggleReminderDone(id: string, now: Date = new Date()): void {
  remindersStore.update((list) => list.map((r) => (r.id === id ? (isDoneToday(r, now) ? undoDone(r) : markDone(r, now)) : r)));
}

/**
 * Takes away a tick dated AFTER today (the phone's date went back after the tick: a flight across the date line, a clock set back), so that day doesn't
 * arrive already "Done". Called when the app starts and comes to the front (app/app/_lib/reminderSync.ts). Dates are strict YYYY-MM-DD, so comparing the
 * text is comparing the days. Changes nothing (and writes nothing) when there is no such tick.
 */
export function dropFutureTicks(now: Date = new Date()): void {
  const today = localDateString(now);
  if (!today) return;
  const list = remindersStore.get();
  if (!list.some((r) => r.doneOn !== undefined && r.doneOn > today)) return;
  remindersStore.set(list.map((r) => (r.doneOn !== undefined && r.doneOn > today ? undoDone(r) : r)));
}

/** "Clear data on this device": empties the reminders. Whatever sends the plan to the phone (app/app/_lib/reminderSync.ts) sees the store change and
 *  sends an empty plan, which cancels every notification Numbite has scheduled. */
export function clearReminders(): void {
  remindersStore.reset();
}

/** Counts a successful save/log/share (drives the review-prompt style nudges later). */
export function countProAction() {
  settingsStore.update((s) => ({ ...s, proActionCount: s.proActionCount + 1 }));
}
