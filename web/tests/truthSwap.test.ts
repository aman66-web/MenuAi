import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { smartSwap, swapFacts, MIN_ORIGINAL_KCAL } from "../lib/mm/truth/swap";
import { passesDiet } from "../lib/mm/menu-view";
import { itemKind } from "../lib/mm/truth/itemKind";
import { NO_PREFERENCES, type Chain, type MenuItem, type Preferences } from "../lib/mm/types";

let seq = 0;
function item(name: string, category: string, calories: number, protein: number | undefined, extra: Partial<MenuItem> = {}): MenuItem {
  return {
    id: `i${++seq}`,
    name,
    category,
    serving: "",
    nutrients: protein === undefined ? { calories } : { calories, protein, carbs: 40, fat: 15 },
    tags: [],
    limitedTime: false,
    rankable: true,
    components: [],
    modifiers: [],
    ...extra,
  };
}
const chainOf = (items: MenuItem[], extra: Partial<Chain> = {}): Chain => ({
  schemaVersion: 1,
  id: "t",
  name: "T",
  cuisine: "Test",
  builderType: "standard",
  aliases: [],
  sample: true,
  source: { title: "x", url: "https://example.com", checkedOn: "2026-11-01" },
  categories: [],
  components: [],
  items,
  combinations: [],
  ...extra,
});

describe("smartSwap: chains that publish protein", () => {
  it("offers a lighter dish with at least as much protein, from the same section", () => {
    const big = item("Double burger", "Burgers", 900, 40);
    const lighter = item("Single burger", "Burgers", 560, 41);
    const heavier = item("Triple burger", "Burgers", 1100, 60);
    const lessProtein = item("Veg burger", "Burgers", 500, 15);
    const elsewhere = item("Chicken salad", "Salads", 300, 45);
    const s = smartSwap(chainOf([big, lighter, heavier, lessProtein, elsewhere]), big, NO_PREFERENCES);
    expect(s?.item.id).toBe(lighter.id);
    expect(s?.tier).toBe("protein-first");
    expect(s?.kcalSaved).toBe(340);
    expect(swapFacts(s!)).toEqual({ saves: 340, moreProtein: 1 });
  });

  it("picks the option with the most protein for its calories among those that qualify", () => {
    const orig = item("Big", "Mains", 900, 30);
    const a = item("A", "Mains", 600, 32); // share 0.213
    const b = item("B", "Mains", 650, 52); // share 0.32
    expect(smartSwap(chainOf([orig, a, b]), orig, NO_PREFERENCES)?.item.id).toBe(b.id);
  });

  it("returns null when nothing is lighter with as much protein (never a worse-protein 'swap')", () => {
    const orig = item("Big", "Mains", 900, 50);
    const less = item("Small", "Mains", 500, 20);
    expect(smartSwap(chainOf([orig, less]), orig, NO_PREFERENCES)).toBeNull();
  });

  it("ignores savings that are too small, dishes far smaller than the original, and tiny originals", () => {
    const orig = item("Big", "Mains", 800, 40);
    expect(smartSwap(chainOf([orig, item("Nearly", "Mains", 760, 45)]), orig, NO_PREFERENCES)).toBeNull(); // saves 40 kcal
    expect(smartSwap(chainOf([orig, item("Tiny", "Mains", 200, 40)]), orig, NO_PREFERENCES)).toBeNull(); // 25% of the size
    const small = item("Snack", "Mains", MIN_ORIGINAL_KCAL - 1, 10);
    expect(smartSwap(chainOf([small, item("Lighter", "Mains", 100, 10)]), small, NO_PREFERENCES)).toBeNull();
  });

  it("never swaps across kinds: a main is not swapped for a side, and a side only for a side", () => {
    const orig = item("Burger", "Menu", 700, 30);
    const side = item("Fries", "Menu", 380, 7);
    expect(smartSwap(chainOf([orig, side]), orig, NO_PREFERENCES)).toBeNull();
    const fries = item("Large fries", "Menu", 520, 7);
    expect(smartSwap(chainOf([fries, side]), fries, NO_PREFERENCES)?.item.id).toBe(side.id);
  });

  it("never swaps an add-on, a sauce or a drink, and never offers one", () => {
    const addon = item("Add 8oz sirloin", "Steaks", 500, 50);
    const lighterAddon = item("Add chicken", "Steaks", 200, 50);
    expect(smartSwap(chainOf([addon, lighterAddon]), addon, NO_PREFERENCES)).toBeNull();
    const drink = item("Large latte", "Hot drinks", 400, 20);
    expect(smartSwap(chainOf([drink, item("Small latte", "Hot drinks", 200, 12)]), drink, NO_PREFERENCES)).toBeNull();
  });

  it("skips limited-time dishes as options", () => {
    const orig = item("Big", "Mains", 900, 30);
    const seasonal = item("Seasonal", "Mains", 500, 40, { limitedTime: true });
    expect(smartSwap(chainOf([orig, seasonal]), orig, NO_PREFERENCES)).toBeNull();
  });

  it("only offers dishes the person's diet and allergy settings allow", () => {
    const orig = item("Beef burger", "Burgers", 900, 40, { tags: ["contains_beef"] });
    const beef = item("Beef single", "Burgers", 560, 42, { tags: ["contains_beef"] });
    const veg = item("Veggie burger", "Burgers", 600, 41, { tags: ["vegetarian"] });
    const nutty = item("Nutty burger", "Burgers", 580, 45, { tags: ["vegetarian"], allergens: { contains: ["nuts"], mayContain: [] } });
    const c = chainOf([orig, beef, veg, nutty]);
    expect(smartSwap(c, orig, NO_PREFERENCES)?.item.id).toBe(nutty.id); // the most protein for its calories
    expect(smartSwap(c, orig, { ...NO_PREFERENCES, vegetarianOnly: true })?.item.id).toBe(nutty.id);
    expect(smartSwap(c, orig, { ...NO_PREFERENCES, noBeef: true })?.item.id).toBe(nutty.id);
    // allergy settings drop dishes with no allergen information at all (we can't say they're free of anything), and dishes that contain the allergen
    expect(smartSwap(c, orig, { ...NO_PREFERENCES, avoidAllergens: ["nuts"] })).toBeNull();
    const veg2 = item("Veggie burger 2", "Burgers", 600, 41, { tags: ["vegetarian"], allergens: { contains: ["gluten"], mayContain: [] } });
    expect(smartSwap(chainOf([orig, beef, nutty, veg2]), orig, { ...NO_PREFERENCES, avoidAllergens: ["nuts"] })?.item.id).toBe(veg2.id);
    expect(smartSwap(chainOf([orig, beef, nutty, veg2]), orig, { ...NO_PREFERENCES, avoidAllergens: ["nuts", "gluten"] })).toBeNull();
  });

  it("is deterministic: the same inputs give the same answer, ties broken by id", () => {
    const orig = item("Big", "Mains", 900, 30);
    const a = item("A", "Mains", 600, 30);
    const b = item("B", "Mains", 600, 30);
    const first = smartSwap(chainOf([orig, a, b]), orig, NO_PREFERENCES)?.item.id;
    expect(smartSwap(chainOf([orig, b, a]), orig, NO_PREFERENCES)?.item.id).toBe(first);
  });
});

