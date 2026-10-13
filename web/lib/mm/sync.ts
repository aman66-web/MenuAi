import type { Store } from "./persist";
import {
  GONE_TTL_MS,
  MAX_SYNC_ID_LENGTH,
  SYNC_STORES,
  SYNC_WINDOW_MS,
  canonical,
  emptyState,
  fingerprint,
  mergeStates,
  statesEqual,
  type SyncItem,
  type SyncSet,
  type SyncState,
  type SyncStoreName,
  type SyncValue,
} from "./syncMerge";

// Sync across devices, the browser's half (docs/ACCOUNTS_SYNC.md). The stores stay exactly as they are (plain lists and objects in
// localStorage); this file notices what changed on this device since the last sync, merges that with the server's copy using the shared
// rules (syncMerge.ts) and puts the result back. Nothing is lost if a sync fails halfway or the phone is offline: what this device last
// agreed on is remembered ("the base"), so the next sync finds the same changes again and sends them then.

export interface SetAdapter<T> {
  name: SyncStoreName;
  kind: "set";
  store: Store<T[]>;
  /** What identifies an item (stable across devices). */
  id(item: T): string;
  /** The item's own date in milliseconds, for stores that only sync recent items (today's log). */
  age?(item: T): number | undefined;
  /** Put merged items in this store's own order. */
  order(entries: ReadonlyArray<{ item: T; t: number }>): T[];
  /** The store's own validation of what is stored (what came from the network is checked the same way as what came from storage). */
  sanitize(raw: unknown): T[];
}

export interface ValueAdapter<S> {
  name: SyncStoreName;
  kind: "value";
  store: Store<S>;
  /** The part that syncs. Counters and other things that belong to this device stay out of it. */
  pick(local: S): unknown;
  /** Put a synced value into this device's copy, keeping the parts that stay on the device. */
  apply(local: S, synced: unknown): S;
  /** Has the person really set this up? (Fresh defaults must not overwrite an account's real settings.) */
  meaningful(synced: unknown): boolean;
}

export type Adapter = SetAdapter<unknown> | ValueAdapter<unknown>;
export const setAdapter = <T>(a: SetAdapter<T>): SetAdapter<unknown> => a as unknown as SetAdapter<unknown>;
export const valueAdapter = <S>(a: ValueAdapter<S>): ValueAdapter<unknown> => a as unknown as ValueAdapter<unknown>;

// ------------------------------------------------------------------------------------------------ what this device last agreed on

export interface SetBase {
  items: Record<string, { h: string; t: number; a?: number }>;
  gone: Record<string, number>;
}
export interface ValueBase {
  h: string;
  t: number;
}
export interface SyncMeta {
  /** Whose data this device last synced: a different person signing in here starts from a clean slate. */
  userId?: string;
  sets: Partial<Record<SyncStoreName, SetBase>>;
  values: Partial<Record<SyncStoreName, ValueBase>>;
  lastSyncAt?: number;
}
export const EMPTY_META: SyncMeta = { sets: {}, values: {} };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function sanitizeMeta(raw: unknown): SyncMeta {
  if (!isObject(raw)) return EMPTY_META;
  const sets: SyncMeta["sets"] = {};
  const values: SyncMeta["values"] = {};
  for (const name of SYNC_STORES) {
    const s = isObject(raw.sets) ? raw.sets[name] : undefined;
    if (isObject(s) && isObject(s.items) && isObject(s.gone)) {
      const items: SetBase["items"] = {};
      for (const [id, it] of Object.entries(s.items)) {
        if (isObject(it) && typeof it.h === "string" && typeof it.t === "number") items[id] = { h: it.h, t: it.t, ...(typeof it.a === "number" ? { a: it.a } : {}) };
      }
      const gone: SetBase["gone"] = {};
      for (const [id, t] of Object.entries(s.gone)) if (typeof t === "number") gone[id] = t;
      sets[name] = { items, gone };
    }
    const v = isObject(raw.values) ? raw.values[name] : undefined;
    if (isObject(v) && typeof v.h === "string" && typeof v.t === "number") values[name] = { h: v.h, t: v.t };
  }
  return {
    ...(typeof raw.userId === "string" ? { userId: raw.userId } : {}),
    sets,
    values,
    ...(typeof raw.lastSyncAt === "number" ? { lastSyncAt: raw.lastSyncAt } : {}),
  };
}

// ------------------------------------------------------------------------------------------------ sets (lists of items by id)

