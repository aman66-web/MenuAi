import { describe, expect, it } from "vitest";
import { createStore, type KeyValueStorage, type Store } from "../lib/mm/persist";
import { EMPTY_META, SyncEngine, sanitizeMeta, type SyncApi, type SyncMeta } from "../lib/mm/sync";
import { createSyncAdapters, type SyncStores } from "../lib/mm/syncStores";
import { handleSyncGet, handleSyncPut, type UserDataRow, type UserDataStore } from "../lib/sync/handlers";
import { makeLimit } from "../lib/auth/limiter";
import { AccountError } from "../lib/mm/account";
import { validateState, type SyncState, type SyncStoreName } from "../lib/mm/syncMerge";
import { DEFAULT_SETTINGS, sanitizeFavorites, sanitizeLog, sanitizeRecipeSaves, sanitizeSavedOrders, sanitizeSettings, type Favorite, type LogEntry, type SavedOrder, type UserSettings } from "../lib/mm/user-data";
import { CUSTOM_RETAILER, sanitizeShoppingList, type ShoppingItem } from "../lib/mm/groceries";
import { sanitizeSavedRecipes } from "../lib/mm/aiRecipe";
import { sanitizeCompare } from "../lib/mm/compare";

// Two (or three) pretend phones syncing through the real server code (lib/sync/handlers.ts) and the real merge rules.

const DAY = 24 * 60 * 60 * 1000;

/** public.user_data in memory (the same compare-and-swap rule as the real table). */
function serverStore() {
  const rows = new Map<string, UserDataRow>();
  let n = 0;
  const store: UserDataStore = {
    async getAll(userId) {
      return [...rows.entries()].filter(([k]) => k.startsWith(`${userId}|`)).map(([k, r]) => ({ store: k.split("|")[1], ...r }));
    },
    async get(userId, s) {
      return rows.get(`${userId}|${s}`) ?? null;
    },
    async putIfUnchanged(userId, s, value, expected) {
      const cur = rows.get(`${userId}|${s}`) ?? null;
      if ((cur?.updatedAt ?? null) !== expected) return false;
      rows.set(`${userId}|${s}`, { value, updatedAt: `v${++n}` });
      return true;
    },
  };
  return { store, rows };
}

const memory = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

interface Clock {
  now: number;
  tick(ms?: number): number;
}
const clock = (start = Date.UTC(2026, 9, 13, 12, 0, 0)): Clock => ({
  now: start,
  tick(ms = 1000) {
    this.now += ms;
    return this.now;
  },
});

function device(server: UserDataStore, clk: Clock, userId = "user-1") {
  const storage = memory();
  const stores: SyncStores = {
    settings: createStore<UserSettings>("settings", DEFAULT_SETTINGS, { sanitize: sanitizeSettings, storage }),
    favorites: createStore<Favorite[]>("favorites", [], { sanitize: sanitizeFavorites, storage }),
    saved: createStore<SavedOrder[]>("saved", [], { sanitize: sanitizeSavedOrders, storage }),
    log: createStore<LogEntry[]>("log", [], { sanitize: sanitizeLog, storage }),
    shopping: createStore<ShoppingItem[]>("shopping", [], { sanitize: sanitizeShoppingList, storage }),
    savedRecipes: createStore("savedRecipes", [], { sanitize: sanitizeRecipeSaves, storage }),
    myRecipes: createStore("myRecipes", [], { sanitize: sanitizeSavedRecipes, storage }),
    cupboard: createStore<string[]>("cupboard", [], { sanitize: (x) => (Array.isArray(x) ? (x as string[]) : []), storage }),
    compare: createStore("compare", [], { sanitize: sanitizeCompare, storage }),
  };
  const meta: Store<SyncMeta> = createStore("meta", EMPTY_META, { sanitize: sanitizeMeta, storage });
  const ctx = { data: server, limit: makeLimit(() => clk.now), now: () => clk.now };
  const calls: string[] = [];
  const hooks: { beforePut?: (name: SyncStoreName) => void; offline?: boolean } = {};
  const api: SyncApi = {
    async syncGetAll() {
      if (hooks.offline) throw new AccountError(0, "offline");
      calls.push("get");
      const r = await handleSyncGet(userId, ctx);
      const out: Partial<Record<SyncStoreName, SyncState>> = {};
      for (const [k, v] of Object.entries(r.body?.stores as Record<string, unknown>)) {
        const s = validateState(k as SyncStoreName, v);
        if (s) out[k as SyncStoreName] = s;
      }
      return out;
    },
    async syncPut(name, state) {
      if (hooks.offline) throw new AccountError(0, "offline");
      calls.push(`put ${name}`);
      hooks.beforePut?.(name);
      const r = await handleSyncPut(name, { state }, userId, ctx);
      if (r.status !== 200) throw new AccountError(r.status, String(r.body?.error));
      return r.body?.state as SyncState;
    },
  };
  const engine = new SyncEngine({ adapters: createSyncAdapters(stores), meta, api, now: () => clk.now });
  return { stores, meta, engine, calls, hooks };
}

