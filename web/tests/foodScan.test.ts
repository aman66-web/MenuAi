import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { handleFoodScan, type ScanCtx } from "../lib/foodScanHandler";
import { menuRefs, recipeRefs } from "../lib/foodScanRefs";
import {
  ESTIMATE_SYSTEM_PROMPT, FIRST_LOOK_SYSTEM_PROMPT, MAX_REFS, consistent, firstLookFromAi, indexRefs, refWords, refsFor, refsForPlate, refsPrompt, scanFromAi,
  type RefDish,
} from "../lib/mm/foodScan";

// Scan food (founder 2026-11-18): the reference dishes, the checks on Pip's answers and the server half, without a key or a payment.

const dishes: RefDish[] = [
  { from: "McDonald's", name: "Double Cheeseburger", kcal: 445, protein: 26, carbs: 34, fat: 22 },
  { from: "McDonald's", name: "Cheeseburger", kcal: 298, protein: 15, carbs: 31, fat: 12 },
  { from: "McDonald's", name: "Cheeseburger Happy Meal with Fries and Fruit Bag", kcal: 520, protein: 18, carbs: 66, fat: 20 },
  { from: "McDonald's", name: "Medium Fries", kcal: 337, protein: 3.7, carbs: 42, fat: 16 },
  { from: "Burger King", name: "Double Cheeseburger", kcal: 410, protein: 24, carbs: 30, fat: 21 },
  { from: "Five Guys", name: "Cheeseburger", kcal: 840, protein: 47, carbs: 40, fat: 55 },
  { from: "Five Guys", name: "Little Cheeseburger", kcal: 550, protein: 27, carbs: 40, fat: 32 },
  { from: "Five Guys", name: "Bacon Cheeseburger", kcal: 920, protein: 51, carbs: 40, fat: 62 },
  { from: "Nando's", name: "Peri-Salted Chips (Regular)", kcal: 386, protein: 5, carbs: 52, fat: 17 },
  { from: "Numbite recipe", name: "Chicken curry with rice", kcal: 669, protein: 61.9, carbs: 75.7, fat: 10.1, portion: "chicken breast fillets 150 g, rice 75 g" },
  { from: "Broken", name: "No numbers", kcal: Number.NaN, protein: 1, carbs: 1, fat: 1 },
];
const index = indexRefs(dishes);

