import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanText, pantryLines, recipeFromAi, recipeToSaved, recipeUserPrompt, sanitizeSavedRecipes, savedToRecipe, type RecipeRequest } from "../lib/mm/aiRecipe";
import { PANTRY } from "../lib/mm/pantry";
import { fitRecipe } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";
import { handleRecipe, makeLimiter, type AskPip } from "../lib/recipeHandler";

const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));

const answer = {
  name: "Chicken and bean rice",
  blurb: "A warming one-pot dinner.",
  servings: 9,
  minutes: 35,
  ingredients: [
    { key: "chicken", amount: 302, role: "protein" },
    { key: "kidney-beans", amount: 240, role: "other" },
    { key: "chopped-tomatoes", amount: 400, role: "other" },
    { key: "rice", amount: 150, role: "carb" },
  ],
  method: ["Cook the rice as the pack says.", "Brown the chicken pieces until cooked through with no pink left.", "Stir in the tomatoes and beans and simmer for 10 minutes."],
  extras: ["Smoked paprika", "Packed with protein"],
};

describe("the pantry Pip is offered", () => {
  it("has the cheapest product of each kind the diet allows, with its label", () => {
    const all = pantryLines(products, {});
    expect(all.length).toBeGreaterThan(30);
    const chicken = all.find((p) => p.key === "chicken")!;
    expect(chicken.product).toMatch(/chicken/i);
    expect(chicken.kcal).toBeGreaterThan(90);
    const vegan = pantryLines(products, { veganOnly: true });
    expect(vegan.every((p) => !PANTRY.get(p.key)!.animal)).toBe(true);
    expect(vegan.some((p) => p.key === "tofu")).toBe(true);
    const halal = pantryLines(products, { halalOnly: true });
    expect(halal.find((p) => p.key === "chicken")!.product).toMatch(/halal/i);
    expect(halal.some((p) => p.key === "turkey-mince" || p.key === "prawns")).toBe(false);
    expect(pantryLines(products, { avoidAllergens: ["milk"] }).some((p) => p.key === "cheddar")).toBe(false);
  });
  it("is written out plainly with the target, the diet and the wish in quotes", () => {
    const req: RecipeRequest = { shop: "sainsburys", meal: "dinner", servings: 2, target: { kcal: 600, protein: 45, fatMax: 20 }, diet: { halalOnly: true, avoidAllergens: ["milk"] }, wish: 'something "Italian"', pantry: pantryLines(products, { halalOnly: true }).slice(0, 3) };
    const text = recipeUserPrompt(req);
    expect(text).toContain("Target per serving: about 600 kcal, about 45 g protein, no more than 20 g fat");
    expect(text).toContain("Diet: halal; avoids milk");
    expect(text).toContain(`Wish: "something 'Italian'"`);
    expect(text.split("\n").filter((l) => l.includes(" | per 100 ")).length).toBe(3);
  });
});

