import { describe, expect, it } from "vitest";
import { englishT } from "../lib/mm/i18n";
import { RECIPES } from "../lib/mm/recipeBook";
import { nicheOf } from "../lib/mm/recipeBook/niches";
import { cuisineOptions } from "../lib/mm/recipeNiche";
import { isMeatFree, isVegan } from "../lib/mm/recipes";
import { matchesRecipeSearch, QUICK_TESTS, recipeSearchExtras } from "../lib/mm/recipeSearch";

// The Recipes screen's search and quick filters, shared with Meal plan's Swap sheet (founder 2026-11-20), so a word finds the same recipes in both.
const offered = { cuisines: cuisineOptions(RECIPES.map((r) => r.id)), occasions: [] };
const find = (q: string, r: (typeof RECIPES)[number]) => matchesRecipeSearch(r, q, englishT, offered, recipeSearchExtras(r, { kcal: 500, protein: 20 }, englishT));

describe("the recipe search", () => {
  const chicken = RECIPES.find((r) => r.ingredients.some((i) => /chicken breast/i.test(i.label)) && !/breast/i.test(r.name + r.blurb))!;
  it("finds a recipe by a word of its name or of an ingredient (\"breast\" of chicken breast), every word typed, any case; nothing typed finds all", () => {
    const word = chicken.name.split(/\s+/).find((w) => w.length > 3)!;
    expect(find(word.toUpperCase(), chicken)).toBe(true);
    expect(find("breast", chicken)).toBe(true);
    expect(find(`breast ${word}`, chicken)).toBe(true);
    expect(find("chicken zzzz", chicken)).toBe(false);
    expect(find("   ", chicken)).toBe(true);
  });
  it("finds by the diet words (vegetarian, vegan) and the cuisine's name, never a recipe that isn't one", () => {
    const veggie = RECIPES.find((r) => isMeatFree(r) && !/vegetarian/i.test(r.name + r.blurb))!;
    expect(find("vegetarian", veggie)).toBe(true);
    expect(find("vegetarian", chicken)).toBe(false);
    const vegan = RECIPES.find((r) => isVegan(r) && !/vegan/i.test(r.name + r.blurb))!;
    expect(find("vegan", vegan)).toBe(true);
    const indian = RECIPES.find((r) => nicheOf(r.id).cuisine === "indian" && !/indian/i.test(r.name + r.blurb + r.ingredients.map((i) => i.label).join(" ")))!;
    expect(find("indian", indian)).toBe(true);
  });
  it("says high protein only when protein gives a fifth of the calories", () => {
    expect(recipeSearchExtras(chicken, { kcal: 500, protein: 25 }, englishT)).toContain("high protein");
    expect(recipeSearchExtras(chicken, { kcal: 500, protein: 24 }, englishT)).not.toContain("high protein");
  });
});

describe("the quick filters", () => {
  it("are Quick, No meat or fish and Vegan, by the recipe book's own tests", () => {
    expect(Object.keys(QUICK_TESTS).sort()).toEqual(["meatFree", "quick", "vegan"]);
    for (const r of RECIPES.slice(0, 40)) {
      expect(QUICK_TESTS.vegan(r)).toBe(isVegan(r));
      expect(QUICK_TESTS.meatFree(r)).toBe(isMeatFree(r));
    }
  });
});
