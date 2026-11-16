import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MIN_SCORED_KCAL, proteinScore, proteinShare, SCORE_LABELS } from "../lib/mm/truth/proteinScore";
import { itemKind, isMealKind } from "../lib/mm/truth/itemKind";
import type { Chain } from "../lib/mm/types";

const s = (calories: number, protein?: number) => proteinScore({ calories, protein })?.score ?? null;

describe("proteinShare", () => {
  it("is the calories that protein gives, over the item's calories", () => {
    expect(proteinShare({ calories: 400, protein: 25 })).toBeCloseTo(0.25, 10);
  });
  it("is undefined without published protein or calories", () => {
    expect(proteinShare({ calories: 400 })).toBeUndefined();
    expect(proteinShare({ calories: 0, protein: 10 })).toBeUndefined();
    expect(proteinShare({ calories: Number.NaN, protein: 10 })).toBeUndefined();
    expect(proteinShare({ calories: 400, protein: -1 })).toBeUndefined();
  });
  it("never exceeds 1 (a rounding quirk in a guide can't give 120%)", () => {
    expect(proteinShare({ calories: 100, protein: 30 })).toBe(1);
  });
});

describe("proteinScore: the bands, pinned", () => {
  it.each([
    // [kcal, protein g, score]
    [600, 45, 5], // 30% share, a normal size
    [650, 41, 5], // 25.2% share at the size limit for a 5
    [651, 41, 4], // one kcal over the limit: the size cap lowers it
    [700, 50, 4], // 28.6% share but 700 kcal
    [800, 50, 4], // 25% share at the 800 limit
    [801, 50, 3], // over 800: cap 3
    [1000, 60, 3], // 24% share, cap 3
    [1100, 70, 2], // 25.5% share, over 1,000: cap 2
    [1100, 30, 1], // 10.9% share over 1,000: 1
    [500, 25, 4], // 20% share exactly
    [500, 24.9, 3], // just under 20%
    [500, 18.9, 3], // 15.1%
    [500, 18.7, 2], // 14.96%
    [500, 10, 2], // 8% exactly
    [500, 9.9, 1],
    [200, 5, 2], // a small plate
    [120, 0, 1], // the smallest scored size, no protein
  ])("%i kcal with %f g protein scores %i", (kcal, protein, score) => expect(s(kcal, protein)).toBe(score));

  it("is null under the minimum size and without published protein", () => {
    expect(s(MIN_SCORED_KCAL - 1, 10)).toBeNull();
    expect(s(400, undefined)).toBeNull();
    expect(s(0, 0)).toBeNull();
  });

  it("returns a label for every score, in neutral words about the numbers (rule 3)", () => {
    for (const score of [1, 2, 3, 4, 5] as const) {
      const label = SCORE_LABELS[score];
      expect(label).toMatch(/protein for its calories$/);
      expect(label).not.toMatch(/\b(good|bad|healthy|unhealthy|best|worst|top pick|alert|clean|junk|guilt)/i);
    }
    expect(proteinScore({ calories: 600, protein: 45 })?.label).toBe(SCORE_LABELS[5]);
  });

  it("a higher protein share never scores lower at the same calories, and a bigger portion never scores higher at the same share", () => {
    for (let kcal = 120; kcal <= 1500; kcal += 10) {
      let last = 0;
      for (let p = 0; p <= kcal / 4; p += 1) {
        const v = s(kcal, p) as number;
        expect(v, `${kcal} kcal ${p} g`).toBeGreaterThanOrEqual(last);
        last = v;
      }
    }
    for (const share of [0.05, 0.1, 0.16, 0.22, 0.3]) {
      let last = 5;
      for (let kcal = 120; kcal <= 1500; kcal += 10) {
        const v = s(kcal, (kcal * share) / 4) as number;
        expect(v, `${kcal} kcal at ${share}`).toBeLessThanOrEqual(last);
        last = v;
      }
    }
  });
});

const menuDir = fileURLToPath(new URL("../public/menus/", import.meta.url));
const chains: Chain[] = readdirSync(menuDir)
  .filter((f) => f.startsWith("chain-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(menuDir + f, "utf8")) as Chain)
  .filter((c) => !c.sample);

describe("proteinScore: real menus", () => {
  it("scores every item of every chain without a NaN or a surprise, and skips calories-only chains", () => {
    let scored = 0;
    let calorieOnlyScored = 0;
    for (const c of chains) {
      for (const it of c.items) {
        const r = proteinScore(it.nutrients);
        if (r === null) continue;
        expect([1, 2, 3, 4, 5]).toContain(r.score);
        expect(Number.isFinite(r.share)).toBe(true);
        expect(r.share).toBeGreaterThanOrEqual(0);
        expect(r.share).toBeLessThanOrEqual(1);
        scored++;
        if (c.nutritionLevel === "calories" && it.nutrients.protein === undefined) calorieOnlyScored++;
      }
    }
    expect(scored).toBeGreaterThan(15000);
    expect(calorieOnlyScored).toBe(0);
  });

  it("spreads the meals across all five scores, with a 5 being uncommon", () => {
    const counts = [0, 0, 0, 0, 0, 0];
    let meals = 0;
    for (const c of chains) {
      for (const it of c.items) {
        if (!isMealKind(itemKind({ name: it.name, category: it.category, calories: it.nutrients.calories }))) continue;
        const r = proteinScore(it.nutrients);
        if (!r) continue;
        counts[r.score]++;
        meals++;
      }
    }
    for (const score of [1, 2, 3, 4, 5]) expect(counts[score], `score ${score}`).toBeGreaterThan(meals * 0.02);
    expect(counts[5]).toBeLessThan(meals * 0.3);
    expect(counts[1] + counts[2]).toBeGreaterThan(meals * 0.2);
  });
});