describe("smartSwap: calories-only chains", () => {
  it("offers a lower-calorie option and says nothing about protein", () => {
    const orig = item("Big pasty", "Pasties", 700, undefined);
    const mid = item("Mid pasty", "Pasties", 520, undefined);
    const small = item("Small pasty", "Pasties", 340, undefined);
    const c = chainOf([orig, mid, small], { nutritionLevel: "calories" });
    const s = smartSwap(c, orig, NO_PREFERENCES);
    expect(s?.tier).toBe("lower-calorie");
    expect(s?.item.id).toBe(small.id); // the biggest saving that is still 40% of the original
    expect(s?.proteinDiff).toBeUndefined();
    expect(swapFacts(s!)).toEqual({ saves: 360 });
  });
});

const menuDir = fileURLToPath(new URL("../public/menus/", import.meta.url));
const chains: Chain[] = readdirSync(menuDir)
  .filter((f) => f.startsWith("chain-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(menuDir + f, "utf8")) as Chain)
  .filter((c) => !c.sample);

describe("smartSwap: real menus (every chain, three different diets)", () => {
  const diets: Array<[string, Preferences]> = [
    ["no settings", NO_PREFERENCES],
    ["vegetarian", { ...NO_PREFERENCES, vegetarianOnly: true }],
    ["milk and gluten", { ...NO_PREFERENCES, avoidAllergens: ["milk", "gluten"] }],
  ];
  it.each(diets)("every swap is from the same chain and section and kind, saves what it says, and passes the diet (%s)", (_label, prefs) => {
    let swaps = 0;
    let originals = 0;
    for (const c of chains) {
      for (const it of c.items) {
        originals++;
        const s = smartSwap(c, it, prefs);
        if (!s) continue;
        swaps++;
        expect(c.items).toContain(s.item);
        expect(s.item.category).toBe(it.category);
        expect(s.item.id).not.toBe(it.id);
        expect(itemKind({ name: s.item.name, category: s.item.category, calories: s.item.nutrients.calories })).toBe(
          itemKind({ name: it.name, category: it.category, calories: it.nutrients.calories }),
        );
        expect(s.kcalSaved).toBeCloseTo(it.nutrients.calories - s.item.nutrients.calories, 6);
        expect(s.kcalSaved).toBeGreaterThanOrEqual(75);
        expect(passesDiet(s.item, prefs)).toBe(true);
        if (s.tier === "protein-first") {
          expect(c.nutritionLevel).not.toBe("calories");
          expect(s.item.nutrients.protein).toBeGreaterThanOrEqual((it.nutrients.protein as number) - 0.5);
        } else {
          expect(s.proteinDiff).toBeUndefined();
        }
      }
    }
    expect(originals).toBeGreaterThan(36000);
    expect(swaps).toBeGreaterThan(prefs === NO_PREFERENCES ? 3000 : 300);
  });
});
