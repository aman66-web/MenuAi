import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The welcome steps' feature screens (the onboarding redesign meeting of 20 November 2026, build list 4): the window draws no digit while it loads or when its
// data failed (CLAUDE.md rule 1: no figure that isn't real), its Free and Premium tags and the week's named tools follow GATING_ENABLED and
// PHOTO_RECIPES_ENABLED only, and nothing in the welcome screens moves under Reduce Motion.

// The window's words hook loads "@/" paths the unit tests can't resolve: a stand-in that fills the placeholders.
vi.mock("../app/app/_lib/i18n", () => ({ useT: () => (s: string, v?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v && k in v ? String(v[k]) : m)) }));

/** The words a page shows: the tags taken out and the characters React writes as entities put back. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const WELCOME = new URL("../app/app/welcome/", import.meta.url);
const source = (file: string) => readFileSync(new URL(file, WELCOME), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the feature screens' window (welcome/ShowcaseWindow.tsx)", () => {
  it("draws no digit while loading, on every window, with or without the tags", async () => {
    for (const env of [{}, { NEXT_PUBLIC_PRO: "1" }]) {
      vi.resetModules();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const { ShowcaseWindow } = await import("../app/app/welcome/ShowcaseWindow");
      for (const kind of ["eatOut", "recipes", "week"] as const) {
        const html = renderToStaticMarkup(createElement(ShowcaseWindow, { kind, loading: true, status: "Finding two recipes at Sainsbury's…", rows: 3 }));
        expect(text(html), `${kind} ${JSON.stringify(env)}`).not.toMatch(/\d/);
        // the skeleton is there, and the window is a named region
        expect(html).toContain("aria-label=");
        expect(html).toMatch(/bg-background/);
      }
    }
  });

  it("carries the Free tag on Eat out and Recipes and the Premium badge on the week only where Premium is sold", async () => {
    const { windowTags } = await import("../app/app/welcome/ShowcaseWindow");
    expect(windowTags("eatOut", false)).toEqual({ free: false, premium: false });
    expect(windowTags("week", false)).toEqual({ free: false, premium: false });
    expect(windowTags("eatOut", true)).toEqual({ free: true, premium: false });
    expect(windowTags("recipes", true)).toEqual({ free: true, premium: false });
    expect(windowTags("week", true)).toEqual({ free: false, premium: true });
  });

  it("names Scan your food and Make it at home only where they are switched on, and nothing on the website", async () => {
    const { alsoInPremium } = await import("../app/app/welcome/ShowcaseWindow");
    expect(alsoInPremium(false, false)).toBeNull();
    expect(alsoInPremium(false, true)).toBeNull();
    expect(alsoInPremium(true, false)).toBe("Also in Premium: Cook with what you already have.");
    expect(alsoInPremium(true, true)).toBe("Also in Premium: Scan your food, Make it at home, and Cook with what you already have.");
  });

  it("follows this build's GATING_ENABLED and PHOTO_RECIPES_ENABLED, never another switch", async () => {
    const builds: Array<Record<string, string>> = [{}, { NEXT_PUBLIC_PRO: "1" }, { NEXT_PUBLIC_PRO: "1", NEXT_PUBLIC_PHOTO_RECIPES: "1" }, { NEXT_PUBLIC_PHOTO_RECIPES: "1" }];
    for (const env of builds) {
      vi.unstubAllEnvs();
      vi.resetModules();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const { alsoInPremium, windowTags, ShowcaseWindow } = await import("../app/app/welcome/ShowcaseWindow");
      const { GATING_ENABLED, PHOTO_RECIPES_ENABLED } = await import("../lib/mm/config");
      expect(alsoInPremium(), JSON.stringify(env)).toBe(alsoInPremium(GATING_ENABLED, PHOTO_RECIPES_ENABLED));
      expect(windowTags("week").premium, JSON.stringify(env)).toBe(GATING_ENABLED);
      const week = text(renderToStaticMarkup(createElement(ShowcaseWindow, { kind: "week", loading: true })));
      expect(week.includes("Premium"), JSON.stringify(env)).toBe(GATING_ENABLED);
      expect(week.includes("Nothing is charged during setup."), JSON.stringify(env)).toBe(GATING_ENABLED);
      const eatOut = text(renderToStaticMarkup(createElement(ShowcaseWindow, { kind: "eatOut", loading: true })));
      expect(/\bFree\b/.test(eatOut), JSON.stringify(env)).toBe(GATING_ENABLED);
      // never a price or trial word anywhere in a window
      expect(week + eatOut).not.toMatch(/£|trial|Try|Subscribe/i);
    }
  });
});

describe("the feature screens' words when their data is missing", () => {
  // the plain lines drawn instead of dishes, recipes or a week: no digit in any of them (their only figures ever come from the data)
  const fallbacks: Array<[file: string, words: string]> = [
    ["EatOutShowcase.tsx", "Menus need a connection the first time. Every restaurant is in Eat out."],
    ["RecipeChoice.tsx", "Recipes can't load just now. You'll find them under Recipes."],
    ["RecipeChoice.tsx", "Finding two recipes for you…"],
    ["WeekShowcase.tsx", "Meal plan plans a week of meals from your shop, sized to your numbers, with one shopping list. You'll find it on Home."],
    ["EatOutShowcase.tsx", "Loading the menus…"],
  ];
  it.each(fallbacks)("%s: %s", (file, words) => {
    expect(source(file)).toContain(`"${words}"`);
    expect(words).not.toMatch(/\d/);
  });

  it("shows prices only with the shelf-price line, on both screens that show them", () => {
    for (const file of ["RecipeChoice.tsx", "WeekShowcase.tsx"]) expect(source(file)).toContain("Prices are {shop}'s shelf prices and vary by store.");
  });
});

describe("Reduce Motion", () => {
  const files = readdirSync(WELCOME).filter((f) => /\.tsx?$/.test(f));
  it("every animation the welcome screens start in script checks for reduced motion first", () => {
    for (const file of files) {
      const src = source(file);
      if (!/\.animate\(/.test(src)) continue;
      expect(src, file).toMatch(/prefers-reduced-motion: reduce/);
    }
  });
  it("Pip's entrance is the stylesheet's pip-jump (only under no-preference), at 800 ms or less, and plays only on step 1", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const noPreference = [...css.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    expect(noPreference).toMatch(/\.pip-jump \{/);
    const users = files.filter((f) => source(f).includes("pip-jump"));
    expect(users).toEqual(["QuestionSteps.tsx"]);
    expect(source("QuestionSteps.tsx")).toContain('animationDuration: "800ms"');
  });
  it("no confetti, burst or count-up is left in the welcome screens", () => {
    for (const file of files) expect(source(file), file).not.toMatch(/<Confetti|<Burst|"confetti|"burst|countUp/);
  });
});
