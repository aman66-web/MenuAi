import { describe, expect, it } from "vitest";
import { PANTRY } from "../lib/mm/pantry";
import { candidates, plainSeasoning, recipeTotals, resolveRecipe, specFromKind, type Recipe } from "../lib/mm/recipes";
import type { ShopProduct } from "../lib/mm/shopProducts";

// Founder 2026-11-18 ("Yes: Asda goes from 47 to 118 recipes and Iceland from 33 to 123"): salt, pepper and dried spices with no nutrition label (UK law requires
// none on herbs, spices or salt) may be listed and priced in a recipe but not counted, and only a product whose name is just that seasoning.
const kind = (k: string) => PANTRY.get(k)!;

describe("seasonings without a label", () => {
  it("only the seasoning itself, whatever the brand in front", () => {
    for (const [k, name] of [["salt", "Saxa Fine Salt 750g"], ["salt", "COOK by ASDA Cook Sea Salt 200g"], ["salt", "Table Salt 400 g"], ["black-pepper", "Schwartz Black Pepper Ground Medium 33g"],
      ["black-pepper", "COOK by ASDA Cook Coarse Ground Black Pepper 45g"], ["cumin", "Rajah Jeera Cumin Ground Spices 100g"], ["chilli-powder", "Kashmiri Mild Chilli Powder 48 g"],
      ["mixed-herbs", "READY, SET…COOK! Italian Mixed Herbs 13 g"], ["oregano", "Morrisons Oregano 12g"], ["turmeric", "Rajah Haldi Turmeric Ground Spices 100g"]] as const) {
      expect(plainSeasoning(name, kind(k).match, kind(k).unlabelledNeeds), name).toBe(true);
    }
    for (const [k, name] of [["salt", "Love,Corn Sea Salt Roasted Corn Snack 45G"], ["salt", "ALPEN FEST STYLE Pretzels With Sea Salt"], ["salt", "Sea Salt Mill 100 g"],
      ["paprika", "Collection Prawn Medley with Paprika Dressing & Garlic Butter (Serves 4)"], ["oregano", "SPECIALLY SELECTED Basil & Oregano Passata Rustica"],
      ["oregano", "Tesco Finest Sourdough with Sundried Tomato & Oregano 400g"], ["turmeric", "BOL Coconut Turmeric Lentil Daal Power Pot 450g"], ["turmeric", "Tesco Turmeric 100G"]] as const) {
      expect(plainSeasoning(name, kind(k).match, kind(k).unlabelledNeeds), name).toBe(false);
    }
  });

  it("a labelled one comes first; an unlabelled spice is listed and priced but not counted; unlabelled salt counts as table salt is labelled", () => {
    const n = (kcal: number, salt: number | null) => ({ kcal, protein: 1, carbs: 1, fat: 1, kj: null, saturates: 0, sugars: 0, fibre: 0, salt, per: "g" as const, state: "" });
    const p = (id: string, name: string, nutrition: ShopProduct["nutrition"]) => ({ id, name, price: 1, unitPrice: 4, unit: "kg", nutrition } as unknown as ShopProduct);
    const pepperSpec = specFromKind(kind("black-pepper"), 1);
    const labelled = p("a", "Ground Black Pepper 100g", n(277, 0.1) as never);
    const bare = p("b", "Saxa Ground Black Pepper 25g", null);
    expect(candidates([bare, labelled], pepperSpec)[0]!.product.id).toBe("a");
    expect(candidates([bare], pepperSpec)[0]!.product.id).toBe("b");
    expect(candidates([p("c", "Black Pepper Crackers 200g", null)], pepperSpec)).toEqual([]);
    const recipe = { id: "t", name: "t", blurb: "", servings: 1, method: [], ingredients: [specFromKind(kind("black-pepper"), 1), specFromKind(kind("salt"), 1)] } as unknown as Recipe;
    const totals = recipeTotals(resolveRecipe(recipe, [bare, p("d", "Saxa Fine Salt 750g", null)]))!;
    expect(totals.notCounted).toEqual(["Ground black pepper"]);
    expect(totals.plainSalt).toEqual(["Salt"]);
    expect(totals.perServing).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(totals.label.salt).toBe(1); // 1 g of salt at 99.9 g per 100 g
  });
});
