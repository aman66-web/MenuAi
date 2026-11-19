import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlainLaunch, OWN_DATA_KEYS, storedData, TOUR_GATE_SCRIPT, TOUR_VERSION, tourDue, trialOfferDue } from "../lib/mm/tour";

// The welcome tour (lib/mm/tour.ts, app/app/welcome/Tour.tsx): the gate a first plain launch goes through, the iPhone app's trial offer after it, and the words
// Pip says on each stop. The two app modules the tour's stops read through "@/" paths are replaced here (the words come back as they are).
vi.mock("../app/app/_lib/i18n", () => ({ useT: () => (s: string) => s }));
vi.mock("../app/app/welcome/parts", () => ({ CAPS: "" }));

type Stored = Record<string, unknown>;
interface FakeStorage { getItem: (key: string) => string | null }

/** A localStorage holding each value in the app's { v, data } envelope; `raw` keys hold text as given; `throws` is storage that refuses (a private window). */
function storage(items: Stored = {}, opts: { raw?: Record<string, string>; throws?: boolean } = {}): FakeStorage {
  return {
    getItem(key: string) {
      if (opts.throws) throw new Error("storage is blocked");
      if (opts.raw && key in opts.raw) return opts.raw[key]!;
      return key in items ? JSON.stringify({ v: 1, data: items[key] }) : null;
    },
  };
}

/** Runs the layout's inline script against a pretend page; returns where it sent the page (none = stayed). */
function runGate(address: string, store: FakeStorage): string[] {
  const url = new URL(address, "https://numbite.com");
  const replaced: string[] = [];
  const location = { pathname: url.pathname, search: url.search, hash: url.hash, replace: (to: string) => replaced.push(to) };
  new Function("location", "localStorage", TOUR_GATE_SCRIPT)(location, store);
  return replaced;
}

/** What isPlainLaunch and tourDue say for the same page (anything that throws, like text that isn't JSON, means no tour). */
function expected(address: string, store: FakeStorage): boolean {
  const url = new URL(address, "https://numbite.com");
  try {
    return isPlainLaunch(url.pathname, url.search, url.hash) && tourDue(storedData((key) => store.getItem(key)));
  } catch {
    return false;
  }
}

const settings = (patch: Stored) => ({ goal: "maintain", dailyCalories: 2000, preferences: {}, ...patch });

describe("the gate on a first plain launch", () => {
  const redirects: Array<[string, string, FakeStorage]> = [
    ["/app with nothing stored", "/app", storage()],
    ["/app/ with nothing stored", "/app/", storage()],
    ["the exported /app/index.html", "/app/index.html", storage()],
    ["settings stored, neither flag set", "/app", storage({ "mm.v1.settings": settings({ hasCompletedOnboarding: false, dismissedTargetsCard: false, textSize: "xlarge" }) })],
    ["an older tour version", "/app", storage({ "mm.v1.tour": 0 })],
    ["own stores that are empty", "/app", storage(Object.fromEntries(OWN_DATA_KEYS.map((k) => [k, []])))],
  ];
  const stays: Array<[string, string, FakeStorage]> = [
    ["a creator's ?ref= link", "/app?ref=x", storage()],
    ["a # on the start page", "/app#x", storage()],
    ["a restaurant", "/app/chain?id=kfc", storage()],
    ["a dish", "/app/item?c=x&i=y", storage()],
    ["a shared list", "/app/groceries/list/shared#1abcdef", storage()],
    ["a friend's invite", "/app/community/friends#ABCDEFGH", storage()],
    ["the welcome screens themselves", "/app/welcome", storage()],
    ["the offline page", "/app/offline", storage()],
    ["someone set up", "/app", storage({ "mm.v1.settings": settings({ hasCompletedOnboarding: true }) })],
    ["someone who said Not now", "/app", storage({ "mm.v1.settings": settings({ dismissedTargetsCard: true }) })],
    ["the tour seen", "/app", storage({ "mm.v1.tour": TOUR_VERSION })],
    ["a non-empty log", "/app", storage({ "mm.v1.log": [{ id: "l1" }] })],
    ["a non-empty shopping list", "/app", storage({ "mm.v1.shopping": [{ name: "Milk" }] })],
    ["water added", "/app", storage({ "mm.v1.water": [{ id: "w1", ml: 250 }] })],
    ["settings that aren't JSON", "/app", storage({}, { raw: { "mm.v1.settings": "{not json" } })],
    ["storage that throws", "/app", storage({}, { throws: true })],
  ];

  it.each(redirects)("sends %s to the welcome screens", (_, address, store) => {
    expect(runGate(address, store)).toEqual(["/app/welcome"]);
    expect(expected(address, store)).toBe(true);
  });

  it.each(stays)("leaves %s where it is", (_, address, store) => {
    expect(runGate(address, store)).toEqual([]);
    expect(expected(address, store)).toBe(false);
  });

  it("counts anything in any of the person's own stores", () => {
    for (const key of OWN_DATA_KEYS) {
      const store = storage({ [key]: [{ id: "x" }] });
      expect(runGate("/app", store), key).toEqual([]);
      expect(expected("/app", store), key).toBe(false);
    }
  });

  it("is built from the same constants, never from a function's source", () => {
    expect(TOUR_GATE_SCRIPT).toContain(JSON.stringify(OWN_DATA_KEYS));
    expect(TOUR_GATE_SCRIPT).toContain(`>=${TOUR_VERSION}`);
    expect(TOUR_GATE_SCRIPT.startsWith("try{")).toBe(true);
    expect(TOUR_GATE_SCRIPT.endsWith("catch(e){}")).toBe(true);
  });
});

