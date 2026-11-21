import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readMemory, remember, shouldRemember, tabFor, tabTarget, validFor, type TabDef } from "../lib/mm/tabMemory";

const TABS: TabDef[] = [
  { href: "/app", match: (p) => p === "/app" || p.startsWith("/app/settings") },
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

  it("finds a page's tab", () => {
    expect(tabFor(TABS, "/app/settings")?.href).toBe("/app");
    expect(tabFor(TABS, "/app/chain")?.href).toBe("/app/eat-out");
    expect(tabFor(TABS, "/nowhere")).toBeUndefined();
  });
});

describe("Home always opens Home, and no tab opens Settings (usability test 2026-11-19)", () => {
  it("never remembers a page in the Home tab", () => {
    expect(remember({}, TABS, "/app/today", "")).toEqual({});
  });
  it("never remembers Settings: the restaurant seen before it stays the one Eat out opens", () => {
    expect(remember({}, TABS, "/app/settings", "")).toEqual({});
    expect(remember({}, TABS, "/app/settings/numbers", "")).toEqual({});
    expect(remember({ "/app/eat-out": "/app/chain?id=kfc" }, TABS, "/app/settings", "")).toEqual({ "/app/eat-out": "/app/chain?id=kfc" });
    expect(validFor(HOME, "/app/settings")).toBe(false);
  });
});

describe("which tab is lit", () => {
  it("keeps Home lit on Home's cooking tools, whose addresses sit under Recipes (founder 2026-11-20)", async () => {
    const { TABS } = await import("../app/app/_lib/tabs");
    const lit = (p: string) => TABS.filter((t) => t.match(p)).map((t) => t.href);
    expect(lit("/app/recipes/fridge")).toEqual(["/app"]);
    expect(lit("/app/recipes/photo")).toEqual(["/app"]);
    expect(lit("/app/recipes")).toEqual(["/app/recipes"]);
    expect(lit("/app/recipes/view")).toEqual(["/app/recipes"]);
    expect(lit("/app/recipes/saved")).toEqual(["/app"]);
  });
});

describe("a recipe page lights the tab it was opened from", () => {
  it("Home from the meal plan or the cooking tools, Groceries from the list, Recipes when opened first", async () => {
    const { litTab } = await import("../app/app/_lib/tabs");
    expect(litTab("/app/recipes/view", "/app")).toBe("/app");
    expect(litTab("/app/recipes/view", "/app/groceries")).toBe("/app/groceries");
    expect(litTab("/app/recipes/view", null)).toBe("/app/recipes");
    expect(litTab("/app/recipes", "/app")).toBe("/app/recipes"); // only shared pages follow where the person came from
    expect(litTab("/app/settings", "/app")).toBeNull();
  });
});

describe("a page opened from several tabs is remembered only under the tab lit on it (Quinn and Hassan, the 30-person meeting, 21 November 2026)", () => {
  it("a recipe opened from Home or Groceries never sticks the Recipes tab on it; one opened from Recipes, or first, still is remembered", async () => {
    const { TABS: REAL, SHARED_PAGES, litTab } = await import("../app/app/_lib/tabs");
    const recipesTab = REAL.find((t) => t.href === "/app/recipes")!;
    const view = "/app/recipes/view";
    // what AppShell does on each page: remember it only when shouldRemember says so
    const visit = (m: Record<string, string>, path: string, search: string, cameFrom: string | null) =>
      shouldRemember(REAL, SHARED_PAGES, path, litTab(path, cameFrom)) ? remember(m, REAL, path, search) : m;

    let m = visit({}, view, "?id=chicken-curry&r=sainsburys", "/app");
    expect(m).toEqual({});
    expect(tabTarget(m, recipesTab, false)).toBe("/app/recipes"); // the Recipes tab opens its first page (and its tips)
    m = visit(m, view, "?id=pasta-bake&r=tesco", "/app/groceries");
    expect(m).toEqual({});

    m = visit(m, view, "?id=chicken-curry&r=sainsburys", "/app/recipes");
    expect(m["/app/recipes"]).toBe("/app/recipes/view?id=chicken-curry&r=sainsburys");
    // opened from Home afterwards: what Recipes remembered from its own visit stays
    expect(visit(m, view, "?id=pasta-bake&r=tesco", "/app")).toBe(m);
    // opened first (a shared link, the app reopened): its own tab is lit, so it is remembered there
    expect(visit({}, view, "?id=pasta-bake&r=tesco", null)).toEqual({ "/app/recipes": "/app/recipes/view?id=pasta-bake&r=tesco" });
    // pages that belong to one tab are untouched by this
    expect(shouldRemember(REAL, SHARED_PAGES, "/app/chain", "/app/eat-out")).toBe(true);
    expect(shouldRemember(REAL, SHARED_PAGES, "/app/chain", null)).toBe(true);
  });

  it("My recipes, opened from the Recipes tab, keeps Recipes lit (it lit Home), and from Home or first keeps Home lit", async () => {
    const { TABS: REAL, SHARED_PAGES, litTab } = await import("../app/app/_lib/tabs");
    expect(SHARED_PAGES).toContain("/app/meals");
    expect(litTab("/app/meals", "/app/recipes")).toBe("/app/recipes");
    expect(litTab("/app/meals", "/app")).toBe("/app");
    expect(litTab("/app/meals", null)).toBe("/app");
    expect(shouldRemember(REAL, SHARED_PAGES, "/app/meals", "/app/recipes")).toBe(false);
  });

  it("a tab whose tips are still due opens its first page, where they are, not the deeper page it remembers (Quinn)", () => {
    const m = { "/app/eat-out": "/app/chain?id=kfc" };
    expect(tabTarget(m, EAT, false, true)).toBe("/app/eat-out");
    expect(tabTarget(m, EAT, false, false)).toBe("/app/chain?id=kfc");
    expect(tabTarget(m, EAT, false)).toBe("/app/chain?id=kfc");
    expect(readFileSync("app/app/_components/AppShell.tsx", "utf8")).toContain("tabTarget(tabMemory, tab, active, coachDue(coach, coachScreenFor(tab.href)))");
    expect(readFileSync("app/app/_components/AppShell.tsx", "utf8")).toContain("shouldRemember(TABS, SHARED_PAGES, pathname, lit)");
  });
});
