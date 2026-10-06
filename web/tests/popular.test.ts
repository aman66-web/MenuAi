import { describe, expect, it } from "vitest";
import { chooseWarmChains, groupByInitial, MAX_WARM_CHAINS, POPULAR_ORDER, splitChains } from "../lib/mm/popular";

const chain = (id: string, name = id) => ({ id, name });

describe("Home restaurant lists", () => {
  it("puts the curated chains first, in curated order, and everything else A to Z", () => {
    const chains = [chain("zizzi", "Zizzi"), chain("greggs", "Greggs"), chain("kfc", "KFC"), chain("burger-king", "Burger King"), chain("aaa-cafe", "AAA Café")];
    const { popular, rest } = splitChains(chains);
    expect(popular.map((c) => c.id)).toEqual(["kfc", "burger-king", "greggs"]);
    expect(rest.map((c) => c.id)).toEqual(["aaa-cafe", "zizzi"]);
  });
  it("caps Popular at the limit and moves the overflow into the A to Z list", () => {
    const chains = POPULAR_ORDER.slice(0, 14).map((id) => chain(id, id.toUpperCase()));
    const { popular, rest } = splitChains(chains, 10);
    expect(popular).toHaveLength(10);
    expect(rest).toHaveLength(4);
    expect(new Set([...popular, ...rest].map((c) => c.id)).size).toBe(14); // nothing lost, nothing twice
  });
  it("falls back to the first ten A to Z when fewer than three curated chains exist (samples only)", () => {
    const chains = [chain("cluck-house", "Cluck House"), chain("bowl-and-co", "Bowl & Co.")];
    const { popular, rest } = splitChains(chains);
    expect(popular.map((c) => c.id)).toEqual(["bowl-and-co", "cluck-house"]);
    expect(rest).toEqual([]);
  });
  it("skips curated chains that have no menu data and handles an empty catalogue", () => {
    expect(splitChains([])).toEqual({ popular: [], rest: [] });
    expect(splitChains([chain("kfc"), chain("greggs"), chain("subway")]).popular.map((c) => c.id)).toEqual(["kfc", "subway", "greggs"]);
  });
  it("groups an A to Z list under letters, ignoring accents, with non-letters last under #", () => {
    const groups = groupByInitial([chain("a", "Ask Italian"), chain("b", "Bill's"), chain("c", "Café Rouge"), chain("d", "Caffè Nero"), chain("e", "#1 Coffee"), chain("f", "Côte")]);
    expect(groups.map((g) => g.letter)).toEqual(["A", "B", "C", "#"]);
    expect(groups.find((g) => g.letter === "C")?.chains.map((c) => c.id)).toEqual(["c", "d", "f"]);
  });

  it("keeps the user's own chains first when choosing what to cache offline, then popular ones, within the limit", () => {
    const many = Array.from({ length: 60 }, (_, i) => chain(`chain-${String(i).padStart(2, "0")}`, `Chain ${String(i).padStart(2, "0")}`));
    const chains = [...many, chain("kfc", "KFC"), chain("greggs", "Greggs"), chain("subway", "Subway")];
    const picked = chooseWarmChains(chains, ["chain-59", "kfc", "not-a-chain"]);
    expect(picked).toHaveLength(MAX_WARM_CHAINS);
    expect(picked.slice(0, 4).map((c) => c.id)).toEqual(["chain-59", "kfc", "subway", "greggs"]);
    expect(new Set(picked.map((c) => c.id)).size).toBe(picked.length);
    expect(chooseWarmChains([], ["kfc"])).toEqual([]);
  });
});
