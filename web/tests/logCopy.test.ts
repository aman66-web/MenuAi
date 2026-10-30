import { describe, expect, it } from "vitest";
import { copyForToday, savedOrderEntry, withoutEntries } from "../lib/mm/logCopy";
import type { LogEntry, SavedOrder } from "../lib/mm/user-data";

const past: LogEntry = {
  id: "old-1",
  loggedAt: new Date(2026, 9, 18, 13, 5).toISOString(),
  chainId: "kfc",
  chainName: "KFC",
  name: "Zinger Burger",
  nutrients: { calories: 450, protein: 25, carbs: 45, fat: 19, salt: 2.3, energyKj: 1880 },
  source: "item",
};

describe("copyForToday: Add to today on a past day", () => {
  it("copies the restaurant, name, source and every figure exactly, into the same meal, with no id or time of its own", () => {
    const copy = copyForToday(past, "lunch");
    expect(copy).toEqual({ chainId: "kfc", chainName: "KFC", name: "Zinger Burger", nutrients: { calories: 450, protein: 25, carbs: 45, fat: 19, salt: 2.3, energyKj: 1880 }, source: "item", meal: "lunch" });
    expect("id" in copy).toBe(false);
    expect("loggedAt" in copy).toBe(false);
    // the figures are a copy, not the same object
    expect(copy.nutrients).not.toBe(past.nutrients);
  });

  it("keeps a figure that was never entered absent (never a 0)", () => {
    const typed: LogEntry = { ...past, id: "old-2", chainId: "", chainName: "", name: "My own numbers", source: "custom", nutrients: { calories: 300 }, meal: "dinner" };
    const copy = copyForToday(typed, "dinner");
    expect(copy.nutrients).toEqual({ calories: 300 });
    expect("protein" in copy.nutrients).toBe(false);
  });

  it("takes the meal of the section it was copied from, whatever the original's own field said", () => {
    expect(copyForToday({ ...past, meal: "breakfast" }, "breakfast").meal).toBe("breakfast");
    expect(copyForToday(past, "dinner").meal).toBe("dinner");
  });
});

describe("savedOrderEntry: Log on a saved restaurant meal", () => {
  it("is the saved order's own snapshot, as the Add food sheet logs a saved meal", () => {
    const order: SavedOrder = { id: "s1", createdAt: "2026-10-01T12:00:00.000Z", chainId: "kfc", chainName: "KFC", name: "Zinger meal", lines: [], nutrients: { calories: 900, protein: 40, carbs: 100, fat: 35 }, dataVersionAtSave: 3 };
    const e = savedOrderEntry(order);
    expect(e).toEqual({ chainId: "kfc", chainName: "KFC", name: "Zinger meal", nutrients: { calories: 900, protein: 40, carbs: 100, fat: 35 }, source: "savedOrder" });
    expect(e.nutrients).not.toBe(order.nutrients);
  });
});

describe("withoutEntries: Undo", () => {
  it("removes exactly the given ids and keeps the order of the rest", () => {
    const log = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(withoutEntries(log, new Set(["b", "d"]))).toEqual([{ id: "a" }, { id: "c" }]);
    expect(withoutEntries(log, new Set())).toEqual(log);
  });
});
