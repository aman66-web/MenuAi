import { isSyncStore, mergeStates, validateState, SYNC_STORES, type SyncState, type SyncStoreName, MAX_SYNC_STATE_BYTES } from "../mm/syncMerge";
import type { HttpResult } from "../auth/handlers";
import type { Limit } from "../auth/limiter";

// Sync across devices, the server half (docs/ACCOUNTS_SYNC.md). A signed-in person's stores live in one table, public.user_data, one row per
// store. The API merges what a device sends into what is stored (lib/mm/syncMerge.ts: the same rules the browser uses) and answers with the
// merged result, so two devices that write at the same time still end up with the same data. Pure: the table sits behind UserDataStore.

export interface UserDataRow {
  value: unknown;
  /** The row's own timestamp text, passed back unchanged to check nobody wrote in between. */
  updatedAt: string;
}

export interface UserDataStore {
  getAll(userId: string): Promise<Array<UserDataRow & { store: string }>>;
  get(userId: string, store: SyncStoreName): Promise<UserDataRow | null>;
  /** Write only if the row is still as it was read (expectedUpdatedAt null = there was no row). False means someone else wrote first. */
  putIfUnchanged(userId: string, store: SyncStoreName, value: unknown, expectedUpdatedAt: string | null): Promise<boolean>;
}

export interface SyncCtx {
  data: UserDataStore;
  limit: Limit;
  now: () => number;
}

const TEN_MIN = 10 * 60 * 1000;
const MAX_TRIES = 5;
export const MAX_SYNC_BODY_BYTES = 1024 * 1024;

const json = (status: number, body: Record<string, unknown>): HttpResult => ({ status, body });
const tooMany = json(429, { error: "rate_limited", message: "Too many tries. Please wait a few minutes and try again." });

/** Every store this person has synced. Values that no longer pass our checks are left out rather than sent on. */
export async function handleSyncGet(userId: string, ctx: SyncCtx): Promise<HttpResult> {
  if (!ctx.limit("sync", userId, 300, TEN_MIN)) return tooMany;
  const stores: Record<string, SyncState> = {};
  for (const row of await ctx.data.getAll(userId)) {
    if (!isSyncStore(row.store)) continue;
    const state = validateState(row.store, row.value);
    if (state) stores[row.store] = state;
  }
  return json(200, { ok: true, stores, known: SYNC_STORES });
}

/** Merge what a device sends into the stored copy and return the merged store. */
export async function handleSyncPut(storeName: string, raw: unknown, userId: string, ctx: SyncCtx): Promise<HttpResult> {
  if (!isSyncStore(storeName)) return json(404, { error: "not_found" });
  const sent = validateState(storeName, (raw as { state?: unknown } | null)?.state);
  if (!sent) return json(400, { error: "invalid_request", message: "That store is not in the expected shape or is too big." });
  if (!ctx.limit("sync", userId, 300, TEN_MIN)) return tooMany;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const row = await ctx.data.get(userId, storeName);
    const stored = row ? validateState(storeName, row.value) : null;
    const merged = stored ? mergeStates(storeName, stored, sent, ctx.now()) : mergeStates(storeName, sent, sent, ctx.now());
    if (new TextEncoder().encode(JSON.stringify(merged)).length > MAX_SYNC_STATE_BYTES) {
      return json(413, { error: "too_large", message: "That is more than we can sync. Remove some items and try again." });
    }
    if (await ctx.data.putIfUnchanged(userId, storeName, merged, row?.updatedAt ?? null)) return json(200, { ok: true, state: merged });
  }
  return json(409, { error: "conflict", message: "Another device was saving at the same time. Please try again." });
}
