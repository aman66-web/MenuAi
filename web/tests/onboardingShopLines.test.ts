import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHOP_OFFER_LINE, shopOffer, type NamesManifest } from "../app/app/welcome/shopLines";
import { RETAILERS } from "../lib/mm/groceries";
import { RECIPE_COVERAGE } from "../lib/mm/recipeCoverage";
import { MIN_RECIPE_COVERAGE, isShopManifest, recipeShops, type ShopManifest } from "../lib/mm/shopProducts";

// The line under each shop in "Where do you shop?" (the onboarding redesign meeting of 20 November 2026, build list 5): worked out from RECIPE_COVERAGE,
// MIN_RECIPE_COVERAGE and the two manifests, never typed. Checked against the real files in public/groceries.

const all = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
const names = JSON.parse(readFileSync("public/groceries/groceries-manifest.json", "utf8")) as NamesManifest;

describe("what each shop has (welcome/shopLines.ts)", () => {
  it("reads the real manifests", () => {
    expect(isShopManifest(all)).toBe(true);
    expect(all.retailers.length).toBeGreaterThan(0);
  });

  it("follows the rules for every shop offered", () => {
    const inRecipes = new Set(recipeShops(all).map((r) => r.id));
    for (const { id } of RETAILERS) {
      const offer = shopOffer(id, all, names);
      const entry = all.retailers.find((r) => r.id === id);
      if (inRecipes.has(id)) {
        expect(offer, id).toBe("recipes");
        // in recipes means its labels are read and its coverage reaches the bar
        expect((entry?.nutrition ?? 0) > 0, id).toBe(true);
        if (RECIPE_COVERAGE[id] !== undefined) expect(RECIPE_COVERAGE[id]!, id).toBeGreaterThanOrEqual(MIN_RECIPE_COVERAGE);
      } else if (entry && entry.count > 0) {
        const priced = entry.priced ?? entry.count;
        expect(offer, id).toBe(priced * 2 >= entry.count ? "priced" : "somePrices");
      } else {
        const listed = (names.retailers.find((r) => r.id === id)?.count ?? 0) > 0;
        expect(offer, id).toBe(listed ? "namesOnly" : "none");
      }
    }
  });

  it("gives today's lines (the meeting's examples)", () => {
    const today = Object.fromEntries(RETAILERS.map((r) => [r.id, shopOffer(r.id, all, names)]));
    // Lidl lists 1,037 products and prices 264
    expect(today.lidl).toBe("somePrices");
    // Co-op is only in the product-names list; Ocado has no products at all, so onboarding leaves it out
    expect(today.coop).toBe("namesOnly");
    expect(today.ocado).toBe("none");
    for (const id of ["sainsburys", "morrisons", "waitrose", "iceland", "asda"]) if (recipeShops(all).some((r) => r.id === id)) expect(today[id], id).toBe("recipes");
  });

  it("says nothing while the lists load, or when they came back empty (offline)", () => {
    for (const { id } of RETAILERS) {
      expect(shopOffer(id, null, names)).toBeNull();
      expect(shopOffer(id, { v: 1, retailers: [] }, names)).toBeNull();
    }
    // a shop missing from the every-product list waits for the names list
    expect(shopOffer("coop", all, null)).toBeNull();
  });

  it("has a line for every offer but 'none', and the lines promise only what the data holds", () => {
    expect(Object.keys(SHOP_OFFER_LINE).sort()).toEqual(["namesOnly", "priced", "recipes", "somePrices"]);
    expect(SHOP_OFFER_LINE.recipes).toBe("Recipes, products and prices");
    for (const k of ["priced", "somePrices"] as const) expect(SHOP_OFFER_LINE[k]).toMatch(/Not in recipes yet$/);
    for (const line of Object.values(SHOP_OFFER_LINE)) expect(line).not.toMatch(/\d/);
  });
});
