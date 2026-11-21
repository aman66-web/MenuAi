import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { recipeFromAi } from "../lib/mm/aiRecipe";
import { scanFromAi } from "../lib/mm/foodScan";
import { PANTRY as KINDS, kindExcluded } from "../lib/mm/pantry";
import { handleFoodScan, type ScanCtx } from "../lib/foodScanHandler";
import { menuRefs } from "../lib/foodScanRefs";
import { handleFridgeRecipe, type FridgeCtx } from "../lib/fridgeRecipeHandler";
import { handleDescribePhoto, handlePhotoRecipe, type AskPhotoRecipe, type PhotoCtx } from "../lib/photoRecipeHandler";
import { generateKeyPair, signClaims, type EntitlementClaims } from "../lib/payments/token";
import { makeLimiter } from "../lib/recipeHandler";

// The 30-person meeting of 21 November 2026 (fixer 2: Premium, Pip's AI tools, Terms and store words): each finding with a check that would have caught it.

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString("base64");
const line = (key: string, label: string, kcal = 100) => ({ key, label, unit: "g" as const, product: `${label} 500g`, kcal, protein: 10, carbs: 10, fat: 5 });
const PANTRY = [line("chicken", "Chicken breast", 110), line("rice", "Basmati rice", 350), line("paprika", "Paprika", 280), line("salt", "Salt", 0), line("olive-oil", "Olive oil", 820), line("garlic", "Garlic purée", 150)];
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
  fromHome: ["chicken", "rice"],
};
const ok = (value: unknown) => ({ status: "ok" as const, value });
const photoBody = (kcal = 600) => ({ shop: "sainsburys", servings: 2, target: { kcal, protein: 40 }, diet: {}, description: "peri-peri chicken wings with spicy rice", image: JPEG, pantry: PANTRY });
const fridgeBody = (kcal = 600) => ({ shop: "sainsburys", servings: 2, target: { kcal }, diet: {}, have: "chicken, rice and garlic", pantry: PANTRY });
const photoCtx = (over: Partial<PhotoCtx> = {}): PhotoCtx => ({ ask: async () => ok(GOOD), describe: async () => ok({ isFood: true, description: "peri-peri chicken" }), premium: async () => true, allow: () => true, ...over });
const fridgeCtx = (over: Partial<FridgeCtx> = {}): FridgeCtx => ({ ask: async () => ok(GOOD), premium: async () => true, allow: () => true, ...over });