const order = (id: string, createdAt: string, name = id): SavedOrder => ({
  id, createdAt, chainId: "kfc", chainName: "KFC", name, lines: [], nutrients: { calories: 500, protein: 30, carbs: 40, fat: 20 }, dataVersionAtSave: 1,
});
const milk = (name: string, addedAt = "2026-10-13T08:00:00.000Z"): ShoppingItem => ({ gtin: "", retailer: CUSTOM_RETAILER, name, brand: "", size: "", qty: 1, addedAt, custom: true });
const logEntry = (id: string, loggedAt: string): LogEntry => ({ id, loggedAt, chainId: "kfc", chainName: "KFC", name: id, nutrients: { calories: 300, protein: 20, carbs: 30, fat: 10 }, source: "item" });
const real = (over: Partial<UserSettings> = {}): UserSettings => ({ ...DEFAULT_SETTINGS, hasCompletedOnboarding: true, hasSetTargets: true, goal: "lose", dailyCalories: 1800, ...over });

describe("signing in on a first device", () => {
  it("sends everything up, and a second empty device receives it", async () => {
    const { store } = serverStore();
    const clk = clock();
    const phone = device(store, clk);
    phone.stores.saved.set([order("o1", "2026-10-12T10:00:00.000Z"), order("o2", "2026-10-11T10:00:00.000Z")]);
    phone.stores.shopping.set([milk("Milk")]);
    phone.stores.favorites.set([{ chainId: "kfc", addedAt: "2026-10-10T10:00:00.000Z" }]);
    phone.stores.cupboard.set(["salt", "cumin"]);
    phone.stores.settings.set(real());
    phone.engine.prepareFor("user-1");
    await phone.engine.syncNow();
    expect(phone.engine.status).toBe("idle");

    const tablet = device(store, clk);
    tablet.engine.prepareFor("user-1");
    await tablet.engine.syncNow();
    expect(tablet.stores.saved.get().map((o) => o.id)).toEqual(["o1", "o2"]); // newest first, as on the phone
    expect(tablet.stores.shopping.get().map((i) => i.name)).toEqual(["Milk"]);
    expect(tablet.stores.favorites.get().map((f) => f.chainId)).toEqual(["kfc"]);
    expect([...tablet.stores.cupboard.get()].sort()).toEqual(["cumin", "salt"]);
    expect(tablet.stores.settings.get()).toMatchObject({ goal: "lose", dailyCalories: 1800, hasCompletedOnboarding: true });
  });

  it("a device with its own saved items merges them into the account instead of replacing either", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    a.stores.saved.set([order("a1", "2026-10-12T10:00:00.000Z")]);
    a.engine.prepareFor("user-1");
    await a.engine.syncNow();
    clk.tick();
    const b = device(store, clk);
    b.stores.saved.set([order("b1", "2026-10-11T10:00:00.000Z")]);
    b.engine.prepareFor("user-1");
    await b.engine.syncNow();
    expect(b.stores.saved.get().map((o) => o.id)).toEqual(["a1", "b1"]);
    await a.engine.syncNow();
    expect(a.stores.saved.get().map((o) => o.id)).toEqual(["a1", "b1"]);
  });
});