const windowOf = (name: SyncStoreName) => SYNC_WINDOW_MS[name];

/** Items this device can't sync: no usable id, or older than the store's sync window (today's log). They stay on the device as they are. */
function isSyncable<T>(adapter: SetAdapter<T>, item: T, now: number): boolean {
  const id = adapter.id(item);
  if (!id || id.length > MAX_SYNC_ID_LENGTH) return false;
  const w = windowOf(adapter.name);
  const a = adapter.age?.(item);
  return !(w !== undefined && a !== undefined && a < now - w);
}

/** What changed on this device since the base: added or edited items get "now", removed ones become deletions. */
export function reconcileSet<T>(adapter: SetAdapter<T>, current: readonly T[], base: SetBase | undefined, now: number): { state: SyncSet; base: SetBase } {
  const prev: SetBase = base ?? { items: {}, gone: {} };
  const w = windowOf(adapter.name);
  const items: Record<string, SyncItem> = {};
  const next: SetBase = { items: {}, gone: {} };
  for (const item of current) {
    if (!isSyncable(adapter, item, now)) continue;
    const id = adapter.id(item);
    if (id in items) continue; // the same id twice: the first one counts
    const a = adapter.age?.(item);
    const h = fingerprint(item);
    const before = prev.items[id];
    const t = before && before.h === h ? before.t : now;
    items[id] = { t, v: item, ...(a !== undefined ? { a } : {}) };
    next.items[id] = { h, t, ...(a !== undefined ? { a } : {}) };
  }
  for (const [id, before] of Object.entries(prev.items)) {
    if (id in items) continue;
    if (w !== undefined && before.a !== undefined && before.a < now - w) continue; // it aged out of the window: not a deletion
    next.gone[id] = now; // it was here at the last sync and is gone now: the person removed it
  }
  for (const [id, t] of Object.entries(prev.gone)) {
    if (id in items || id in next.gone) continue;
    if (t > now - GONE_TTL_MS) next.gone[id] = t;
  }
  return { state: { kind: "set", items, gone: { ...next.gone } }, base: next };
}

/** The store's new contents from a merged copy. Items this device doesn't sync (too old, no id) are kept as they are. */
export function applySet<T>(adapter: SetAdapter<T>, merged: SyncSet, current: readonly T[], now: number): { next: T[]; changed: boolean; base: SetBase } {
  const kept = current.filter((item) => !isSyncable(adapter, item, now));
  const entries = [
    ...Object.values(merged.items).map((it) => ({ item: it.v as T, t: it.t })),
    ...kept.map((item) => ({ item, t: 0 })),
  ];
  const next = adapter.sanitize(adapter.order(entries));
  const base: SetBase = { items: {}, gone: { ...merged.gone } };
  for (const item of next) {
    if (!isSyncable(adapter, item, now)) continue;
    const id = adapter.id(item);
    const m = merged.items[id];
    if (!m || id in base.items) continue;
    base.items[id] = { h: fingerprint(item), t: m.t, ...(m.a !== undefined ? { a: m.a } : {}) };
  }
  return { next, changed: canonical(next) !== canonical(current), base };
}

// ------------------------------------------------------------------------------------------------ values (settings)

/**
 * This device's copy of a value store as a SyncValue, or null when there is nothing worth sending.
 * Untouched defaults are never sent: they could later hide an account's real settings. An account's real settings win over a device that
 * has never been set up (and over a first sync's local ones), and settings set up here go up when the account has none yet.
 */
export function reconcileValue<S>(adapter: ValueAdapter<S>, current: S, base: ValueBase | undefined, remote: SyncState | undefined, now: number): { state: SyncValue | null; base: ValueBase } {
  const local = adapter.pick(current);
  const h = fingerprint(local);
  const remoteReal = remote?.kind === "value" && remote.t > 0 && adapter.meaningful(remote.v);
  const unchanged = base !== undefined && base.h === h;
  const t = unchanged ? base.t : adapter.meaningful(local) && !(base === undefined && remoteReal) ? now : 0;
  if (t === 0 && !remoteReal) return { state: null, base: { h, t: 0 } };
  return { state: { kind: "value", t, v: local }, base: { h, t } };
}

// ------------------------------------------------------------------------------------------------ the engine