describe("the AI rate limits (Chloe, Priya)", () => {
  it("is still called as limit(who), and release(who) hands back that caller's newest use only", () => {
    let t = 1_000_000;
    const limit = makeLimiter(2, 10, () => t);
    expect(limit("a")).toBe(true);
    expect(limit("a")).toBe(true);
    expect(limit("a")).toBe(false);
    limit.release("a");
    t += 1;
    expect(limit("a")).toBe(true);
    expect(limit("a")).toBe(false);
    limit.release("nobody"); // nothing to hand back: no harm
    expect(limit("b")).toBe(true);
  });

  it("two different tokens for the same purchase or free week share one count; a gift keeps its own", async () => {
    const keys = await generateKeyPair();
    process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK = JSON.stringify(keys.publicJwk);
    const { limitedCaller, limitKey } = await import("../lib/photoRecipeRoute");
    const now = Math.floor(Date.now() / 1000);
    const claims = (over: Partial<EntitlementClaims>): EntitlementClaims => ({ v: 1, plan: "trial", src: "account", iat: now, exp: now + 5 * 86_400, ...over });
    const who = async (c: EntitlementClaims) => {
      const token = await signClaims(c, keys.privateJwk);
      const caller = limitedCaller(new Request("https://numbite.com/api/v1/recipe/photo", { headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": "1.2.3.4" } }));
      expect(await caller.premium()).toBe(true);
      return caller.who();
    };
    // the app is given a new token (a new iat) each time it checks the same free week or App Store purchase
    expect(await who(claims({ iat: now - 60 }))).toBe(await who(claims({ iat: now })));
    expect(await who(claims({ src: "apple", plan: "annual", iat: now - 3600 }))).toBe(await who(claims({ src: "apple", plan: "annual" })));
    const limit = makeLimiter(1, 5);
    expect(limit(await who(claims({ iat: now - 60 })))).toBe(true);
    expect(limit(await who(claims({ iat: now })))).toBe(false);
    // a gift's end moves with each token, and gift holders must never share one allowance
    expect(await who(claims({ plan: "gift", iat: now - 60 }))).not.toBe(await who(claims({ plan: "gift" })));
    // a different free week (another end) is another person
    expect(await who(claims({ exp: now + 4 * 86_400 }))).not.toBe(await who(claims({})));
    expect(limitKey("x", claims({}))).toBe(limitKey("y", claims({})));
    delete process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK;
  });

  it("an AI outage gives the use back (Try again isn't refused for it); a refusal or a recipe keeps it", async () => {
    const back = vi.fn();
    const busy = async () => ({ status: "unavailable" as const });
    expect((await handlePhotoRecipe(photoBody(), photoCtx({ ask: busy, giveBack: back }))).status).toBe(503);
    expect((await handleDescribePhoto({ image: JPEG }, photoCtx({ describe: busy, giveBack: back }))).status).toBe(503);
    expect((await handleFridgeRecipe(fridgeBody(), fridgeCtx({ ask: busy, giveBack: back }))).status).toBe(503);
    expect(back).toHaveBeenCalledTimes(3);
    back.mockClear();
    expect((await handlePhotoRecipe(photoBody(), photoCtx({ giveBack: back }))).status).toBe(200);
    expect((await handleFridgeRecipe(fridgeBody(), fridgeCtx({ ask: async () => ({ status: "refused" as const }), giveBack: back }))).status).toBe(502);
    expect(back).not.toHaveBeenCalled();
  });

  it("the routes wire giveBack to the same limit they count with", () => {
    const route = readFileSync("lib/photoRecipeRoute.ts", "utf8");
    expect(route).toMatch(/giveBack: \(\) => \(kind === "recipe" \? recipeLimit : describeLimit\)\.release\(id\.who\(\)\)/);
    expect(route).toMatch(/giveBack: \(\) => recipeLimit\.release\(id\.who\(\)\)/);
  });
});

describe("Pip's recipes (Priya)", () => {
  it("accept a GLP-1 meal size from 100 kcal, as Settings does", async () => {
    expect((await handlePhotoRecipe(photoBody(100), photoCtx())).status).toBe(200);
    expect((await handleFridgeRecipe(fridgeBody(100), fridgeCtx())).status).toBe(200);
    expect((await handlePhotoRecipe(photoBody(99), photoCtx())).status).toBe(400);
  });

  it("refuse a 12th step or a 17th ingredient instead of dropping it, and the second go says why", async () => {
    const steps = (n: number) => Array.from({ length: n }, (_, i) => `Step ${i + 1}: Stir the pan and keep it on a medium heat for a minute.`);
    expect(recipeFromAi({ ...GOOD, method: steps(11) }, { servings: 2, diet: {} }, "ai-test")).not.toBeNull();
    expect(recipeFromAi({ ...GOOD, method: steps(12) }, { servings: 2, diet: {} }, "ai-test")).toBeNull();
    const kinds = [...KINDS.values()].filter((k) => kindExcluded(k, {}) === null).slice(0, 17).map((k) => ({ key: k.key, amount: 100, role: "other" }));
    expect(kinds).toHaveLength(17);
    expect(recipeFromAi({ ...GOOD, ingredients: kinds.slice(0, 16) }, { servings: 2, diet: {} }, "ai-test")).not.toBeNull();
    expect(recipeFromAi({ ...GOOD, ingredients: kinds }, { servings: 2, diet: {} }, "ai-test")).toBeNull();
    const ask = vi.fn<AskPhotoRecipe>().mockResolvedValueOnce(ok({ ...GOOD, method: [...GOOD.method, ...steps(8)] })).mockResolvedValueOnce(ok(GOOD));
    expect((await handlePhotoRecipe(photoBody(), photoCtx({ ask }))).status).toBe(200);
    expect(ask.mock.calls[1]![1]).toContain("at most 16 ingredients");
  });
});

describe("Scan your food (Priya)", () => {
  const plate = (name: string, item = "Chicken salad", portion = "a bowl, about 300 g") => ({ name, confidence: "medium", items: [{ name: item, portion, kcal: 350, protein: 30, carbs: 20, fat: 16 }] });

  it("never shows or logs a health word in the plate, a food or a portion", () => {
    expect(scanFromAi(plate("Chicken salad"))).not.toBeNull();
    expect(scanFromAi(plate("Healthy chicken salad"))).toBeNull();
    expect(scanFromAi(plate("Chicken salad", "Lean chicken breast"))).toBeNull();
    expect(scanFromAi(plate("Chicken salad", "Chicken salad", "a healthy portion"))).toBeNull();
    // chain names that are food words are not turned down
    expect(scanFromAi(plate("Tortilla chips with salsa", "Tortilla chips"))).not.toBeNull();
    expect(scanFromAi(plate("Wasabi peas", "Wasabi peas"))).not.toBeNull();
  });

  const jpeg = `/9j/${"A".repeat(400)}`;
  const look = { status: "ok" as const, value: { isFood: true, dish: "Chicken salad", items: [{ name: "Chicken salad", portion: "a bowl", search: ["chicken salad"] }] } };
  const scanCtx = (over: Partial<ScanCtx> = {}): ScanCtx => ({ look: async () => look, estimate: async () => ok(plate("Chicken salad")), refs: async () => [], premium: async () => true, allow: () => true, ...over });

  it("asks once more, saying no health words, when the estimate has one", async () => {
    const users: string[] = [];
    const res = await handleFoodScan({ image: jpeg }, scanCtx({ estimate: async (_s, _i, u) => { users.push(u); return ok(users.length === 1 ? plate("Healthy chicken salad") : plate("Chicken salad")); } }));
    expect(res.status).toBe(200);
    expect(users[1]).toContain("no health words such as healthy");
  });

  it("gives the use back when the AI can't be reached, at the first look or the estimate", async () => {
    const back = vi.fn();
    const busy = async () => ({ status: "unavailable" as const });
    expect((await handleFoodScan({ image: jpeg }, scanCtx({ look: busy, giveBack: back }))).status).toBe(503);
    expect((await handleFoodScan({ image: jpeg }, scanCtx({ estimate: busy, giveBack: back }))).status).toBe(503);
    expect(back).toHaveBeenCalledTimes(2);
  });

  it("leaves out a chain whose figures don't line up with its dishes, and reads the files fresh", () => {
    const search = { chains: [{ id: "a", name: "Chain A", items: [["1", "Burger"], ["2", "Chips"]] as Array<[string, string]> }, { id: "b", name: "Chain B", items: [["1", "Wrap"]] as Array<[string, string]> }] };
    const numbers = { chains: [{ id: "a", k: [500, 300, 200], p: [20, 4, 1], c: [40, 40, 1], f: [25, 14, 1] }, { id: "b", k: [400], p: [20], c: [40], f: [15] }] };
    expect(menuRefs(search, numbers).map((r) => `${r.from}: ${r.name}`)).toEqual(["Chain B: Wrap"]);
    const refs = readFileSync("lib/foodScanRefs.ts", "utf8");
    expect(refs).toContain('cache: "no-store"');
    expect(refs).not.toContain("force-cache");
  });
});

describe("the screens (Dev, Priya, Sam)", () => {
  const fridge = readFileSync("app/app/recipes/fridge/page.tsx", "utf8");
  const photo = readFileSync("app/app/recipes/photo/page.tsx", "utf8");
  const plans = readFileSync("app/app/_components/AppStorePlans.tsx", "utf8");

  it("Cook with what you have: after buying Premium the request goes ahead with the new token, not the plans again", () => {
    expect(fridge).toMatch(/const askPip = \(\) => gate\("fridgeRecipe", \(\) => consent\.ask\(\(\) => void write\(\)\)\);/);
    expect(fridge).toContain("const token = paidStore.get().token;");
    expect(fridge).not.toMatch(/paid\.token/);
  });

  it("Cook with what you have: a list that couldn't be loaded says so with Try again, and the results get the screen reader's focus", () => {
    expect(fridge).toContain("useShopProducts(shop, retry)");
    expect(fridge).toMatch(/failed \? <div className="mt-3"><ErrorBox message=\{t\(PRODUCTS_FAILED\)\} onRetry=\{\(\) => setRetry\(\(n\) => n \+ 1\)\} \/>/);
    expect(fridge).toMatch(/id="fridge-results" ref=\{resultsHeading\} tabIndex=\{-1\}/);
    expect(fridge).toContain("resultsHeading.current?.focus({ preventScroll: true });");
  });

  it("Make it at home: Stop works during the photo check, and the done line says only the figures come from the products, not always their labels", () => {
    const write = photo.slice(photo.indexOf("const write = async"));
    expect(write.indexOf("abort.current = ctrl;")).toBeGreaterThan(-1);
    expect(write.indexOf("abort.current = ctrl;")).toBeLessThan(write.indexOf("await (foodCheck.current"));
    expect(write).toContain("if (ctrl.signal.aborted) { setStep(\"shops\"); return; }");
    expect(write).toContain("signal: ctrl.signal");
    // the second sort of the meeting (Tara): some figures are community numbers or the UK government's, so never "the products' own labels"
    expect(photo).toContain('t("Every figure added up from the products\' numbers")');
    expect(photo).not.toContain("Every amount, price and figure");
    expect(photo).not.toContain("products' own labels");
  });

  it("the plans: while a purchase is confirmed the buy button stays busy and the other plan can't be picked", () => {
    expect(plans).toContain('busy={busy !== null && busy !== "restore"}');
    expect(plans).toContain("onClick={() => { if (busy === null) setChosen(p.plan); }}");
    expect(plans).toContain("aria-disabled={busy !== null || undefined}");
  });
});

describe("Terms and the store words (Dev, Chloe, Olivia)", () => {
  it("the Terms describe the free week, not an Apple trial that charges when it ends", () => {
    const terms = readFileSync("app/(site)/terms/page.tsx", "utf8");
    expect(terms).toContain("<strong>The free week.</strong>");
    expect(terms).toContain("{FREE_WEEK_DAYS} days after its first sign-in in the iPhone app");
    expect(terms).not.toMatch(/The free trial\.|Apple charges the plan you chose/);
    expect(terms).toContain("<strong>Cancelling and refunds.</strong>");
  });

  it("STORE.md's 1.1 words sell no 90-day pass, no Top 5 at every chain, and the free week once per person and iPhone", () => {
    const store = readFileSync("../docs/STORE.md", "utf8");
    expect(store).not.toContain("then choose Monthly or Annual, or a one-off 90-day pass");
    expect(store).not.toContain("Top 5 picks for your goal at every chain");
    expect(store).toContain("the Top 5 picks for your goal at chains that publish protein");
    expect(store).toContain("Build 10 is in review with the old words.");
    expect(store).toContain("Your first 7 days of Premium are free (one free week per person and iPhone)");
    expect(store).toContain("One free week per person and per iPhone: if this iPhone or Apple ID already had it, the plans show at once and a sandbox purchase unlocks Premium.");
  });
});
