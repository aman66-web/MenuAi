import { describe, expect, it } from "vitest";
import { mergeQuery, ownHistoryState, parseMealParam, parseOnlyParam, onlyParam, RECIPE_TOGGLES } from "../lib/mm/recipeAddress";

describe("mergeQuery: one change to the address, keeping everything else", () => {
  it("sets, replaces and removes keys and keeps the others in place", () => {
    expect(mergeQuery("?r=sainsburys&cuisine=chinese", { meal: "dinner" })).toBe("r=sainsburys&cuisine=chinese&meal=dinner");
    expect(mergeQuery("?r=sainsburys&meal=lunch", { meal: "dinner" })).toBe("r=sainsburys&meal=dinner");
    expect(mergeQuery("?r=sainsburys&meal=lunch", { meal: null })).toBe("r=sainsburys");
    expect(mergeQuery("r=sainsburys", { only: "" })).toBe("r=sainsburys");
    expect(mergeQuery("", { r: "tesco", meal: null })).toBe("r=tesco");
    expect(mergeQuery("?meal=lunch", { meal: null })).toBe("");
  });

  it("applies several changes at once (Clear takes everything off in one write)", () => {
    expect(mergeQuery("?r=sainsburys&meal=lunch&only=quick&cuisine=indian&occasion=picnic", { meal: null, only: null, cuisine: null, occasion: null })).toBe("r=sainsburys");
  });
});

describe("ownHistoryState: what the app writes back with a native replaceState", () => {
  it("drops Next.js's own keys (Next copies them back itself, and a state carrying them is not synced to useSearchParams) and keeps the rest", () => {
    expect(ownHistoryState({ __NA: true, _N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: [] }, mmDepth: 3, mmQuery: "curry" })).toEqual({ mmDepth: 3, mmQuery: "curry" });
    expect(ownHistoryState(null)).toEqual({});
    expect(ownHistoryState("odd")).toEqual({});
  });
});

describe("the meal tile and the three toggles in the address", () => {
  it("reads a meal only when it is one of the four", () => {
    expect(parseMealParam("dinner")).toBe("dinner");
    expect(parseMealParam("snack")).toBe("snack");
    expect(parseMealParam("brunch")).toBeNull();
    expect(parseMealParam(null)).toBeNull();
  });

  it("reads the toggles as a set, ignoring anything unknown, and writes them back in a fixed order", () => {
    expect([...parseOnlyParam("vegan,quick")].sort()).toEqual(["quick", "vegan"]);
    expect([...parseOnlyParam("quick,quick,bogus,<script>")]).toEqual(["quick"]);
    expect(parseOnlyParam(null).size).toBe(0);
    expect(onlyParam(new Set(["vegan", "quick"]))).toBe("quick,vegan");
    expect(onlyParam(new Set())).toBeNull();
    expect(RECIPE_TOGGLES).toEqual(["quick", "meatFree", "vegan"]);
  });
});
