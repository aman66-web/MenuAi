import { describe, expect, it } from "vitest";
import { FREE_PRESET_RESULTS } from "../lib/mm/paid";
import {
  SHOWCASE_GROUPS,
  SHOWCASE_HEADING,
  dishFits,
  nearIdentical,
  presetForGoal,
  presetOrder,
  showcaseCandidates,
  showcaseChips,
  showcaseDishes,
  showcasePrefs,
  variantKey,
} from "../lib/mm/showcase";
import { applyPreset } from "../lib/mm/truth/presets";
import { NO_PREFERENCES, type Chain, type ManifestChain, type MenuItem, type Preferences } from "../lib/mm/types";
import { tinyChain } from "./fixtures";

// Step 3 of the welcome screens (the onboarding redesign meeting of 20 November 2026, build list 2): the goal's list, its fallbacks, the four kinds of place
// and the display-only dish filter. Display only: applyPreset and its constants are untouched (CLAUDE.md rule 8).

const real = (c: Chain): Chain => ({ ...c, id: c.id === "tiny" ? "testchain" : c.id, sample: false });
type Row = [string, string, number, number, MenuItem["tags"]?];
const chain = (rows: Row[], patch: (i: MenuItem) => Partial<MenuItem> = () => ({}), extra: Partial<Chain> = {}): Chain => {
  const c = real(tinyChain(rows, extra));
  return { ...c, items: c.items.map((i) => ({ ...i, category: "Mains", ...patch(i) })) };
};

describe("the goal's list (display only)", () => {
  it("maps each goal to the meeting's list, and no goal to Most protein for the calories", () => {
    expect(presetForGoal("lose")).toBe("under-500");
    expect(presetForGoal("buildMuscle")).toBe("protein-35");
    expect(presetForGoal("glp1")).toBe("small-appetite");
    expect(presetForGoal("maintain")).toBe("most-protein");
    expect(presetForGoal("other")).toBe("most-protein");
    expect(presetForGoal(undefined)).toBe("most-protein");
    expect(presetForGoal(null)).toBe("most-protein");
  });
  it("falls back to Most protein for the calories, then Under 500 calories", () => {
    expect(presetOrder("buildMuscle")).toEqual(["protein-35", "most-protein", "under-500"]);
    expect(presetOrder("glp1")).toEqual(["small-appetite", "most-protein", "under-500"]);
    expect(presetOrder("lose")).toEqual(["under-500", "most-protein"]);
    expect(presetOrder("maintain")).toEqual(["most-protein", "under-500"]);
  });
  it("heads GLP-1's list with rule 3's words, never 'Small appetite'; every heading names the restaurant", () => {
    expect(SHOWCASE_HEADING["small-appetite"]).toBe("Smaller, protein-first orders at {chain}");
    expect(SHOWCASE_HEADING).toEqual({
      "under-500": "Under 500 calories at {chain}",
      "protein-35": "35 g+ protein at {chain}",
      "small-appetite": "Smaller, protein-first orders at {chain}",
      "most-protein": "Most protein for the calories at {chain}",
    });
    for (const h of Object.values(SHOWCASE_HEADING)) {
      expect(h).toContain("{chain}");
      expect(h).not.toMatch(/small appetite|\b(good|bad|healthy|unhealthy)\b|!/i);
    }
  });
});

describe("the four kinds of place", () => {
  it("are fast food, bakery and sandwiches, coffee shops and sit-down, in the meeting's order (a plain run: McDonald's, Greggs, Costa, Nando's)", () => {
    expect(SHOWCASE_GROUPS.map((g) => g.id)).toEqual(["fastFood", "bakery", "coffee", "sitDown"]);
    expect(SHOWCASE_GROUPS.map((g) => g.chains[0])).toEqual(["mcdonalds", "greggs", "costa", "nandos"]);
    const all = SHOWCASE_GROUPS.flatMap((g) => g.chains);
    expect(new Set(all).size).toBe(all.length);
  });
  it("offers only real restaurants that publish protein and aren't taken down", () => {
    const m = (id: string, over: Partial<ManifestChain> = {}): Pick<ManifestChain, "id" | "sample" | "nutritionLevel"> => ({ id, sample: false, ...over });
    const manifest = [m("mcdonalds", { sample: true }), m("kfc"), m("burger-king", { nutritionLevel: "calories" }), m("five-guys"), m("greggs"), m("costa"), m("nandos")];
    const got = showcaseCandidates(manifest, ["five-guys"]);
    expect(got.find((g) => g.group === "fastFood")?.chainIds).toEqual(["kfc"]);
    expect(got.find((g) => g.group === "bakery")?.chainIds).toEqual(["greggs"]);
    // a restaurant missing from the manifest is left out
    expect(got.find((g) => g.group === "sitDown")?.chainIds).toEqual(["nandos"]);
  });
});

