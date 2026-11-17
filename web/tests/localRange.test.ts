import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { resolveRecipe } from "../lib/mm/recipes";
import { LOCAL_SHOP_PRODUCTS } from "../lib/mm/localRange";
import { LOCAL_TIPS, localTipFor } from "../lib/mm/localTips";
import { decodeShopProducts } from "../lib/mm/shopProducts";

// Founder 2026-11-17: every recipe ingredient can be found at a small local shop. Each pick is a product a typical Sainsbury's Local stocks (lib/mm/localRange.ts),
// or the ingredient says what to buy there instead (lib/mm/localTips.ts).
const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));

describe("ingredients a small shop sells", () => {
  it("every ingredient of every recipe is a small-shop product or has a small-shop tip", () => {
    const missing: string[] = [];
    let local = 0, total = 0;
    for (const r of RECIPES) resolveRecipe(r, products).picks.forEach((p, i) => {
      if (!p) return;
      total++;
      if (LOCAL_SHOP_PRODUCTS.has(p.product.id)) local++;
      else if (!localTipFor(r.ingredients[i]?.pantry, p.product.id)) missing.push(`${r.id}: ${r.ingredients[i]?.pantry} (${p.product.name})`);
    });
    expect(missing).toEqual([]);
    expect(local / total).toBeGreaterThan(0.75); // most picks are the small-shop product itself
  });

  it("picks the small-shop product when the shop lists one, even if a big pack is cheaper", () => {
    const chickenRecipe = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "chicken"))!;
    const i = chickenRecipe.ingredients.findIndex((x) => x.pantry === "chicken");
    const pick = resolveRecipe(chickenRecipe, products).picks[i]!;
    expect(LOCAL_SHOP_PRODUCTS.has(pick.product.id)).toBe(true);
  });

  it("tips are plain words: no figures, no health words", () => {
    for (const [kind, tip] of Object.entries(LOCAL_TIPS)) {
      expect(tip, kind).not.toMatch(/\d/);
      expect(tip, kind).not.toMatch(/healthy|lean|good for|bad for|diet/i);
    }
  });
});
