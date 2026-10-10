import { describe, expect, it } from "vitest";
import { candidatesFor, passesPreferences, rank } from "../lib/mm/ranking";
import type { Goal, Meal, Preferences, Profile } from "../lib/mm/types";
import { NO_PREFERENCES } from "../lib/mm/types";
import { loadChain, loadFixture, tinyChain } from "./fixtures";

interface GoldenCase {
  name: string;
  chain: string;
  profile: Profile;
  loggedCalories: number;
  meal: Meal;
  prefs: Partial<Preferences>;
  expected: { mode: string; remaining: number; budget: number; picks: string[]; reasons?: string[]; names?: string[] };
}

const golden = loadFixture<{ cases: GoldenCase[] }>("ranking-golden.json");

describe("RankingEngine matches the Python oracle (data/fixtures/ranking-golden.json)", () => {
  it("has the eight golden cases", () => {
    expect(golden.cases).toHaveLength(8);
  });
  for (const c of golden.cases) {
    it(c.name, () => {
      const result = rank({
        chain: loadChain(c.chain),
        profile: c.profile,
        loggedCalories: c.loggedCalories,
        meal: c.meal,
        preferences: { ...NO_PREFERENCES, ...c.prefs },
      });
      expect(result.mode).toBe(c.expected.mode);
      expect(result.remaining).toBe(c.expected.remaining);
      expect(result.budget).toBe(c.expected.budget);
      expect(result.picks.map((p) => p.id)).toEqual(c.expected.picks);
      if (c.expected.reasons) expect(result.picks.map((p) => p.reason)).toEqual(c.expected.reasons);
      if (c.expected.names) expect(result.picks.map((p) => p.name)).toEqual(c.expected.names);
    });
  }
  it("worked example A: #1 is the chicken salad, double chicken, no cheese, no vinaigrette (65 g, 410 kcal, 15.9 g per 100 kcal)", () => {
    const a = golden.cases[0]!;
    const result = rank({ chain: loadChain(a.chain), profile: a.profile, loggedCalories: a.loggedCalories, meal: a.meal, preferences: NO_PREFERENCES });
    expect(result.picks[0]!.name).toBe("Chicken salad · double chicken · no cheese, no honey lime vinaigrette");
    expect(result.picks[0]!.reason).toBe("65g protein · 410 kcal · 15.9g per 100 kcal");
  });
});

const profile = (goal: Goal, dailyCalories = 2000, extra: Partial<Profile> = {}): Profile => ({ goal, dailyCalories, ...extra });
const rankTiny = (
  items: Parameters<typeof tinyChain>[0],
  p: Profile,
  opts: { logged?: number; meal?: Meal; prefs?: Partial<Preferences> } = {},
) => rank({ chain: tinyChain(items), profile: p, loggedCalories: opts.logged ?? 0, meal: opts.meal ?? "lunch", preferences: { ...NO_PREFERENCES, ...opts.prefs } });

