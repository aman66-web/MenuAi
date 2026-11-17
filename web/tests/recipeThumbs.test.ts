import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { RECIPE_THUMBS } from "../lib/mm/recipeThumbs";

// The small copies of the recipe pictures (tools/recipes/make_recipe_thumbs.py) used where a recipe is shown small (app/app/recipes/RecipeThumb.tsx).
const PUBLIC = join(__dirname, "..", "public");

describe("small recipe pictures", () => {
  it("every recipe picture has its small copy, with the same file name, and nothing else is listed", () => {
    expect(Object.keys(RECIPE_THUMBS).sort()).toEqual(Object.keys(RECIPE_IMAGES).sort());
    for (const [id, full] of Object.entries(RECIPE_IMAGES)) {
      expect(RECIPE_THUMBS[id]).toBe(full.replace("/recipe-images/", "/recipe-images/thumbs/"));
    }
  });

  it("each small copy is on disk and much smaller than its picture (rerun the script after importing pictures)", () => {
    for (const [id, thumb] of Object.entries(RECIPE_THUMBS)) {
      const small = join(PUBLIC, thumb), big = join(PUBLIC, RECIPE_IMAGES[id]!);
      expect(existsSync(small), thumb).toBe(true);
      expect(statSync(small).size).toBeLessThan(statSync(big).size / 2);
    }
  });
});