describe("the dishes", () => {
  const menu = chain([
    ["a", "Chicken Fillet Wrap", 450, 40],
    ["b", "Chicken Fillet Wrap with Ketchup", 470, 40],
    ["c", "Grilled Chicken Salad", 320, 30],
    ["d", "Big Burger", 700, 45],
    ["e", "Veggie Wrap", 400, 12, ["vegetarian"]],
    ["f", "Bean Burger", 480, 21, ["vegetarian"]],
  ]);

  it("shows the free top two of the goal's list, with the restaurant's own figures and serving", () => {
    const withServing: Chain = { ...menu, items: menu.items.map((i) => (i.id === "c" ? { ...i, serving: "1 bowl" } : i)) };
    const r = showcaseDishes(withServing, "maintain", NO_PREFERENCES)!;
    expect(r.preset).toBe("most-protein");
    expect(r.heading).toBe(SHOWCASE_HEADING["most-protein"]);
    expect(r.fallback).toBe(false);
    expect(r.dishes).toHaveLength(FREE_PRESET_RESULTS);
    const top = applyPreset("most-protein", withServing.items).filter((i) => i.id !== "b").slice(0, 2);
    expect(r.dishes.map((d) => d.itemId)).toEqual(top.map((i) => i.id));
    for (const d of r.dishes) {
      const item = withServing.items.find((i) => i.id === d.itemId)!;
      expect([d.kcal, d.protein, d.name]).toEqual([item.nutrients.calories, item.nutrients.protein, item.name]);
      expect(d.serving).toBe(item.serving.trim() || undefined);
    }
    expect(r.checkedOn).toBe(withServing.source.checkedOn);
  });

  it("skips a near-identical variant of a dish already shown", () => {
    const r = showcaseDishes(menu, "buildMuscle", NO_PREFERENCES)!;
    expect(r.preset).toBe("protein-35");
    expect(r.dishes.map((d) => d.itemId)).not.toContain("b");
    expect(r.dishes.map((d) => d.itemId).sort()).toEqual(["a", "d"]);
  });

  it("falls back when the goal's list gives fewer than two, and names the list it used", () => {
    // nothing at 400 kcal or less with 20 g protein but the salad: small-appetite gives one, so Most protein for the calories
    const r = showcaseDishes(menu, "glp1", NO_PREFERENCES)!;
    expect(r.preset).toBe("most-protein");
    expect(r.fallback).toBe(true);
    expect(r.heading).toBe(SHOWCASE_HEADING["most-protein"]);
    // vegetarian: under 20 g protein for one of the two, so Most protein gives one and Under 500 calories answers
    const veg = showcaseDishes(menu, "maintain", { ...NO_PREFERENCES, vegetarianOnly: true })!;
    expect(veg.preset).toBe("under-500");
    expect(veg.dishes.map((d) => d.itemId).sort()).toEqual(["e", "f"]);
  });

  it("gives nothing when no list has two dishes (the restaurant isn't offered)", () => {
    expect(showcaseDishes(chain([["a", "Salad", 300, 25]]), "maintain", NO_PREFERENCES)).toBeNull();
    // a sample restaurant, or one that publishes calories only, is never shown
    expect(showcaseDishes({ ...menu, sample: true }, "maintain", NO_PREFERENCES)).toBeNull();
    expect(showcaseDishes({ ...menu, nutritionLevel: "calories" }, "maintain", NO_PREFERENCES)).toBeNull();
  });
});

