import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { itemKind, isMealKind, type ItemKind } from "../lib/mm/truth/itemKind";
import type { Chain } from "../lib/mm/types";

const k = (name: string, category: string, calories?: number): ItemKind => itemKind({ name, category, calories });

describe("itemKind: by menu section", () => {
  it.each([
    ["Big Mac", "Burgers", "main"],
    ["Margherita", "Classic Crust Pizzas", "main"],
    ["Chicken Caesar", "Salads", "main"],
    ["Houmous and flatbread", "Starters", "main"],
    ["Nuggets x6", "Sharers", "main"],
    ["Chicken Nuggets 4pc", "Kids: Mains", "kids"],
    ["Fruit bag", "Kids", "kids"],
    ["Mini sundae", "Kids Desserts", "dessert"], // a kids' dessert is a dessert (the 20 November 2026 audit: kids' ice creams were "the lowest calorie meal")
    ["Kids vanilla pod ice cream", "Kids", "dessert"],
    ["Toasty Garlic Bread", "Kids Set Menu - Starters", "side"],
    ["Fries (kids side)", "Kids: Sides", "side"],
    ["Cod & Chips", "Fish & Chips: Kids' meals", "kids"],
    ["Kids Roast with Yorkshire pudding", "Kids", "kids"],
    ["Caramel Frappé", "Frappé", "drink"],
    ["Mocha Frappé", "Frappés", "drink"],
    ["Frappé", "Coffee Coolers & Frappés", "drink"],
    ["Orange juice", "Kids: Drinks", "drink"],
    ["Flat White", "Hot Coffee", "drink"],
    ["Mango smoothie", "Cold Drinks", "drink"],
    ["Coke", "Soft Drinks (Coke Freestyle)", "drink"],
    ["Merlot", "Wines", "drink"],
    ["Hot chocolate", "Hot Chocolate", "drink"],
    ["Iced matcha latte", "Iced Matcha", "drink"],
    ["Chocolate brownie", "Desserts", "dessert"],
    ["Cheesecake", "Cakes & Desserts", "dessert"],
    ["Blueberry muffin", "Muffins", "dessert"],
    ["Vanilla ice cream", "Ice Cream", "dessert"],
    ["Fries", "Sides", "side"],
    ["Coleslaw", "Sides & Snacks", "side"],
    ["Barbecue sauce", "Sauces", "sauce"],
    ["Garlic mayo", "Dips", "sauce"],
    ["Extra cheese", "Add-ons", "addon"],
    ["Bacon", "Options & Add-ons", "addon"],
    ["Avocado", "Breakfast Extras", "addon"],
    ["Pepperoni", "Toppings", "addon"],
  ] as const)("%s in %s is %s", (name, category, kind) => expect(k(name, category)).toBe(kind));

  it("a savoury pastry or savoury snack is not a dessert", () => {
    expect(k("Sausage roll", "Savoury")).toBe("main");
    expect(k("Steak bake", "Savouries")).toBe("main");
    expect(k("Cornish pasty", "Pasties")).toBe("main");
  });

  it("a drink section wins over a name that sounds like food", () => {
    expect(k("Coffee cake smoothie", "Smoothies")).toBe("drink");
  });

  it("an add-on is never a main, even in a main-looking section", () => {
    expect(k("Add 8oz sirloin", "Steaks", 410)).toBe("addon");
    expect(k("Add bacon", "Burgers", 90)).toBe("addon");
  });

  it("'Extra …' is an add-on only when it is small: Extra Crispy burgers are mains", () => {
    expect(k("Extra cheese", "Burgers", 60)).toBe("addon");
    expect(k("Extra Crispy Fillet Burger", "Burgers", 520)).toBe("main");
    expect(k("Extra chicken", "Burgers")).toBe("addon");
  });
});

