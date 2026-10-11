import { describe, expect, it } from "vitest";
import { recentFor, recordView, RECENT_MAX, sanitizeRecent } from "../lib/mm/recent";

const at = (h: number) => new Date(Date.UTC(2026, 9, 11, 0) + h * 3600_000);

describe("recently viewed", () => {
  it("keeps the dishes opened in the last day per restaurant, newest first, without repeats", () => {
    let list = recordView([], "mcdonalds", "happy-meal", at(0));
    list = recordView(list, "kfc", "zinger", at(1));
    list = recordView(list, "mcdonalds", "big-mac", at(2));
    list = recordView(list, "mcdonalds", "happy-meal", at(3));
    expect(recentFor(list, "mcdonalds", at(4))).toEqual(["happy-meal", "big-mac"]);
    expect(recentFor(list, "kfc", at(4))).toEqual(["zinger"]);
    expect(recentFor(list, "nandos", at(4))).toEqual([]);
  });
  it("forgets a dish a day after it was last opened", () => {
    const list = recordView(recordView([], "mcdonalds", "happy-meal", at(0)), "mcdonalds", "big-mac", at(10));
    expect(recentFor(list, "mcdonalds", at(23))).toEqual(["big-mac", "happy-meal"]);
    expect(recentFor(list, "mcdonalds", at(24.5))).toEqual(["big-mac"]);
    expect(recentFor(list, "mcdonalds", at(34.5))).toEqual([]);
    // the next view also drops what has expired
    expect(recordView(list, "kfc", "zinger", at(30)).map((v) => v.itemId)).toEqual(["zinger", "big-mac"]);
  });
  it("is capped and rejects malformed stored rows", () => {
    let list = [] as ReturnType<typeof recordView>;
    for (let i = 0; i < RECENT_MAX + 10; i++) list = recordView(list, "c", `item-${i}`, at(i / 100));
    expect(list).toHaveLength(RECENT_MAX);
    expect(sanitizeRecent([{ chainId: "kfc", itemId: "zinger", viewedAt: at(0).toISOString() }, { chainId: "../x", itemId: "a", viewedAt: "x" }, null, "nope"])).toEqual([{ chainId: "kfc", itemId: "zinger", viewedAt: at(0).toISOString() }]);
    expect(sanitizeRecent("nope")).toEqual([]);
  });
});
