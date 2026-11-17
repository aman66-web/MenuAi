import { describe, expect, it } from "vitest";
import { methodAmount, placeAmounts, spoonText } from "../lib/mm/kitchenAmount";
import { RECIPES } from "../lib/mm/recipeBook";
import { splitStep } from "../lib/mm/recipeSteps";
import { firstMentions } from "../lib/mm/stepIngredients";

describe("spoons", () => {
  it("writes small amounts in level spoons", () => {
    expect(spoonText(30, "g", "light-mayo")).toBe("2 tbsp");
    expect(spoonText(5, "g", "mustard")).toBe("1 tsp");
    expect(spoonText(15, "ml", "olive-oil")).toBe("1 tbsp");
    expect(spoonText(2, "g", "cumin")).toBe("1 tsp");
    expect(spoonText(1, "g", "turmeric")).toBe("¼ tsp");
    expect(spoonText(0.5, "g", "salt")).toBe("a pinch");
    expect(spoonText(400, "g", "chopped-tomatoes")).toBeNull();
    expect(spoonText(100, "g", "light-mayo")).toBeNull();
  });
  it("keeps counts and weights where spoons don't fit", () => {
    expect(methodAmount({ amount: 120, unit: "g", pantry: "eggs" }, "2 eggs", "120 g").full).toBe("2 eggs");
    expect(methodAmount({ amount: 400, unit: "g", pantry: "new-potatoes" }, null, "400 g").full).toBe("400 g");
    expect(methodAmount({ amount: 30, unit: "g", pantry: "light-mayo" }, null, "30 g")).toEqual({ full: "2 tbsp, 30 g", short: "2 tbsp" });
    expect(methodAmount({ amount: 1, unit: "ml", pantry: "oil-spray" }, null, "1 ml").full).toBe("about 5 sprays");
    expect(methodAmount({ amount: 75, unit: "g", pantry: "onion" }, null, "75 g").full).toBe("75 g, about ½ an onion");
    expect(methodAmount({ amount: 160, unit: "g", pantry: "carrots" }, null, "160 g").full).toBe("160 g, about 2 carrots");
  });
});

describe("amounts in the steps", () => {
  it("puts each amount right after the words that name it", () => {
    const { pieces, unplaced } = placeAmounts("Stir the mayonnaise, mustard and lemon juice together.", [
      { key: "a", pantry: "light-mayo", label: "Light mayonnaise", amount: { full: "2 tbsp", short: "2 tbsp" } },
      { key: "b", pantry: "mustard", label: "Mustard", amount: { full: "1 tsp", short: "1 tsp" } },
      { key: "c", pantry: "lemon-juice", label: "Lemon juice", amount: { full: "1 tbsp", short: "1 tbsp" } },
    ]);
    expect(unplaced).toEqual([]);
    expect(pieces.map((p) => ("amount" in p ? `[${p.amount}]` : p.text)).join("")).toBe("Stir the mayonnaise[2 tbsp], mustard[1 tsp] and lemon juice[1 tbsp] together.");
  });
  it("names each ingredient under a general word", () => {
    const { pieces } = placeAmounts("Add the spices and stir.", [
      { key: "a", pantry: "cumin", label: "Ground cumin", amount: { full: "1 tsp, 2 g", short: "1 tsp" } },
      { key: "b", pantry: "turmeric", label: "Ground turmeric", amount: { full: "½ tsp, 1 g", short: "½ tsp" } },
    ]);
    expect(pieces.map((p) => ("amount" in p ? `[${p.amount}]` : p.text)).join("")).toBe("Add the spices[1 tsp ground cumin, ½ tsp ground turmeric] and stir.");
  });
  it("places the amount of every ingredient of every recipe in a step's words or title", () => {
    const lost: string[] = [];
    for (const r of RECIPES) {
      const first = firstMentions(r.method, r.ingredients);
      first.forEach((keys, i) => {
        const step = splitStep(r.method[i]!);
        const items = keys.map((k) => r.ingredients.find((x) => x.key === k)!).map((s) => ({ key: s.key, pantry: s.pantry, label: s.label, amount: { full: "x", short: "x" } }));
        const { unplaced } = placeAmounts(step.text, items);
        // an ingredient named only in the step's title still gets its amount (in the line under the step)
        for (const k of unplaced) if (!(step.title && placeAmounts(step.title, items.filter((x) => x.key === k)).unplaced.length === 0)) lost.push(`${r.id}: ${k}`);
      });
    }
    expect(lost).toEqual([]);
  });
});