export interface SyncApi {
  syncGetAll(): Promise<Partial<Record<SyncStoreName, SyncState>>>;
  syncPut(store: SyncStoreName, state: SyncState): Promise<SyncState>;
}

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface SyncEngineDeps {
  adapters: readonly Adapter[];
  meta: Store<SyncMeta>;
  api: SyncApi;
  now: () => number;
}

/** A store changed because a sync put merged data into it (not because the person did something): it doesn't need another sync. */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  status: SyncStatus = "idle";
  /** Set while the engine itself is writing a store, so that write isn't mistaken for the person's own change. */
  applying = false;
  private listeners = new Set<() => void>();

  constructor(private deps: SyncEngineDeps) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private setStatus(s: SyncStatus) {
    this.status = s;
    for (const l of [...this.listeners]) l();
  }

  /** Start from a clean slate when a different person signs in on this device (their data is on the server; the last person's is not theirs). */
  prepareFor(userId: string): void {
    const meta = this.deps.meta.get();
    if (meta.userId === userId) return;
    if (meta.userId !== undefined) {
      this.applying = true;
      try {
        for (const a of this.deps.adapters) a.store.reset();
      } finally {
        this.applying = false;
      }
      this.deps.meta.set({ ...EMPTY_META, userId });
    } else {
      this.deps.meta.set({ ...meta, userId }); // first account on this device: what is here is theirs and merges in
    }
  }

  /** After signing out of the account for good (deleting it): forget the account link; the data stays here as plain device data. */
  forget(): void {
    this.deps.meta.set(EMPTY_META);
    this.setStatus("idle");
  }

  /** Sync everything now. A sync already running is followed by one more (changes made meanwhile). Never throws. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.once();
        } while (this.again && this.status !== "offline" && this.status !== "error");
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private write<T>(store: Store<T>, value: T) {
    this.applying = true;
    try {
      store.set(value);
    } finally {
      this.applying = false;
    }
  }

  private patchMeta(fn: (m: SyncMeta) => SyncMeta) {
    this.deps.meta.set(fn(this.deps.meta.get()));
  }

  /** Reconcile this device's store against its base, merge with `remote`, and apply the result: all in one step, no waiting in between. */
  private cycle(adapter: Adapter, remote: SyncState | undefined): { merged: SyncState | null; push: boolean } {
    const now = this.deps.now();
    const remoteState = remote ?? emptyState(adapter.name);
    if (adapter.kind === "set") {
      const current = adapter.store.get();
      const base = this.deps.meta.get().sets[adapter.name];
      const { state } = reconcileSet(adapter, current, base, now);
      const merged = mergeStates(adapter.name, state, remoteState, now) as SyncSet;
      const applied = applySet(adapter, merged, current, now);
      if (applied.changed) this.write(adapter.store, applied.next);
      this.patchMeta((m) => ({ ...m, sets: { ...m.sets, [adapter.name]: applied.base } }));
      return { merged, push: !statesEqual(merged, remoteState) };
    }
    const current = adapter.store.get();
    const base = this.deps.meta.get().values[adapter.name];
    const rec = reconcileValue(adapter, current, base, remote, now);
    if (!rec.state) {
      this.patchMeta((m) => ({ ...m, values: { ...m.values, [adapter.name]: rec.base } }));
      return { merged: null, push: false };
    }
    const merged = mergeStates(adapter.name, rec.state, remoteState, now) as SyncValue;
    if (canonical(merged.v) !== canonical(adapter.pick(current))) this.write(adapter.store, adapter.apply(current, merged.v));
    const after: ValueBase = { h: fingerprint(adapter.pick(adapter.store.get())), t: merged.t };
    this.patchMeta((m) => ({ ...m, values: { ...m.values, [adapter.name]: after } }));
    return { merged, push: !statesEqual(merged, remoteState) };
  }

  private async once(): Promise<void> {
    this.setStatus("syncing");
    try {
      const remote = await this.deps.api.syncGetAll();
      for (const adapter of this.deps.adapters) {
        const first = this.cycle(adapter, remote[adapter.name]);
        if (!first.merged || !first.push) continue;
        const echoed = await this.deps.api.syncPut(adapter.name, first.merged);
        // The server answered with its merged copy. The person may have changed something while we waited: fold that in before applying.
        const second = this.cycle(adapter, echoed);
        if (second.push) this.again = true;
      }
      this.patchMeta((m) => ({ ...m, lastSyncAt: this.deps.now() }));
      this.setStatus("idle");
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      this.setStatus(status === 0 ? "offline" : "error");
    }
  }
}