describe("the display-only filter", () => {
  const item = (over: Partial<MenuItem>): MenuItem => ({ ...chain([["x", "Chicken Wrap", 450, 30]]).items[0]!, ...over });
  const c = { id: "testchain" };

  it("leaves out limited-time, kids', sharing, side, drinks and part-of-a-dish items", () => {
    expect(dishFits(c, item({}), NO_PREFERENCES)).toBe(true);
    for (const [label, over] of [
      ["limited time", { limitedTime: true }],
      ["kids' section", { category: "Kids menu" }],
      ["children's section", { category: "Children’s menu" }],
      ["a sharebox", { name: "9 Chicken Selects Sharebox" }],
      ["a multipack", { name: "Pizza Box 4 Pack" }],
      ["a bucket", { name: "Family Bucket" }],
      ["a serving for several", { serving: "Serves 2-3" }],
      ["Wagamama's lighter bites", { category: "Lighter bites" }],
      ["small plates", { category: "Small plates" }],
      ["starters", { category: "Starters" }],
      ["gyoza", { category: "Gyoza" }],
      ["Pret's children's range", { category: "Little Pret Stars" }],
      ["Costa's frappés", { category: "Frappé" }],
      ["fruit coolers", { category: "Fruit Coolers" }],
      ["a jacket potato filling", { name: "Grated Cheese (jacket potato filling)" }],
      ["a burger add-on", { name: "Halloumi (burger add-on)" }],
      ["no published protein", { nutrients: { calories: 450 } }],
    ] as Array<[string, Partial<MenuItem>]>) {
      expect(dishFits(c, item(over), NO_PREFERENCES), label).toBe(false);
    }
    // "(excl. sauce)" is still the dish
    expect(dishFits(c, item({ name: "Crispy Chicken Fillet (excl. sauce)" }), NO_PREFERENCES)).toBe(true);
  });

  it("uses the app's own diet and allergy filter: an allergen listed, or no allergy information, leaves the dish out", () => {
    const listed = item({ allergens: { contains: ["milk"], mayContain: [] } });
    const free = item({ allergens: { contains: ["gluten"], mayContain: [] } });
    const unknown = item({});
    const milk: Preferences = { ...NO_PREFERENCES, avoidAllergens: ["milk"] };
    expect(dishFits(c, listed, milk)).toBe(false);
    expect(dishFits(c, item({ allergens: { contains: [], mayContain: ["milk"] } }), milk)).toBe(false);
    expect(dishFits(c, unknown, milk)).toBe(false);
    expect(dishFits(c, free, milk)).toBe(true);
    expect(dishFits(c, item({ tags: ["contains_pork"] }), { ...NO_PREFERENCES, noPork: true })).toBe(false);
    expect(dishFits(c, unknown, { ...NO_PREFERENCES, vegetarianOnly: true })).toBe(false);
    expect(dishFits(c, item({ tags: ["vegetarian"] }), { ...NO_PREFERENCES, vegetarianOnly: true })).toBe(true);
    expect(dishFits(c, item({ name: "Vegan Wrap" }), { ...NO_PREFERENCES, veganOnly: true })).toBe(true);
    expect(dishFits(c, unknown, { ...NO_PREFERENCES, veganOnly: true })).toBe(false);
  });

  it("shows halal only where the restaurant says all its food is halal", () => {
    expect(dishFits({ id: "mcdonalds" }, item({}), { ...NO_PREFERENCES, halalOnly: true })).toBe(false);
    expect(dishFits({ id: "daves-hot-chicken" }, item({}), { ...NO_PREFERENCES, halalOnly: true })).toBe(true);
  });

  it("names the newer diets a menu can't be checked for, and still uses what the restaurant's own tags can tell", () => {
    expect(showcasePrefs({ ...NO_PREFERENCES, noRedMeat: true })).toMatchObject({ noPork: true, noBeef: true });
    expect(showcasePrefs({ ...NO_PREFERENCES, kosherStyle: true })).toMatchObject({ noPork: true, noBeef: false });
    expect(showcasePrefs({ ...NO_PREFERENCES, jain: true })).toMatchObject({ vegetarianOnly: true });
    expect(dishFits(c, item({ tags: ["contains_beef"] }), { ...NO_PREFERENCES, noRedMeat: true })).toBe(false);
    const menu = chain([["a", "Chicken Wrap", 450, 40], ["b", "Grilled Chicken Salad", 320, 30], ["c", "Beef Burger", 700, 45, ["contains_beef"]]]);
    const r = showcaseDishes(menu, "maintain", { ...NO_PREFERENCES, noRedMeat: true, noAlcohol: true })!;
    expect(r.dishes.map((d) => d.itemId)).not.toContain("c");
    expect(r.notChecked).toEqual(["noRedMeat", "noAlcohol"]);
    expect(showcaseDishes(menu, "maintain", NO_PREFERENCES)!.notChecked).toEqual([]);
  });
});

