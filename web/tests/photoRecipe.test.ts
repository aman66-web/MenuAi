import { describe, expect, it, vi } from "vitest";
import {
  DESCRIBE_SYSTEM_PROMPT, PHOTO_SYSTEM_PROMPT, cleanFoodBox, cleanSuggestion, foodCrop, needsMoreDetail, photoPantryPrompt, photoRecipeFromAi, photoUserPrompt, type PhotoRecipeRequest,
} from "../lib/mm/photoRecipe";
import { handleDescribePhoto, handlePhotoRecipe, isJpeg, type AskPhotoRecipe, type DescribePhoto, type PhotoCtx } from "../lib/photoRecipeHandler";

// Make it at home (lib/mm/photoRecipe.ts, lib/photoRecipeHandler.ts): the rules Pip's answer must pass and the server's checks, with a pretend AI.

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString("base64");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(400, 7)]).toString("base64");

const line = (key: string, label: string, kcal = 100) => ({ key, label, unit: "g" as const, product: `${label} 500g`, kcal, protein: 10, carbs: 10, fat: 5 });
const PANTRY = [line("chicken", "Chicken breast", 110), line("rice", "Basmati rice", 350), line("paprika", "Paprika", 280), line("salt", "Salt", 0), line("olive-oil", "Olive oil", 820), line("garlic", "Garlic purée", 150)];

const request = (over: Partial<PhotoRecipeRequest> = {}): PhotoRecipeRequest => ({
  shop: "sainsburys", servings: 2, target: { kcal: 600, protein: 40 }, diet: {}, description: "peri-peri chicken wings with spicy rice", image: JPEG, pantry: PANTRY, ...over,
});

const GOOD = {
  name: "Peri-peri chicken with spicy rice",
  blurb: "Smoky paprika chicken with fluffy rice.",
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
};

const answer = (value: unknown) => ({ status: "ok" as const, value });
const ctx = (over: Partial<PhotoCtx> = {}): PhotoCtx => ({
  ask: async () => answer(GOOD),
  describe: async () => answer({ isFood: true, description: "peri-peri chicken wings with fries and coleslaw" }),
  premium: async () => true,
  allow: () => true,
  ...over,
});

describe("Make it at home: the description", () => {
  it("asks for more detail when the description is under three words", () => {
    expect(needsMoreDetail("wings")).toBe(true);
    expect(needsMoreDetail("chicken wings")).toBe(true);
    expect(needsMoreDetail("  ")).toBe(true);
    expect(needsMoreDetail("peri peri chicken wings")).toBe(false);
  });

  it("puts the description, the diet and the pantry into the prompt, and the prompt keeps the house rules", () => {
    const p = photoUserPrompt(request({ description: 'peri-peri "wings" with rice', diet: { halalOnly: true } }));
    expect(p).toContain(`The dish, as the person describes it: "peri-peri 'wings' with rice"`);
    expect(p).toContain("Diet: halal");
    // the shop's ingredient list is its own (cached) part, with nothing about the person or the dish in it
    expect(p).not.toContain("Chicken breast 500g");
    const pantry = photoPantryPrompt(request({}).pantry);
    expect(pantry).toContain("chicken | Chicken breast | Chicken breast 500g | per 100 g: 110 kcal");
    expect(pantry).not.toMatch(/peri-peri|Diet:|People:/);
    expect(PHOTO_SYSTEM_PROMPT).toMatch(/Short title: instruction\./);
    expect(PHOTO_SYSTEM_PROMPT).toMatch(/never name a restaurant, chain or brand/);
    expect(PHOTO_SYSTEM_PROMPT).toMatch(/Never write calories/);
  });

  it("takes Pip's suggestion only when it is food and says nothing it shouldn't", () => {
    expect(cleanSuggestion({ isFood: true, description: "peri-peri chicken wings with fries" })).toEqual({ isFood: true, description: "peri-peri chicken wings with fries" });
    expect(cleanSuggestion({ isFood: false, description: "" })).toEqual({ isFood: false });
    expect(cleanSuggestion({ isFood: true, description: "a healthy salad bowl" })).toBeNull();
    expect(cleanSuggestion({ isFood: true, description: "a 450 kcal burger" })).toBeNull();
    expect(cleanSuggestion({ isFood: true, description: "word ".repeat(30) })).toBeNull();
    expect(cleanSuggestion("chicken")).toBeNull();
  });

  it("says where the food is, so the app shows the dish and not the rest of the photo (founder 2026-11-18)", () => {
    expect(DESCRIBE_SYSTEM_PROMPT).toMatch(/smallest box around the dish itself/);
    const food = { left: 0.2, top: 0.55, width: 0.5, height: 0.4 };
    expect(cleanSuggestion({ isFood: true, description: "cajun chicken pasta", food })).toEqual({ isFood: true, description: "cajun chicken pasta", food });
    // no box, a box off the photo or one too small to trust: the description still counts
    expect(cleanSuggestion({ isFood: true, description: "cajun chicken pasta", food: null })).toEqual({ isFood: true, description: "cajun chicken pasta" });
    expect(cleanFoodBox({ left: 0.9, top: 0.9, width: 0.5, height: 0.5 })).toEqual({ left: 0.9, top: 0.9, width: 0.09999999999999998, height: 0.09999999999999998 });
    expect(cleanFoodBox({ left: 0.5, top: 0.5, width: 0.01, height: 0.3 })).toBeNull();
    expect(cleanFoodBox({ left: "0.1", top: 0, width: 1, height: 1 })).toBeNull();
  });

  it("crops the photo round the food at the picture's shape, inside the photo", () => {
    // a phone screenshot (1000 x 2000) with the dish in its lower half: the crop is 4:3, holds the dish with a margin, and stays inside the photo
    const box = { left: 0.1, top: 0.6, width: 0.8, height: 0.25 };
    const c = foodCrop(1000, 2000, box);
    expect(c.width / c.height).toBeCloseTo(4 / 3, 5);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(1000 + 1e-9);
    expect(c.y + c.height).toBeLessThanOrEqual(2000 + 1e-9);
    expect(c.y).toBeLessThanOrEqual(0.6 * 2000);
    expect(c.y + c.height).toBeGreaterThanOrEqual(0.85 * 2000);
    // food filling a wide photo: the whole height, centred on the food
    const wide = foodCrop(2000, 1000, { left: 0, top: 0, width: 1, height: 1 });
    expect(wide.height).toBeCloseTo(1000, 5);
    expect(wide.width).toBeCloseTo(4000 / 3, 5);
  });
});

