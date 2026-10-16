import { describe, expect, it } from "vitest";
import { backName, canGoBack, depthOf, DEPTH_KEY, QUERY_KEY, queryOf, stateFor, withQuery } from "../lib/mm/navDepth";

// "Back goes to the page before": every history entry carries its depth in history.state.

describe("depthOf", () => {
  it("is 0 for no state, a foreign state or a bad depth", () => {
    for (const s of [null, undefined, "x", 5, {}, { __NA: true }, { [DEPTH_KEY]: -1 }, { [DEPTH_KEY]: 1.5 }, { [DEPTH_KEY]: "2" }, { [DEPTH_KEY]: NaN }, { [DEPTH_KEY]: 1e9 }]) {
      expect(depthOf(s), JSON.stringify(s)).toBe(0);
    }
  });
  it("reads a whole number from 1 up", () => {
    expect(depthOf({ [DEPTH_KEY]: 1 })).toBe(1);
    expect(depthOf({ __NA: true, [DEPTH_KEY]: 7 })).toBe(7);
  });
});

describe("stateFor", () => {
  it("a push is one deeper than the entry the browser is on", () => {
    expect((stateFor("push", { __NA: true }, null) as Record<string, unknown>)[DEPTH_KEY]).toBe(1);
    expect((stateFor("push", { __NA: true }, { [DEPTH_KEY]: 3 }) as Record<string, unknown>)[DEPTH_KEY]).toBe(4);
  });
  it("a replace keeps the depth of the entry it replaces", () => {
    expect((stateFor("replace", { __NA: true }, null) as Record<string, unknown>)[DEPTH_KEY]).toBe(0);
    expect((stateFor("replace", { __NA: true }, { [DEPTH_KEY]: 3 }) as Record<string, unknown>)[DEPTH_KEY]).toBe(3);
  });
  it("keeps everything else the caller passed and does not change it", () => {
    const data = { __NA: true, tree: [1, 2] };
    const out = stateFor("push", data, { [DEPTH_KEY]: 1 }) as Record<string, unknown>;
    expect(out.__NA).toBe(true);
    expect(out.tree).toEqual([1, 2]);
    expect(data).toEqual({ __NA: true, tree: [1, 2] }); // the caller's object is untouched
  });
  it("takes no state (a map's same-URL entry) as an empty object and still counts it", () => {
    expect(stateFor("push", null, { [DEPTH_KEY]: 2 })).toEqual({ [DEPTH_KEY]: 3 });
    expect(stateFor("replace", undefined, { [DEPTH_KEY]: 2 })).toEqual({ [DEPTH_KEY]: 2 });
  });
  it("leaves a value that is not an object alone", () => {
    expect(stateFor("push", "text", null)).toBe("text");
    expect(stateFor("replace", 42, { [DEPTH_KEY]: 2 })).toBe(42);
  });
  it("replaces a stale depth in the data with the right one", () => {
    expect((stateFor("push", { [DEPTH_KEY]: 99 }, { [DEPTH_KEY]: 1 }) as Record<string, unknown>)[DEPTH_KEY]).toBe(2);
  });
});

describe("a walk through the app", () => {
  // Recipes (opened first, depth 0) -> My meals (push) -> a tab inside it (replace) -> Today (push): Back from Today then Meals then Recipes, never past it.
  it("counts pushes, ignores replaces", () => {
    let current: unknown = null; //                                              Recipes: the first entry
    expect(canGoBack(current)).toBe(false);
    current = stateFor("push", { __NA: true }, current); //                      My meals
    expect(depthOf(current)).toBe(1);
    expect(canGoBack(current)).toBe(true);
    current = stateFor("replace", { __NA: true }, current); //                   its tab changes: same entry
    expect(depthOf(current)).toBe(1);
    current = stateFor("push", { __NA: true }, current); //                      Today
    expect(depthOf(current)).toBe(2);
  });
  it("a page replaced at the very start (onboarding's redirect) is still the first entry", () => {
    const first = stateFor("replace", { __NA: true }, null); //                  /app -> /app/welcome by replace
    expect(canGoBack(first)).toBe(false);
  });
});

describe("backName (the spoken name of a Back control)", () => {
  it("is the plain word after an in-app arrival, whatever the fixed page is", () => {
    expect(backName("Back", "Back to home", true)).toBe("Back");
    expect(backName("Atrás", "Volver al inicio", true)).toBe("Atrás");
  });
  it("names the fixed page otherwise, unchanged when that phrase already holds the visible word", () => {
    expect(backName("Back", "Back to home", false)).toBe("Back to home");
    expect(backName("Voltar", "Voltar ao início", false)).toBe("Voltar ao início");
    expect(backName("BACK", "back to menu", false)).toBe("back to menu");
  });
  it("puts the visible word first when the phrase lacks it (Label in Name)", () => {
    expect(backName("Atrás", "Volver al inicio", false)).toBe("Atrás: Volver al inicio");
    expect(backName("رجوع", "العودة إلى الرئيسية", false)).toBe("رجوع: العودة إلى الرئيسية");
  });
});

describe("the words of a search box in a history entry", () => {
  it("reads nothing from no state, someone else's state or a value that is not text", () => {
    for (const s of [null, undefined, "x", 3, {}, { __NA: true }, { [QUERY_KEY]: 5 }, { [QUERY_KEY]: null }]) expect(queryOf(s), JSON.stringify(s)).toBe("");
  });
  it("saves the words and keeps the depth and Next.js's own keys", () => {
    const state = { __NA: true, [DEPTH_KEY]: 2, tree: [1] };
    const out = withQuery(state, "chicken bowl");
    expect(out).toEqual({ __NA: true, [DEPTH_KEY]: 2, tree: [1], [QUERY_KEY]: "chicken bowl" });
    expect(queryOf(out)).toBe("chicken bowl");
    expect(state).toEqual({ __NA: true, [DEPTH_KEY]: 2, tree: [1] }); // the caller's object is untouched
  });
  it("replaces earlier words, and removes them when the box is emptied", () => {
    const first = withQuery({ [DEPTH_KEY]: 1 }, "beans");
    expect(queryOf(withQuery(first, "baked beans"))).toBe("baked beans");
    const cleared = withQuery(first, "");
    expect(QUERY_KEY in cleared).toBe(false);
    expect(cleared[DEPTH_KEY]).toBe(1);
  });
  it("starts an empty state from nothing, and never stores more than a search could need", () => {
    expect(withQuery(null, "tea")).toEqual({ [QUERY_KEY]: "tea" });
    expect(queryOf(withQuery({}, "x".repeat(5000))).length).toBe(200);
  });
  it("survives a replace through stateFor (the depth is kept, the words ride along)", () => {
    const entry = withQuery({ [DEPTH_KEY]: 1, __NA: true }, "salad");
    const replaced = stateFor("replace", entry, entry) as Record<string, unknown>;
    expect(depthOf(replaced)).toBe(1);
    expect(queryOf(replaced)).toBe("salad");
  });
});