describe("changes after that", () => {
  it("an item added on one device appears on the other, and a deletion removes it everywhere", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    const b = device(store, clk);
    a.engine.prepareFor("user-1");
    b.engine.prepareFor("user-1");
    await a.engine.syncNow();
    await b.engine.syncNow();

    clk.tick();
    a.stores.shopping.set([milk("Milk"), milk("Bread", "2026-10-13T09:00:00.000Z")]);
    await a.engine.syncNow();
    clk.tick();
    await b.engine.syncNow();
    expect(b.stores.shopping.get().map((i) => i.name)).toEqual(["Milk", "Bread"]);

    clk.tick();
    b.stores.shopping.set(b.stores.shopping.get().filter((i) => i.name !== "Milk")); // B ticked it off and removed it
    await b.engine.syncNow();
    clk.tick();
    await a.engine.syncNow();
    expect(a.stores.shopping.get().map((i) => i.name)).toEqual(["Bread"]);
  });

  it("two phones that change different things at the same time keep both changes", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    const b = device(store, clk);
    a.engine.prepareFor("user-1");
    b.engine.prepareFor("user-1");
    a.stores.saved.set([order("shared", "2026-10-12T10:00:00.000Z")]);
    await a.engine.syncNow();
    await b.engine.syncNow();
    clk.tick();
    a.stores.saved.set([...a.stores.saved.get(), order("from-a", "2026-10-13T09:00:00.000Z")]);
    b.stores.saved.set([...b.stores.saved.get(), order("from-b", "2026-10-13T09:30:00.000Z")]);
    clk.tick();
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    const ids = (d: typeof a) => d.stores.saved.get().map((o) => o.id);
    expect(ids(a)).toEqual(["from-b", "from-a", "shared"]);
    expect(ids(b)).toEqual(ids(a));
  });

  it("editing an item in place (the same id) reaches the other device, the later edit wins", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    const b = device(store, clk);
    a.engine.prepareFor("user-1");
    b.engine.prepareFor("user-1");
    a.stores.saved.set([order("o1", "2026-10-12T10:00:00.000Z", "Original")]);
    await a.engine.syncNow();
    await b.engine.syncNow();
    clk.tick();
    a.stores.saved.set([order("o1", "2026-10-12T10:00:00.000Z", "Renamed on A")]);
    await a.engine.syncNow();
    clk.tick();
    b.stores.saved.set([order("o1", "2026-10-12T10:00:00.000Z", "Renamed later on B")]);
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(a.stores.saved.get()[0].name).toBe("Renamed later on B");
    expect(b.stores.saved.get()[0].name).toBe("Renamed later on B");
  });

  it("removing something and adding it back works", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    const b = device(store, clk);
    a.engine.prepareFor("user-1");
    b.engine.prepareFor("user-1");
    a.stores.shopping.set([milk("Milk")]);
    await a.engine.syncNow();
    await b.engine.syncNow();
    clk.tick();
    a.stores.shopping.set([]);
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.stores.shopping.get()).toEqual([]);
    clk.tick();
    b.stores.shopping.set([milk("Milk", "2026-10-13T11:00:00.000Z")]);
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(a.stores.shopping.get().map((i) => i.name)).toEqual(["Milk"]);
  });

  it("a sync with nothing to send makes no writes", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    a.stores.saved.set([order("o1", "2026-10-12T10:00:00.000Z")]);
    a.engine.prepareFor("user-1");
    await a.engine.syncNow();
    a.calls.length = 0;
    clk.tick();
    await a.engine.syncNow();
    expect(a.calls).toEqual(["get"]);
  });
});

