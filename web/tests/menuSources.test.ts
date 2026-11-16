import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FSA_SOURCE } from "../lib/mm/truth/fsaLights";
import { HOUSEHOLD_BASIS, HOUSEHOLD_SOURCES, householdEquivalents } from "../lib/mm/truth/household";
import { MENU_SOURCES, MENU_SOURCES_CHECKED, MENU_SOURCE_HOSTS, menuSource } from "../lib/mm/truth/menuSources";
import { MOST_PROTEIN, PRESETS, PROTEIN_35_G, SMALL_APPETITE, SUGAR_5_G, UNDER_500_KCAL } from "../lib/mm/truth/presets";
import { LOW_SHARE_OVER_1000, OVER_1000_CAP, proteinScore, SHARE_BANDS, SIZE_CAPS } from "../lib/mm/truth/proteinScore";
import { REFERENCE_INTAKE_SOURCE } from "../lib/mm/truth/referenceIntake";

// App Review 1.4.1 (the rule that rejected build 3): the menu screens' extra numbers name their source, easy to find. The menu sources screen may only list a
// source the Truth card already links to (each read on 13 November 2026), and its words are built from the same constants the features use.
const BODY = readFileSync(new URL("../app/app/_components/MenuSourcesBody.tsx", import.meta.url), "utf8");
const LINK = readFileSync(new URL("../app/app/_components/MenuSourcesLink.tsx", import.meta.url), "utf8");

describe("menu sources", () => {
  it("lists exactly the sources the Truth card links to, each https on an allowed host", () => {
    expect(MENU_SOURCES.map((s) => s.url).sort()).toEqual(
      [REFERENCE_INTAKE_SOURCE.url, FSA_SOURCE.url, HOUSEHOLD_SOURCES.sugar.url, HOUSEHOLD_SOURCES.fat.url, HOUSEHOLD_SOURCES.protein.url].sort(),
    );
    for (const s of MENU_SOURCES) {
      const u = new URL(s.url);
      expect(u.protocol).toBe("https:");
      expect(MENU_SOURCE_HOSTS).toContain(u.host);
      expect(u.username + u.password).toBe("");
      expect(s.citation.length).toBeGreaterThan(20);
    }
    expect(new Set(MENU_SOURCES.map((s) => s.id)).size).toBe(MENU_SOURCES.length);
    expect(new Set(MENU_SOURCES.map((s) => s.url)).size).toBe(MENU_SOURCES.length);
  });

  it("were all read on the one day the screen names", () => {
    expect(new Set(MENU_SOURCES.map((s) => s.checkedOn))).toEqual(new Set([MENU_SOURCES_CHECKED]));
    expect(Number.isNaN(Date.parse(MENU_SOURCES_CHECKED))).toBe(false);
  });

  it("finds a source by id and refuses an unknown one", () => {
    expect(menuSource("fsa-front-of-pack").url).toBe(FSA_SOURCE.url);
    expect(() => menuSource("nope" as never)).toThrow();
  });

  it("keeps every address in lib/mm/truth (the screens read them from there)", () => {
    for (const src of [BODY, LINK]) expect(src).not.toMatch(/https?:\/\//);
  });

  it("shows the same basis line as the Truth card's 'What that looks like'", () => {
    const eq = householdEquivalents({ calories: 900, sugar: 30, fat: 40, protein: 30 });
    expect(eq.map((e) => e.basis)).toEqual([HOUSEHOLD_BASIS.sugar, HOUSEHOLD_BASIS.fat, HOUSEHOLD_BASIS.protein]);
  });

  it("still describes the Protein score the way the words say", () => {
    // "5 needs at least {p5} …, 4 needs {p4}, 3 needs {p3} and 2 needs {p2}; below that it is 1"
    expect(SHARE_BANDS.map((b) => b.score)).toEqual([5, 4, 3, 2]);
    // "up to {k5} kcal can score 5, up to {k4} kcal 4, up to {k3} kcal 3, and larger ones 2 at most (1 if under {low} …)"
    expect(SIZE_CAPS.map((c) => c.cap)).toEqual([5, 4, 3]);
    expect(OVER_1000_CAP).toBe(2);
    const big = SIZE_CAPS[SIZE_CAPS.length - 1].maxKcal + 100;
    expect(proteinScore({ calories: big, protein: (big * (LOW_SHARE_OVER_1000 - 0.01)) / 4 })?.score).toBe(1);
    expect(proteinScore({ calories: big, protein: (big * 0.5) / 4 })?.score).toBe(2);
  });

  it("states the same Quick answers limits as each list's own rule line", () => {
    const rule = (id: string) => PRESETS.find((p) => p.id === id)?.rule ?? "";
    expect(rule("under-500")).toContain(`${UNDER_500_KCAL} kcal`);
    expect(rule("protein-35")).toContain(`${PROTEIN_35_G} g`);
    expect(rule("small-appetite")).toContain(`${SMALL_APPETITE.maxKcal} kcal`);
    expect(rule("small-appetite")).toContain(`${SMALL_APPETITE.minProtein} g`);
    expect(rule("sugar-5")).toContain(`${SUGAR_5_G} g`);
    expect(rule("most-protein")).toContain(`${MOST_PROTEIN.minKcal} kcal`);
    expect(rule("most-protein")).toContain(`${MOST_PROTEIN.minProtein} g`);
  });

  it("never calls a food good, bad or healthy, and gives no advice of its own", () => {
    const words = [...BODY.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(" ");
    expect(words.length).toBeGreaterThan(500);
    expect(words).not.toMatch(/\b(good|bad|healthy|healthier|unhealthy|junk|should)\b/i);
  });
});
