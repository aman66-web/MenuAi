import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ShopManifest } from "../lib/mm/shopProducts";

// The app's "@/..." imports aren't resolved under vitest: point them at the real modules (the shop-list loader, which fetches, isn't needed here).
vi.mock("@/lib/mm/config", () => import("../lib/mm/config"));
vi.mock("@/lib/mm/recipes", () => import("../lib/mm/recipes"));
vi.mock("@/lib/mm/recipeBook", () => import("../lib/mm/recipeBook"));
vi.mock("@/lib/mm/shopProducts", () => import("../lib/mm/shopProducts"));
vi.mock("../app/app/_lib/shopProducts", () => ({ loadShopFile: () => Promise.reject(new Error("not in tests")) }));

const { recipeShop, recipeShopSetFor } = await import("../app/app/_lib/recipes");

// Which shops a recipe screen uses. A shop named in the address (a recipe card's &r=, a Back link's ?r=, a tab remembered from before) must never put back a
// supermarket the person has since unticked (founder 2026-11-17: "If I choose to shop at Asda, it's still showing stuff from Sainsbury's"). It only counts
// when none of the person's own shops can make recipes yet. And every screen that fills a recipe (Recipes, a recipe page, Add food, My meals, onboarding's
// first recipe) works from the same set of shops, so the figures agree.

const manifest = (ready: string[], other: string[] = []): ShopManifest => ({
  v: 1,
  retailers: [...ready.map((id) => ({ id, name: id, file: `${id}.json`, count: 10, checkedOn: "2026-10-08", sha256: "", nutrition: 5 })), ...other.map((id) => ({ id, name: id, file: `${id}.json`, count: 10, checkedOn: "2026-10-08", sha256: "" }))],
});

describe("the shops a recipe screen uses", () => {
  // "cornershop" is a made-up second shop: for real ones (Tesco makes only a few recipes) the coverage table in lib/mm/recipeCoverage.ts also decides
  const m = manifest(["sainsburys", "cornershop"], ["asda"]);

  it("ignores a shop in the address when the person has a recipe-ready shop of their own", () => {
    // the person unticked Sainsbury's and ticked Tesco; a remembered recipe address still says &r=sainsburys
    expect(recipeShopSetFor(m, "sainsburys", ["cornershop"])).toEqual(["cornershop"]);
    // the address never reorders their own shops either
    expect(recipeShopSetFor(m, "sainsburys", ["cornershop", "sainsburys"])).toEqual(["cornershop"]);
    expect(recipeShop(m, "sainsburys", ["cornershop"])).toBe("cornershop");
  });

  it("uses the shop in the address when none of the person's shops can make recipes", () => {
    expect(recipeShopSetFor(m, "cornershop", ["asda"])).toEqual(["cornershop"]);
    expect(recipeShopSetFor(m, "cornershop", undefined)).toEqual(["cornershop"]);
    expect(recipeShopSetFor(m, "cornershop", [])).toEqual(["cornershop"]);
  });

  it("otherwise follows the first of the person's shops", () => {
    expect(recipeShopSetFor(m, null, ["asda", "cornershop", "sainsburys"])).toEqual(["cornershop"]);
    expect(recipeShopSetFor(m, "asda", ["asda"])).toEqual(["sainsburys"]);
    expect(recipeShopSetFor(null, "cornershop", ["cornershop"])).toEqual([]);
  });
});

describe("every screen that fills a recipe uses every one of the person's shops", () => {
  // Add food › Choose a recipe, My meals › Recipes and onboarding's first recipe used the first shop alone, so a recipe made from two shops on the Recipes page
  // was missing there or logged with other products and other numbers.
  const screens = ["app/app/_components/addfood/RecipePick.tsx", "app/app/meals/MyRecipes.tsx", "app/app/welcome/RecipeChoice.tsx", "app/app/recipes/page.tsx", "app/app/recipes/view/RecipeScreen.tsx"];
  for (const file of screens) {
    it(file, () => {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(src).toContain("useRecipeShopSet(");
      expect(src).toContain("recipeShopSetFor(");
      expect(src).not.toMatch(/\buseShopProducts\(/);
    });
  }
});