describe("offline and in-between", () => {
  it("changes made offline are kept and sent when the connection is back", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    a.engine.prepareFor("user-1");
    await a.engine.syncNow();
    a.hooks.offline = true;
    a.stores.shopping.set([milk("Eggs")]);
    await a.engine.syncNow();
    expect(a.engine.status).toBe("offline");
    expect(a.stores.shopping.get().map((i) => i.name)).toEqual(["Eggs"]); // still there on the phone
    clk.tick();
    a.hooks.offline = false;
    await a.engine.syncNow();
    expect(a.engine.status).toBe("idle");
    const b = device(store, clk);
    b.engine.prepareFor("user-1");
    await b.engine.syncNow();
    expect(b.stores.shopping.get().map((i) => i.name)).toEqual(["Eggs"]);
  });

  it("a deletion made offline is sent later too", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    const b = device(store, clk);
    a.engine.prepareFor("user-1");
    b.engine.prepareFor("user-1");
    a.stores.shopping.set([milk("Milk")]);
    await a.engine.syncNow();
    await b.engine.syncNow();
    a.hooks.offline = true;
    clk.tick();
    a.stores.shopping.set([]);
    await a.engine.syncNow(); // fails: offline
    a.hooks.offline = false;
    clk.tick();
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.stores.shopping.get()).toEqual([]);
  });

  it("something the person adds while a sync is waiting on the network is not lost", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    a.engine.prepareFor("user-1");
    a.stores.shopping.set([milk("Milk")]);
    let added = false;
    a.hooks.beforePut = (name) => {
      if (name === "shopping" && !added) {
        added = true;
        clk.tick();
        a.stores.shopping.set([...a.stores.shopping.get(), milk("Added during the sync", "2026-10-13T12:00:00.000Z")]);
      }
    };
    await a.engine.syncNow();
    expect(a.stores.shopping.get().map((i) => i.name).sort()).toEqual(["Added during the sync", "Milk"]);
    const b = device(store, clk);
    b.engine.prepareFor("user-1");
    await b.engine.syncNow();
    expect(b.stores.shopping.get().map((i) => i.name).sort()).toEqual(["Added during the sync", "Milk"]);
  });

  it("a second sync asked for while one runs follows it", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    a.engine.prepareFor("user-1");
    const first = a.engine.syncNow();
    a.stores.saved.set([order("late", "2026-10-13T10:00:00.000Z")]);
    const second = a.engine.syncNow();
    await Promise.all([first, second]);
    const b = device(store, clk);
    b.engine.prepareFor("user-1");
    await b.engine.syncNow();
    expect(b.stores.saved.get().map((o) => o.id)).toEqual(["late"]);
  });
});

describe("settings", () => {
  it("a fresh install doesn't overwrite an account's real settings, and gets them", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    a.stores.settings.set(real());
    a.engine.prepareFor("user-1");
    await a.engine.syncNow();
    clk.tick();
    const fresh = device(store, clk); // defaults, never set up
    fresh.engine.prepareFor("user-1");
    await fresh.engine.syncNow();
    expect(fresh.stores.settings.get()).toMatchObject({ goal: "lose", dailyCalories: 1800, hasCompletedOnboarding: true });
    await a.engine.syncNow();
    expect(a.stores.settings.get()).toMatchObject({ goal: "lose", dailyCalories: 1800 }); // unchanged
  });

  it("never sends untouched defaults (so they can't hide real settings later)", async () => {
    const { store, rows } = serverStore();
    const clk = clock();
    const fresh = device(store, clk);
    fresh.engine.prepareFor("user-1");
    await fresh.engine.syncNow();
    clk.tick();
    await fresh.engine.syncNow(); // and not on the next sync either
    fresh.stores.settings.set({ ...fresh.stores.settings.get(), goal: "glp1" }); // half-way through onboarding: still not set up
    clk.tick();
    await fresh.engine.syncNow();
    expect(rows.has("user-1|settings")).toBe(false);
    fresh.stores.settings.set(real({ goal: "glp1" })); // onboarding finished: now it counts
    clk.tick();
    await fresh.engine.syncNow();
    expect(rows.has("user-1|settings")).toBe(true);
  });

  it("a later change of settings on one device reaches the other; the other's own text size and language stay as they are", async () => {
    const { store } = serverStore();
    const clk = clock();
    const a = device(store, clk);
    const b = device(store, clk);
    a.stores.settings.set(real({ textSize: "large", language: "pl" }));
    a.engine.prepareFor("user-1");
    await a.engine.syncNow();
    b.engine.prepareFor("user-1");
    await b.engine.syncNow();
    b.stores.settings.set({ ...b.stores.settings.get(), textSize: "xlarge", language: "es" });
    clk.tick();
    a.stores.settings.set({ ...a.stores.settings.get(), dailyCalories: 2100, paywallDismissCount: 7 });
    await a.engine.syncNow();
    clk.tick();
    await b.engine.syncNow();
    expect(b.stores.settings.get()).toMatchObject({ dailyCalories: 2100, textSize: "xlarge", language: "es", paywallDismissCount: 0 });
  });
});

