import { afterEach, describe, expect, it, vi } from "vitest";
import { lunchTeaser } from "../lib/mm/onboarding";
import { NO_PREFERENCES } from "../lib/mm/types";
import { cluck } from "./fixtures";

describe("onboarding teaser", () => {
  const chain = cluck().chain;
  it("counts main dishes with 20 g+ protein inside the lunch budget", () => {
    const { count, budget } = lunchTeaser(chain, { goal: "maintain", dailyCalories: 2000 }, NO_PREFERENCES);
    expect(budget).toBe(700);
    const expected = chain.items.filter((i) => i.rankable && (i.nutrients.protein ?? 0) >= 20 && i.nutrients.calories > 0 && i.nutrients.calories <= 700).length;
    expect(count).toBe(expected);
  });
  it("uses the GLP-1 meal size and the diet filters", () => {
    const glp = lunchTeaser(chain, { goal: "glp1", dailyCalories: 2000, glp1MealCap: 300 }, NO_PREFERENCES);
    expect(glp.budget).toBe(300);
    const veg = lunchTeaser(chain, { goal: "maintain", dailyCalories: 2000 }, { ...NO_PREFERENCES, vegetarianOnly: true });
    expect(veg.count).toBeLessThanOrEqual(lunchTeaser(chain, { goal: "maintain", dailyCalories: 2000 }, NO_PREFERENCES).count);
  });
});

// welcome/parts.tsx also draws the number card, whose keyboard helper and words hook load "@/" paths the unit tests can't resolve: stand-ins for those two.
vi.mock("../app/app/_components/SearchDone", () => ({ dismissKeyboard: () => undefined }));
vi.mock("../app/app/_lib/i18n", () => ({ useT: () => (s: string) => s }));

describe("Pip's reaction to each goal (welcome/parts.tsx)", () => {
  it("praises no choice and never exclaims; GLP-1 keeps its own line (CLAUDE.md rule 3)", async () => {
    const { GOAL_REACTION } = await import("../app/app/welcome/parts");
    for (const line of Object.values(GOAL_REACTION)) {
      expect(line).not.toMatch(/great/i);
      expect(line).not.toContain("!");
      expect(line).not.toMatch(/\b(good|bad|healthy)\b/i);
    }
    expect(GOAL_REACTION.glp1).toBe("Got it: smaller, protein-first orders.");
    expect(Object.keys(GOAL_REACTION).sort()).toEqual(["buildMuscle", "glp1", "lose", "maintain", "other"]);
  });
});

describe("the last welcome screen's line on what is free (welcome/parts.tsx)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("names adding what you eat on the side the build puts it, and Scan your food only where it exists", async () => {
    const { freePremiumLine } = await import("../app/app/welcome/parts");
    const lines = [freePremiumLine(false, false), freePremiumLine(false, true), freePremiumLine(true, false), freePremiumLine(true, true)];
    expect(new Set(lines).size).toBe(4);
    for (const [logIsPaid, scanOn] of [[false, false], [false, true], [true, false], [true, true]] as const) {
      const line = freePremiumLine(logIsPaid, scanOn);
      const [free, premium] = line.split("Premium adds extras");
      expect(premium, line).toBeDefined();
      expect(free!.includes("adding what you eat"), line).toBe(!logIsPaid);
      expect(premium!.includes("adding what you eat"), line).toBe(logIsPaid);
      expect(line.includes("Scan your food"), line).toBe(scanOn);
      // "such as": more is paid than fits in the line, so it must never read as the whole list
      expect(premium).toMatch(/^, such as /);
      expect(premium).toContain("Meal plan");
    }
  });

  it("chooses through LOG_IS_PAID, never bare needsPaywall (true on a build with no gating at all)", async () => {
    // [env, is logging paid]: the default build (no gating), the iPhone app's In-App Purchase build (PAID_TIER_ONLY keeps logging free), Pro on
    const builds: Array<[Record<string, string>, boolean]> = [
      [{}, false],
      [{ NEXT_PUBLIC_APP_BUILD: "1", NEXT_PUBLIC_IAP: "1" }, false],
      [{ NEXT_PUBLIC_PRO: "1" }, true],
    ];
    for (const [env, paid] of builds) {
      vi.unstubAllEnvs();
      vi.resetModules();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const { FREE_PREMIUM_LINE, freePremiumLine } = await import("../app/app/welcome/parts");
      const { FOOD_SCAN_ENABLED, GATING_ENABLED } = await import("../lib/mm/config");
      const { needsPaywall } = await import("../lib/mm/entitlements");
      if (!GATING_ENABLED) expect(needsPaywall("log", { pro: false }), "bare needsPaywall says paid with no gating").toBe(true);
      expect(FREE_PREMIUM_LINE, JSON.stringify(env)).toBe(freePremiumLine(paid, FOOD_SCAN_ENABLED));
    }
  });
});
