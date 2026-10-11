import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSearchIndex, buildSearchIndexFromCompact, decodeDiet, dietFactsOf, fitsDiet, normalizeForSearch, search } from "../lib/mm/search";
import { loadChain, tinyChain } from "./fixtures";

const index = buildSearchIndex([loadChain("bowl-and-co"), loadChain("cluck-house")]);

describe("search (SPEC §7.3)", () => {
  it("needs at least two characters", () => {
    expect(search(index, "n")).toEqual({ chains: [], items: [], hiddenByDiet: 0 });
    expect(search(index, "  ")).toEqual({ chains: [], items: [], hiddenByDiet: 0 });
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

describe("search with diet settings", () => {
  const veg = { vegetarianOnly: true, noPork: false, noBeef: false };
  it("decodes the search file's diet letters", () => {
    expect(decodeDiet(undefined)).toEqual({ tags: [], namedVegan: false, allergens: null });
    expect(decodeDiet("vn")).toEqual({ tags: ["vegetarian"], namedVegan: true, allergens: null });
    expect(decodeDiet("pba1v")).toEqual({ tags: ["contains_pork", "contains_beef"], namedVegan: false, allergens: ["celery", "gluten", "milk"] });
    expect(decodeDiet("a0").allergens).toEqual([]);
  });
  it("fitsDiet follows the chain page's rules", () => {
    expect(fitsDiet(decodeDiet("v"), veg)).toBe(true);
    expect(fitsDiet(decodeDiet(""), veg)).toBe(false);
    expect(fitsDiet(decodeDiet("p"), { ...veg, vegetarianOnly: false, noPork: true })).toBe(false);
    expect(fitsDiet(decodeDiet("v"), { ...veg, veganOnly: true })).toBe(false);
    expect(fitsDiet(decodeDiet("vn"), { ...veg, veganOnly: true })).toBe(true);
    expect(fitsDiet(decodeDiet("v"), { ...veg, avoidAllergens: ["milk"] })).toBe(false); // no allergen information
    expect(fitsDiet(decodeDiet("va1v"), { ...veg, avoidAllergens: ["milk"] })).toBe(false);
    expect(fitsDiet(decodeDiet("va1v"), { ...veg, avoidAllergens: ["peanuts"] })).toBe(true);
  });
  it("leaves out dishes that don't fit and counts them; the compact index and full chains agree", () => {
    const compact = buildSearchIndexFromCompact([{ id: "c", name: "Cafe", cuisine: "Cafe", aliases: [], sample: false,
      items: [["a", "Chicken wrap", 400], ["b", "Halloumi wrap", 450, "v"], ["c", "Bacon wrap", 500, "p"]] }]);
    expect(search(compact, "wrap").items).toHaveLength(3);
    const r = search(compact, "wrap", 40, veg);
    expect(r.items.map((i) => i.itemId)).toEqual(["b"]);
    expect(r.hiddenByDiet).toBe(2);
    expect(search(compact, "wrap", 40, { ...veg, vegetarianOnly: false, noPork: true }).items.map((i) => i.itemId)).toEqual(["a", "b"]);
    // the pipeline's letters (Python) decode to exactly what the app reads from the full menus
    const file = JSON.parse(readFileSync(new URL("../public/menus-sample/menus-search.json", import.meta.url), "utf8"));
    const fromFile = buildSearchIndexFromCompact(file.chains);
    for (const id of ["bowl-and-co", "cluck-house"]) {
      const chain = loadChain(id);
      for (const item of chain.items) expect(fromFile.items.find((i) => i.chainId === id && i.itemId === item.id)?.diet).toEqual(dietFactsOf(item));
    }
  });
});
