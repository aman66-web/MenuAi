import { describe, expect, it } from "vitest";
import { buildSearchIndex, normalizeForSearch, search } from "../lib/mm/search";
import { loadChain, tinyChain } from "./fixtures";

const index = buildSearchIndex([loadChain("bowl-and-co"), loadChain("cluck-house")]);

describe("search (SPEC §7.3)", () => {
  it("needs at least two characters", () => {
    expect(search(index, "n")).toEqual({ chains: [], items: [] });
    expect(search(index, "  ")).toEqual({ chains: [], items: [] });
  });
  it("finds nuggets by 'nugg' (prefix of the name)", () => {
    const r = search(index, "nugg");
    expect(r.items.map((i) => i.name)).toEqual(expect.arrayContaining(["Nuggets (8 ct)", "Nuggets (12 ct)", "Grilled nuggets (8 ct)"]));
    expect(r.items.every((i) => i.chainId === "cluck-house")).toBe(true);
  });
  it("matches the start of any word, and ranks name-prefix matches first", () => {
    const r = search(index, "nugg");
    expect(r.items[0]!.name.toLowerCase().startsWith("nugg")).toBe(true);
    const wrap = search(index, "chicken");
    expect(wrap.items.length).toBeGreaterThan(2);
    expect(search(index, "salad").items.map((i) => i.name)).toContain("Cobb salad with nuggets");
  });
  it("does not match the middle of a word", () => {
    expect(search(index, "ugge").items).toEqual([]);
  });
  it("matches chains by name and alias, case- and diacritic-insensitively, '&' as 'and'", () => {
    expect(search(index, "bowl").chains.map((c) => c.chainId)).toEqual(["bowl-and-co"]);
    expect(search(index, "BOWL AND").chains.map((c) => c.chainId)).toEqual(["bowl-and-co"]);
    expect(search(index, "cluckhouse").chains.map((c) => c.chainId)).toEqual(["cluck-house"]);
    const accents = buildSearchIndex([tinyChain([["a", "Crème brûlée", 300, 5]], { name: "Café Zoë", aliases: [] })]);
    expect(search(accents, "cafe zoe").chains).toHaveLength(1);
    expect(search(accents, "creme").items).toHaveLength(1);
  });
  it("returns items with the data the UI shows", () => {
    const r = search(index, "classic");
    expect(r.items[0]).toMatchObject({ chainId: "cluck-house", chainName: "Cluck House", itemId: "classic-sandwich", calories: 440 });
  });
  it("normalises punctuation", () => {
    expect(normalizeForSearch("Raising Cane's  Chicken-Fingers!")).toBe("raising canes chicken fingers");
    expect(normalizeForSearch("Bowl & Co.")).toBe("bowl and co");
  });
});

describe("search highlight and recent searches", () => {
  it("highlights the typed text where it starts the name or a word", async () => {
    const { highlightRange } = await import("../lib/mm/search");
    expect(highlightRange("Chicken Wrap", "wra")).toEqual([8, 11]);
    expect(highlightRange("Caffè Latte", "caffe")).toEqual([0, 5]);
    expect(highlightRange("Iced Latte", "atte")).toBeNull();
    expect(highlightRange("Fish & Chips", "fish and")).toBeNull();
    expect(highlightRange("Wrap", "w")).toBeNull();
  });
  it("keeps recent searches newest first, without repeats, capped", async () => {
    const { addRecentSearch } = await import("../lib/mm/search");
    let list: string[] = [];
    for (const q of ["latte", "wrap", "LATTE ", "x", "a1", "b2", "c3", "d4", "e5"]) list = addRecentSearch(list, q);
    expect(list).toEqual(["e5", "d4", "c3", "b2", "a1", "LATTE"]);
  });
});
