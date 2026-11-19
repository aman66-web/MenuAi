import { describe, expect, it, vi } from "vitest";
import { FRIDGE_SYSTEM_PROMPT, moodMatches, fridgeRecipeFromAi, fridgeUserPrompt, haveItems, ingredientsYouHave, recipesFromFridge, type FridgeRecipeRequest } from "../lib/mm/fridgeRecipe";
import { haveKey, recipeTotals, resolveRecipe } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";
import { readFileSync } from "node:fs";
import { handleFridgeRecipe, type AskFridgeRecipe, type FridgeCtx } from "../lib/fridgeRecipeHandler";
import { RECIPES } from "../lib/mm/recipeBook";

// Cook with what you have (founder 2026-11-19: "people can write down what they have in their fridge, and then it can make some cool recipe ... based on all the
// stuff that they have"): our recipes matched to what's typed, and Pip's own recipe built round it, checked like Make it at home's, with a pretend AI.

const line = (key: string, label: string, kcal = 100) => ({ key, label, unit: "g" as const, product: `${label} 500g`, kcal, protein: 10, carbs: 10, fat: 5 });
const PANTRY = [line("chicken", "Chicken breast", 110), line("rice", "Basmati rice", 350), line("paprika", "Paprika", 280), line("salt", "Salt", 0), line("olive-oil", "Olive oil", 820), line("garlic", "Garlic purée", 150)];
const request = (over: Partial<FridgeRecipeRequest> = {}): FridgeRecipeRequest => ({ shop: "sainsburys", servings: 2, target: { kcal: 600, protein: 40 }, diet: {}, have: "chicken, rice and garlic", pantry: PANTRY, ...over });
const GOOD = {
  name: "Garlic chicken rice",
  blurb: "Golden garlicky chicken over fluffy rice.",
  servings: 2,
  minutes: 35,
  ingredients: [
    { key: "chicken", amount: 400, role: "protein" }, { key: "rice", amount: 150, role: "carb" }, { key: "paprika", amount: 4, role: "other" },
    { key: "salt", amount: 1, role: "other" }, { key: "olive-oil", amount: 10, role: "other" }, { key: "garlic", amount: 10, role: "other" },
  ],
  method: [
    "Cook the rice: Rinse the rice, then simmer it in a pan of salted water for 12 minutes, until soft.",
    "Coat the chicken: Cut the chicken into strips and toss it with the paprika, garlic purée and oil.",
    "Cook the chicken: Fry the chicken over a medium-high heat for 8 to 10 minutes, until piping hot with no pink left.",
    "Serve: Drain the rice and serve it with the chicken on top.",
  ],
  fromHome: ["chicken", "rice", "garlic", "not-a-key"],
};
const answer = (value: unknown) => ({ status: "ok" as const, value });
const ctx = (over: Partial<FridgeCtx> = {}): FridgeCtx => ({ ask: async () => answer(GOOD), premium: async () => true, allow: () => true, ...over });

describe("what the person has", () => {
  it("splits what's typed into things, tidied and each once", () => {
    expect(haveItems("Eggs, spinach and cheddar\nleftover rice; eggs & half an onion!")).toEqual(["eggs", "spinach", "cheddar", "leftover rice", "half an onion"]);
    expect(haveItems("  ")).toEqual([]);
  });

  it("finds our recipes that use the most of it, for the person's diet", () => {
    const matches = recipesFromFridge(RECIPES, ["eggs", "spinach"], {});
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.uses).toEqual(["eggs", "spinach"]);
    expect(matches.every((m, i) => i === 0 || matches[i - 1]!.uses.length >= m.uses.length)).toBe(true);
    // a vegan sees no recipe that only works with eggs
    for (const m of recipesFromFridge(RECIPES, ["eggs"], { veganOnly: true })) expect(m.recipe.ingredients.some((i) => (i.pantry ?? i.key) === "eggs")).toBe(false);
  });
});

describe("the kind of food they fancy (founder 2026-11-19: \"what vibe of food they wanna eat\")", () => {
  const byId = new Map(RECIPES.map((r) => [r.id, r]));
  it("narrows our recipes by cuisine, time, heat and cheese", () => {
    expect(moodMatches(byId.get("spaghetti-bolognese")!, "italian")).toBe(true);
    expect(moodMatches(byId.get("spaghetti-bolognese")!, "indian")).toBe(false);
    expect(moodMatches(byId.get("beef-chilli")!, "spicy")).toBe(true);
    expect(moodMatches(byId.get("easy-macaroni-cheese")!, "cheesy")).toBe(true);
    const quick = recipesFromFridge(RECIPES, ["eggs"], {}, 30, "quick");
    expect(quick.length).toBeGreaterThan(0);
    expect(quick.every((m) => m.recipe.minutes <= 20)).toBe(true);
    expect(recipesFromFridge(RECIPES, ["chicken"], {}, 30, "indian").every((m) => moodMatches(m.recipe, "indian"))).toBe(true);
  });

  it("is told to Pip in plain words, and only the known kinds are accepted", async () => {
    expect(fridgeUserPrompt(request({ mood: "spicy" }))).toContain("What they fancy: something with a bit of heat");
    expect(fridgeUserPrompt(request())).toContain("What they fancy: whatever goes best with what they have");
    expect((await handleFridgeRecipe({ ...request(), mood: "anything goes" }, ctx())).status).toBe(400);
    expect((await handleFridgeRecipe(request({ mood: "italian" }), ctx())).status).toBe(200);
  });
});

