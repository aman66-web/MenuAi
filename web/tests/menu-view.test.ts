import { describe, expect, it } from "vitest";
import { filterItems, groupByCategory, isNewItem, sortItems } from "../lib/mm/menu-view";
import { NO_PREFERENCES } from "../lib/mm/types";
import { cluck, tinyChain } from "./fixtures";

const items = cluck().chain.items;

describe("sorting (SPEC §7.4)", () => {
  it("menu order keeps the data order", () => {
    expect(sortItems(items, "menu").map((i) => i.id)).toEqual(items.map((i) => i.id));
  });
  it("most protein first, ties by name", () => {
    const sorted = sortItems(items, "protein");
    const proteins = sorted.map((i) => i.nutrients.protein);
    expect(proteins).toEqual([...proteins].sort((a, b) => b - a));
    expect(sorted[0]!.id).toBe("nuggets-12"); // 40 g
  });
  it("fewest calories first, ties by name", () => {
    const sorted = sortItems(items, "calories");
    expect(sorted[0]!.nutrients.calories).toBe(0 + 60); // fruit cup
    const calories = sorted.map((i) => i.nutrients.calories);
    expect(calories).toEqual([...calories].sort((a, b) => a - b));
  });
  it("most protein per 100 calories first", () => {
    const sorted = sortItems(items, "density");
    expect(sorted[0]!.id).toBe("grilled-nuggets-8"); // 25 g / 130 kcal = 19.2
  });
  it("breaks ties by name so the order is stable", () => {
    const chain = tinyChain([["b", "Beta", 300, 30], ["a", "Alpha", 300, 30], ["c", "Charlie", 300, 30]]);
    for (const kind of ["protein", "calories", "density"] as const) {
      expect(sortItems(chain.items, kind).map((i) => i.name)).toEqual(["Alpha", "Beta", "Charlie"]);
    }
  });
  it("orders names case-insensitively in lists (a lower-case name isn't pushed after every capital)", () => {
    const chain = tinyChain([["z", "zebra wrap", 300, 30], ["a", "Apple bowl", 300, 30], ["m", "mango bowl", 300, 30]]);
    expect(sortItems(chain.items, "protein").map((i) => i.name)).toEqual(["Apple bowl", "mango bowl", "zebra wrap"]);
  });
  it("does not mutate its input", () => {
    const copy = [...items];
    sortItems(items, "protein");
    expect(items).toEqual(copy);
  });
});

describe("filters", () => {
  it("vegetarian keeps only vegetarian-tagged items", () => {
    const veg = filterItems(items, { ...NO_PREFERENCES, vegetarianOnly: true }).map((i) => i.id);
    expect(veg).toEqual(["waffle-fries", "fruit-cup", "side-salad", "pumpkin-shake", "lemonade", "cluck-sauce"]);
  });
  it("no pork drops pork items only", () => {
    const ids = filterItems(items, { ...NO_PREFERENCES, noPork: true }).map((i) => i.id);
    expect(ids).not.toContain("cobb-salad");
    expect(ids).toHaveLength(items.length - 1);
  });
  it("filters combine", () => {
    expect(filterItems(items, { vegetarianOnly: true, noPork: true, noBeef: true }).length).toBe(6);
    expect(filterItems(items, NO_PREFERENCES)).toHaveLength(items.length);
  });
});

describe("'New' tag", () => {
  const item = { addedOn: "2026-10-01" };
  it("is new for 30 days after addedOn", () => {
    expect(isNewItem(item, new Date(2026, 9, 1, 12))).toBe(true);
    expect(isNewItem(item, new Date(2026, 9, 31, 0, 0))).toBe(true); // day 30
    expect(isNewItem(item, new Date(2026, 10, 1, 12))).toBe(false); // day 31
  });
  it("is not new before it was added, or without a date", () => {
    expect(isNewItem(item, new Date(2026, 8, 30))).toBe(false);
    expect(isNewItem({}, new Date(2026, 9, 5))).toBe(false);
    expect(isNewItem({ addedOn: "garbage" }, new Date(2026, 9, 5))).toBe(false);
  });
});

describe("grouping", () => {
  it("groups by category in the chain's category order", () => {
    const { chain } = cluck();
    const sections = groupByCategory(chain, chain.items);
    expect(sections.map((s) => s.category)).toEqual(chain.categories);
    expect(sections.reduce((n, s) => n + s.items.length, 0)).toBe(chain.items.length);
  });
  it("drops empty categories (e.g. everything filtered out)", () => {
    const { chain } = cluck();
    const veg = filterItems(chain.items, { ...NO_PREFERENCES, vegetarianOnly: true });
    expect(groupByCategory(chain, veg).map((s) => s.category)).toEqual(["Sides", "Treats", "Drinks", "Sauces"]);
  });
});