describe("checking Pip's answer", () => {
  it("refuses claims and figures the app should work out, but not product names", () => {
    expect(cleanText("A healthy curry", 100)).toBeNull();
    expect(cleanText("Only 450 kcal", 100)).toBeNull();
    expect(cleanText("Gives 40g of protein", 100)).toBeNull();
    expect(cleanText("Costs £2", 100)).toBeNull();
    expect(cleanText("Add the light coconut milk and simmer for 5 minutes.", 300)).toBe("Add the light coconut milk and simmer for 5 minutes.");
    expect(cleanText("Pour in 400 ml of water", 300)).toBe("Pour in 400 ml of water");
  });
  it("turns a good answer into a recipe from today's pantry, with the servings the person chose", () => {
    const r = recipeFromAi(answer, { servings: 2, diet: {} }, "ai-test1")!;
    expect(r.servings).toBe(2);
    expect(r.ai).toBe(true);
    expect(r.ingredients.map((i) => [i.key, i.amount, i.role])).toEqual([["chicken", 300, "protein"], ["kidney-beans", 240, "other"], ["chopped-tomatoes", 400, "other"], ["rice", 150, "carb"]]);
    expect(r.ingredients[1]!.drained).toBe(true);
    expect(r.extras).toEqual(["Smoked paprika"]); // the claim is dropped
    const f = fitRecipe(r, products, {}, { kcal: 600, protein: 45 })!;
    expect(Math.abs(f.totals.perServing.kcal - 600)).toBeLessThan(80);
  });
  it("uses halal-named meat for halal and refuses kinds the diet leaves out", () => {
    expect(recipeFromAi(answer, { servings: 2, diet: { halalOnly: true } }, "ai-test2")!.ingredients[0]!.match.all).toContain("halal");
    expect(recipeFromAi(answer, { servings: 2, diet: { vegetarianOnly: true } }, "ai-test3")).toBeNull();
  });
  it("refuses unknown kinds, silly amounts and a step with a claim", () => {
    expect(recipeFromAi({ ...answer, ingredients: [...answer.ingredients, { key: "caviar", amount: 10, role: "other" }] }, { servings: 2, diet: {} }, "ai-x")).toBeNull();
    expect(recipeFromAi({ ...answer, ingredients: [{ ...answer.ingredients[0], amount: 9000 }, ...answer.ingredients.slice(1)] }, { servings: 2, diet: {} }, "ai-x")).toBeNull();
    expect(recipeFromAi({ ...answer, method: [...answer.method, "A healthy finish."] }, { servings: 2, diet: {} }, "ai-x")).toBeNull();
    expect(recipeFromAi({ ...answer, name: "Guilt-free bowl" }, { servings: 2, diet: {} }, "ai-x")).toBeNull();
  });
  it("saves on the device and comes back the same", () => {
    const r = recipeFromAi(answer, { servings: 2, diet: {} }, "ai-abc123")!;
    const saved = recipeToSaved(r, "sainsburys", new Date("2026-10-10T12:00:00Z"));
    expect(sanitizeSavedRecipes(JSON.parse(JSON.stringify([saved])))).toEqual([saved]);
    expect(savedToRecipe(saved, {})!.ingredients.map((i) => i.amount)).toEqual([300, 240, 400, 150]);
    expect(savedToRecipe(saved, { vegetarianOnly: true })).toBeNull();
    expect(sanitizeSavedRecipes([{ ...saved, id: "bad id" }, { ...saved, shop: "../x" }])).toEqual([]);
  });
});

describe("the recipe request on the server", () => {
  const body = (extra: Partial<RecipeRequest> = {}) => ({ shop: "sainsburys", meal: "dinner", servings: 2, target: { kcal: 600, protein: 45 }, diet: {}, wish: "", pantry: pantryLines(products, {}), ...extra });
  const ok: AskPip = async () => ({ status: "ok", recipe: answer });
  it("says when it isn't switched on, and refuses a bad body", async () => {
    expect((await handleRecipe(body(), { ask: null, allow: () => true })).status).toBe(503);
    expect((await handleRecipe({ ...body(), servings: 40 }, { ask: ok, allow: () => true })).status).toBe(400);
    expect((await handleRecipe({ ...body(), extra: 1 }, { ask: ok, allow: () => true })).status).toBe(400);
  });
  it("offers Pip only the kinds the diet allows, whatever the browser sent", async () => {
    let keys: string[] = [];
    let prompt = "";
    const spy: AskPip = async (_s, user, k) => { keys = k; prompt = user; return { status: "ok", recipe: { ...answer, ingredients: answer.ingredients.filter((i) => i.key !== "chicken") } }; };
    const res = await handleRecipe(body({ diet: { vegetarianOnly: true } }), { ask: spy, allow: () => true });
    expect(res.status).toBe(200);
    expect(keys).not.toContain("chicken");
    expect(prompt).not.toContain("chicken |");
  });
  it("asks once more when the answer can't be used, and gives up kindly", async () => {
    let calls = 0;
    const bad: AskPip = async () => { calls++; return { status: "ok", recipe: { ...answer, name: "Healthy rice" } }; };
    expect((await handleRecipe(body(), { ask: bad, allow: () => true })).status).toBe(502);
    expect(calls).toBe(2);
    calls = 0;
    const thenGood: AskPip = async () => (++calls === 1 ? { status: "ok", recipe: { ...answer, name: "Healthy rice" } } : { status: "ok", recipe: answer });
    expect((await handleRecipe(body(), { ask: thenGood, allow: () => true })).status).toBe(200);
    expect((await handleRecipe(body(), { ask: async () => ({ status: "refused" }), allow: () => true })).status).toBe(502);
    calls = 0;
    expect((await handleRecipe(body(), { ask: bad, allow: () => true, timeLeft: () => 10_000 })).status).toBe(502);
    expect(calls).toBe(1);
  });
  it("limits how often one caller can ask", async () => {
    let t = 0;
    const allow = makeLimiter(2, 3, () => t);
    expect([allow("a"), allow("a"), allow("a")]).toEqual([true, true, false]);
    t = 11 * 60_000;
    expect([allow("a"), allow("a")]).toEqual([true, false]); // the day's ceiling of 3
    expect(allow("b")).toBe(true);
    expect((await handleRecipe(body(), { ask: ok, allow: () => false })).status).toBe(429);
  });
});
