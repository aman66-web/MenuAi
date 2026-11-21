// Pip's search help (founder 2026-11-21: "use AI to find and figure out what they're trying to search"): only words go and come back, a suggestion is cleaned
// before it is shown, one question is asked once a day, and a caller over the limit gets 429.
import { describe, expect, it } from "vitest";
import { cleanPhrases, helpQuery } from "../lib/mm/searchHelp";
import { handleSearchHelp } from "../lib/searchHelpHandler";

describe("search help", () => {
  it("cleans what comes back: words only, at most three, no repeats, never the typed words", () => {
    expect(cleanPhrases(["McChicken Sandwich", "mcchicken sandwich", "McDonald's", "<script>", 42, "Mc chick", "Nando's", "extra"], "Mc chick")).toEqual(["McChicken Sandwich", "McDonald's", "Nando's"]);
    expect(cleanPhrases("not a list")).toEqual([]);
  });

  it("sends only a short search", () => {
    expect(helpQuery("  mc   chick ")).toBe("mc chick");
    expect(helpQuery("x")).toBeNull();
    expect(helpQuery("a".repeat(81))).toBeNull();
    expect(helpQuery(7)).toBeNull();
  });

  it("asks once for the same words, keeps to the limit, and says when it can't help", async () => {
    let calls = 0;
    const cache = new Map<string, { phrases: string[]; at: number }>();
    let allowed = 1;
    const ctx = { ask: async () => { calls++; return { status: "ok" as const, phrases: ["McChicken Sandwich"] }; }, allow: () => allowed-- > 0, cache, now: () => 1000 };
    expect(await handleSearchHelp({ q: "Mc chick" }, ctx)).toEqual({ status: 200, body: { phrases: ["McChicken Sandwich"] } });
    expect(await handleSearchHelp({ q: "mc chick" }, ctx)).toEqual({ status: 200, body: { phrases: ["McChicken Sandwich"] } });
    expect(calls).toBe(1);
    expect((await handleSearchHelp({ q: "wagamamma" }, ctx)).status).toBe(429);
    expect((await handleSearchHelp({ q: "" }, ctx)).status).toBe(400);
    expect((await handleSearchHelp({ q: "nandoes" }, { ...ctx, ask: null })).status).toBe(503);
    expect((await handleSearchHelp({ q: "nandoes" }, { ...ctx, allow: () => true, ask: async () => ({ status: "error" as const }) })).status).toBe(502);
  });
});
