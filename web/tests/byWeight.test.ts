// Liquids whose shop label is printed per 100 g, counted for a recipe's ml by weight (founder 2026-11-21, "Yes, that is perfect": M&S prints its oils, milk
// and lemon juice per 100 g; lib/mm/recipes.ts weighedPerMl, PantryKind.density), and fresh garlic standing in for purée where a shop sells only bulbs.
import { describe, expect, it } from "vitest";
import { PANTRY } from "../lib/mm/pantry";
import { candidates, productFits, recipeTotals, resolveRecipe, specFromKind, type Recipe } from "../lib/mm/recipes";
import type { PricedProduct, ShopNutrition } from "../lib/mm/shopProducts";

const nut = (kcal: number, protein: number, carbs: number, fat: number, per: "g" | "ml", extra: Partial<ShopNutrition> = {}): ShopNutrition =>
  ({ kcal, protein, carbs, fat, saturates: null, sugars: null, fibre: null, salt: null, kj: null, per, state: "", ...extra }) as ShopNutrition;
const product = (id: string, name: string, price: number, unitPrice: number | null, unit: string, nutrition: ShopNutrition | null): PricedProduct =>
  ({ id, name, price, unitPrice, unit, member: null, category: "Food cupboard", photoId: "", gtin: "", nutrition });

const kind = (key: string) => PANTRY.get(key)!;

describe("a liquid labelled per 100 g, for a recipe's ml", () => {
  const oil = product("1", "Extra Virgin Olive Oil 500 ml", 4.5, null, "", nut(884, 0, 0, 100, "g"));
  const spec = specFromKind(kind("olive-oil"), 15);

  it("only kinds with a well-known density: oils, milk, oat drink, lemon and lime juice, coconut milk, soy sauce", () => {
    const dense = [...PANTRY.values()].filter((k) => k.density).map((k) => k.key).sort();
    expect(dense).toEqual(["coconut-light", "coconut-milk", "lemon-juice", "lime-juice", "milk", "oat-drink", "oil-spray", "olive-oil", "soy", "vegetable-oil"]);
    for (const k of PANTRY.values()) if (k.density) expect(k.unit, k.key).toBe("ml");
    expect(kind("olive-oil").density).toBe(0.91);
    expect(kind("milk").density).toBe(1.03);
  });

  it("counts its label times the grams in one ml, marked so the recipe says so", () => {
    const [c] = candidates([oil], spec);
    expect(c).toBeTruthy();
    expect(c!.product.nutrition).toMatchObject({ per: "ml", byWeight: 0.91, kcal: 804.44, fat: 91 });
    expect(c!.product.id).toBe("1");
    expect(productFits([oil], spec, oil)).toBe(true); // the shop's own product still fits (the copy is only the recipe's)
  });

  it("a kind with no density (teriyaki sauce) never takes a per-100 g label for its ml", () => {
    const teriyaki = product("2", "Teriyaki Sauce 250 ml", 2, null, "", nut(120, 3, 25, 0, "g"));
    expect(candidates([teriyaki], specFromKind(kind("teriyaki"), 30))).toEqual([]);
  });

  it("a label already per 100 ml is used as printed", () => {
    const perMl = product("3", "Olive Oil 500 ml", 3.5, null, "", nut(822, 0, 0, 91, "ml"));
    const [c] = candidates([perMl], spec);
    expect(c!.product.nutrition).toMatchObject({ per: "ml", kcal: 822 });
    expect(c!.product.nutrition!.byWeight).toBeUndefined();
  });

  it("the recipe's totals use the converted figures and name the liquid", () => {
    const pasta = product("4", "Spaghetti 500 g", 0.75, null, "", nut(359, 12, 72, 1.5, "g"));
    const recipe: Recipe = {
      id: "t-oil", name: "Test", blurb: "", servings: 1, minutes: 10, meal: "dinner", tags: [],
      ingredients: [specFromKind(kind("pasta-long"), 100), spec],
      method: ["Cook: Cook it."],
    } as unknown as Recipe;
    const t = recipeTotals(resolveRecipe(recipe, [pasta, oil]))!;
    expect(t.byWeight).toEqual([spec.label]);
    expect(t.perServing.kcal).toBe(Math.round(359 + 804.44 * 0.15));
  });
});

describe("fresh garlic for a shop that sells no purée", () => {
  const bulb = product("5", "NATURE'S PICK Loose Garlic 1 Each", 0.39, 0.39, "each", nut(98, 7.9, 16.3, 0.6, "g", { govFood: "Garlic, raw" }));
  const garlic = specFromKind(kind("garlic"), 10);

  it("purée is still the first choice, and fresh garlic is its substitute", () => {
    expect(kind("garlic").subs).toEqual([{ key: "fresh-garlic" }]);
    expect(candidates([bulb], garlic)).toEqual([]); // a bulb is not purée
  });

  it("a recipe at that shop uses the bulb, part of it priced, with the government's figures named", () => {
    const recipe: Recipe = { id: "t-garlic", name: "Test", blurb: "", servings: 1, minutes: 10, meal: "dinner", tags: [], ingredients: [garlic], method: ["Cook: Cook it."] } as unknown as Recipe;
    const r = resolveRecipe(recipe, [bulb]);
    expect(r.complete).toBe(true);
    const pick = r.picks[0]!;
    expect(pick.spec).toMatchObject({ pantry: "fresh-garlic", label: "Fresh garlic, crushed", subFor: "Garlic purée or paste", note: "a clove is about 5 g", amount: 10 });
    expect(pick.packs).toBe(1);
    expect(pick.usedCost).toBeCloseTo((10 / 40) * 0.39, 5); // part of one bulb, a small bulb being 40 g
    expect(recipeTotals(r)!.govFood).toEqual(["Fresh garlic, crushed"]);
  });

  it("never a garlic product that is something else", () => {
    const fresh = specFromKind(kind("fresh-garlic"), 10);
    for (const name of ["Garlic Granules 50 g", "Garlic Bread 2 Pack", "Black Garlic 1 Each", "Wild Garlic Pesto", "Garlic & Herb Cheese", "Garlic Purée 90 g"]) {
      expect(candidates([product("6", name, 1, 1, "each", nut(120, 5, 20, 1, "g"))], fresh), name).toEqual([]);
    }
  });
});
