import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bookDietPictures, dietPictures, PICTURE_DIETS } from "../app/app/welcome/dietPictures";
import { MORE_DIET_KEYS } from "../lib/mm/foodDiet";
import { PANTRY, type DietPrefs } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { recipeForDiet } from "../lib/mm/recipes";

// "Anything you avoid?" shows each diet as a picture of one of our own recipes that fits it (founder, 20 November 2026: pictures over text; CLAUDE.md rule 2:
// an illustration only for our own recipes).

const kindsOf = (id: string) => RECIPES.find((r) => r.id === id)!.ingredients.map((i) => (i.pantry ? PANTRY.get(i.pantry) : undefined)).filter((k) => !!k);

describe("the diet tiles' pictures", () => {
  const pics = bookDietPictures();

  it("has a picture for every diet the picker shows (the six, then the six behind More diets)", () => {
    expect(PICTURE_DIETS).toEqual(["vegetarianOnly", "veganOnly", "pescatarianOnly", "halalOnly", "noPork", "noBeef", ...MORE_DIET_KEYS]);
    for (const key of PICTURE_DIETS) expect(pics[key], key).toBeDefined();
  });

  it("is always one of our own recipes, with its own illustration on disk, that fits that diet as written", () => {
    for (const key of PICTURE_DIETS) {
      const { recipeId, src } = pics[key]!;
      const recipe = RECIPES.find((r) => r.id === recipeId);
      expect(recipe, key).toBeDefined();
      expect(src).toBe(RECIPE_IMAGES[recipeId]);
      expect(existsSync(`public${src}`), src).toBe(true);
      expect(recipeForDiet(recipe!, { [key]: true } as DietPrefs), `${key} ${recipeId}`).not.toBeNull();
    }
  });

  it("never shows the same picture twice", () => {
    const ids = PICTURE_DIETS.map((k) => pics[k]!.recipeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows meat for the diets that still eat it, fish for pescatarian, and a vegetarian dish that isn't vegan", () => {
    for (const key of ["halalOnly", "noPork", "noBeef", "kosherStyle", "noHalalKosherMeat"] as const) expect(kindsOf(pics[key]!.recipeId).some((k) => !!k!.meat), key).toBe(true);
    expect(kindsOf(pics.pescatarianOnly!.recipeId).some((k) => !!k!.fish)).toBe(true);
    expect(kindsOf(pics.vegetarianOnly!.recipeId).some((k) => !!k!.animal)).toBe(true);
    expect(kindsOf(pics.veganOnly!.recipeId).some((k) => !!k!.animal)).toBe(false);
  });

  it("leaves a diet with no fitting illustrated recipe without a picture, never with another diet's", () => {
    expect(dietPictures(RECIPES, {})).toEqual({});
    const onlyMeat = RECIPES.filter((r) => kindsOf(r.id).some((k) => !!k!.meat));
    const some = dietPictures(onlyMeat, RECIPE_IMAGES);
    expect(some.veganOnly).toBeUndefined();
    expect(some.vegetarianOnly).toBeUndefined();
  });
});