describe("near-identical dishes", () => {
  const dish = (name: string, kcal: number, protein: number): MenuItem => ({ ...tinyChain([["x", name, kcal, protein]]).items[0]! });
  it("are the same dish with another sauce, size, count, flavour or form", () => {
    expect(nearIdentical(dish("Double Sausage Sandwich with Ketchup", 455, 28), dish("Double Sausage Sandwich with Brown Sauce", 458, 28))).toBe(true);
    expect(nearIdentical(dish("Chicken Selects (5 pieces)", 560, 39), dish("Chicken Selects (3 pieces)", 336, 23))).toBe(true);
    expect(nearIdentical(dish("5 Spicy Tenders", 378, 58), dish("5 Classic Tenders", 375, 57))).toBe(true);
    expect(nearIdentical(dish("Grilled chicken ramen", 498, 35.7), dish("Grilled chicken ramen (gluten free menu)", 494, 28.4))).toBe(true);
    expect(nearIdentical(dish("Chicken & Bacon Sub", 634, 45), dish("Chicken & Bacon Wrap", 710, 45))).toBe(true);
    expect(nearIdentical(dish("Chicken breast", 187, 36), dish("Grilled chicken breast", 187, 36))).toBe(true);
    expect(nearIdentical(dish("Smokey BBQ Twister", 482, 28.7), dish("Sweet Chilli Twister", 492, 28.7))).toBe(true);
  });
  it("are not different dishes", () => {
    expect(nearIdentical(dish("Chicken Butterfly", 332, 59.4), dish("1/4 Chicken", 289, 39.3))).toBe(false);
    expect(nearIdentical(dish("Chicken Selects (5 pieces)", 560, 39), dish("Double Quarter Pounder with Cheese", 749, 50))).toBe(false);
    expect(nearIdentical(dish("Chicken + prawn yaki udon", 714, 36.9), dish("Chicken katsu curry", 900, 40))).toBe(false);
    expect(variantKey("Crispy Chicken Tenders (5) with Nacho Cheese Sauce")).toBe("crispy chicken tenders");
  });
});

describe("the chips", () => {
  const two = (id: string, name: string): Chain => ({ ...chain([["a", "Chicken Wrap", 450, 40], ["b", "Grilled Chicken Salad", 320, 30]]), id, name });
  const one = (id: string): Chain => ({ ...chain([["a", "Chicken Wrap", 450, 40]]), id });
  const candidates = [
    { group: "fastFood" as const, chainIds: ["mcdonalds", "kfc"] },
    { group: "bakery" as const, chainIds: ["greggs"] },
    { group: "coffee" as const, chainIds: ["costa", "starbucks"] },
    { group: "sitDown" as const, chainIds: [] },
  ];

  it("takes the first restaurant in each group that gives two dishes; a group with none is left out", () => {
    const menus: Record<string, Chain | null> = { mcdonalds: one("mcdonalds"), kfc: two("kfc", "KFC"), greggs: two("greggs", "Greggs"), costa: null, starbucks: one("starbucks") };
    const { chips, pending } = showcaseChips(candidates, (id) => menus[id], "maintain", NO_PREFERENCES);
    expect(chips.map((c) => [c.group, c.chainId])).toEqual([["fastFood", "kfc"], ["bakery", "greggs"]]);
    expect(pending).toEqual([]);
    expect(chips[0]!.chainName).toBe("KFC");
  });

  it("waits for a menu still loading rather than skipping past it", () => {
    const menus: Record<string, Chain | null | undefined> = { mcdonalds: undefined, kfc: two("kfc", "KFC"), greggs: two("greggs", "Greggs"), costa: one("costa") };
    const { chips, pending } = showcaseChips(candidates, (id) => menus[id], "maintain", NO_PREFERENCES);
    expect(chips.map((c) => c.chainId)).toEqual(["greggs"]);
    expect(pending).toEqual([{ group: "fastFood", chainId: "mcdonalds" }, { group: "coffee", chainId: "starbucks" }]);
  });
});