describe("finding reference dishes", () => {
  it("compares plain words: no little words, a plain plural taken off", () => {
    expect(refWords("A Portion of Chips & Peas")).toEqual(["chip", "pea"]);
    expect(refWords("Glass of House Wine 175")).toEqual(["glass", "house", "wine"]);
    expect(refWords("Hummus")).toEqual(["hummu"]);
    expect(refWords("Fries")).toEqual(["frie"]);
  });

  it("leaves out a dish without all four figures", () => {
    expect(index.map((d) => d.from)).not.toContain("Broken");
    expect(index).toHaveLength(dishes.length - 1);
  });

  it("finds the closest names first, a plain dish before a long meal deal, and at most two from one chain", () => {
    const got = refsFor(index, { name: "Double cheeseburger", portion: "one burger", search: ["double cheeseburger", "cheeseburger"] });
    expect(got.slice(0, 2).map((d) => `${d.from}: ${d.name}`)).toEqual(["Burger King: Double Cheeseburger", "McDonald's: Double Cheeseburger"]);
    const perChain = new Map<string, number>();
    for (const d of got) perChain.set(d.from, (perChain.get(d.from) ?? 0) + 1);
    for (const [, n] of perChain) expect(n).toBeLessThanOrEqual(2);
    const plain = got.findIndex((d) => d.name === "Cheeseburger" && d.from === "McDonald's");
    const meal = got.findIndex((d) => d.name.startsWith("Cheeseburger Happy Meal"));
    expect(meal === -1 || plain < meal).toBe(true);
  });

  it("finds fries for chips through the searches, and a recipe for a home dish", () => {
    const chips = refsFor(index, { name: "Chips", portion: "a medium portion", search: ["fries", "chips"] });
    expect(chips.map((d) => d.name)).toEqual(expect.arrayContaining(["Medium Fries", "Peri-Salted Chips (Regular)"]));
    const curry = refsFor(index, { name: "Chicken curry with rice", portion: "a bowl", search: ["chicken curry"] });
    expect(curry[0]?.from).toBe("Numbite recipe");
  });

  it("puts the whole plate's references together, no dish twice, at most MAX_REFS, and writes them for Pip with their figures", () => {
    const refs = refsForPlate(index, [
      { name: "Double cheeseburger", portion: "", search: ["cheeseburger"] },
      { name: "Cheeseburger", portion: "", search: ["cheeseburger"] },
      { name: "Fries", portion: "", search: ["fries"] },
    ]);
    const keys = refs.map((r) => `${r.from}|${r.name}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(refs.length).toBeLessThanOrEqual(MAX_REFS);
    const text = refsPrompt(refs);
    expect(text).toContain("McDonald's: Double Cheeseburger = 445 kcal, protein 26 g, carbs 34 g, fat 22 g");
    expect(refsPrompt([])).toMatch(/No reference dishes/);
    expect(refsPrompt([dishes[9]!])).toContain("(one serving: chicken breast fillets 150 g, rice 75 g)");
  });
});

describe("the reference files", () => {
  it("reads every chain dish with all four figures from the published menus, lined up by position", () => {
    const search = JSON.parse(readFileSync("public/menus/menus-search.json", "utf8"));
    const numbers = JSON.parse(readFileSync("public/menus/menus-numbers.json", "utf8"));
    const refs = menuRefs(search, numbers);
    expect(refs.length).toBeGreaterThan(20000);
    for (const r of refs.slice(0, 500)) for (const k of ["kcal", "protein", "carbs", "fat"] as const) expect(Number.isFinite(r[k]), `${r.from} ${r.name} ${k}`).toBe(true);
    // the first chain's first dish carries that chain's first figures
    const first = search.chains.find((c: { sample?: boolean }) => !c.sample);
    const n = numbers.chains.find((c: { id: string }) => c.id === first.id);
    const hit = refs.find((r) => r.from === first.name && r.name === first.items[0][1]);
    if (n.p[0] !== null) expect(hit?.kcal).toBe(n.k[0]);
    expect(recipeRefs().length).toBeGreaterThan(100);
    expect(recipeRefs().every((r) => r.from === "Numbite recipe" && r.portion)).toBe(true);
  });
});

describe("checking Pip's answers", () => {
  const good = { name: "Double cheeseburger and chips", confidence: "medium", items: [
    { name: "Double cheeseburger", portion: "one burger, about 180 g", kcal: 450, protein: 26, carbs: 34, fat: 23 },
    { name: "Chips", portion: "a medium portion", kcal: 340, protein: 4, carbs: 43, fat: 16.5 },
  ] };

  it("keeps a good answer and sums the totals itself", () => {
    const scan = scanFromAi(good)!;
    expect(scan.total).toEqual({ kcal: 790, protein: 30, carbs: 77, fat: 40 });
    expect(scan.items).toHaveLength(2);
    expect(scan.confidence).toBe("medium");
  });

  it("turns down calories that don't fit the macros, numbers out of range, no items and a missing confidence", () => {
    expect(scanFromAi({ ...good, items: [{ ...good.items[0], kcal: 150 }] })).toBeNull();
    expect(scanFromAi({ ...good, items: [{ ...good.items[0], kcal: 1400 }] })).toBeNull();
    expect(scanFromAi({ ...good, items: [{ ...good.items[0], fat: -1 }] })).toBeNull();
    expect(scanFromAi({ ...good, items: [{ ...good.items[0], kcal: 5000, protein: 300 }] })).toBeNull();
    expect(scanFromAi({ ...good, items: [] })).toBeNull();
    expect(scanFromAi({ ...good, confidence: "certain" })).toBeNull();
    expect(scanFromAi({ ...good, name: " " })).toBeNull();
    expect(scanFromAi(null)).toBeNull();
    expect(scanFromAi({ ...good, items: Array.from({ length: 13 }, () => good.items[1]) })).toBeNull();
  });

  it("lets an alcoholic drink have more calories than its macros", () => {
    expect(consistent({ name: "Pint of lager", kcal: 220, protein: 2, carbs: 18, fat: 0 })).toBe(true);
    expect(consistent({ name: "Cola", kcal: 220, protein: 0, carbs: 18, fat: 0 })).toBe(false);
    expect(consistent({ name: "Side salad", kcal: 20, protein: 1, carbs: 3, fat: 0.2 })).toBe(true);
  });

  it("reads the first look: food with items, or no food", () => {
    expect(firstLookFromAi({ isFood: false, dish: "", items: [] })).toEqual({ isFood: false, dish: "", items: [] });
    const look = firstLookFromAi({ isFood: true, dish: "Burger and chips", items: [{ name: "Burger", portion: "one", search: ["burger", "", "beef burger", "a", "b", "c"] }] })!;
    expect(look.items[0]!.search).toEqual(["burger", "beef burger", "a", "b", "c"]);
    expect(firstLookFromAi({ isFood: true, dish: "x", items: [] })).toBeNull();
    expect(firstLookFromAi("nope")).toBeNull();
  });

  it("asks for no restaurant names and keeps the macros consistent in the prompts", () => {
    expect(ESTIMATE_SYSTEM_PROMPT).toMatch(/never a restaurant's or brand's name/);
    expect(ESTIMATE_SYSTEM_PROMPT).toMatch(/4 kcal a gram, fat about 9/);
    expect(FIRST_LOOK_SYSTEM_PROMPT).toMatch(/Don't guess any nutrition figures yet/);
    // founder 2026-11-18: a photo of a dish on a website was turned down as "not food"; a dish on a screen, menu or pack counts, and only the one aimed at
    expect(FIRST_LOOK_SYSTEM_PROMPT).toMatch(/A dish on a screen, in a menu, in an advert or on a pack counts/);
    expect(FIRST_LOOK_SYSTEM_PROMPT).toMatch(/describe only the one in the middle/);
    expect(ESTIMATE_SYSTEM_PROMPT).toMatch(/estimate one ordinary serving of it/);
  });
});

describe("what the person typed the food is (founder 2026-11-18: \"before they take a photo, they have to type in what the food is\")", () => {
  it("is cleaned to one short line with no quote marks", async () => {
    const { cleanDescription, describedPrompt, MAX_DESCRIPTION } = await import("../lib/mm/foodScan");
    expect(cleanDescription('  Chicken  "korma"\nwith rice ')).toBe("Chicken korma with rice");
    expect(cleanDescription(42)).toBe("");
    expect(cleanDescription("a".repeat(500)).length).toBe(MAX_DESCRIPTION);
    expect(describedPrompt("")).toBe("");
    expect(describedPrompt("chicken korma")).toMatch(/The person typed what this is: "chicken korma"/);
  });
});

describe("the server half", () => {
  const jpeg = `/9j/${"A".repeat(400)}`;
  const look = { status: "ok" as const, value: { isFood: true, dish: "Burger and chips", items: [{ name: "Double cheeseburger", portion: "one", search: ["cheeseburger"] }, { name: "Chips", portion: "medium", search: ["fries"] }] } };
  const estimate = { status: "ok" as const, value: { name: "Burger and chips", confidence: "high", items: [{ name: "Double cheeseburger", portion: "one", kcal: 450, protein: 26, carbs: 34, fat: 23 }] } };
  const ctx = (over: Partial<ScanCtx> = {}): ScanCtx => ({
    look: async () => look,
    estimate: async () => estimate,
    refs: async () => index,
    premium: async () => true,
    allow: () => true,
    ...over,
  });

  it("answers with an estimate made from the photo, the first look and the reference dishes", async () => {
    let seen = "";
    const res = await handleFoodScan({ image: jpeg }, ctx({ estimate: async (_s, image, user) => { seen = `${image.slice(0, 4)}|${user}`; return estimate; } }));
    expect(res.status).toBe(200);
    expect((res.body.scan as { total: { kcal: number } }).total.kcal).toBe(450);
    expect(seen.startsWith("/9j/|At a first look the plate is: Burger and chips.")).toBe(true);
    expect(seen).toContain("McDonald's: Double Cheeseburger = 445 kcal");
  });

  it("passes what the person typed the food is to both looks, cleaned (an older app that sends none still works)", async () => {
    let lookNote: string | undefined = "unset";
    let estimateUser = "";
    const res = await handleFoodScan(
      { image: jpeg, description: ' chicken "korma" with rice ' },
      ctx({ look: async (_s, _i, note) => { lookNote = note; return look; }, estimate: async (_s, _i, user) => { estimateUser = user; return estimate; } }),
    );
    expect(res.status).toBe(200);
    expect(lookNote).toBe('The person typed what this is: "chicken korma with rice". Use their words to tell what the food is and how it was made, but count only what you can see in the photo.');
    expect(estimateUser.startsWith('The person typed what this is: "chicken korma with rice".')).toBe(true);
    let none: string | undefined = "unset";
    await handleFoodScan({ image: jpeg }, ctx({ look: async (_s, _i, note) => { none = note; return look; } }));
    expect(none).toBeUndefined();
  });

  it("checks the request, Premium and the limit before any AI call", async () => {
    let calls = 0;
    const counting = ctx({ look: async () => { calls++; return look; } });
    expect((await handleFoodScan({ image: "not a photo" }, counting)).status).toBe(400);
    expect((await handleFoodScan({ image: `iVBO${"A".repeat(400)}` }, counting)).status).toBe(400);
    expect((await handleFoodScan({ image: jpeg, extra: 1 }, counting)).status).toBe(400);
    expect((await handleFoodScan({ image: jpeg, description: "x".repeat(401) }, counting)).status).toBe(400);
    expect((await handleFoodScan({ image: jpeg }, { ...counting, premium: async () => false })).status).toBe(402);
    expect((await handleFoodScan({ image: jpeg }, { ...counting, allow: () => false })).status).toBe(429);
    expect(calls).toBe(0);
    expect((await handleFoodScan({ image: jpeg }, { ...counting, look: null })).status).toBe(503);
  });

  it("says when the photo isn't food, and goes on without references if they can't be read", async () => {
    const notFood = await handleFoodScan({ image: jpeg }, ctx({ look: async () => ({ status: "ok", value: { isFood: false, dish: "", items: [] } }) }));
    expect([notFood.status, notFood.body.error]).toEqual([422, "not_food"]);
    let user = "";
    const noRefs = await handleFoodScan({ image: jpeg }, ctx({ refs: async () => { throw new Error("offline"); }, estimate: async (_s, _i, u) => { user = u; return estimate; } }));
    expect(noRefs.status).toBe(200);
    expect(user).toMatch(/No reference dishes were found/);
  });

  it("tries once more when an answer can't be used, then gives up", async () => {
    let tries = 0;
    const bad = { status: "ok" as const, value: { name: "x", confidence: "high", items: [{ name: "Burger", portion: "", kcal: 100, protein: 50, carbs: 50, fat: 50 }] } };
    const res = await handleFoodScan({ image: jpeg }, ctx({ estimate: async (_s, _i, u) => { tries++; return tries === 1 ? bad : (u.includes("couldn't be used") ? estimate : bad); } }));
    expect(res.status).toBe(200);
    expect(tries).toBe(2);
    let always = 0;
    const fail = await handleFoodScan({ image: jpeg }, ctx({ estimate: async () => { always++; return bad; } }));
    expect([fail.status, always]).toEqual([502, 2]);
    const refused = await handleFoodScan({ image: jpeg }, ctx({ estimate: async () => ({ status: "refused" }) }));
    expect(refused.status).toBe(502);
  });
});
