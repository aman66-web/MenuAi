import { readFileSync, writeFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  KnownFigures, cardNames, checkSentence, figuresIn, parseEvent, plainText, sameFigure, sanitizeCard, takeSentences,
  type AskPipRequest, type PipEvent,
} from "../lib/mm/askPip";
import { PIP_SYSTEM_PROMPT, aboutPrompt, askPipSchema, makePipLimiter, prepareAskPip, runAskPip, toMessages, ModelUnavailable, type AskPipCtx, type PipModel } from "../lib/askPipHandler";
import { PIP_TOOLS, dishClash, findChain, prefsOf, recipeFigures, runTool, type PipData } from "../lib/askPipTools";
import { RECIPES } from "../lib/mm/recipeBook";
import { decodeShopProducts, type ShopFile, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";
import { uncheckedDiet } from "../lib/mm/menu-view";
import type { Chain } from "../lib/mm/types";

// Ask Pip (lib/mm/askPip.ts, lib/askPipTools.ts, lib/askPipHandler.ts): the figures guard (CLAUDE.md rule 1: a sentence with a figure no tool gave is never
// shown), the food-words guard (rule 3), the tools against the app's real published menus and supermarket labels, and the chat loop with a scripted model.

// ----------------------------------------------------------------------------------------------------------------------- fixtures: the real published files

const nandos = JSON.parse(readFileSync("public/menus/chain-nandos.json", "utf8")) as Chain;
const menus = JSON.parse(readFileSync("public/menus/menus-manifest.json", "utf8")) as { chains: Array<{ id: string; name: string; cuisine: string; sample: boolean }> };
const shopManifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
let sainsburys: ShopProduct[] | null = null;
const sainsburysProducts = () => (sainsburys ??= decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")) as ShopFile));

const data: PipData = {
  chains: async () => menus.chains.filter((c) => !c.sample).map(({ id, name, cuisine }) => ({ id, name, cuisine })),
  chain: async (id) => (id === "nandos" ? nandos : null),
  shops: async () => shopManifest,
  products: async (id) => (id === "sainsburys" ? sainsburysProducts() : null),
};

const request = (over: Partial<AskPipRequest> = {}, text = "What can I have at Nando's?"): AskPipRequest => ({
  messages: [{ role: "user", text }],
  me: { goal: "lose", kcal: 1800, protein: 130, diet: [], avoid: [], shops: ["sainsburys"], now: "Thursday 18:40" },
  day: null,
  saved: [],
  plan: null,
  ...over,
});

// ----------------------------------------------------------------------------------------------------------------------- the figures guard

describe("figures in a sentence", () => {
  it("finds calories, grams, percentages and prices, and ranges", () => {
    expect(figuresIn("The wrap is 514 kcal with 36.2 g protein.")).toEqual([{ value: 514, money: false }, { value: 36.2, money: false }]);
    expect(figuresIn("A 600-calorie meal")).toEqual([{ value: 600, money: false }]);
    expect(figuresIn("about 20% of your day")).toEqual([{ value: 20, money: false }]);
    expect(figuresIn("It costs £4.50 or 85p a serving.")).toEqual([{ value: 4.5, money: true }, { value: 0.85, money: true }]);
    expect(figuresIn("Between 300 and 400 kcal")).toEqual([{ value: 400, money: false }]);
    expect(figuresIn("300 to 400 kcal")).toEqual([{ value: 300, money: false }, { value: 400, money: false }]);
    expect(figuresIn("Your 1,800 kcal day")).toEqual([{ value: 1800, money: false }]);
  });

  it("leaves plain counts alone (two eggs, day 3, 20 minutes)", () => {
    expect(figuresIn("Have 2 eggs on day 3, ready in 20 minutes.")).toEqual([]);
  });

  it("allows the rounding people do, and nothing else", () => {
    expect(sameFigure(514, 514)).toBe(true);
    expect(sameFigure(36, 36.2)).toBe(true);
    expect(sameFigure(510, 514)).toBe(true); // to the nearest 10
    expect(sameFigure(515, 514)).toBe(true); // to the nearest 5
    expect(sameFigure(500, 514)).toBe(false);
    expect(sameFigure(37, 36.2)).toBe(false);
    expect(sameFigure(40, 36.2)).toBe(false); // under 100: no rounding to tens
    expect(sameFigure(4.5, 4.5, true)).toBe(true);
    expect(sameFigure(4.6, 4.5, true)).toBe(false);
  });

  it("drops a sentence with a made-up figure and keeps one whose figures came from a tool", () => {
    const known = new KnownFigures();
    known.add(JSON.stringify({ kcal: 514, protein: 36.2, cost_per_serving: 1.62 }));
    expect(checkSentence("The Grilled Chicken Wrap has 514 kcal and 36 g protein.", known)).toEqual({ ok: true });
    expect(checkSentence("It costs about £1.62 a serving.", known)).toEqual({ ok: true });
    expect(checkSentence("A side of chips adds about 300 kcal.", known)).toEqual({ ok: false, why: "figure" });
    expect(checkSentence("Together that's 828 kcal.", known)).toEqual({ ok: false, why: "figure" });
    expect(checkSentence("Most people need 30 g of protein a meal.", known)).toEqual({ ok: false, why: "figure" });
    expect(checkSentence("That's around five hundred calories.", known)).toEqual({ ok: false, why: "words" });
    expect(checkSentence("Spinach adds 3% of your iron.", known)).toEqual({ ok: false, why: "figure" });
    expect(checkSentence("Try the wrap with a side salad.", known)).toEqual({ ok: true });
  });

  it("drops sentences that judge food (rule 3)", () => {
    const known = new KnownFigures();
    for (const s of ["That's a healthy choice.", "Skip the junk.", "Salmon is a superfood.", "Avoid bad carbs.", "Have a cheat meal on Saturday.", "A guilt-free pudding."]) {
      expect(checkSentence(s, known)).toEqual({ ok: false, why: "judged" });
    }
    expect(checkSentence("Grilled chicken is a good way to reach your protein.", known)).toEqual({ ok: true });
  });
});

describe("sentences from a stream", () => {
  it("splits at full stops followed by a space and at line breaks, never inside a decimal", () => {
    expect(takeSentences("It has 4.5 g fat. Next one")).toEqual({ sentences: ["It has 4.5 g fat."], rest: " Next one" });
    expect(takeSentences("First line\n• second", false)).toEqual({ sentences: ["First line\n"], rest: "• second" });
    expect(takeSentences("Last bit", true)).toEqual({ sentences: ["Last bit"], rest: "" });
    expect(takeSentences("Ends here.")).toEqual({ sentences: [], rest: "Ends here." });
  });

  it("takes markdown out", () => {
    expect(plainText("**Grilled** chicken\n- one\n## Head")).toBe("Grilled chicken\n• one\nHead");
  });
});

describe("the stream's lines on the phone", () => {
  it("reads each kind of line and checks cards field by field", () => {
    expect(parseEvent('{"t":"say","text":"Hello."}')).toEqual({ t: "say", text: "Hello." });
    expect(parseEvent('{"t":"end","left":12}')).toEqual({ t: "end", left: 12 });
    expect(parseEvent("not json")).toBeNull();
    expect(sanitizeCard({ kind: "dishes", chain: { id: "nandos", name: "Nando's" }, items: [{ id: "x", name: "X", serving: "1", kcal: "lots" }] })).toBeNull();
    const card = sanitizeCard({ kind: "recipes", shop: { id: "sainsburys", name: "Sainsbury's" }, items: [{ id: "r", name: "R", meal: "dinner", minutes: 20, kcal: 500, protein: 40, carbs: 50, fat: 10, cost: 1.5 }] });
    expect(card && cardNames(card)).toBe("Shown recipes (Sainsbury's): R [r]");
  });
});

// ----------------------------------------------------------------------------------------------------------------------- the tools, on the real files

describe("tools", () => {
  it("finds a restaurant however it is typed", async () => {
    expect(await findChain(data, "nandos")).toMatchObject({ id: "nandos" });
    expect(await findChain(data, "Nando's")).toMatchObject({ id: "nandos" });
    expect(await findChain(data, "zzzz not a place")).toEqual({ candidates: [] });
  });

  it("searches a menu with the restaurant's own figures, and says what clashes with an allergy", async () => {
    const req = request({ me: { ...request().me, avoid: ["milk"] } });
    const out = await runTool("search_menu", { restaurant: "Nando's", words: "wrap", sort: "protein" }, data, req);
    const r = out.result as { fits_diet: Array<{ id: string; kcal: number; protein: number }>; clash_with_diet: Array<{ id: string; clash: string[] }> };
    const wrap = nandos.items.find((i) => i.id === "grilled-chicken-wrap")!;
    // the grilled chicken wrap contains milk: it is in the clashes with the reason, with its own figures
    const clash = r.clash_with_diet.find((d) => d.id === wrap.id);
    expect(clash?.clash).toContain("Contains milk");
    expect(r.fits_diet.every((d) => d.id !== wrap.id)).toBe(true);
    // every figure is the menu's own
    for (const d of r.fits_diet) {
      const item = nandos.items.find((i) => i.id === d.id)!;
      expect(d.kcal).toBe(item.nutrients.calories);
      expect(d.protein).toBe(item.nutrients.protein ?? null);
    }
  });

  it("says when a dish has no allergen information and the person avoids one", () => {
    const item = { ...nandos.items[0]!, allergens: undefined };
    const prefs = prefsOf(request({ me: { ...request().me, avoid: ["nuts"] } }));
    expect(dishClash(item, prefs, uncheckedDiet(nandos.items, prefs, "nandos"))).toContain("No allergen information published for this dish");
  });

  it("shows dishes as a card with the published figures, and adds up one meal", async () => {
    const out = await runTool("show_dishes", { restaurant_id: "nandos", dish_ids: ["1-4-chicken", "sweet-potato-wedges"], one_meal: true }, data, request());
    expect(out.card?.kind).toBe("dishes");
    const card = out.card as Extract<NonNullable<typeof out.card>, { kind: "dishes" }>;
    const quarter = nandos.items.find((i) => i.id === "1-4-chicken")!.nutrients;
    const wedges = nandos.items.find((i) => i.id === "sweet-potato-wedges")!.nutrients;
    expect(card.items[0]).toMatchObject({ kcal: quarter.calories, protein: quarter.protein });
    expect(card.total?.kcal).toBe(Math.round(quarter.calories + wedges.calories));
    expect((out.result as { together: { kcal: number } }).together.kcal).toBe(card.total?.kcal);
  });

  it("refuses ids that aren't on the menu", async () => {
    const out = await runTool("show_dishes", { restaurant_id: "nandos", dish_ids: ["made-up-dish"] }, data, request());
    expect(out.isError).toBe(true);
    expect(out.card).toBeUndefined();
  });

  it("gives a recipe's figures as the recipe code works them out from the shop's labels", async () => {
    const out = await runTool("search_recipes", { words: "chicken", meal: "dinner" }, data, request());
    const list = (out.result as { recipes: Array<{ id: string; kcal: number; protein: number }> }).recipes;
    expect(list.length).toBeGreaterThan(0);
    const first = RECIPES.find((r) => r.id === list[0]!.id)!;
    const again = recipeFigures(first, prefsOf(request()), "sainsburys", sainsburysProducts());
    expect(list[0]).toMatchObject({ kcal: again!.kcal, protein: again!.protein });
    const shown = await runTool("show_recipes", { recipe_ids: [list[0]!.id] }, data, request());
    expect(shown.card).toMatchObject({ kind: "recipes", shop: { id: "sainsburys" }, items: [{ id: list[0]!.id, kcal: again!.kcal }] });
  }, 30_000);

  it("keeps recipes to the person's diet", async () => {
    const out = await runTool("search_recipes", { words: "chicken" }, data, request({ me: { ...request().me, diet: ["vegetarianOnly"] } }));
    const list = (out.result as { recipes: Array<{ name: string }> }).recipes;
    expect(list.every((r) => !/chicken/i.test(r.name) || /quorn|meat-free/i.test(r.name))).toBe(true);
  }, 30_000);

  it("searches a supermarket's products with their label figures", async () => {
    const out = await runTool("search_products", { words: "greek yogurt", sort: "protein" }, data, request());
    const r = out.result as { shop: { id: string }; products: Array<{ id: string; kcal: number; protein: number }> };
    expect(r.shop.id).toBe("sainsburys");
    const p = sainsburysProducts().find((x) => x.id === r.products[0]!.id)!;
    expect(r.products[0]).toMatchObject({ kcal: p.nutrition!.kcal, protein: p.nutrition!.protein });
  }, 30_000);

  it("gives the person's own day, saved recipes and plan only when asked", async () => {
    const day = { entries: [{ name: "Porridge", meal: "breakfast", kcal: 310, protein: 12, carbs: 50, fat: 6 }], total: { kcal: 310, protein: 12, carbs: 50, fat: 6 }, left: { kcal: 1490, protein: 118 } };
    expect((await runTool("get_my_day", {}, data, request({ day }))).result).toMatchObject({ left: { kcal: 1490 } });
    const id = RECIPES.find((r) => !r.ai)!.id;
    expect((await runTool("get_my_saved_recipes", {}, data, request({ saved: [id] }))).result).toMatchObject({ saved: [{ id }] });
    expect((await runTool("get_my_meal_plan", {}, data, request())).result).toMatchObject({ plan: null });
  });

  it("sets up a meal plan from the person's words with the meal plan's own answers", async () => {
    const out = await runTool("make_meal_plan", { aim: "loseFat", cook_weekday: 30, spice: "mild", notes: "No mushrooms", style: "highProtein" }, data, request());
    expect(out.card).toEqual({ kind: "plan", handoff: { answers: { aim: "loseFat", cookWeekday: 30, spice: "mild", notes: "No mushrooms" }, style: "highProtein" }, lines: [] });
    expect((await runTool("make_meal_plan", { aim: "bulk" }, data, request())).isError).toBe(true);
  });

  it("every tool the model is given has an answer", async () => {
    for (const t of PIP_TOOLS) expect((await runTool(t.name, {}, data, request())).result).toBeTruthy();
    expect((await runTool("not_a_tool", {}, data, request())).isError).toBe(true);
  }, 30_000);
});

// ----------------------------------------------------------------------------------------------------------------------- the request and the prompt

describe("the request", () => {
  it("is checked strictly: the last message is the person's, nothing else about them", () => {
    expect(askPipSchema.safeParse(request()).success).toBe(true);
    expect(askPipSchema.safeParse({ ...request(), messages: [{ role: "pip", text: "Hi" }] }).success).toBe(false);
    expect(askPipSchema.safeParse({ ...request(), me: { ...request().me, email: "a@b.c" } }).success).toBe(false);
    expect(askPipSchema.safeParse({ ...request(), messages: [{ role: "user", text: "x".repeat(501) }] }).success).toBe(false);
  });

  it("tells the AI who the person is without a name, and never calls Pip a dietitian", () => {
    const about = aboutPrompt(request({ me: { ...request().me, diet: ["vegetarianOnly"], avoid: ["peanuts"] } }), new Map([["sainsburys", "Sainsbury's"]]));
    expect(about).toContain("1800 kcal and 130 g protein");
    expect(about).toContain("vegetarian");
    expect(about).toContain("peanuts");
    expect(about).toContain("Sainsbury's");
    expect(PIP_SYSTEM_PROMPT).toContain("food guide and nutrition coach");
    expect(PIP_SYSTEM_PROMPT).toMatch(/not a doctor, dietitian or nutritionist/);
    expect(PIP_SYSTEM_PROMPT).toMatch(/GP or a registered dietitian/);
  });

  it("starts the conversation with the person's words", () => {
    expect(toMessages([{ role: "pip", text: "Hi" }, { role: "user", text: "Hello" }])).toEqual([{ role: "user", content: "Hello" }]);
  });
});

// ----------------------------------------------------------------------------------------------------------------------- the chat loop, with a scripted model

type Round = { text?: string; tools?: Array<{ name: string; input: Record<string, unknown> }>; stop?: string };
function scripted(rounds: Round[], seen: Anthropic.Beta.BetaMessageParam[][] = []): PipModel {
  let i = 0;
  return async ({ messages, onText }) => {
    seen.push(structuredClone(messages));
    const r = rounds[i++] ?? { text: "Done." };
    // the words come in small pieces, as a stream does
    for (const piece of (r.text ?? "").match(/[\s\S]{1,7}/g) ?? []) onText(piece);
    const content: Anthropic.Beta.BetaContentBlock[] = [
      ...(r.text ? [{ type: "text", text: r.text, citations: null } as Anthropic.Beta.BetaTextBlock] : []),
      ...(r.tools ?? []).map((t, j) => ({ type: "tool_use", id: `t${i}${j}`, name: t.name, input: t.input } as Anthropic.Beta.BetaToolUseBlock)),
    ];
    return { content, stop: r.stop ?? (r.tools?.length ? "tool_use" : "end_turn") };
  };
}

function ctxWith(model: PipModel | null, over: Partial<AskPipCtx> = {}): AskPipCtx {
  const limiter = makePipLimiter(15, 40);
  return { model, data, premium: async () => true, take: () => limiter.take("me"), giveBack: () => limiter.release("me"), ...over };
}

async function chat(model: PipModel, req = request()): Promise<PipEvent[]> {
  const ctx = ctxWith(model);
  const ready = await prepareAskPip(req, ctx);
  if ("status" in ready) throw new Error(ready.message);
  const events: PipEvent[] = [];
  await runAskPip(ready.req, ready.left, ctx, (e) => events.push(e));
  return events;
}

const words = (events: PipEvent[]) => events.filter((e): e is Extract<PipEvent, { t: "say" }> => e.t === "say").map((e) => e.text).join("");

describe("the chat loop", () => {
  it("never shows a figure the model made up, and shows the ones the tools gave", async () => {
    const wrap = nandos.items.find((i) => i.id === "grilled-chicken-pitta")!;
    const seen: Anthropic.Beta.BetaMessageParam[][] = [];
    const events = await chat(scripted([
      // before looking anything up, a made-up figure: dropped
      { text: "Nando's usually has dishes around 450 kcal. Let me look. ", tools: [{ name: "search_menu", input: { restaurant: "Nando's", words: "pitta" } }] },
      { tools: [{ name: "show_dishes", input: { restaurant_id: "nandos", dish_ids: [wrap.id] } }] },
      // after the tools: the real figures pass, the made-up side doesn't
      { text: `The ${wrap.name} has ${wrap.nutrients.calories} kcal and ${Math.round(wrap.nutrients.protein!)} g protein. Add chips for about 350 kcal more. Enjoy!` },
    ], seen));
    const said = words(events);
    expect(said).toContain(`${wrap.nutrients.calories} kcal`);
    expect(said).toContain("Let me look.");
    expect(said).toContain("Enjoy!");
    expect(said).not.toContain("450");
    expect(said).not.toContain("350");
    // what Pip was doing, and the card from the menu's own figures
    expect(events).toContainEqual({ t: "doing", what: "menu", name: "Nando's" });
    const card = events.find((e) => e.t === "card");
    expect(card).toMatchObject({ t: "card", card: { kind: "dishes", items: [{ id: wrap.id, kcal: wrap.nutrients.calories }] } });
    expect(events[events.length - 1]).toEqual({ t: "end", left: 39 });
    // the tool results went back to the model, every round's reply passed back whole
    expect(seen[1]!.length).toBe(3);
    expect(seen[1]![1]!.role).toBe("assistant");
    expect(JSON.stringify(seen[1]![2])).toContain("tool_result");
  });

  it("says sorry instead of nothing when every sentence is held back", async () => {
    const events = await chat(scripted([{ text: "That's about 500 kcal." }]));
    expect(words(events)).toBe("Sorry, I couldn't answer that. Try asking another way.");
  });

  it("answers a refusal kindly", async () => {
    const events = await chat(scripted([{ stop: "refusal" }]));
    expect(words(events)).toBe("I can't help with that one. Ask me about food, meals or your targets.");
  });

  it("hands back the allowance when Anthropic can't be reached", async () => {
    const limiter = makePipLimiter(15, 40);
    const ctx = ctxWith(async () => { throw new ModelUnavailable(); }, { take: () => limiter.take("me"), giveBack: () => limiter.release("me") });
    const ready = await prepareAskPip(request(), ctx);
    if ("status" in ready) throw new Error("refused");
    const events: PipEvent[] = [];
    await runAskPip(ready.req, ready.left, ctx, (e) => events.push(e));
    expect(events).toEqual([{ t: "fail", error: "busy", message: "Pip can't do this right now. Please try again in a little while." }]);
    expect(limiter.take("me")).toEqual({ ok: true, left: 39 });
  });

  it("refuses without Premium, without a key, and past the day's 40", async () => {
    expect(await prepareAskPip(request(), ctxWith(scripted([]), { premium: async () => false }))).toMatchObject({ status: 402, error: "premium" });
    expect(await prepareAskPip(request(), ctxWith(null))).toMatchObject({ status: 503 });
    expect(await prepareAskPip({ nope: true }, ctxWith(scripted([])))).toMatchObject({ status: 400 });
    let t = 0;
    const limiter = makePipLimiter(15, 40, () => (t += 60_000)); // one a minute: never 15 in ten minutes
    const ctx = ctxWith(scripted([]), { take: () => limiter.take("me") });
    for (let i = 0; i < 40; i++) expect("req" in (await prepareAskPip(request(), ctx))).toBe(true);
    expect(await prepareAskPip(request(), ctx)).toMatchObject({ status: 429, message: "That's all your questions for today. Pip will be back tomorrow." });
  });

  it("slows down a burst", () => {
    const limiter = makePipLimiter(15, 40, () => 1000);
    for (let i = 0; i < 15; i++) limiter.take("me");
    expect(limiter.take("me")).toEqual({ ok: false, why: "burst" });
  });
});

// ----------------------------------------------------------------------------------------------------------------------- the browser check's answers

// e2e/askpip.mjs plays these back in place of the server: three answers made by the real tools on the real files, with a scripted model. Rewrite them with
// WRITE_ASKPIP_E2E=1 npx vitest run tests/askPip.test.ts after the menus or recipes change.
describe("the browser check's answers (e2e/askpip.mjs)", () => {
  /** A model that picks from what its first search found (the recipe ids aren't known in advance). */
  const fromSearch = (search: { name: string; input: Record<string, unknown> }, show: (found: Record<string, unknown>) => { name: string; input: Record<string, unknown> }, text: string): PipModel => {
    let round = 0;
    return async ({ messages, onText }) => {
      round++;
      if (round === 1) return { content: [{ type: "tool_use", id: "s1", name: search.name, input: search.input } as Anthropic.Beta.BetaToolUseBlock], stop: "tool_use" };
      if (round === 2) {
        const last = messages[messages.length - 1]!.content as Anthropic.Beta.BetaToolResultBlockParam[];
        const found = JSON.parse(String(last[0]!.content)) as Record<string, unknown>;
        const s = show(found);
        return { content: [{ type: "tool_use", id: "s2", name: s.name, input: s.input } as Anthropic.Beta.BetaToolUseBlock], stop: "tool_use" };
      }
      onText(text);
      return { content: [{ type: "text", text, citations: null } as Anthropic.Beta.BetaTextBlock], stop: "end_turn" };
    };
  };

  it("are made by the real tools, and keep to the rules", async () => {
    const milkFree = request({ me: { ...request().me, avoid: ["milk"] } });
    const menu = await chat(fromSearch(
      { name: "search_menu", input: { restaurant: "Nando's", words: "chicken" } },
      () => ({ name: "show_dishes", input: { restaurant_id: "nandos", dish_ids: ["1-4-chicken", "sweet-potato-wedges", "grilled-chicken-wrap"], one_meal: false } }),
      "The quarter chicken with sweet potato wedges suits your protein well. The Grilled Chicken Wrap contains milk, so I'd skip that one.",
    ), milkFree);
    const recipes = await chat(fromSearch(
      { name: "search_recipes", input: { words: "chicken", meal: "dinner" } },
      (found) => ({ name: "show_recipes", input: { recipe_ids: (found.recipes as Array<{ id: string }>).slice(0, 2).map((r) => r.id) } }),
      "Here are two chicken dinners you could cook tonight. Tap Save to keep one in My recipes.",
    ), request({}, "What can I have for dinner tonight?"));
    const plan = await chat(scripted([
      { tools: [{ name: "make_meal_plan", input: { aim: "loseFat", cook_weekday: 30, spice: "mild" } }] },
      { text: "Your week is set up: dinners in 30 minutes or less, nothing too spicy. Tap View meal plan and I'll make it." },
    ]), request({}, "Make me a meal plan for this week"));
    for (const events of [menu, recipes, plan]) {
      expect(events.some((e) => e.t === "card")).toBe(true);
      expect(events[events.length - 1]!.t).toBe("end");
    }
    expect(JSON.stringify(menu)).toContain("Contains milk");
    if (process.env.WRITE_ASKPIP_E2E) {
      writeFileSync("e2e/fixtures/askpip-streams.json", `${JSON.stringify({ menu, recipes, plan }, null, 1)}\n`);
    }
  }, 30_000);
});

describe("where the chat is switched on (founder 2026-11-26)", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("the button, onboarding screen and Premium line need a build that sells Premium; the route and privacy page need only the switch", () => {
    expect(src("lib/mm/askPip.ts")).toMatch(/export const ASK_PIP_API_ENABLED = process\.env\.NEXT_PUBLIC_ASK_PIP === "1";/);
    expect(src("lib/mm/askPip.ts")).toMatch(/export const ASK_PIP_ENABLED = ASK_PIP_API_ENABLED && GATING_ENABLED;/);
    expect(src("app/api/v1/pip/chat/route.ts")).toMatch(/if \(!ASK_PIP_API_ENABLED\) return notFound\(request\);/);
    expect(src("app/(site)/privacy/page.tsx")).toMatch(/\{ASK_PIP_API_ENABLED && \(/);
    expect(src("app/app/_components/AskPip.tsx")).toMatch(/if \(!ASK_PIP_ENABLED\) return null;/);
  });
  it("both app packs switch it on unless PACK_ASK_PIP=0", () => {
    for (const p of ["../scripts/build_app_web.sh", "../scripts/build_android_web.sh"]) {
      expect(src(p)).toMatch(/^export NEXT_PUBLIC_ASK_PIP="\$\{PACK_ASK_PIP:-1\}"$/m);
    }
  });
});