describe("Pip's recipe from it", () => {
  it("asks for a tasty dish built round what they have, from the pantry only, with no figures or claims", () => {
    expect(FRIDGE_SYSTEM_PROMPT).toMatch(/built around what they have/);
    expect(FRIDGE_SYSTEM_PROMPT).toMatch(/Never write calories/);
    expect(FRIDGE_SYSTEM_PROMPT).toMatch(/"fromHome"/);
    expect(fridgeUserPrompt(request())).toContain(`What they have at home: "chicken, rice, garlic"`);
  });

  it("keeps only the home keys that are really in the recipe", () => {
    const made = fridgeRecipeFromAi(GOOD, request(), "ai-x")!;
    expect(made.recipe.name).toBe("Garlic chicken rice");
    expect(made.fromHome).toEqual(["chicken", "rice", "garlic"]);
    expect(fridgeRecipeFromAi({ ...GOOD, method: GOOD.method.slice(0, 2) }, request(), "ai-x")).toBeNull();
  });

  it("the server: switched on, at least two things, Premium, then the recipe; a bad answer gets one more go", async () => {
    expect((await handleFridgeRecipe(request(), ctx({ ask: null }))).status).toBe(503);
    expect((await handleFridgeRecipe(request({ have: "chicken" }), ctx())).status).toBe(422);
    expect((await handleFridgeRecipe(request(), ctx({ premium: async () => false }))).status).toBe(402);
    expect((await handleFridgeRecipe({ ...request(), image: "x" }, ctx())).status).toBe(400);
    const ok = await handleFridgeRecipe(request(), ctx());
    expect(ok.status).toBe(200);
    const ask = vi.fn<AskFridgeRecipe>().mockResolvedValueOnce(answer({ ...GOOD, method: ["Serve: Eat it."] })).mockResolvedValueOnce(answer(GOOD));
    expect((await handleFridgeRecipe(request(), ctx({ ask }))).status).toBe(200);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[0]![1]).toContain("What they have at home");
  });
});

describe("forgiving spellings (usability test 2026-11-19)", () => {
  it("matches a thing typed with a wrong plural", async () => {
    const { spellings, recipesFromFridge } = await import("../lib/mm/fridgeRecipe");
    expect(spellings("potatos")).toContain("potato");
    expect(spellings("eggs")).toContain("egg");
    const { RECIPES } = await import("../lib/mm/recipeBook");
    const right = recipesFromFridge(RECIPES, ["potatoes"], {}, 50).length;
    const typo = recipesFromFridge(RECIPES, ["potatos"], {}, 50);
    expect(typo.length).toBe(right);
    expect(typo.every((m) => m.uses.includes("potatos"))).toBe(true);
  });
});

describe("what the person has stays off the shopping list (usability test 2026-11-19: Pat's Add all put her own eggs and onion on it)", () => {
  const omelette = RECIPES.find((r) => r.id === "spanish-omelette")!;

  it("finds the recipe's ingredients the person has, by key, plurals and slips forgiven, never a seasoning", () => {
    const keys = ingredientsYouHave(omelette, ["eggs", "onions", "potatos", "pepper"]);
    const labels = omelette.ingredients.filter((i) => keys.includes(i.key)).map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes("egg"))).toBe(true);
    expect(labels.some((l) => l.includes("onion"))).toBe(true);
    expect(labels.some((l) => l.includes("potato"))).toBe(true);
    expect(labels.some((l) => /black pepper|salt/.test(l))).toBe(false);
    expect(ingredientsYouHave(omelette, [])).toEqual([]);
  });

  it("leaves a ticked ingredient out of the price to buy it all, never out of a serving's numbers", () => {
    const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
    const resolved = resolveRecipe(omelette, products);
    const all = recipeTotals(resolved)!;
    const egg = omelette.ingredients.find((i) => /egg/i.test(i.label))!;
    const less = recipeTotals(resolved, new Set([haveKey(egg.key)]))!;
    expect(less.basket).toBeLessThan(all.basket);
    expect(less.perServing).toEqual(all.perServing);
  });
});
