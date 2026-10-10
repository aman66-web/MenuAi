import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanText } from "../lib/mm/aiRecipe";
import { PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { fitRecipe, isMeatFree, recipeForDiet, recipeTotals, resolveRecipe, MEAL_TYPES } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";

// The rules every recipe in the book follows (lib/mm/recipeBook/index.ts), checked against the real Sainsbury's list.

const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const SAFETY = /(no pink|piping hot|cooked through|flakes|opaque|set\b|until (?:just )?set|golden|pink all the way|cooked all the way)/i;
const NEEDS_SAFETY = new Set(["chicken", "chicken-thigh", "beef-mince", "turkey-mince", "lamb-mince", "bacon", "salmon", "cod", "white-fish", "prawns", "eggs", "beef-steak"]);

describe("the recipe book", () => {
  it("has unique ids and names", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.name.toLowerCase())).size).toBe(RECIPES.length);
  });

  for (const r of RECIPES) {
    it(`${r.id}: well formed, no claims, cooks safely, resolves and fits at Sainsbury's`, () => {
      expect(r.id, "id").toMatch(/^[a-z0-9-]{3,60}$/);
      expect(MEAL_TYPES.some((m) => m.value === r.meal), "meal").toBe(true);
      expect(r.servings, "servings").toBeGreaterThanOrEqual(1);
      expect(r.servings, "servings").toBeLessThanOrEqual(6);
      expect(r.minutes, "minutes").toBeGreaterThanOrEqual(2);
      expect(r.minutes, "minutes").toBeLessThanOrEqual(240);
      expect(r.method.length, "steps").toBeGreaterThanOrEqual(2);
      expect(r.method.length, "steps").toBeLessThanOrEqual(7);
      expect(cleanText(r.name, 60), `name "${r.name}"`).not.toBeNull();
      expect(r.blurb === "" || cleanText(r.blurb, 140) !== null, `blurb "${r.blurb}"`).toBe(true);
      for (const step of r.method) expect(cleanText(step, 300), `step "${step}"`).not.toBeNull();
      for (const e of r.extras) expect(cleanText(e, 120), `extra "${e}"`).not.toBeNull();
      expect(new Set(r.ingredients.map((i) => i.key)).size, "an ingredient twice").toBe(r.ingredients.length);
      for (const i of r.ingredients) {
        expect(i.pantry && PANTRY.has(i.pantry), `pantry kind ${i.key}`).toBe(true);
        expect(i.amount, `${i.key} amount`).toBeGreaterThanOrEqual(5);
        expect(i.amount / r.servings, `${i.key} per serving`).toBeLessThanOrEqual(450);
        for (const s of i.subs ?? []) expect(PANTRY.has(s.key), `substitute ${s.key} for ${i.key}`).toBe(true);
      }
      if (r.ingredients.some((i) => NEEDS_SAFETY.has(i.pantry ?? ""))) expect(r.method.some((m) => SAFETY.test(m)), "says how to tell it's cooked").toBe(true);
      const resolved = resolveRecipe(r, products);
      expect(resolved.complete, `missing at Sainsbury's: ${r.ingredients.filter((_, k) => !resolved.picks[k]).map((i) => i.key).join(", ")}`).toBe(true);
      const t = recipeTotals(resolved)!;
      expect(t.perServing.kcal, "kcal a serving as written").toBeGreaterThan(r.meal === "snack" ? 60 : 180);
      expect(t.perServing.kcal, "kcal a serving as written").toBeLessThan(1100);
      expect(fitRecipe(r, products, {}, { kcal: 600, protein: 40 }), "fits").not.toBeNull();
    });
  }

  it("has plenty for every meal and diet", () => {
    const count = (f: (r: (typeof RECIPES)[number]) => boolean) => RECIPES.filter(f).length;
    expect(RECIPES.length).toBeGreaterThanOrEqual(95);
    for (const m of MEAL_TYPES) expect(count((r) => r.meal === m.value), m.value).toBeGreaterThanOrEqual(m.value === "snack" ? 8 : 15);
    expect(count((r) => isMeatFree(r)), "meat-free").toBeGreaterThanOrEqual(30);
    expect(count((r) => recipeForDiet(r, { veganOnly: true }) !== null), "vegan").toBeGreaterThanOrEqual(12);
    expect(count((r) => recipeForDiet(r, { halalOnly: true }) !== null), "halal").toBeGreaterThanOrEqual(45);
    expect(count((r) => recipeForDiet(r, { avoidAllergens: ["gluten"] }) !== null), "no gluten").toBeGreaterThanOrEqual(25);
    expect(count((r) => recipeForDiet(r, { avoidAllergens: ["milk"] }) !== null), "no milk").toBeGreaterThanOrEqual(40);
  });
});
