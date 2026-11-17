import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { namesAllergen, passesMenuDiet, uncheckedDiet } from "../lib/mm/menu-view";
import { NO_PREFERENCES, type Chain, type MenuItem, type Preferences } from "../lib/mm/types";

// Founder 2026-11-17: restaurants must show their dishes. Diet choices a restaurant's own data can't check leave out only the dishes whose names say otherwise.
const P = (p: Partial<Preferences>): Preferences => ({ ...NO_PREFERENCES, ...p });
const item = (name: string, extra: Partial<MenuItem> = {}): MenuItem =>
  ({ id: name.toLowerCase().replace(/\W+/g, "-"), name, category: "Mains", serving: "", nutrients: { calories: 500, protein: 20, carbs: 50, fat: 20 }, tags: [], limitedTime: false, rankable: true, components: [], modifiers: [], ...extra }) as MenuItem;
const shown = (items: MenuItem[], prefs: Preferences) => { const u = uncheckedDiet(items, prefs); return items.filter((i) => passesMenuDiet(i, prefs, u)).map((i) => i.name); };

describe("a restaurant that marks no dish vegetarian", () => {
  const menu = [item("Big Mac"), item("Cheeseburger"), item("Chicken McNuggets"), item("Filet-O-Fish"), item("Fries"), item("Veggie Burger"), item("Bacon Roll"), item("Apple Pie")];
  it("shows its menu to a vegetarian with only dishes whose names say meat or fish left out", () => {
    expect(uncheckedDiet(menu, P({ vegetarianOnly: true })).vegetarian).toBe(true);
    expect(shown(menu, P({ vegetarianOnly: true }))).toEqual(["Big Mac", "Fries", "Veggie Burger", "Apple Pie"]);
  });
  it("keeps fish for a pescatarian", () => {
    expect(shown(menu, P({ pescatarianOnly: true }))).toEqual(["Big Mac", "Filet-O-Fish", "Fries", "Veggie Burger", "Apple Pie"]);
  });
  it("still leaves out a fish dish for someone avoiding fish when there are no allergen details", () => {
    expect(shown(menu, P({ pescatarianOnly: true, avoidAllergens: ["fish"] }))).not.toContain("Filet-O-Fish");
  });
});

describe("a restaurant that marks vegetarian dishes", () => {
  const menu = [item("Margherita", { tags: ["vegetarian"] }), item("Pepperoni"), item("Garlic Bread")];
  it("follows the restaurant's own marks (strict, as before)", () => {
    expect(uncheckedDiet(menu, P({ vegetarianOnly: true })).vegetarian).toBe(false);
    expect(shown(menu, P({ vegetarianOnly: true }))).toEqual(["Margherita"]);
  });
});

describe("allergens", () => {
  it("names an allergen only from the dish's own words, never promising the rest", () => {
    expect(namesAllergen({ name: "Cheese Toastie" }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "Oat Milk Latte" }, ["milk"])).toBe(false);
    expect(namesAllergen({ name: "Prawn Cocktail" }, ["crustaceans"])).toBe(true);
    expect(namesAllergen({ name: "Oyster Mushroom Bao" }, ["molluscs"])).toBe(false);
    expect(namesAllergen({ name: "Doughnut" }, ["nuts"])).toBe(false);
    expect(namesAllergen({ name: "Butternut Squash Soup" }, ["milk"])).toBe(false);
  });
  it("uses the allergen guide where the restaurant has one", () => {
    const menu = [item("Salad", { allergens: { contains: ["milk"], mayContain: [] } }), item("Soup", { allergens: { contains: [], mayContain: [] } })];
    expect(shown(menu, P({ avoidAllergens: ["milk"] }))).toEqual(["Soup"]);
  });
});

describe("every published restaurant", () => {
  const dir = new URL("../public/menus/", import.meta.url);
  const chains = readdirSync(dir).filter((f) => f.startsWith("chain-")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Chain).filter((c) => !c.sample);
  it("shows dishes to a vegetarian and to a pescatarian at every restaurant", () => {
    for (const prefs of [P({ vegetarianOnly: true }), P({ pescatarianOnly: true })]) {
      const empty = chains.filter((c) => shown(c.items, prefs).length === 0).map((c) => c.id);
      expect(empty).toEqual([]);
    }
  });
  it("never shows a dish a restaurant tags with pork to someone avoiding pork", () => {
    for (const c of chains) {
      const u = uncheckedDiet(c.items, P({ noPork: true }));
      expect(c.items.filter((i) => passesMenuDiet(i, P({ noPork: true }), u) && i.tags.includes("contains_pork")).map((i) => i.name)).toEqual([]);
    }
  });
});

describe("a restaurant that marks hardly any dish vegetarian", () => {
  it("counts as not marking them, keeping the few it does mark", () => {
    const menu = [item("Vegan Roll", { tags: ["vegetarian"] }), ...Array.from({ length: 30 }, (_, n) => item(n % 2 ? `Cheese Bake ${n}` : `Sausage Roll ${n}`))];
    expect(uncheckedDiet(menu, P({ vegetarianOnly: true })).vegetarian).toBe(true);
    const names = shown(menu, P({ vegetarianOnly: true }));
    expect(names).toContain("Vegan Roll");
    expect(names).toContain("Cheese Bake 1");
    expect(names.some((n) => n.startsWith("Sausage"))).toBe(false);
  });
});
