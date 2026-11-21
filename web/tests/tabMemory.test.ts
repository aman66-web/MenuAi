import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { readMemory, remember, shouldRemember, tabFor, tabTarget, validFor, type TabDef, type TabMemory } from "../lib/mm/tabMemory";

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
    m = remember(m, TABS, "/app/recipes", "?meal=dinner");
    expect(m["/app/recipes"]).toBe("/app/recipes?meal=dinner");
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
  it("a recipe is never remembered, wherever it was opened from: the Recipes tab always opens its list (Quinn, then Dina)", async () => {
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

    // opened from Recipes itself (Dina: it used to be remembered there, and tapped from Home the Recipes tab reopened it with Home lit)
    m = visit(m, view, "?id=chicken-curry&r=sainsburys", "/app/recipes");
    expect(m).toEqual({});
    // the Recipes list as it was left (its filters are in the query) stays what the Recipes tab opens
    m = visit(m, "/app/recipes", "?meal=dinner", null);
    expect(m["/app/recipes"]).toBe("/app/recipes?meal=dinner");
    expect(visit(m, view, "?id=pasta-bake&r=tesco", "/app/recipes")).toBe(m);
    expect(visit(m, view, "?id=pasta-bake&r=tesco", "/app")).toBe(m);
    // opened first (a shared link, the app reopened): its own tab is lit, and it is still not remembered
    expect(visit({}, view, "?id=pasta-bake&r=tesco", null)).toEqual({});
    expect(validFor(recipesTab, "/app/recipes/view?id=pasta-bake")).toBe(false);
    expect(readMemory(JSON.stringify({ "/app/recipes": "/app/recipes/view?id=pasta-bake" }), REAL)).toEqual({}); // one kept by an older build is dropped
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

/**
 * AppShell's moves, replayed: the tab lit on each page (its nav/cameFrom state, AppShell.tsx), what the tabs remember (only when shouldRemember says so), and
 * where a tab's link goes (tabTarget, with no tips due).
 */
async function shell() {
  const { TABS: REAL, SHARED_PAGES, litTab } = await import("../app/app/_lib/tabs");
  let nav: { path: string; cameFrom: string | null } = { path: "", cameFrom: null };
  let memory: TabMemory = {};
  let lit: string | null = null;
  let address = "";
  const go = (to: string) => {
    const [path = "", query] = to.split("?");
    if (nav.path !== path) nav = { path, cameFrom: SHARED_PAGES.some((p) => nav.path.startsWith(p)) ? nav.cameFrom : litTab(nav.path, null) };
    lit = litTab(path, nav.cameFrom);
    address = to;
    if (shouldRemember(REAL, SHARED_PAGES, path, lit)) memory = remember(memory, REAL, path, query ? `?${query}` : "");
  };
  const target = (href: string) => {
    const tab = REAL.find((t) => t.href === href)!;
    return tabTarget(memory, tab, tab.href === lit);
  };
  return { go, target, tap: (href: string) => go(target(href)), lit: () => lit, address: () => address, memory: () => memory };
}

describe("moving around (Dina, the 30-person meeting, 21 November 2026)", () => {
  it("BLOCKER: Recipes, a recipe, Home, then the Recipes tab opens the Recipes list with Recipes lit (it reopened the recipe with Home lit)", async () => {
    const s = await shell();
    s.go("/app/recipes");
    s.go("/app/recipes/view?id=chicken-curry&r=sainsburys");
    expect(s.lit()).toBe("/app/recipes");
    s.tap("/app");
    expect(s.address()).toBe("/app");
    expect(s.lit()).toBe("/app");
    expect(s.target("/app/recipes")).toBe("/app/recipes");
    s.tap("/app/recipes");
    expect(s.address()).toBe("/app/recipes");
    expect(s.lit()).toBe("/app/recipes");
  });

  it("the Recipes tab opens the list as it was left (filters in the query), with Recipes lit; tapped again there, its first page", async () => {
    const s = await shell();
    s.go("/app/recipes");
    s.go("/app/recipes?meal=dinner");
    s.go("/app/recipes/view?id=chicken-curry&r=sainsburys");
    s.tap("/app/groceries");
    expect(s.lit()).toBe("/app/groceries");
    s.tap("/app/recipes");
    expect(s.address()).toBe("/app/recipes?meal=dinner");
    expect(s.lit()).toBe("/app/recipes");
    expect(s.target("/app/recipes")).toBe("/app/recipes");
  });

  it("a shared shopping list and Friends (their content is after the '#') are never what a tab reopens", async () => {
    const { TABS: REAL } = await import("../app/app/_lib/tabs");
    const groceries = REAL.find((t) => t.href === "/app/groceries")!;
    expect(remember({}, REAL, "/app/groceries/list/shared", "")).toEqual({});
    expect(remember({ "/app/groceries": "/app/groceries/list?l=abc" }, REAL, "/app/groceries/list/shared", "")).toEqual({ "/app/groceries": "/app/groceries/list?l=abc" });
    expect(validFor(groceries, "/app/groceries/list/shared")).toBe(false);
    expect(remember({}, REAL, "/app/groceries/list", "?l=abc")).toEqual({ "/app/groceries": "/app/groceries/list?l=abc" }); // the list itself still is
    const community: TabDef = { href: "/app/community", match: (p) => p.startsWith("/app/community") };
    expect(remember({}, [community], "/app/community/friends", "")).toEqual({});
    expect(validFor(community, "/app/community/friends")).toBe(false);
    expect(remember({}, [community], "/app/community/inbox", "")).toEqual({ "/app/community": "/app/community/inbox" });
  });

  it("Compare keeps lit the tab it was opened from (it lit none), lights none when opened first, and no tab remembers it", async () => {
    const { litTab, SHARED_PAGES } = await import("../app/app/_lib/tabs");
    expect(SHARED_PAGES).toContain("/app/compare");
    expect(litTab("/app/compare", "/app/eat-out")).toBe("/app/eat-out");
    expect(litTab("/app/compare", "/app/groceries")).toBe("/app/groceries");
    expect(litTab("/app/compare", null)).toBeNull();
    const s = await shell();
    s.go("/app/groceries");
    s.go("/app/compare?tab=food");
    expect(s.lit()).toBe("/app/groceries");
    expect(s.memory()).toEqual({});
    s.tap("/app");
    s.tap("/app/groceries");
    expect(s.address()).toBe("/app/groceries");
  });
});

describe("a change to the query alone is remembered (Dina: Recipes' filters and search, the list chosen on the Shopping list)", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it("every history entry the app pushes or replaces fires the address event", async () => {
    const { ADDRESS_EVENT, installBackDepth } = await import("../app/app/_lib/backNav");
    expect(ADDRESS_EVENT).toBe("mm:address");
    const fired: string[] = [];
    const urls: unknown[] = [];
    const history = {
      state: null as unknown,
      pushState(data: unknown, _unused: string, url?: string | URL | null) { urls.push(url); this.state = data; },
      replaceState(data: unknown, _unused: string, url?: string | URL | null) { urls.push(url); this.state = data; },
    };
    (globalThis as Record<string, unknown>).window = { history, dispatchEvent: (e: Event) => { fired.push(e.type); return true; } };
    installBackDepth();
    const w = (globalThis as unknown as { window: { history: typeof history } }).window;
    w.history.pushState({}, "", "/app/recipes?meal=dinner");
    expect(fired).toEqual([ADDRESS_EVENT]);
    w.history.replaceState(w.history.state, "", "/app/recipes?meal=lunch");
    expect(fired).toEqual([ADDRESS_EVENT, ADDRESS_EVENT]);
    expect(urls).toEqual(["/app/recipes?meal=dinner", "/app/recipes?meal=lunch"]);
    expect(w.history.state).toMatchObject({ mmDepth: 1 }); // the depth is still written
  });

  it("AppShell notes it, and Back and Forward, only on the page on screen, and stops listening when it goes", () => {
    const src = readFileSync("app/app/_components/AppShell.tsx", "utf8");
    expect(src).toContain("window.addEventListener(ADDRESS_EVENT, noteQuery);");
    expect(src).toContain('window.addEventListener("popstate", noteQuery);');
    expect(src).toContain("window.removeEventListener(ADDRESS_EVENT, noteQuery);");
    expect(src).toContain('window.removeEventListener("popstate", noteQuery);');
    expect(src).toContain("window.location.pathname === now.path && shouldRemember(TABS, SHARED_PAGES, now.path, now.lit)");
    expect(src).toContain("shown.current = { path: pathname, lit };");
    // the remembering itself: the same address twice changes nothing (the event fires on every keystroke in a search box)
    const m = remember({}, [{ href: "/app/recipes", match: (p) => p.startsWith("/app/recipes") }], "/app/recipes", "?q=curry");
    expect(remember(m, [{ href: "/app/recipes", match: (p) => p.startsWith("/app/recipes") }], "/app/recipes", "?q=curry")).toBe(m);
  });
});
