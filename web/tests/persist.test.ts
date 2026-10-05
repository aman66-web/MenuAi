import { describe, expect, it } from "vitest";
import { createStore, type KeyValueStorage } from "../lib/mm/persist";
import { DEFAULT_SETTINGS, sanitizeFavorites, sanitizeLog, sanitizeSavedOrders, sanitizeSettings } from "../lib/mm/user-data";

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

describe("sanitizers", () => {
  it("settings: unknown or out-of-range fields fall back to defaults", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ goal: "nonsense", dailyCalories: -5, dailyProtein: "lots", preferences: 3 })).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ goal: "glp1", dailyCalories: 1500, dailyProtein: 95, hasSetTargets: true, preferences: { noPork: true } });
    expect(s).toMatchObject({ goal: "glp1", dailyCalories: 1500, dailyProtein: 95, hasSetTargets: true });
    expect(s.preferences).toEqual({ vegetarianOnly: false, noPork: true, noBeef: false });
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
