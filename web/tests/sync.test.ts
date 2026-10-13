import { describe, expect, it } from "vitest";
import { handleSyncGet, handleSyncPut, type SyncCtx, type UserDataRow, type UserDataStore } from "../lib/sync/handlers";
import { makeLimit } from "../lib/auth/limiter";
import type { SyncSet, SyncState, SyncValue } from "../lib/mm/syncMerge";

const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);

/** public.user_data in memory, with the same compare-and-swap rule the real table uses. */
function memoryStore(opts: { failFirstWrites?: number } = {}) {
  const rows = new Map<string, UserDataRow>();
  let clock = 0;
  let failures = opts.failFirstWrites ?? 0;
  const key = (u: string, s: string) => `${u}|${s}`;
  const store: UserDataStore = {
    async getAll(userId) {
      return [...rows.entries()].filter(([k]) => k.startsWith(`${userId}|`)).map(([k, r]) => ({ store: k.split("|")[1], ...r }));
    },
    async get(userId, s) {
      return rows.get(key(userId, s)) ?? null;
    },
    async putIfUnchanged(userId, s, value, expected) {
      const current = rows.get(key(userId, s)) ?? null;
      if (failures > 0) {
        failures--; // another device wrote in between: make our read stale
        rows.set(key(userId, s), { value: current?.value ?? value, updatedAt: `t${++clock}` });
        return false;
      }
      if ((current?.updatedAt ?? null) !== expected) return false;
      rows.set(key(userId, s), { value, updatedAt: `t${++clock}` });
      return true;
    },
  };
  return { store, rows };
}

const ctxFor = (store: UserDataStore, now = T0): SyncCtx => ({ data: store, limit: makeLimit(() => now), now: () => now });
const set = (items: Record<string, [number, unknown]> = {}, gone: Record<string, number> = {}): SyncSet => ({
  kind: "set",
  items: Object.fromEntries(Object.entries(items).map(([id, [t, v]]) => [id, { t, v }])),
  gone,
});
const put = (store: string, state: SyncState, userId: string, ctx: SyncCtx) => handleSyncPut(store, { state }, userId, ctx);

