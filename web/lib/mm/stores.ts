import { createStore } from "./persist";
import { sanitizeOutbox, OutboxSender, type OutboxItem } from "./outbox";
import { indexedDbPhotos } from "./photo-store";
import {
  DEFAULT_SETTINGS, sanitizeFavorites, sanitizeLog, sanitizeSavedOrders, sanitizeSettings,
  type Favorite, type LogEntry, type SavedOrder, type UserSettings,
} from "./user-data";

// The browser-only stores (SPEC §5 "User data"). Nothing here ever leaves the device except submissions
// the user chooses to send through the outbox.

export const settingsStore = createStore<UserSettings>("mm.v1.settings", DEFAULT_SETTINGS, { sanitize: sanitizeSettings });
export const favoritesStore = createStore<Favorite[]>("mm.v1.favorites", [], { sanitize: sanitizeFavorites });
export const savedStore = createStore<SavedOrder[]>("mm.v1.saved", [], { sanitize: sanitizeSavedOrders });
export const logStore = createStore<LogEntry[]>("mm.v1.log", [], { sanitize: sanitizeLog });
export const outboxStore = createStore<OutboxItem[]>("mm.v1.outbox", [], { sanitize: sanitizeOutbox });

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
  return saved;
}

export function deleteSavedOrder(id: string) {
  savedStore.update((list) => list.filter((o) => o.id !== id));
}

export function addLogEntry(entry: Omit<LogEntry, "id" | "loggedAt">): LogEntry {
  const logged: LogEntry = { ...entry, id: newId(), loggedAt: new Date().toISOString() };
  logStore.update((list) => [...list, logged]);
  return logged;
}

export function deleteLogEntry(id: string) {
  logStore.update((list) => list.filter((e) => e.id !== id));
}

/** Counts a successful save/log/share (drives the review-prompt style nudges later). */
export function countProAction() {
  settingsStore.update((s) => ({ ...s, proActionCount: s.proActionCount + 1 }));
}