describe("the iPhone app's free-trial offer", () => {
  const base = { native: true, onboarded: true, tourSeen: false, shown: false, paid: false, pathname: "/app" };
  it.each([
    ["after setup, on Home", base, true],
    ["after the tour was seen (Look around first, Skip)", { ...base, onboarded: false, tourSeen: true }, true],
    ["neither set up nor toured", { ...base, onboarded: false, tourSeen: false }, false],
    ["shown already", { ...base, shown: true }, false],
    ["paid access on", { ...base, paid: true }, false],
    ["on the website", { ...base, native: false }, false],
    ["on Home with a slash", { ...base, pathname: "/app/" }, true],
    ["on the welcome screens", { ...base, pathname: "/app/welcome" }, false],
    ["on Eat out", { ...base, pathname: "/app/eat-out" }, false],
    ["on a shared list", { ...base, pathname: "/app/groceries/list/shared" }, false],
  ])("%s", (_, input, want) => {
    expect(trialOfferDue(input)).toBe(want);
  });
});

describe("the tour's stops", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const lines = (stop: { says: string; rows: ReadonlyArray<{ text: string }> }) => [stop.says, ...stop.rows.map((r) => r.text)];

  it("has one stop per tab, in the bar's order", async () => {
    const { TOUR_STOPS } = await import("../app/app/welcome/Tour");
    const { TABS } = await import("../app/app/_lib/tabs");
    const ids: Record<string, string> = { "/app": "home", "/app/eat-out": "eatOut", "/app/groceries": "groceries", "/app/recipes": "recipes", "/app/community": "community" };
    expect(TOUR_STOPS.map((s) => s.id)).toEqual(TABS.map((t) => ids[t.href]));
  });

  it("shows three or four things to do on each tab (Community: the food blogs, and friends when they are on)", async () => {
    const { TOUR_STOPS, visibleRows } = await import("../app/app/welcome/Tour");
    const { COMMUNITY_FRIENDS_ENABLED } = await import("../lib/mm/config");
    for (const stop of TOUR_STOPS) {
      const n = visibleRows(stop.rows).length;
      if (stop.id === "community") expect(n).toBe(COMMUNITY_FRIENDS_ENABLED ? 2 : 1);
      else expect(n, stop.id).toBeGreaterThanOrEqual(3);
      expect(n, stop.id).toBeLessThanOrEqual(4);
    }
  });

  it("has no figures and never calls food good or bad (CLAUDE.md rules 1 and 3)", async () => {
    const { TOUR_STOPS } = await import("../app/app/welcome/Tour");
    for (const stop of TOUR_STOPS) {
      for (const line of lines(stop)) {
        expect(line, line).not.toMatch(/\d/);
        expect(line, line).not.toMatch(/\b(good|bad|healthy|unhealthy|junk|clean)\b/i);
      }
    }
  });

  it("leaves a row out when its feature is off", async () => {
    const { visibleRows } = await import("../app/app/welcome/Tour");
    const Icon = () => null;
    expect(visibleRows([{ Icon, text: "a" }, { Icon, text: "b", when: false }, { Icon, text: "c", when: true }]).map((r) => r.text)).toEqual(["a", "c"]);
  });

  it("follows the build's switches: Make it at home only with photo recipes, Community only when it is on, friends only when Community friends are on", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMMUNITY_FRIENDS", "0");
    vi.stubEnv("NEXT_PUBLIC_PHOTO_RECIPES", "0");
    vi.resetModules();
    const off = (await import("../app/app/welcome/Tour")).TOUR_STOPS;
    const offRows = (id: string) => (off.find((s) => s.id === id)?.rows ?? []).filter((r) => r.when !== false).map((r) => r.text);
    // the scan card's row (calories and macros, or a recipe to make it at home) is on Home since 2026-11-19, and only on a build with the photo features
    expect([...offRows("home"), ...offRows("recipes")].some((t) => t.includes("make it at home") || t.startsWith("Scan your food"))).toBe(false);
    // Community is off unless NEXT_PUBLIC_COMMUNITY=1 (founder 2026-11-18): no Community stop at all
    expect(off.some((s) => s.id === "community")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_COMMUNITY", "1");
    vi.resetModules();
    const noFriends = (await import("../app/app/welcome/Tour")).TOUR_STOPS;
    expect((noFriends.find((s) => s.id === "community")?.rows ?? []).filter((r) => r.when !== false).some((r) => r.text.includes("friends"))).toBe(false);
    expect(noFriends.find((s) => s.id === "community")?.says).toBe("Short articles to read, all in one place!");

    vi.stubEnv("NEXT_PUBLIC_COMMUNITY_FRIENDS", "1");
    vi.stubEnv("NEXT_PUBLIC_PHOTO_RECIPES", "1");
    vi.stubEnv("NEXT_PUBLIC_PRO", "1"); // Make it at home needs Premium on the build
    vi.resetModules();
    const on = (await import("../app/app/welcome/Tour")).TOUR_STOPS;
    const onRows = (id: string) => (on.find((s) => s.id === id)?.rows ?? []).filter((r) => r.when !== false).map((r) => r.text);
    expect(onRows("home")).toContain("Scan your food: take a photo of a meal for its calories and macros, or for a recipe to make it at home. It's part of Premium.");
    expect(onRows("home")).toContain("Under your numbers: let Meal plan make your week, or cook with what you already have. Meal plan is part of Premium.");
    expect(onRows("community")).toContain("Sign in to add friends with a code, then send each other shopping lists.");
    expect(on.find((s) => s.id === "community")?.says).toBe("Read short food articles, and send your shopping list to friends!");
  });

  it("every line is a tk() key, listed in keys.json", async () => {
    const { TOUR_STOPS } = await import("../app/app/welcome/Tour");
    const keys = new Set(JSON.parse(readFileSync(new URL("../lib/mm/locales/keys.json", import.meta.url), "utf8")) as string[]);
    const source = readFileSync(new URL("../app/app/welcome/Tour.tsx", import.meta.url), "utf8");
    for (const stop of TOUR_STOPS) {
      for (const row of stop.rows) {
        expect(source, row.text).toContain(`tk(${JSON.stringify(row.text)})`);
        expect(keys.has(row.text), `run WRITE_I18N=1 npx vitest run tests/i18n.test.ts: "${row.text}" is not in keys.json`).toBe(true);
      }
      expect(keys.has(stop.says), stop.says).toBe(true);
    }
  });
});