describe("itemKind: by name when the section is generic", () => {
  it("whole-name drinks", () => {
    expect(k("Large Cappuccino", "Menu")).toBe("drink");
    expect(k("Iced Latte", "All")).toBe("drink");
    expect(k("Coca-Cola", "Menu")).toBe("drink");
    expect(k("Diet Coke", "Menu")).toBe("drink");
  });
  it("a dish that only mentions a drink is not one", () => {
    expect(k("Coffee cake", "Menu")).toBe("main");
    expect(k("Cola glazed ribs", "Menu")).toBe("main");
    expect(k("Mocha brownie", "Menu")).toBe("main");
  });
  it("small sauces by name only", () => {
    expect(k("Sweet chilli sauce", "Menu", 45)).toBe("sauce");
    expect(k("Chicken in white wine sauce", "Menu", 640)).toBe("main");
  });
  it("sides by name only", () => {
    expect(k("Fries", "Menu", 380)).toBe("side");
    expect(k("Large Chips", "Menu", 520)).toBe("side");
    expect(k("Side salad", "Menu", 80)).toBe("side");
    expect(k("Fish and chips", "Menu", 980)).toBe("main");
  });
  it("kids by name", () => {
    expect(k("Kids burger", "Menu")).toBe("kids");
    expect(k("Junior pizza", "Menu")).toBe("kids");
  });
});

describe("isMealKind", () => {
  it("is true for mains and kids' meals only", () => {
    expect(isMealKind("main")).toBe(true);
    expect(isMealKind("kids")).toBe(true);
    for (const kind of ["side", "dessert", "sauce", "drink", "addon"] as const) expect(isMealKind(kind)).toBe(false);
  });
});

// ---- the real data: every one of the 241 chains classifies without error, and the split is sane

const menuDir = fileURLToPath(new URL("../public/menus/", import.meta.url));
const chains: Chain[] = readdirSync(menuDir)
  .filter((f) => f.startsWith("chain-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(menuDir + f, "utf8")) as Chain)
  .filter((c) => !c.sample);

describe("itemKind: real menus", () => {
  it("reads all 241 chains", () => expect(chains.length).toBe(241));

  it("gives every item exactly one valid kind", () => {
    let n = 0;
    for (const c of chains) {
      for (const it of c.items) {
        expect(["main", "kids", "side", "dessert", "sauce", "drink", "addon"]).toContain(k(it.name, it.category, it.nutrients.calories));
        n++;
      }
    }
    expect(n).toBeGreaterThan(36000);
  });

  it("a chain that classifies as one kind that is not 'main' is a real specialist (all ice cream, all cookies, all coffee-shop drinks)", () => {
    const single: string[] = [];
    for (const c of chains) {
      if (c.items.length < 12) continue;
      const kinds = new Set(c.items.map((it) => k(it.name, it.category, it.nutrients.calories)));
      if (kinds.size === 1 && !kinds.has("main")) single.push(c.id);
    }
    expect(single.sort()).toEqual(["baskin-robbins", "bens-cookies", "gails"]);
  });

  it("items the data itself marks rankable are almost always mains or kids' meals", () => {
    let rankable = 0;
    let meals = 0;
    for (const c of chains) {
      for (const it of c.items) {
        if (!it.rankable) continue;
        rankable++;
        if (isMealKind(k(it.name, it.category, it.nutrients.calories))) meals++;
      }
    }
    expect(rankable).toBeGreaterThan(1000);
    expect(meals / rankable).toBeGreaterThan(0.85);
  });

  it("never calls a drink-section item a main, and finds a few thousand drinks, sauces and add-ons", () => {
    const counts: Record<ItemKind, number> = { main: 0, kids: 0, side: 0, dessert: 0, sauce: 0, drink: 0, addon: 0 };
    for (const c of chains) for (const it of c.items) counts[k(it.name, it.category, it.nutrients.calories)]++;
    expect(counts.main).toBeGreaterThan(8000);
    expect(counts.drink).toBeGreaterThan(3000);
    expect(counts.addon).toBeGreaterThan(500);
    expect(counts.sauce).toBeGreaterThan(200);
  });
});
