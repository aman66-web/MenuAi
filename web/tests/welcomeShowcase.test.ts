import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The welcome screens that show the app working (step 4's recipes and Your plan's week): the window draws no digit while it loads or when its data failed
// (CLAUDE.md rule 1: no figure that isn't real), carries no caption or tag (founder, 20 November 2026: "no labels on previews"), and nothing in the welcome
// screens moves under Reduce Motion.

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

describe("the window (welcome/ShowcaseWindow.tsx)", () => {
  it("draws no digit while loading, on every window, with or without Premium sold", async () => {
    for (const env of [{}, { NEXT_PUBLIC_PRO: "1" }]) {
      vi.resetModules();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const { ShowcaseWindow } = await import("../app/app/welcome/ShowcaseWindow");
      for (const kind of ["recipes", "week"] as const) {
        const html = renderToStaticMarkup(createElement(ShowcaseWindow, { kind, loading: true, status: "Finding two recipes at Sainsbury's…", rows: 3 }));
        expect(text(html), `${kind} ${JSON.stringify(env)}`).not.toMatch(/\d/);
        // the skeleton is there, and the window is a named region
        expect(html).toContain("aria-label=");
        expect(html).toMatch(/bg-background/);
      }
    }
  });

  it("carries no caption, Free tag, Premium badge or 'Nothing is charged' line, on any build", async () => {
    for (const env of [{}, { NEXT_PUBLIC_PRO: "1" }, { NEXT_PUBLIC_PRO: "1", NEXT_PUBLIC_PHOTO_RECIPES: "1" }]) {
      vi.unstubAllEnvs();
      vi.resetModules();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const { ShowcaseWindow } = await import("../app/app/welcome/ShowcaseWindow");
      for (const kind of ["recipes", "week"] as const) {
        const words = text(renderToStaticMarkup(createElement(ShowcaseWindow, { kind, loading: true })));
        expect(words, `${kind} ${JSON.stringify(env)}`).not.toMatch(/A look at|\bFree\b|Premium|Nothing is charged|£|trial|Subscribe/i);
      }
    }
    for (const file of readdirSync(WELCOME).filter((f) => /\.tsx?$/.test(f))) {
      expect(source(file), file).not.toMatch(/"A look at|"Nothing is charged during setup\.|"Also in Premium/);
    }
  });
});

describe("the welcome screens' words when their data is missing", () => {
  // the plain lines drawn instead of recipes or a week: no digit in any of them (their only figures ever come from the data)
  const fallbacks: Array<[file: string, words: string]> = [
    ["RecipeChoice.tsx", "Recipes can't load just now. You'll find them under Recipes."],
    ["RecipeChoice.tsx", "Finding two recipes for you…"],
    ["WeekShowcase.tsx", "Meal plan makes your week from your shop, with one shopping list."],
  ];
  it.each(fallbacks)("%s: %s", (file, words) => {
    expect(source(file)).toContain(`"${words}"`);
    expect(words).not.toMatch(/\d/);
  });

  it("shows prices only with the shelf-price line (step 4, and Your plan's example week: its first shop and each week after)", () => {
    expect(source("RecipeChoice.tsx")).toContain("Prices are {shop}'s shelf prices and vary by store.");
    // founder 2026-11-20, 23:05 ("week one cost and then the week afterwards costs"): the example week is priced at the person's shop, as Meal plan says it
    const week = source("WeekShowcase.tsx");
    expect(week).toContain("<TwoWeeks ");
    expect(week).toContain("Prices are {shop}'s shelf prices, checked {date}, and vary by store.");
    expect(week).not.toMatch(/formatPrice|total\b/);
  });

  it("Your plan's week is an example, never worked out or sized for the person (founder 2026-11-20: \"We shouldn't calculate the meal plan\")", () => {
    const week = source("WeekShowcase.tsx");
    expect(week).toContain("exampleWeek(");
    expect(week).toContain("An example of what you can make.");
    // the shop's file is read only to price the example (23:05); the week itself is never a plan worked out or sized for them
    for (const worked of ["weekPreview", "dailyCalories", "kcal"]) expect(week, worked).not.toContain(worked);
  });

  it("captions every restaurant photo with where it comes from (CLAUDE.md rule 2), and never shows Costa's (it has none)", () => {
    const row = source("RestaurantRow.tsx");
    expect(row).toContain('"Photo from the {chain} website"');
    expect(row).toContain('"Not affiliated with any restaurant or shop shown."');
    expect(row).toMatch(/itemImageUrl/);
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
  it("no Pip speech bubble is left in the welcome screens (founder, 20 November 2026)", () => {
    for (const file of files) expect(source(file), file).not.toMatch(/<PipSays|BubbleWords|className="speech/);
  });
  it("no confetti, burst or count-up is left in the welcome screens", () => {
    for (const file of files) expect(source(file), file).not.toMatch(/<Confetti|<Burst|"confetti|"burst|countUp/);
  });
});