describe("candidates and preferences", () => {
  it("includes rankable items and every combination; excludes non-rankable items", () => {
    const chain = tinyChain([["a", "A", 300, 30], ["b", "B", 200, 5]]);
    chain.items[1]!.rankable = false;
    chain.combinations.push({ id: "var-a-1", name: "A · x", kind: "variation", baseItemId: "a", components: [], items: [], nutrients: { calories: 250, protein: 30, carbs: 1, fat: 1 }, tags: [], itemCount: 1 });
    expect(candidatesFor(chain).map((c) => [c.id, c.baseKey])).toEqual([["a", "a"], ["var-a-1", "a"]]);
  });
  it("applies vegetarian / no pork / no beef", () => {
    expect(passesPreferences([], { ...NO_PREFERENCES, vegetarianOnly: true })).toBe(false);
    expect(passesPreferences(["vegetarian"], { ...NO_PREFERENCES, vegetarianOnly: true })).toBe(true);
    expect(passesPreferences(["contains_pork"], { ...NO_PREFERENCES, noPork: true })).toBe(false);
    expect(passesPreferences(["contains_beef"], { ...NO_PREFERENCES, noPork: true })).toBe(true);
    expect(passesPreferences(["contains_beef"], { ...NO_PREFERENCES, noBeef: true })).toBe(false);
  });
  it("noMatches when the filters remove everything", () => {
    const r = rankTiny([["a", "A", 300, 30]], profile("maintain"), { prefs: { vegetarianOnly: true } });
    expect(r.mode).toBe("noMatches");
    expect(r.picks).toEqual([]);
  });
  it("ignores zero-calorie candidates", () => {
    const r = rankTiny([["water", "Water", 0, 0], ["a", "A", 300, 30]], profile("maintain"));
    expect(r.picks.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("scoring branches (SPEC §6.4 step 5)", () => {
  // Budget at lunch for 2,000 kcal = 700.
  const items: Parameters<typeof tinyChain>[0] = [
    ["lean", "Lean", 200, 30], // d = 15.0
    ["big", "Big", 650, 70], // d = 10.77
  ];
  it("maintain: protein density only", () => {
    expect(rankTiny(items, profile("maintain")).picks.map((p) => p.id)).toEqual(["lean", "big"]);
  });
  it("buildMuscle: density + 0.05 × protein can lift a big protein item", () => {
    // lean: 15 + 1.5 = 16.5; big: 10.77 + 3.5 = 14.27 → lean still first
    expect(rankTiny(items, profile("buildMuscle")).picks.map((p) => p.id)).toEqual(["lean", "big"]);
    const close: Parameters<typeof tinyChain>[0] = [["a", "A", 300, 36], ["b", "B", 600, 66]]; // d 12.0 vs 11.0; +1.8 vs +3.3
    expect(rankTiny(close, profile("maintain")).picks[0]!.id).toBe("a");
    expect(rankTiny(close, profile("buildMuscle")).picks[0]!.id).toBe("b");
  });
  it("lose and glp1: reward being further under budget", () => {
    // a: d 12 + 2×(1−300/700)=13.14; b: d 12.5 + 2×(1−640/700)=12.67 → a first for lose even though b has higher density
    const pair: Parameters<typeof tinyChain>[0] = [["a", "A", 300, 36], ["b", "B", 640, 80]];
    expect(rankTiny(pair, profile("maintain")).picks[0]!.id).toBe("b");
    expect(rankTiny(pair, profile("lose")).picks[0]!.id).toBe("a");
  });
  it("glp1: picks with 25 g+ protein come first, whatever their score", () => {
    const glp1Items: Parameters<typeof tinyChain>[0] = [["tiny", "Tiny", 100, 20], ["solid", "Solid", 400, 28]]; // tiny has d=20 but < 25 g
    const r = rankTiny(glp1Items, profile("glp1", 2000, { glp1MealCap: 450 }));
    expect(r.picks.map((p) => p.id)).toEqual(["solid", "tiny"]);
  });
  it("breaks score ties by budget headroom, then item count, then name (plain code-unit compare)", () => {
    const r = rankTiny([["b", "b item", 300, 30], ["a", "a item", 300, 30], ["Z", "Z item", 300, 30]], profile("maintain"));
    expect(r.picks.map((p) => p.name)).toEqual(["Z item", "a item", "b item"]); // uppercase sorts before lowercase
  });
});

describe("modes", () => {
  it("outOfBudget: five lowest-calorie candidates with 10 g+ protein, calories ↑ protein ↓ name ↑", () => {
    const r = rankTiny(
      [["a", "A", 300, 12], ["b", "B", 250, 20], ["c", "C", 250, 25], ["d", "D", 100, 5], ["e", "E", 400, 30], ["f", "F", 500, 40], ["g", "G", 600, 50]],
      profile("lose", 2000),
      { logged: 1900 },
    );
    expect(r.mode).toBe("outOfBudget");
    expect(r.picks.map((p) => p.id)).toEqual(["c", "b", "a", "e", "f"]);
  });
  it("outOfBudget with nothing at 10 g+ protein returns no cards", () => {
    const r = rankTiny([["a", "A", 100, 3]], profile("lose", 2000), { logged: 1900 });
    expect(r.mode).toBe("outOfBudget");
    expect(r.picks).toEqual([]);
  });
  it("outOfBudget triggers below 200 remaining but not at exactly 200", () => {
    const items: Parameters<typeof tinyChain>[0] = [["a", "A", 150, 20]];
    expect(rankTiny(items, profile("maintain", 2000), { logged: 1801 }).mode).toBe("outOfBudget");
    expect(rankTiny(items, profile("maintain", 2000), { logged: 1800 }).mode).toBe("ranked");
  });
  it("nothingFits: three lowest-calorie candidates labelled with how far over", () => {
    const r = rankTiny([["a", "A", 700, 40], ["b", "B", 600, 40], ["c", "C", 800, 40], ["d", "D", 900, 40]], profile("glp1", 2000, { glp1MealCap: 450 }));
    expect(r.mode).toBe("nothingFits");
    expect(r.picks.map((p) => [p.id, p.overBy])).toEqual([["b", 150], ["a", 250], ["c", 350]]);
  });
  it("diversity: at most two picks per base item", () => {
    const chain = tinyChain([["base", "Base", 500, 30]]);
    for (let i = 0; i < 4; i++) {
      chain.combinations.push({ id: `var-base-${i}`, name: `Base · v${i}`, kind: "variation", baseItemId: "base", components: [], items: [], nutrients: { calories: 300 + i, protein: 40, carbs: 1, fat: 1 }, tags: [], itemCount: 1 });
    }
    chain.items.push({ ...chain.items[0]!, id: "other", name: "Other", nutrients: { calories: 600, protein: 20, carbs: 1, fat: 1 } });
    const r = rank({ chain, profile: profile("maintain"), loggedCalories: 0, meal: "lunch", preferences: NO_PREFERENCES });
    expect(r.picks.filter((p) => p.baseKey === "base")).toHaveLength(2);
    expect(r.picks.map((p) => p.id)).toContain("other");
  });
  it("returns at most five picks", () => {
    const items = Array.from({ length: 9 }, (_, i): Parameters<typeof tinyChain>[0][number] => [`i${i}`, `Item ${i}`, 300 + i, 30]);
    expect(rankTiny(items, profile("maintain")).picks).toHaveLength(5);
  });
});

describe("the Other goal", () => {
  it("ranks exactly like Maintain", () => {
    const items: Parameters<typeof tinyChain>[0] = [["a", "A", 300, 30], ["b", "B", 520, 41], ["c", "C", 640, 22], ["d", "D", 180, 9]];
    const ids = (g: Goal) => rankTiny(items, profile(g)).picks.map((p) => p.id);
    expect(ids("other")).toEqual(ids("maintain"));
  });
});
