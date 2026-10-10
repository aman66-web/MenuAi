import { describe, expect, it } from "vitest";
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
