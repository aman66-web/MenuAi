import { NO_PREFERENCES } from "../lib/mm/types";
import { describe, expect, it } from "vitest";
import { createStore, type KeyValueStorage } from "../lib/mm/persist";
import { DEFAULT_SETTINGS, sanitizeFavorites, sanitizeLog, sanitizeSavedOrders, sanitizeSettings, warnPreferences } from "../lib/mm/user-data";

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

describe("createStore", () => {
  it("round-trips through storage and notifies subscribers", () => {
    const storage = new MemoryStorage();
    const a = createStore("k", 0, { sanitize: (r) => (typeof r === "number" ? r : 0), storage });
    let calls = 0;
    const off = a.subscribe(() => calls++);
    a.set(5);
    a.update((n) => n + 1);
    expect(a.get()).toBe(6);
    expect(calls).toBe(2);
    off();
    a.set(7);
    expect(calls).toBe(2);
    // a fresh store (new page load) reads what was saved
    const b = createStore("k", 0, { sanitize: (r) => (typeof r === "number" ? r : 0), storage });
    expect(b.get()).toBe(7);
  });
  it("falls back to defaults for corrupt or foreign data", () => {
    const storage = new MemoryStorage();
    storage.setItem("k", "{not json");
    expect(createStore("k", 1, { sanitize: () => 99, storage }).get()).toBe(1);
    storage.setItem("k", JSON.stringify({ v: 2, data: 5 }));
    expect(createStore("k", 1, { sanitize: () => 99, storage }).get()).toBe(1);
  });
  it("keeps working from memory when storage is missing or throws", () => {
    const none = createStore("k", 0, { sanitize: () => 0, storage: null });
    none.set(3);
    expect(none.get()).toBe(3);
    const throwing: KeyValueStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
    const s = createStore("k", 0, { sanitize: (r) => r as number, storage: throwing });
    expect(s.get()).toBe(0);
    s.set(4);
    expect(s.get()).toBe(4);
    s.reset();
    expect(s.get()).toBe(0);
  });
  it("serves the defaults during server rendering", () => {
    const s = createStore("k", 10, { sanitize: (r) => r as number, storage: new MemoryStorage() });
    s.set(20);
    expect(s.getServerSnapshot()).toBe(10);
  });
});

describe("sign-up answers never filter (founder 2026-11-21: \"you should not filter people based on what they've put in\")", () => {
  it("an older phone's diet, saved as the filters, becomes what they told us, once, and the filters start off", () => {
    const s = sanitizeSettings({ preferences: { vegetarianOnly: true, avoidAllergens: ["peanuts"] } });
    expect(s.preferences).toEqual(NO_PREFERENCES);
    expect(s.toldUs).toEqual({ vegetarianOnly: true, noPork: false, noBeef: false, avoidAllergens: ["peanuts"] });
    expect(s.signUpApart).toBe(true);
    // after that, a filter chosen in the app stays, and so does what they told us
    const again = sanitizeSettings({ ...s, preferences: { ...NO_PREFERENCES, noPork: true } });
    expect(again.preferences.noPork).toBe(true);
    expect(again.toldUs?.vegetarianOnly).toBe(true);
  });
  it("nothing told, nothing kept; a new phone starts apart", () => {
    expect(sanitizeSettings({ preferences: {} }).toldUs).toBeUndefined();
    expect(DEFAULT_SETTINGS.signUpApart).toBe(true);
  });
  it("warnings use both: the filters and what they told us (a warning is not a filter)", () => {
    const w = warnPreferences({ preferences: { ...NO_PREFERENCES, avoidAllergens: ["milk"] }, toldUs: { ...NO_PREFERENCES, vegetarianOnly: true, avoidAllergens: ["peanuts"] } });
    expect(w.vegetarianOnly).toBe(true);
    expect(w.avoidAllergens).toEqual(["milk", "peanuts"]);
  });
});

describe("sanitizers", () => {
  it("settings: unknown or out-of-range fields fall back to defaults", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ goal: "nonsense", dailyCalories: -5, dailyProtein: "lots", preferences: 3 })).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ goal: "glp1", dailyCalories: 1500, dailyProtein: 95, hasSetTargets: true, signUpApart: true, preferences: { noPork: true } });
    expect(s).toMatchObject({ goal: "glp1", dailyCalories: 1500, dailyProtein: 95, hasSetTargets: true });
    expect(s.preferences).toEqual({ vegetarianOnly: false, noPork: true, noBeef: false });
  });
  it("settings: carb and fat targets are kept when sensible and dropped otherwise", () => {
    expect(sanitizeSettings({ dailyCalories: 2000, dailyCarbs: 250, dailyFat: 70 })).toMatchObject({ dailyCarbs: 250, dailyFat: 70 });
    const s = sanitizeSettings({ dailyCalories: 2000, dailyCarbs: -1, dailyFat: "lots" });
    expect(s.dailyCarbs).toBeUndefined();
    expect(s.dailyFat).toBeUndefined();
    expect(sanitizeSettings({ dailyCarbs: 5000 }).dailyCarbs).toBeUndefined();
  });
  it("default targets are 2,000 kcal with no protein target", () => {
    expect(DEFAULT_SETTINGS.dailyCalories).toBe(2000);
    expect(DEFAULT_SETTINGS.dailyProtein).toBeUndefined();
  });
  it("drops malformed saved orders, log entries and favourites", () => {
    expect(sanitizeSavedOrders("x")).toEqual([]);
    expect(sanitizeSavedOrders([{ id: "1" }, null])).toEqual([]);
    expect(sanitizeLog([{ id: "1", loggedAt: "garbage", name: "x", nutrients: { calories: 1, protein: 1, carbs: 1, fat: 1 } }])).toEqual([]);
    expect(sanitizeFavorites([{ chainId: "a", addedAt: "2026-10-05" }, { nope: true }])).toHaveLength(1);
  });
});

describe("withCopy (the iPhone app's Keychain copy of the sign-in, 2026-11-18)", () => {
  it("hands every change to the copy and reads as before", async () => {
    const { createStore, withCopy } = await import("../lib/mm/persist");
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const base = createStore<number | null>("t.copy", null, { sanitize: (v) => (typeof v === "number" ? v : null), storage });
    const copies: Array<number | null> = [];
    const store = withCopy(base, (v) => copies.push(v));
    store.set(1);
    store.update((v) => (v ?? 0) + 1);
    store.reset();
    expect(copies).toEqual([1, 2, null]);
    base.set(5); // a change made straight to the store underneath is not copied (restoring from the copy uses that)
    expect(store.get()).toBe(5);
    expect(copies).toEqual([1, 2, null]);
  });
});
