import { describe, expect, it, vi } from "vitest";
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

describe("the welcome screens' shared pieces (welcome/parts.tsx)", () => {
  it("keep the number card, and no longer carry Pip's reactions or the free and Premium line (founder, 20 November 2026: no speech bubbles, no labels)", async () => {
    const parts = await import("../app/app/welcome/parts");
    expect(typeof parts.StepperCard).toBe("function");
    // a short bold heading at the top left, as in the founder's example screens (20 November 2026)
    expect(parts.HEADLINE).toMatch(/text-\[1\.75rem\]/);
    expect(parts.HEADLINE).toMatch(/font-\[700\]/);
    expect("GOAL_REACTION" in parts).toBe(false);
    expect("freePremiumLine" in parts).toBe(false);
    expect("FREE_PREMIUM_LINE" in parts).toBe(false);
  });
});
