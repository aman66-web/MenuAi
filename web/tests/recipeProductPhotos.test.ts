import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { resolveRecipe } from "../lib/mm/recipes";
import { decodeShopProducts, recipeShops, shopPhotoSources, type ShopFile, type ShopManifest } from "../lib/mm/shopProducts";

// Every product a recipe uses at a shop recipes are offered from (lib/mm/recipeCoverage.ts >= MIN_RECIPE_COVERAGE) shows a picture: the shop's own photo,
// or the same product's photo from another supermarket's own website (founder 2026-11-17: "Use images please when possible"; 2026-11-20: a recipe
// ingredient's photo opens the product). A product left with none is fixed in the data (tools/groceries: the shop's own product page), never with a made picture.
it("every product our recipes use at a recipe shop has a photo", () => {
  const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
  const shops = recipeShops(manifest);
  expect(shops.length).toBeGreaterThan(0);
  const missing: string[] = [];
  for (const r of shops) {
    const file = JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8")) as ShopFile;
    const products = decodeShopProducts(file);
    const seen = new Set<string>();
    for (const recipe of RECIPES) {
      for (const pick of resolveRecipe(recipe, products).picks) {
        if (!pick || seen.has(pick.product.id)) continue;
        seen.add(pick.product.id);
        if (shopPhotoSources(file, pick.product).length === 0) missing.push(`${r.id}: ${pick.product.name} (${pick.product.id}), in ${recipe.id}`);
      }
    }
  }
  expect(missing).toEqual([]);
}, 300_000);
