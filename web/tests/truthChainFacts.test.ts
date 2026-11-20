import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chainFacts, chainFaq } from "../lib/mm/truth/chainFacts";
import type { Chain, MenuItem } from "../lib/mm/types";

let seq = 0;
const it_ = (name: string, category: string, calories: number, protein?: number): MenuItem => ({
  id: `c${++seq}`, name, category, serving: "", nutrients: protein === undefined ? { calories } : { calories, protein, carbs: 30, fat: 10 },
  tags: [], limitedTime: false, rankable: true, components: [], modifiers: [],
});

describe("chainFacts and chainFaq", () => {
  const items = [it_("Big burger", "Burgers", 900, 45), it_("Chicken wrap", "Wraps", 420, 38), it_("Side salad", "Sides", 90, 2), it_("Latte", "Hot drinks", 150, 10), it_("Garden bowl", "Mains", 310, 12), it_("Add bacon", "Add-ons", 120, 9)];
  it("finds the meal with the most protein and the one with the fewest calories, ignoring sides, drinks and add-ons", () => {
    const f = chainFacts({ items });
    expect(f.mostProtein?.name).toBe("Big burger");
    expect(f.fewestCalories?.name).toBe("Garden bowl");
    expect(f.under500).toBe(2);
    expect(f.protein35).toBe(2);
    expect(f.meals).toBe(3);
  });
  it("writes only the answers the numbers support, with real figures and the source date", () => {
    const faq = chainFaq({ name: "Test", items }, "1 Nov 2026");
    expect(faq.map((q) => q.question)).toEqual(["What is the highest protein order at Test?", "What is the lowest calorie meal at Test?", "How many Test meals are 500 calories or fewer?"]);
    expect(faq[0].answer).toBe("Of the meals on Test's menu, Big burger has the most protein: 45 g protein and 900 kcal, from Test's own published nutrition guide, checked 1 Nov 2026. Drinks, sides, desserts, sauces and add-ons are not counted.");
    expect(faq[1].answer).toContain("Garden bowl has the fewest calories: 310 kcal");
    expect(faq[2].answer).toBe("2 of the 3 meals we list for Test are 500 kcal or less, from Test's own published nutrition guide, checked 1 Nov 2026.");
  });
  it("a calories-only restaurant gets no protein answer", () => {
    const co = [it_("Pasty", "Pasties", 520), it_("Slice", "Slices", 300)];
    const faq = chainFaq({ name: "Bakes", items: co, nutritionLevel: "calories" }, "1 Nov 2026");
    expect(faq.map((q) => q.question)).toEqual(["What is the lowest calorie meal at Bakes?", "How many Bakes meals are 500 calories or fewer?"]);
    expect(chainFacts({ items: co, nutritionLevel: "calories" }).protein35).toBe(0);
  });
  it("says 'None of' when no meal is under 500 and 'is' for exactly one", () => {
    expect(chainFaq({ name: "A", items: [it_("Huge", "Mains", 800, 40)] }, "d")[2].answer).toMatch(/^None of the 1 meals/);
    expect(chainFaq({ name: "A", items: [it_("Small", "Mains", 400, 20)] }, "d")[2].answer).toMatch(/^1 of the 1 meals we list for A is 500/);
  });
  it("never calls a kids' dessert, side or starter the lowest calorie meal (the 20 November 2026 audit)", () => {
    const kids = [it_("Kids vanilla pod ice cream", "Kids", 130, 2), it_("Toasty Garlic Bread", "Kids Set Menu - Starters", 180, 5), it_("Kids chicken & rice", "Kids", 350, 20), it_("Ramen", "Mains", 600, 35)];
    expect(chainFacts({ items: kids }).fewestCalories?.name).toBe("Kids chicken & rice");
  });
  it("makes no claim in the words (rule 3)", () => {
    for (const q of chainFaq({ name: "Test", items }, "d")) expect(`${q.question} ${q.answer}`).not.toMatch(/\b(healthy|unhealthy|good|bad|best|worst|clean|junk|guilt)\b/i);
  });
});

const menuDir = fileURLToPath(new URL("../public/menus/", import.meta.url));
const chains: Chain[] = readdirSync(menuDir).filter((f) => f.startsWith("chain-") && f.endsWith(".json")).map((f) => JSON.parse(readFileSync(menuDir + f, "utf8")) as Chain).filter((c) => !c.sample);

describe("chainFacts: real menus", () => {
  it("gives every one of the 241 chains a lowest-calorie answer or none, never a NaN, and every FAQ answer is built from real numbers", () => {
    let withMeals = 0;
    for (const c of chains) {
      const f = chainFacts(c);
      expect(Number.isFinite(f.under500) && f.under500 <= f.meals, c.id).toBe(true);
      if (f.meals > 0) withMeals++;
      for (const q of chainFaq(c, "1 Nov 2026")) {
        expect(q.answer).not.toMatch(/NaN|undefined|null/);
        expect(q.answer.length).toBeGreaterThan(40);
      }
      if (c.nutritionLevel === "calories") expect(f.mostProtein).toBeUndefined();
    }
    expect(withMeals).toBeGreaterThan(200);
  });
  it("no restaurant's lowest calorie meal is an ice cream, a sorbet, chips or garlic bread", () => {
    const odd = chains.map((c) => [c.id, chainFacts(c).fewestCalories?.name ?? ""] as const).filter(([, n]) => !/\bwith\b/i.test(n) && /\b(?:ice[- ]?cream|sorbet|gelato|garlic bread|chips|fries)\b/i.test(n));
    expect(odd).toEqual([]);
  });
});
