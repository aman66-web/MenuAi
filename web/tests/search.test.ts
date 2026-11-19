import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSearchIndex, buildSearchIndexFromCompact, compactPhoto, type CompactSearchChain, decodeDiet, dietFactsOf, fitsDiet, normalizeForSearch, search } from "../lib/mm/search";
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
  it("pescatarian: vegetarian-tagged dishes and dishes that name fish or seafood without meat", () => {
    const pesc = { vegetarianOnly: false, noPork: false, noBeef: false, pescatarianOnly: true };
    expect(fitsDiet(decodeDiet("v", "Halloumi wrap"), pesc)).toBe(true);
    expect(fitsDiet(decodeDiet("", "Salmon wrap"), pesc)).toBe(true);
    expect(fitsDiet(decodeDiet("", "Chicken and prawn wrap"), pesc)).toBe(false);
    expect(fitsDiet(decodeDiet("", "Chicken wrap"), pesc)).toBe(false);
    expect(fitsDiet(decodeDiet("p", "Prawn and bacon wrap"), pesc)).toBe(false);
    const compact = buildSearchIndexFromCompact([{ id: "c", name: "Cafe", cuisine: "Cafe", aliases: [], sample: false,
      items: [["a", "Chicken wrap", 400], ["b", "Halloumi wrap", 450, "v"], ["c", "Tuna wrap", 420]] }]);
    const r = search(compact, "wrap", 40, pesc);
    expect(r.items.map((i) => i.itemId).sort()).toEqual(["b", "c"]);
    expect(r.hiddenByDiet).toBe(1);
  });
  it("works the pescatarian answer out only when somebody asks, and only once (building the index must stay cheap for everyone else)", () => {
    const facts = decodeDiet("", "Salmon wrap");
    expect(facts.namedFish).toBeUndefined(); // not worked out when the file is read
    expect(facts.name).toBe("Salmon wrap");
    expect(fitsDiet(facts, { vegetarianOnly: false, noPork: false, noBeef: false })).toBe(true); // an ordinary search doesn't need it either
    expect(facts.namedFish).toBeUndefined();
    expect(fitsDiet(facts, { vegetarianOnly: false, noPork: false, noBeef: false, pescatarianOnly: true })).toBe(true);
    expect(facts.namedFish).toBe(true); // kept for the next dish list
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

describe("search results carry the dish's photo", () => {
  it("reads the search file's 5th entry as the photo in the chain's own folder, and still reads files written before photos", () => {
    const compact = buildSearchIndexFromCompact([
      { id: "cafe", name: "Cafe", cuisine: "Cafe", aliases: [], sample: false, items: [
        ["a", "Chicken wrap", 400, "", "abc123def456"], // a photo and no diet letters: the letters are ""
        ["b", "Halloumi wrap", 450, "v", "0d4a8872f20c"],
        ["c", "Tuna wrap", 420], // no photo (an old 3- or 4-entry row)
        ["d", "Bean wrap", 380, "vn"],
        ["e", "Odd wrap", 300, "", "../x" as string], // a value of any other shape is no photo
      ] },
    ]);
    const hits = new Map(search(compact, "wrap").items.map((i) => [i.itemId, i]));
    expect(hits.get("a")?.image).toBe("cafe/abc123def456.webp");
    expect(hits.get("b")?.image).toBe("cafe/0d4a8872f20c.webp");
    expect(hits.get("a")!.calories).toBe(400);
    for (const id of ["c", "d", "e"]) expect(hits.get(id)).not.toHaveProperty("image");
    expect(search(compact, "wrap", 40, { vegetarianOnly: true, noPork: false, noBeef: false }).items.map((i) => i.itemId)).toEqual(["d", "b"]); // the letters still read
    expect(compactPhoto("cafe", undefined)).toBeUndefined();
    expect(compactPhoto("cafe", 42)).toBeUndefined();
    expect(compactPhoto("cafe", "ABC.webp")).toBeUndefined();
  });
  it("gives the same photo from a full menu as from the search file", () => {
    const chain = tinyChain([["a", "Chicken wrap", 400, 30], ["b", "Tuna wrap", 420, 25]]);
    chain.items[0] = { ...chain.items[0]!, image: "tiny/abc123def456.webp" };
    const r = search(buildSearchIndex([chain]), "wrap");
    expect(r.items.find((i) => i.itemId === "a")?.image).toBe("tiny/abc123def456.webp");
    expect(r.items.find((i) => i.itemId === "b")).not.toHaveProperty("image");
  });
  // Runs once the published menus are rebuilt with the photo column (tools/build_menus.py search_row); until then the file has no 5th entries.
  const dir = new URL("../public/menus/", import.meta.url);
  const published = JSON.parse(readFileSync(new URL("menus-search.json", dir), "utf8")) as { chains: CompactSearchChain[] };
  const carriesPhotos = published.chains.some((c) => c.items.some((row) => row.length >= 5));
  it.skipIf(!carriesPhotos)("the published search file gives every dish exactly the photo its chain file has", () => {
    const fromFile = buildSearchIndexFromCompact(published.chains);
    const byKey = new Map(fromFile.items.map((i) => [`${i.chainId}/${i.itemId}`, i.image]));
    let photos = 0;
    for (const c of published.chains) {
      const chain = JSON.parse(readFileSync(new URL(`chain-${c.id}.json`, dir), "utf8")) as { items: Array<{ id: string; image?: string }> };
      for (const item of chain.items) {
        expect(byKey.get(`${c.id}/${item.id}`), `${c.id}/${item.id}`).toBe(item.image);
        if (item.image) photos++;
      }
    }
    expect(photos).toBeGreaterThan(1000);
  });
});

// Usability test 2026-11-19 (George, 87): "greggs sausage roll" found nothing, and "greggs" showed no Greggs dish.
describe("a restaurant named in the search", () => {
  it("finds that restaurant's dish when the name comes first or last", () => {
    for (const q of ["cluck house nuggets", "nuggets cluck house", "Cluck House nugg"]) {
      const r = search(index, q);
      expect(r.items.length, q).toBeGreaterThan(0);
      expect(r.items[0]!.chainId, q).toBe("cluck-house");
      expect(r.items[0]!.name.toLowerCase(), q).toContain("nugget");
    }
  });
  it("lists the restaurant's menu, in its own order, when only its name is typed", () => {
    const r = search(index, "cluck house");
    expect(r.chains.map((c) => c.chainId)).toContain("cluck-house");
    const menu = loadChain("cluck-house").items.map((i) => i.name);
    expect(r.items.map((i) => i.name)).toEqual(menu.slice(0, r.items.length));
  });
  it("still finds a dish anywhere when no restaurant is named", () => {
    expect(search(index, "nugg").items.length).toBeGreaterThan(2);
  });
});