describe("sync", () => {
  it("starts empty", async () => {
    const { store } = memoryStore();
    const r = await handleSyncGet("u1", ctxFor(store));
    expect(r.status).toBe(200);
    expect(r.body?.stores).toEqual({});
  });

  it("stores what a device sends and gives it back", async () => {
    const { store } = memoryStore();
    const ctx = ctxFor(store);
    const sent = set({ milk: [T0 - 1000, { name: "Milk" }] });
    const r = await put("shopping", sent, "u1", ctx);
    expect(r.status).toBe(200);
    expect(r.body?.state).toEqual(sent);
    expect((await handleSyncGet("u1", ctx)).body?.stores).toEqual({ shopping: sent });
  });

  it("two devices end up with the same data", async () => {
    const { store } = memoryStore();
    const ctx = ctxFor(store);
    await put("saved", set({ a: [T0 - 3000, "from phone"] }), "u1", ctx);
    const fromTablet = await put("saved", set({ b: [T0 - 2000, "from tablet"] }), "u1", ctx);
    expect(Object.keys((fromTablet.body?.state as SyncSet).items).sort()).toEqual(["a", "b"]);
    const phoneAgain = await put("saved", set({ a: [T0 - 3000, "from phone"] }), "u1", ctx);
    expect(phoneAgain.body?.state).toEqual(fromTablet.body?.state);
  });

  it("a deletion on one device removes the item for the other", async () => {
    const { store } = memoryStore();
    const ctx = ctxFor(store);
    await put("saved", set({ a: [T0 - 3000, "x"] }), "u1", ctx);
    await put("saved", set({}, { a: T0 - 1000 }), "u1", ctx); // the tablet deleted it
    const phone = await put("saved", set({ a: [T0 - 3000, "x"] }), "u1", ctx); // the phone still has the old copy
    expect((phone.body?.state as SyncSet).items).toEqual({});
    expect((phone.body?.state as SyncSet).gone).toEqual({ a: T0 - 1000 });
  });

  it("settings: the newest write wins", async () => {
    const { store } = memoryStore();
    const ctx = ctxFor(store);
    const v = (t: number, goal: string): SyncValue => ({ kind: "value", t, v: { goal } });
    await put("settings", v(T0 - 2000, "lose"), "u1", ctx);
    const r = await put("settings", v(T0 - 5000, "maintain"), "u1", ctx);
    expect((r.body?.state as SyncValue).v).toEqual({ goal: "lose" });
  });

  it("keeps people apart", async () => {
    const { store } = memoryStore();
    const ctx = ctxFor(store);
    await put("saved", set({ a: [T0 - 1000, "mine"] }), "u1", ctx);
    expect((await handleSyncGet("u2", ctx)).body?.stores).toEqual({});
    const other = await put("saved", set({ b: [T0 - 1000, "theirs"] }), "u2", ctx);
    expect(Object.keys((other.body?.state as SyncSet).items)).toEqual(["b"]);
  });

  it("two devices writing at the same moment both survive (it re-reads and merges again)", async () => {
    const { store } = memoryStore({ failFirstWrites: 2 });
    const r = await put("saved", set({ a: [T0 - 1000, "x"] }), "u1", ctxFor(store));
    expect(r.status).toBe(200);
    expect((r.body?.state as SyncSet).items.a.v).toBe("x");
  });

  it("gives up with a clear message if it keeps losing the race", async () => {
    const { store } = memoryStore({ failFirstWrites: 99 });
    const r = await put("saved", set({ a: [T0 - 1000, "x"] }), "u1", ctxFor(store));
    expect(r.status).toBe(409);
  });

  it("refuses an unknown store, a wrong shape and something too big", async () => {
    const { store } = memoryStore();
    const ctx = ctxFor(store);
    expect((await put("passwords", set(), "u1", ctx)).status).toBe(404);
    expect((await handleSyncPut("saved", { state: { kind: "value", t: 1, v: 1 } }, "u1", ctx)).status).toBe(400);
    expect((await handleSyncPut("saved", null, "u1", ctx)).status).toBe(400);
    const bigSet = (prefix: string, n: number) =>
      set(Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, [T0, "x".repeat(14_000)] as [number, string]])));
    expect((await put("saved", bigSet("i", 70), "u1", ctx)).status).toBe(400); // one send over the limit
    // two sends that are each fine but together are more than we can keep
    expect((await put("saved", bigSet("a", 43), "u1", ctx)).status).toBe(200);
    const together = await put("saved", bigSet("b", 43), "u1", ctx);
    expect(together.status).toBe(413);
    expect((await handleSyncGet("u1", ctx)).body?.stores).toHaveProperty("saved"); // what was stored is untouched
  });

  it("limits how often one person can sync", async () => {
    const { store } = memoryStore();
    const ctx = ctxFor(store);
    for (let i = 0; i < 300; i++) await handleSyncGet("u1", ctx);
    expect((await handleSyncGet("u1", ctx)).status).toBe(429);
    expect((await put("saved", set(), "u1", ctx)).status).toBe(429);
    expect((await handleSyncGet("u2", ctx)).status).toBe(200);
  });

  it("leaves out stored values that are no longer valid instead of sending them on", async () => {
    const { store, rows } = memoryStore();
    rows.set("u1|saved", { value: { kind: "set", items: { x: { t: -5, v: 1 } }, gone: {} }, updatedAt: "t0" });
    rows.set("u1|log", { value: set({ ok: [T0, 1] }), updatedAt: "t0" });
    const r = await handleSyncGet("u1", ctxFor(store));
    expect(Object.keys(r.body?.stores as object)).toEqual(["log"]);
  });
});
