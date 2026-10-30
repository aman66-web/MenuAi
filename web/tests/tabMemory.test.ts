import { describe, expect, it } from "vitest";
import { readMemory, remember, tabFor, tabTarget, validFor, type TabDef } from "../lib/mm/tabMemory";

const TABS: TabDef[] = [
  { href: "/app", match: (p) => p === "/app" || p.startsWith("/app/settings") || p.startsWith("/app/reminders") || p.startsWith("/app/today") || p.startsWith("/app/meals") },
  { href: "/app/eat-out", match: (p) => p.startsWith("/app/eat-out") || p.startsWith("/app/chain") },
  { href: "/app/recipes", match: (p) => p.startsWith("/app/recipes") },
];
const [HOME, EAT, RECIPES] = TABS as [TabDef, TabDef, TabDef];

describe("tab memory", () => {
  it("remembers the page last seen in a tab, query included", () => {
    let m = remember({}, TABS, "/app/chain", "?id=kfc");
    expect(m).toEqual({ "/app/eat-out": "/app/chain?id=kfc" });
    m = remember(m, TABS, "/app/recipes/view", "?id=chicken-curry&r=sainsburys");
    expect(m["/app/recipes"]).toBe("/app/recipes/view?id=chicken-curry&r=sainsburys");
    expect(m["/app/eat-out"]).toBe("/app/chain?id=kfc");
  });

  it("a tab's first page forgets what was remembered", () => {
    const m = remember({ "/app/eat-out": "/app/chain?id=kfc" }, TABS, "/app/eat-out", "");
    expect(m).toEqual({});
  });

  it("does not remember the welcome or offline pages, or pages in no tab", () => {
    expect(remember({}, TABS, "/app/welcome", "?next=/app")).toEqual({});
    expect(remember({}, TABS, "/app/offline", "")).toEqual({});
    expect(remember({}, TABS, "/app/unknown", "")).toEqual({});
  });

  it("the open tab goes to its first page, another goes to where it was", () => {
    const m = { "/app/eat-out": "/app/chain?id=kfc" };
    expect(tabTarget(m, EAT, true)).toBe("/app/eat-out");
    expect(tabTarget(m, EAT, false)).toBe("/app/chain?id=kfc");
    expect(tabTarget(m, RECIPES, false)).toBe("/app/recipes");
    expect(tabTarget(m, HOME, false)).toBe("/app");
  });

  it("never holds an address with a fragment, outside the app, or from another tab", () => {
    expect(validFor(EAT, "/app/chain?id=kfc#abc")).toBe(false);
    expect(validFor(EAT, "https://evil.example/app/chain")).toBe(false);
    expect(validFor(EAT, "//evil.example")).toBe(false);
    expect(validFor(EAT, "/app//evil")).toBe(false);
    expect(validFor(EAT, "/app/recipes/view?id=x")).toBe(false);
    expect(validFor(EAT, "/app/welcome")).toBe(false);
    expect(validFor(EAT, 42)).toBe(false);
    expect(remember({}, TABS, "/app/chain", "?id=kfc#x")).toEqual({});
  });

  it("reads stored memory defensively", () => {
    expect(readMemory(null, TABS)).toEqual({});
    expect(readMemory("not json", TABS)).toEqual({});
    expect(readMemory("[1]", TABS)).toEqual({});
    expect(readMemory(JSON.stringify({ "/app/eat-out": "/app/chain?id=kfc", "/app/recipes": "/app/chain?id=kfc", "/app": "/app" }), TABS)).toEqual({ "/app/eat-out": "/app/chain?id=kfc" });
  });

  it("Home never remembers Settings, Reminders or a past day: tapping Home opens today", () => {
    // reached from Home's gear, its Reminders row and its calendar: none of them is "where you were" in Home
    for (const [path, search] of [["/app/settings", ""], ["/app/settings/numbers", ""], ["/app/reminders", ""], ["/app/today", "?d=2026-10-20"], ["/app/today", "?x=1&d="]] as const) {
      expect(remember({}, TABS, path, search)).toEqual({});
      // and what Home already remembered is kept, not replaced by it
      expect(remember({ "/app": "/app/meals?tab=restaurant" }, TABS, path, search)).toEqual({ "/app": "/app/meals?tab=restaurant" });
    }
    expect(validFor(HOME, "/app/settings")).toBe(false);
    expect(validFor(HOME, "/app/settings#diet")).toBe(false);
    expect(validFor(HOME, "/app/reminders")).toBe(false);
    expect(validFor(HOME, "/app/today?d=2026-10-20")).toBe(false);
    expect(tabTarget({ "/app": "/app/settings" }, HOME, false)).toBe("/app");
    expect(tabTarget({ "/app": "/app/today?d=2026-10-20" }, HOME, false)).toBe("/app");
    expect(readMemory(JSON.stringify({ "/app": "/app/reminders" }), TABS)).toEqual({});
    // today's own page and the other Home pages are still remembered
    expect(remember({}, TABS, "/app/today", "")).toEqual({ "/app": "/app/today" });
    expect(remember({}, TABS, "/app/meals", "?tab=restaurant")).toEqual({ "/app": "/app/meals?tab=restaurant" });
    expect(validFor(HOME, "/app/today")).toBe(true);
  });

  it("finds a page's tab", () => {
    expect(tabFor(TABS, "/app/settings")?.href).toBe("/app");
    expect(tabFor(TABS, "/app/chain")?.href).toBe("/app/eat-out");
    expect(tabFor(TABS, "/nowhere")).toBeUndefined();
  });
});
