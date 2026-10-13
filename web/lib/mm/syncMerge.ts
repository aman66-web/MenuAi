// Sync across devices (docs/ACCOUNTS_SYNC.md): the merge rules, shared by the browser and the server so both always agree.
//
// Each synced store travels as one SyncState:
//   * a "value" store (settings) is one JSON value with the time it was last changed: the newest write wins;
//   * a "set" store (saved orders, the shopping list...) is a list of items by id, each with the time it was last changed, plus the
//     ids that were deleted and when. Merging two copies keeps, for every id, whichever happened last: a change, or a deletion. So two
//     phones never undo each other, and a deleted item stays deleted.
// The merge is the same whichever copy comes first (commutative), safe to repeat (idempotent) and needs no clock agreement beyond
// "roughly right" (a time more than 5 minutes ahead of the server's clock is treated as that far ahead, so a wrong clock can't win forever).
// Pure: no browser, Next.js or Supabase imports.

export const SYNC_STORES = ["settings", "favorites", "saved", "log", "shopping", "savedRecipes", "myRecipes", "cupboard", "compare"] as const;
export type SyncStoreName = (typeof SYNC_STORES)[number];

export const isSyncStore = (s: unknown): s is SyncStoreName => typeof s === "string" && (SYNC_STORES as readonly string[]).includes(s);

export const SYNC_KIND: Record<SyncStoreName, "value" | "set"> = {
  settings: "value",
  favorites: "set",
  saved: "set",
  log: "set",
  shopping: "set",
  savedRecipes: "set",
  myRecipes: "set",
  cupboard: "set",
  compare: "set",
};

export interface SyncValue {
  kind: "value";
  /** When it was last changed (milliseconds since 1970). */
  t: number;
  v: unknown;
}

export interface SyncItem {
  /** When this item was last added or changed. */
  t: number;
  v: unknown;
  /** The item's own date (for stores that only sync recent items): older items drop out of the synced set. */
  a?: number;
}

export interface SyncSet {
  kind: "set";
  items: Record<string, SyncItem>;
  /** Deleted ids and when. Kept for GONE_TTL_MS so a phone that was offline doesn't bring a deleted item back. */
  gone: Record<string, number>;
}

export type SyncState = SyncValue | SyncSet;

/** A deletion is remembered for 90 days. A phone offline for longer than that can bring a deleted item back (it is added again, never lost). */
export const GONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Stores that only sync recent items (by each item's own date): today's log is today's, with a day either side for time zones. */
export const SYNC_WINDOW_MS: Partial<Record<SyncStoreName, number>> = { log: 2 * 24 * 60 * 60 * 1000 };
/** A time this far ahead of the server's clock is pulled back to it. */
export const MAX_CLOCK_AHEAD_MS = 5 * 60 * 1000;

/** Limits checked on the server and the browser (the database also caps a store at 1 MB). */
export const MAX_SYNC_ITEMS = 2000;
export const MAX_SYNC_ITEM_BYTES = 16 * 1024;
export const MAX_SYNC_ID_LENGTH = 200;
export const MAX_SYNC_STATE_BYTES = 900 * 1024;

export const emptyState = (store: SyncStoreName): SyncState =>
  SYNC_KIND[store] === "value" ? { kind: "value", t: 0, v: null } : { kind: "set", items: {}, gone: {} };

/** JSON with the keys in a fixed order, so equal values always give equal text (used to compare and to break ties). */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

/** A short fingerprint of a value (not secret: only used to notice that an item changed on this device). */
export function fingerprint(value: unknown): string {
  const text = canonical(value);
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

const clampT = (t: number, now: number) => Math.min(t, now + MAX_CLOCK_AHEAD_MS);

function newerItem(a: SyncItem | undefined, b: SyncItem | undefined): SyncItem | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.t !== b.t) return a.t > b.t ? a : b;
  return canonical(a.v) >= canonical(b.v) ? a : b;
}

/** Merge two copies of the same store. `now` is the clock used to forget old deletions and items past a store's window. */
export function mergeStates(store: SyncStoreName, a: SyncState, b: SyncState, now: number): SyncState {
  if (a.kind === "value" && b.kind === "value") {
    const ta = clampT(a.t, now);
    const tb = clampT(b.t, now);
    if (ta !== tb) return ta > tb ? { kind: "value", t: ta, v: a.v } : { kind: "value", t: tb, v: b.v };
    return { kind: "value", t: ta, v: canonical(a.v) >= canonical(b.v) ? a.v : b.v };
  }
  if (a.kind !== "set" || b.kind !== "set") throw new Error("Cannot merge a value with a set");

  const window = SYNC_WINDOW_MS[store];
  const items: Record<string, SyncItem> = {};
  const gone: Record<string, number> = {};
  const ids = new Set([...Object.keys(a.items), ...Object.keys(b.items), ...Object.keys(a.gone), ...Object.keys(b.gone)]);
  for (const id of ids) {
    const alive = newerItem(a.items[id], b.items[id]);
    const clamped = alive ? { ...alive, t: clampT(alive.t, now) } : undefined;
    const deleted = Math.max(...[a.gone[id], b.gone[id]].filter((x): x is number => typeof x === "number").map((x) => clampT(x, now)), -Infinity);
    if (clamped && !(deleted >= clamped.t)) {
      if (window !== undefined && clamped.a !== undefined && clamped.a < now - window) continue; // too old to keep syncing
      items[id] = clamped;
    } else if (deleted > -Infinity && deleted > now - GONE_TTL_MS) {
      gone[id] = deleted;
    }
  }
  return { kind: "set", items, gone };
}

export function statesEqual(a: SyncState, b: SyncState): boolean {
  return canonical(a) === canonical(b);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 4e12;
const bytes = (v: unknown) => new TextEncoder().encode(canonical(v)).length;

/** Check a state that came over the network (server and browser): the right shape, sensible sizes. Returns a cleaned copy, or null. */
export function validateState(store: SyncStoreName, raw: unknown): SyncState | null {
  if (!isObject(raw)) return null;
  if (SYNC_KIND[store] === "value") {
    if (raw.kind !== "value" || !isTime(raw.t)) return null;
    if (bytes(raw.v) > MAX_SYNC_ITEM_BYTES) return null;
    return { kind: "value", t: raw.t, v: raw.v ?? null };
  }
  if (raw.kind !== "set" || !isObject(raw.items) || !isObject(raw.gone)) return null;
  const itemIds = Object.keys(raw.items);
  const goneIds = Object.keys(raw.gone);
  if (itemIds.length > MAX_SYNC_ITEMS || goneIds.length > MAX_SYNC_ITEMS * 2) return null;
  const items: Record<string, SyncItem> = {};
  for (const id of itemIds) {
    const it = raw.items[id];
    if (!id || id.length > MAX_SYNC_ID_LENGTH || !isObject(it) || !isTime(it.t) || (it.a !== undefined && !isTime(it.a))) return null;
    if (bytes(it.v) > MAX_SYNC_ITEM_BYTES) return null;
    items[id] = { t: it.t, v: it.v ?? null, ...(it.a !== undefined ? { a: it.a as number } : {}) };
  }
  const gone: Record<string, number> = {};
  for (const id of goneIds) {
    const t = raw.gone[id];
    if (!id || id.length > MAX_SYNC_ID_LENGTH || !isTime(t)) return null;
    gone[id] = t;
  }
  const state: SyncSet = { kind: "set", items, gone };
  return bytes(state) > MAX_SYNC_STATE_BYTES ? null : state;
}
