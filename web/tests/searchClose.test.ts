// Close matches in restaurant search (founder 2026-11-21: "one little spelling mistake will mean that they won't be able to get the right thing"), on the real
// search file: spaces ignored, a slip or two forgiven, and only when nothing matched as typed (an exact search is unchanged).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSearchIndexFromCompact, closeRank, nearlySame, search } from "../lib/mm/search";

const file = JSON.parse(readFileSync("public/menus/menus-search.json", "utf8"));
const index = buildSearchIndexFromCompact(file.chains);
const names = (q: string) => search(index, q).items.map((i) => `${i.chainName}: ${i.name}`);

describe("close matches", () => {
  it("counts slips: a change, a missing or extra letter, two letters swapped", () => {
    expect(nearlySame("nandos", "nandoes", 1)).toBe(true);
    expect(nearlySame("chicken", "chiken", 1)).toBe(true);
    expect(nearlySame("burger", "buregr", 1)).toBe(true);
    expect(nearlySame("burger", "pizza", 2)).toBe(false);
  });

  it("ignores spaces: \"mc chick\" finds the McChicken", () => {
    const r = search(index, "Mc chick");
    expect(r.close).toBe(true);
    expect(names("Mc chick").some((n) => /McChicken/i.test(n))).toBe(true);
  });

  it("forgives a slip in a restaurant's name", () => {
    expect(search(index, "mcdonals").chains.map((c) => c.name)).toContain("McDonald's");
    expect(search(index, "nandoes").chains.map((c) => c.name)).toContain("Nando's");
    expect(search(index, "wagamamma").chains.map((c) => c.name)).toContain("Wagamama");
  });

  it("forgives a slip in a dish's name", () => {
    expect(names("chiken burger").length).toBeGreaterThan(0);
    expect(names("chiken burger").every((n) => /chicken/i.test(n) && /burger/i.test(n))).toBe(true);
  });

  it("reads the restaurant's name in the search too: \"greggs saussage roll\", \"pret avacado\", \"kfc zinga\"", () => {
    expect(names("greggs saussage roll")[0]).toMatch(/^Greggs: .*Sausage Roll/i);
    expect(names("pret avacado").every((n) => n.startsWith("Pret") && /avocado/i.test(n))).toBe(true);
    expect(names("kfc zinga").some((n) => /^KFC: Zinger/.test(n))).toBe(true);
    expect(search(index, "maccies").items).toHaveLength(0); // slang is left to Pip's search help
  });

  it("leaves an exact search as it was, and nonsense finds nothing", () => {
    expect(search(index, "big mac").close).toBeUndefined();
    expect(search(index, "zzqxv").items).toHaveLength(0);
    expect(closeRank("big mac", "zzqxv")).toBeNull();
  });
});