describe("Make it at home: Pip's recipe", () => {
  it("accepts a recipe with titled steps that says how to tell the chicken is cooked", () => {
    const r = photoRecipeFromAi(GOOD, request(), "ai-test");
    expect(r?.name).toBe("Peri-peri chicken with spicy rice");
    expect(r?.ingredients.map((i) => i.pantry)).toEqual(["chicken", "rice", "paprika", "salt", "olive-oil", "garlic"]);
    expect(r?.ai).toBe(true);
  });

  it("refuses steps without a title, steps over 45 words, too few steps and no doneness sign", () => {
    expect(photoRecipeFromAi({ ...GOOD, method: GOOD.method.map((m) => m.replace(/^[^:]+: /, "")) }, request(), "x")).toBeNull();
    expect(photoRecipeFromAi({ ...GOOD, method: [...GOOD.method.slice(0, 3), `Serve: ${"word ".repeat(50).trim()}.`] }, request(), "x")).toBeNull();
    expect(photoRecipeFromAi({ ...GOOD, method: GOOD.method.slice(0, 3) }, request(), "x")).toBeNull();
    expect(photoRecipeFromAi({ ...GOOD, method: GOOD.method.map((m) => m.replace(", until piping hot with no pink left", "")) }, request(), "x")).toBeNull();
  });

  it("refuses a recipe that claims to be a restaurant's, makes a claim, or breaks the diet", () => {
    expect(photoRecipeFromAi({ ...GOOD, name: "Copycat peri-peri chicken" }, request(), "x")).toBeNull();
    expect(photoRecipeFromAi({ ...GOOD, blurb: "Just like the official one." }, request(), "x")).toBeNull();
    expect(photoRecipeFromAi({ ...GOOD, name: "Healthy chicken rice" }, request(), "x")).toBeNull();
    expect(photoRecipeFromAi(GOOD, request({ diet: { vegetarianOnly: true } }), "x")).toBeNull();
    expect(photoRecipeFromAi({ ...GOOD, ingredients: [...GOOD.ingredients, { key: "not-a-kind", amount: 50, role: "other" }] }, request(), "x")).toBeNull();
  });
});

