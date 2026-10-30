import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TARGET_SOURCES, TARGET_SOURCES_CHECKED, TARGET_SOURCE_HOSTS, targetSource } from "../lib/mm/targetSources";
import { CALORIE_ADJUSTMENT, DIET_PROTEIN_FACTOR } from "../lib/mm/targets";

// App Review 1.4.1 (30 October 2026): citations for the health information. A source may only be one that was read, on a host we expect, over https.
describe("target sources", () => {
  it("lists the three read sources, each with a citation and an https link on an allowed host", () => {
    expect(TARGET_SOURCES.map((s) => s.id).sort()).toEqual(["issn-protein", "mifflin", "nhs-calories"]);
    for (const s of TARGET_SOURCES) {
      const u = new URL(s.url);
      expect(u.protocol).toBe("https:");
      expect(TARGET_SOURCE_HOSTS).toContain(u.host);
      expect(s.citation.length).toBeGreaterThan(20);
      expect(u.username + u.password).toBe("");
    }
  });
  it("has unique ids and addresses, and a real checked date", () => {
    expect(new Set(TARGET_SOURCES.map((s) => s.id)).size).toBe(TARGET_SOURCES.length);
    expect(new Set(TARGET_SOURCES.map((s) => s.url)).size).toBe(TARGET_SOURCES.length);
    expect(Number.isNaN(Date.parse(TARGET_SOURCES_CHECKED))).toBe(false);
  });
  it("still describes the rules the sources screen states in words", () => {
    // "For the lose-weight and GLP-1 goals, 500 kcal a day below": the two goals must share one adjustment
    expect(CALORIE_ADJUSTMENT.glp1).toBe(CALORIE_ADJUSTMENT.lose);
    // "For a vegetarian or vegan diet, the grams per kilogram start a little higher" (pescatarian: no change)
    expect(DIET_PROTEIN_FACTOR.vegan).toBeGreaterThan(1);
    expect(DIET_PROTEIN_FACTOR.vegetarian).toBeGreaterThan(1);
    expect(DIET_PROTEIN_FACTOR.pescatarian).toBe(1);
  });
  it("finds a source by id and refuses an unknown one", () => {
    expect(targetSource("mifflin").url).toContain("pubmed");
    expect(() => targetSource("nope" as never)).toThrow();
  });
  it("is the only place the source addresses live (the screens read them from here)", () => {
    for (const f of ["../app/app/_components/SourcesBody.tsx", "../app/app/_components/SourcesLink.tsx", "../app/app/settings/sources/SourcesContent.tsx"]) {
      expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/https?:\/\/(?!numbite)/);
    }
  });
});