describe("today's log", () => {
  it("syncs today's entries, keeps older ones only on the phone, and isn't confused when they age out", async () => {
    const { store, rows } = serverStore();
    const clk = clock(Date.UTC(2026, 9, 13, 12, 0, 0));
    const a = device(store, clk);
    a.stores.log.set([logEntry("today", "2026-10-13T08:00:00.000Z"), logEntry("last-week", "2026-10-06T08:00:00.000Z")]);
    a.engine.prepareFor("user-1");
    await a.engine.syncNow();
    const sent = rows.get("user-1|log")!.value as { items: Record<string, unknown> };
    expect(Object.keys(sent.items)).toEqual(["today"]);

    const b = device(store, clk);
    b.engine.prepareFor("user-1");
    await b.engine.syncNow();
    expect(b.stores.log.get().map((e) => e.id)).toEqual(["today"]);

    // three days later "today" is old: it leaves the synced set without being treated as a deletion
    clk.tick(3 * DAY);
    await a.engine.syncNow();
    expect(a.stores.log.get().map((e) => e.id).sort()).toEqual(["last-week", "today"]); // still on the phone
    await b.engine.syncNow();
    expect(b.stores.log.get().map((e) => e.id)).toEqual(["today"]); // and still on the other phone
  });
});

describe("a different person on the same phone", () => {
  it("starts from a clean slate, and the first person's data isn't uploaded to the second person's account", async () => {
    const { store, rows } = serverStore();
    const clk = clock();
    const phone = device(store, clk, "user-1");
    phone.stores.saved.set([order("mine", "2026-10-12T10:00:00.000Z")]);
    phone.engine.prepareFor("user-1");
    await phone.engine.syncNow();

    // user-2 signs in on the same phone
    const sameStores = phone;
    sameStores.engine.prepareFor("user-2");
    expect(sameStores.stores.saved.get()).toEqual([]);
    expect(sameStores.meta.get().userId).toBe("user-2");
    expect(rows.has("user-2|saved")).toBe(false);
  });

  it("the same person signing back in keeps their data and carries on", async () => {
    const { store } = serverStore();
    const clk = clock();
    const phone = device(store, clk);
    phone.stores.saved.set([order("mine", "2026-10-12T10:00:00.000Z")]);
    phone.engine.prepareFor("user-1");
    await phone.engine.syncNow();
    phone.engine.prepareFor("user-1");
    expect(phone.stores.saved.get().map((o) => o.id)).toEqual(["mine"]);
  });

  it("forgetting the account leaves the data on the phone as plain device data", async () => {
    const { store } = serverStore();
    const clk = clock();
    const phone = device(store, clk);
    phone.stores.saved.set([order("mine", "2026-10-12T10:00:00.000Z")]);
    phone.engine.prepareFor("user-1");
    await phone.engine.syncNow();
    phone.engine.forget();
    expect(phone.stores.saved.get().map((o) => o.id)).toEqual(["mine"]);
    expect(phone.meta.get()).toEqual(EMPTY_META);
  });
});

describe("meta", () => {
  it("survives storage that is empty or damaged", () => {
    expect(sanitizeMeta(null)).toEqual(EMPTY_META);
    expect(sanitizeMeta({ sets: { saved: { items: { x: { h: 5, t: "no" } }, gone: { y: "no" } } } })).toEqual({ sets: { saved: { items: {}, gone: {} } }, values: {} });
  });
});
