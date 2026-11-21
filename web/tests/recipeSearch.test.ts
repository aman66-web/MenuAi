import { describe, expect, it } from "vitest";
import { englishT } from "../lib/mm/i18n";
import { RECIPES } from "../lib/mm/recipeBook";
import { nicheOf } from "../lib/mm/recipeBook/niches";
import { PANTRY } from "../lib/mm/pantry";
import { cuisineOptions } from "../lib/mm/recipeNiche";
import { isMeatFree, isVegan, recipeForDiet } from "../lib/mm/recipes";
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
    expect(recipeSearchExtras(chicken, { kcal: 500, protein: 25 }, englishT).words).toContain("high protein");
    expect(recipeSearchExtras(chicken, { kcal: 500, protein: 24 }, englishT).words).not.toContain("high protein");
  });

  // Hassan, 21 November 2026: "fish", "meat", "egg", "nut", "milk", "soy" and "sesame" each found nearly every recipe, through the free-from and meat-free words
  const byId = (id: string) => RECIPES.find((r) => r.id === id)!;
  const count = (q: string) => RECIPES.filter((r) => find(q, r)).length;
  it("never finds a recipe by one word of a free-from or meat-free phrase; the whole phrase still finds it", () => {
    const curry = byId("chicken-curry");
    expect(find("fish", curry)).toBe(false);
    expect(find("fish free", curry)).toBe(true);
    expect(find("fish-free", curry)).toBe(true);
    expect(find("fish free curry", curry)).toBe(true);
    expect(find("meat", curry)).toBe(false);
    expect(find("no meat", curry)).toBe(false);
    expect(find("egg fried rice", byId("chicken-rice-bowl"))).toBe(false);
    expect(find("egg fried rice", byId("egg-fried-rice"))).toBe(true);
    const veggie = RECIPES.find((r) => isMeatFree(r) && !/meat|fish/i.test(r.name + r.blurb))!;
    expect(find("no meat", veggie)).toBe(true);
    expect(find("no meat or fish", veggie)).toBe(true);
    expect(find("meat free", veggie)).toBe(true);
    // "peanut free" is never read as "nut free" (a recipe with nuts but no peanuts is peanut free)
    const nutty = RECIPES.find((r) => recipeForDiet(r, { avoidAllergens: ["peanuts"] }) && !recipeForDiet(r, { avoidAllergens: ["nuts"] }));
    if (nutty) {
      expect(find("peanut free", nutty)).toBe(true);
      expect(find("nut free", nutty)).toBe(false);
    }
    // a word alone finds only what names it: far from every recipe
    for (const w of ["fish", "meat", "egg", "milk", "soy", "sesame"]) expect(count(w), w).toBeLessThan(RECIPES.length / 2);
  });
  it("never finds a vegetarian recipe by \"egg\" through \"veggie\"", () => {
    const veggie = RECIPES.find((r) => isMeatFree(r) && !/egg/i.test([r.name, r.blurb, ...r.ingredients.map((i) => i.label)].join(" ")) && find("veggie", r))!;
    expect(find("veg", veggie)).toBe(true);
    expect(find("egg", veggie)).toBe(false);
  });
  it("ignores accents and apostrophes", () => {
    const puree = RECIPES.find((r) => r.ingredients.some((i) => /purée/.test(i.label)))!;
    expect(find("tomato puree", RECIPES.find((r) => r.ingredients.some((i) => /tomato purée/i.test(i.label)))!)).toBe(true);
    expect(find("PUREE", puree)).toBe(true);
    expect(find("purée", puree)).toBe(true);
    const nicoise = { ...puree, id: "x-nicoise", name: "Tuna niçoise salad", blurb: "", ai: true as const };
    expect(matchesRecipeSearch(nicoise, "nicoise", englishT, offered)).toBe(true);
    expect(matchesRecipeSearch({ ...nicoise, name: "Shepherd’s pie" }, "shepherds", englishT, offered)).toBe(true);
    expect(matchesRecipeSearch({ ...nicoise, name: "Shepherd's pie" }, "shepherd’s pie", englishT, offered)).toBe(true);
  });
  it("calls a recipe made with ordinary green pesto no meat or fish, but not vegetarian, unless it is made for a vegetarian", () => {
    const pesto = RECIPES.find((r) => isMeatFree(r) && r.ingredients.some((i) => !!i.pantry && !!PANTRY.get(i.pantry)?.rennet))!;
    expect(find("vegetarian", pesto)).toBe(false);
    expect(find("veggie", pesto)).toBe(false);
    expect(find("no meat or fish", pesto)).toBe(true);
    const forVegetarian = recipeForDiet(pesto, { vegetarianOnly: true })!;
    expect(find("vegetarian", forVegetarian)).toBe(true);
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