describe("Make it at home: the server", () => {
  it("knows a JPEG", () => {
    expect(isJpeg(JPEG)).toBe(true);
    expect(isJpeg(PNG)).toBe(false);
    expect(isJpeg("!!!")).toBe(false);
  });

  it("is off without an AI key, and checks the request, the photo and Premium before asking", async () => {
    expect((await handlePhotoRecipe(request(), ctx({ ask: null }))).status).toBe(503);
    expect((await handlePhotoRecipe({ ...request(), extra: 1 }, ctx())).status).toBe(400);
    expect((await handlePhotoRecipe(request({ image: PNG }), ctx())).status).toBe(400);
    expect((await handlePhotoRecipe(request({ description: "" }), ctx())).status).toBe(400);
    const ask = vi.fn<AskPhotoRecipe>(async () => answer(GOOD));
    expect((await handlePhotoRecipe(request(), ctx({ ask, premium: async () => false }))).status).toBe(402);
    expect((await handlePhotoRecipe(request(), ctx({ ask, allow: () => false }))).status).toBe(429);
    expect(ask).not.toHaveBeenCalled();
  });

  it("cuts the pantry to the diet whatever the phone sent", async () => {
    const res = await handlePhotoRecipe(request({ diet: { veganOnly: true }, pantry: [line("chicken", "Chicken"), line("eggs", "Eggs")] }), ctx());
    expect(res.status).toBe(422);
  });

  it("sends the photo with the prompt and returns a recipe that passes", async () => {
    const ask = vi.fn<AskPhotoRecipe>(async () => answer(GOOD));
    const res = await handlePhotoRecipe(request(), ctx({ ask }));
    expect(res.status).toBe(200);
    expect((res.body as { recipe: { name: string } }).recipe.name).toBe(GOOD.name);
    const [system, user, image, keys, pantry] = ask.mock.calls[0]!;
    expect(system).toBe(PHOTO_SYSTEM_PROMPT);
    expect(user).toContain("peri-peri chicken wings with spicy rice");
    expect(image).toBe(JPEG);
    expect(keys).toEqual(PANTRY.map((p) => p.key));
    expect(pantry).toBe(photoPantryPrompt(PANTRY));
  });

  it("asks once more with a reminder when the first answer breaks the rules, and gives up after that", async () => {
    const bad = { ...GOOD, method: GOOD.method.slice(0, 2) };
    const ask = vi.fn<AskPhotoRecipe>().mockResolvedValueOnce(answer(bad)).mockResolvedValueOnce(answer(GOOD));
    expect((await handlePhotoRecipe(request(), ctx({ ask }))).status).toBe(200);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1]![1]).toContain("Your last answer couldn't be used");
    const always = vi.fn<AskPhotoRecipe>(async () => answer(bad));
    expect((await handlePhotoRecipe(request(), ctx({ ask: always }))).status).toBe(502);
    const late = vi.fn<AskPhotoRecipe>(async () => answer(bad));
    expect((await handlePhotoRecipe(request(), ctx({ ask: late, timeLeft: () => 5_000 }))).status).toBe(502);
    expect(late).toHaveBeenCalledTimes(1);
    expect((await handlePhotoRecipe(request(), ctx({ ask: async () => ({ status: "refused" }) }))).status).toBe(502);
  });

  it("suggests a description, says when there's no food, and checks Premium", async () => {
    const boxed = await handleDescribePhoto({ image: JPEG }, ctx({ describe: async () => answer({ isFood: true, description: "cajun chicken pasta", food: { left: 0.1, top: 0.5, width: 0.6, height: 0.4 } }) }));
    expect(boxed.body).toEqual({ description: "cajun chicken pasta", food: { left: 0.1, top: 0.5, width: 0.6, height: 0.4 } });
    const ok = await handleDescribePhoto({ image: JPEG }, ctx());
    expect(ok).toEqual({ status: 200, body: { description: "peri-peri chicken wings with fries and coleslaw" } });
    expect((await handleDescribePhoto({ image: JPEG }, ctx({ describe: async () => answer({ isFood: false, description: "" }) }))).status).toBe(422);
    expect((await handleDescribePhoto({ image: JPEG }, ctx({ describe: async () => answer({ isFood: true, description: "a healthy bowl" }) }))).status).toBe(502);
    const describe = vi.fn<DescribePhoto>(async () => answer({ isFood: true, description: "x y z" }));
    expect((await handleDescribePhoto({ image: JPEG }, ctx({ describe, premium: async () => false }))).status).toBe(402);
    expect((await handleDescribePhoto({ image: PNG }, ctx({ describe }))).status).toBe(400);
    expect(describe).not.toHaveBeenCalled();
    expect((await handleDescribePhoto({ image: JPEG }, ctx({ describe: null }))).status).toBe(503);
  });
});
