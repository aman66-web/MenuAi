import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The meeting of 21 November 2026, second pass (Violet #23): in the iPhone app the question "who is signed in?" had no time limit, so a weak signal could leave the
// whole app on "Loading…". app/app/_lib/account.ts runs here with the iPhone app's stored session and a server that answers when the test says.

const h = vi.hoisted(() => ({
  initial: new Map<string, unknown>(),
  session: (() => new Promise(() => {})) as () => Promise<unknown>,
  sessionCalls: 0,
  signOuts: 0,
}));

vi.mock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() }));
vi.mock("@/lib/mm/config", () => ({ API_BASE: "https://numbite.test/api/v1/", APP_BUILD: true }));
vi.mock("@/lib/mm/native", () => ({ hasNative: () => false, nativeCall: async () => ({ error: "unavailable" }) }));
vi.mock("@/lib/mm/persist", () => {
  const createStore = <T,>(key: string, fallback: T) => {
    let value = (h.initial.has(key) ? h.initial.get(key) : fallback) as T;
    const listeners = new Set<() => void>();
    const store = {
      get: () => value,
      getServerSnapshot: () => fallback,
      set(next: T) { value = next; listeners.forEach((l) => l()); },
      update(fn: (v: T) => T) { store.set(fn(value)); },
      reset() { store.set(fallback); },
      subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
    };
    return store;
  };
  return { createStore, withCopy: <T,>(store: T) => store };
});
vi.mock("@/lib/mm/account", () => ({
  cleanUser: (u: unknown) => u,
  sanitizeStoredSession: (s: unknown) => s ?? null,
  createAccountApi: () => ({
    session: () => { h.sessionCalls++; return h.session(); },
    signOut: async () => { h.signOuts++; },
  }),
}));
vi.mock("@/lib/mm/sync", () => ({
  EMPTY_META: { sets: {}, values: {} },
  sanitizeMeta: (m: unknown) => m,
  SyncEngine: class {
    status = "idle";
    applying = false;
    prepareFor() {}
    syncNow() { return Promise.resolve(); }
    subscribe() { return () => {}; }
    stop() {}
    forget() {}
  },
}));
vi.mock("@/lib/mm/syncStores", () => ({ createSyncAdapters: () => ({}) }));
vi.mock("@/lib/mm/homePages", () => ({ withoutArrival: (v: unknown) => v }));
vi.mock("@/lib/payments/accountAccess", () => ({ forgetAccountAccess: () => {} }));
vi.mock("../app/app/_lib/communityCache", () => ({ communityCacheStore: { reset: () => {} } }));
vi.mock("../app/app/_lib/inviteCode", () => ({ forgetInviteCode: () => {} }));
vi.mock("@/lib/mm/stores", () => {
  const fake = () => ({ get: () => undefined, set: () => {}, reset: () => {}, subscribe: () => () => {} });
  const names = ["compareStore", "cupboardStore", "earlierPlansStore", "favoritesStore", "homePagesStore", "logStore", "mealPlanStore", "myRecipesStore", "recentStore", "remindersStore", "savedRecipesStore", "savedStore", "settingsStore", "shoppingStore", "waterStore", "householdStore"];
  return Object.fromEntries(names.map((n) => [n, fake()]));
});

const ANA = { id: "user-ana", email: "ana@example.com" };
const BEN = { id: "user-ben", email: "ben@example.com" };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let online: Array<() => void> = [];
async function freshApp() {
  vi.resetModules();
  return import("../app/app/_lib/account");
}

describe("the iPhone app's sign-in check on a weak signal (Violet #23)", () => {
  beforeEach(() => {
    online = [];
    h.initial.clear();
    h.initial.set("mm.v1.session", { accessToken: "a", refreshToken: "r", expiresAt: 9e12 }); // the app holds a session; the device has no name for it yet
    h.sessionCalls = 0;
    h.signOuts = 0;
    vi.useFakeTimers();
    const listen = (type: string, fn: () => void) => { if (type === "online") online.push(fn); };
    vi.stubGlobal("window", { location: { search: "", pathname: "/app", hash: "" }, history: { state: null, replaceState: () => {} }, addEventListener: listen, removeEventListener: () => {} });
    vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stops waiting after 8 seconds (the sign-in screen shows), and a late 'signed in' still opens the app", async () => {
    const answer = deferred<unknown>();
    h.session = () => answer.promise;
    const a = await freshApp();
    expect(a.useAccountChecking()).toBe(true);
    void a.bootAccount();
    await flush();
    await vi.advanceTimersByTimeAsync(7_999);
    expect(a.useAccountChecking()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(a.useAccountChecking()).toBe(false);
    expect(a.useAccountUser()).toBeNull();
    answer.resolve(ANA);
    await flush();
    expect(a.useAccountUser()).toEqual(ANA);
  });

  it("a late 'nobody' after someone has signed in on the sign-in screen leaves them signed in", async () => {
    const answer = deferred<unknown>();
    h.session = () => answer.promise;
    const a = await freshApp();
    void a.bootAccount();
    await flush();
    await vi.advanceTimersByTimeAsync(8_000);
    a.signedIn(BEN); // the sign-in screen
    answer.resolve(null);
    await flush();
    expect(a.useAccountUser()).toEqual(BEN);
  });

  it("no signal at all: the screens open at once, and the app asks again when the signal is back", async () => {
    let up = false;
    h.session = () => (up ? Promise.resolve(ANA) : Promise.reject(new TypeError("offline")));
    const a = await freshApp();
    void a.bootAccount();
    await flush();
    expect(a.useAccountChecking()).toBe(false);
    expect(a.useAccountUser()).toBeNull();
    expect(online).toHaveLength(1);
    up = true;
    online.forEach((f) => f());
    await flush();
    expect(h.sessionCalls).toBe(2);
    expect(a.useAccountUser()).toEqual(ANA);
  });

  it("asks only once more, and not at all when someone has signed in by then", async () => {
    h.session = () => Promise.reject(new TypeError("offline"));
    const a = await freshApp();
    void a.bootAccount();
    await flush();
    a.signedIn(BEN);
    const listeners = online.splice(0); // signedIn also listens for the signal (to sync): only the retry is under test
    listeners[0]!();
    await flush();
    expect(h.sessionCalls).toBe(1);
    expect(a.useAccountUser()).toEqual(BEN);
  });
});
