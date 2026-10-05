import { describe, expect, it } from "vitest";
import { indexChain } from "../lib/mm/chain-index";
import { formatGrams } from "../lib/mm/format";
import {
  addComponent, addableComponents, afterThis, afterThisText, isOrderAvailable, lineFromItem, lineNutrients, linesFromCombination,
  describeOrder, orderName, orderNutrients, orderTags, removeComponent, setComponentQty, setItemQty, swapComponent, swapOptions, toggleModifier,
  validateOrder, type ComponentLine, type ItemLine, type OrderLine,
} from "../lib/mm/order";
import type { Chain } from "../lib/mm/types";
import { bowl, cluck, loadChain } from "./fixtures";

const comp = (line: OrderLine | null): ComponentLine => {
  if (!line || line.kind !== "components") throw new Error("expected a component line");
  return line;
};
const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("Bowl & Co. maths (BUILD_PLAN M5)", () => {
  const ix = bowl();
  it("chicken bowl default = 655 kcal / 50 g protein, fat 20.5 shows as 21g", () => {
    const line = lineFromItem(ix, "chicken-bowl")!;
    const n = lineNutrients(ix, line)!;
    expect(n.calories).toBe(655);
    expect(n.protein).toBe(50);
    expect(n.fat).toBe(20.5);
    expect(formatGrams(n.fat)).toBe("21g");
    expect(orderName(ix, [line])).toBe("Chicken bowl");
  });
  it("double chicken = 835 kcal / 82 g protein", () => {
    const line = unwrap(setComponentQty(ix, comp(lineFromItem(ix, "chicken-bowl")), "chicken", 2));
    const n = lineNutrients(ix, line)!;
    expect([n.calories, n.protein]).toEqual([835, 82]);
    expect(orderName(ix, [line])).toBe("Chicken bowl · double chicken");
  });
  it("two-line order (chicken bowl + agua fresca) totals both lines", () => {
    const lines = [lineFromItem(ix, "chicken-bowl")!, lineFromItem(ix, "agua-fresca")!];
    expect(lines[1]!.kind).toBe("item");
    const n = orderNutrients(ix, lines)!;
    expect(n.calories).toBe(655 + 120);
    expect(n.protein).toBe(50);
    expect(orderName(ix, lines)).toBe("Chicken bowl + Agua fresca");
  });
  it("item line quantity scales the item", () => {
    const line = unwrap(setItemQty(lineFromItem(ix, "agua-fresca") as ItemLine, 3));
    expect(lineNutrients(ix, line)!.calories).toBe(360);
    expect(orderName(ix, [line])).toBe("3 × Agua fresca");
  });
});

describe("every pipeline combination reproduces exactly (BUILD_PLAN M5 'done when')", () => {
  for (const id of ["bowl-and-co", "cluck-house"]) {
    const chain = loadChain(id);
    const ix = indexChain(chain);
    describe(chain.name, () => {
      const variations = chain.combinations.filter((c) => c.kind === "variation");
      const combos = chain.combinations.filter((c) => c.kind === "combo");
      it(`has variations to check (${variations.length}) and combos (${combos.length})`, () => {
        expect(variations.length).toBeGreaterThan(0);
      });
      it("every variation: same name, same nutrients, same tags", () => {
        const mismatches: string[] = [];
        for (const combo of variations) {
          const lines = linesFromCombination(ix, combo);
          if (!lines) { mismatches.push(`${combo.id}: could not build lines`); continue; }
          const name = orderName(ix, lines);
          const n = orderNutrients(ix, lines);
          const tags = orderTags(ix, lines);
          if (name !== combo.name) mismatches.push(`name: got "${name}" want "${combo.name}"`);
          if (JSON.stringify(n) !== JSON.stringify(combo.nutrients) && JSON.stringify(sortKeys(n)) !== JSON.stringify(sortKeys(combo.nutrients))) mismatches.push(`${combo.name}: nutrients ${JSON.stringify(n)} vs ${JSON.stringify(combo.nutrients)}`);
          if (JSON.stringify(tags) !== JSON.stringify(combo.tags)) mismatches.push(`${combo.name}: tags ${tags} vs ${combo.tags}`);
        }
        expect(mismatches).toEqual([]);
      });
      it("every combo: same nutrients and tags (names are hand-written)", () => {
        for (const combo of combos) {
          const lines = linesFromCombination(ix, combo)!;
          expect(sortKeys(orderNutrients(ix, lines))).toEqual(sortKeys(combo.nutrients));
          expect(orderTags(ix, lines)).toEqual(combo.tags);
        }
      });
    });
  }
});

function sortKeys(o: unknown): unknown {
  if (!o || typeof o !== "object") return o;
  return Object.fromEntries(Object.entries(o as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
}

describe("Cluck House modifiers", () => {
  const ix = cluck();
  it("classic sandwich with no mayo = 340 kcal", () => {
    const line = lineFromItem(ix, "classic-sandwich", ["no-mayo"])!;
    expect(lineNutrients(ix, line)!.calories).toBe(340);
    expect(orderName(ix, [line])).toBe("Classic chicken sandwich · no mayo");
  });
  it("names acronym labels without lower-casing them", () => {
    const line = lineFromItem(ix, "grilled-sandwich", ["no-sauce"])!;
    expect(orderName(ix, [line])).toBe("Grilled chicken sandwich · no BBQ sauce");
  });
  it("toggles modifiers on and off, and rejects unknown ones", () => {
    let line = lineFromItem(ix, "classic-sandwich") as ItemLine;
    line = unwrap(toggleModifier(ix, line, "extra-fillet"));
    expect(lineNutrients(ix, line)!.calories).toBe(630);
    line = unwrap(toggleModifier(ix, line, "extra-fillet"));
    expect(lineNutrients(ix, line)!.calories).toBe(440);
    expect(toggleModifier(ix, line, "nope").ok).toBe(false);
  });
  it("a missing optional nutrient propagates through modifiers", () => {
    // pumpkin shake publishes no sodium; the line total must not invent one
    const n = lineNutrients(ix, lineFromItem(ix, "pumpkin-shake")!)!;
    expect("sodium" in n).toBe(false);
  });
});

describe("tags", () => {
  it("adding bacon makes a vegetarian order non-vegetarian", () => {
    const chain: Chain = JSON.parse(JSON.stringify(loadChain("cluck-house")));
    const item = chain.items.find((i) => i.id === "classic-sandwich")!;
    item.tags = ["vegetarian"]; // hypothetical vegetarian sandwich
    const ix = indexChain(chain);
    const plain = lineFromItem(ix, "classic-sandwich")!;
    expect(orderTags(ix, [plain])).toEqual(["vegetarian"]);
    const withBacon = unwrap(toggleModifier(ix, plain as ItemLine, "add-bacon"));
    expect(orderTags(ix, [withBacon])).toEqual(["contains_pork"]);
  });
  it("removing an ingredient keeps the item's tags (conservative)", () => {
    const ix = cluck();
    const line = lineFromItem(ix, "classic-sandwich", ["no-mayo"])!;
    expect(orderTags(ix, [line])).toEqual([]);
  });
  it("vegetarian only if every line is", () => {
    const ix = cluck();
    const fries = lineFromItem(ix, "waffle-fries")!;
    const sandwich = lineFromItem(ix, "classic-sandwich")!;
    expect(orderTags(ix, [fries])).toEqual(["vegetarian"]);
    expect(orderTags(ix, [fries, sandwich])).toEqual([]);
  });
});

describe("builder rules (SPEC §6.5)", () => {
  const ix = bowl();
  const start = () => comp(lineFromItem(ix, "chicken-bowl"));
  it("rejects doubling a component that isn't doublable, accepts one that is", () => {
    expect(setComponentQty(ix, start(), "cheese", 2)).toEqual({ ok: false, error: "Cheese can't be doubled." });
    expect(setComponentQty(ix, start(), "chicken", 2).ok).toBe(true);
    expect(setComponentQty(ix, start(), "tortilla", 1).ok).toBe(false); // not in the line
  });
  it("any component can be removed or added; the last one can't be removed", () => {
    let line = unwrap(removeComponent(start(), "cheese"));
    expect(orderName(ix, [line])).toBe("Chicken bowl · no cheese");
    line = unwrap(addComponent(ix, line, "guacamole"));
    // a removed and an added component in the same group read as a swap, whichever way the user got there
    expect(orderName(ix, [line])).toBe("Chicken bowl · guacamole instead of cheese");
    const added = unwrap(addComponent(ix, start(), "tortilla")); // wrap group had nothing removed: a plain add
    expect(orderName(ix, [added])).toBe("Chicken bowl · add flour tortilla");
    const single: ComponentLine = { kind: "components", itemId: "chicken-bowl", components: [{ id: "chicken", qty: 1 }] };
    expect(removeComponent(single, "chicken").ok).toBe(false);
    expect(addComponent(ix, start(), "chicken").ok).toBe(false); // already there
  });
  it("swaps only within the same group, and swap options exclude what's already in the line", () => {
    const line = start();
    expect(swapComponent(ix, line, "white-rice", "cheese").ok).toBe(false);
    const swapped = unwrap(swapComponent(ix, line, "white-rice", "lettuce"));
    expect(orderName(ix, [swapped])).toBe("Chicken bowl · romaine lettuce instead of white rice");
    expect(swapOptions(ix, line, "white-rice").map((c) => c.id).sort()).toEqual(["brown-rice", "lettuce"]);
    expect(swapOptions(ix, line, "chicken").map((c) => c.id).sort()).toEqual(["sofritas", "steak"]);
  });
  it("keeps a double when swapping to another doublable protein, resets it otherwise", () => {
    const doubled = unwrap(setComponentQty(ix, start(), "chicken", 2));
    expect(unwrap(swapComponent(ix, doubled, "chicken", "steak")).components.find((c) => c.id === "steak")!.qty).toBe(2);
    const doubledSofritas = { ...doubled, components: doubled.components.map((c) => ({ ...c })) };
    expect(unwrap(swapComponent(ix, doubledSofritas, "chicken", "sofritas")).components.find((c) => c.id === "sofritas")!.qty).toBe(2);
  });
  it("names remove + swap + double in the pipeline's order: doubles, removals, swaps, adds", () => {
    let line = unwrap(setComponentQty(ix, start(), "chicken", 2));
    line = unwrap(removeComponent(line, "cheese"));
    line = unwrap(swapComponent(ix, line, "white-rice", "lettuce"));
    expect(orderName(ix, [line])).toBe("Chicken bowl · double chicken · no cheese · romaine lettuce instead of white rice");
    const nutrients = lineNutrients(ix, line)!;
    expect(nutrients.calories).toBe(835 - 110 - 210 + 5);
  });
  it("lists addable components by group in builder order", () => {
    const groups = [...addableComponents(ix, start()).keys()];
    expect(groups).toEqual(["base", "wrap", "protein", "topping", "sauce", "side"]);
  });
  it("an order needs at least one line and every component line needs a component", () => {
    expect(validateOrder([]).ok).toBe(false);
    expect(validateOrder([{ kind: "components", itemId: "chicken-bowl", components: [] }]).ok).toBe(false);
    expect(validateOrder([start()]).ok).toBe(true);
  });
  it("quantity limits on item lines", () => {
    const line = lineFromItem(ix, "agua-fresca") as ItemLine;
    expect(setItemQty(line, 0).ok).toBe(false);
    expect(setItemQty(line, 10).ok).toBe(false);
    expect(setItemQty(line, 2.5).ok).toBe(false);
    expect(setItemQty(line, 9).ok).toBe(true);
  });
});

describe("orders that no longer match the menu", () => {
  const ix = bowl();
  it("reports a missing item, component or modifier as unavailable", () => {
    expect(lineFromItem(ix, "gone")).toBeNull();
    expect(isOrderAvailable(ix, [{ kind: "components", itemId: "gone", components: [{ id: "chicken", qty: 1 }] }])).toBe(false);
    expect(isOrderAvailable(ix, [{ kind: "components", itemId: "chicken-bowl", components: [{ id: "unobtanium", qty: 1 }] }])).toBe(false);
    expect(isOrderAvailable(ix, [{ kind: "item", itemId: "agua-fresca", qty: 1, modifierIds: ["nope"] }])).toBe(false);
    expect(isOrderAvailable(ix, [lineFromItem(ix, "chicken-bowl")!])).toBe(true);
  });
});

describe("After this (SPEC §6.5)", () => {
  const total = { calories: 610, protein: 58, carbs: 0, fat: 0 };
  it("shows what is left today", () => {
    expect(afterThisText(afterThis({ calories: 1050, protein: 92 }, total))).toBe("After this: 440 cal · 34g protein left today");
    expect(afterThisText(afterThis({ calories: 1050 }, total))).toBe("After this: 440 cal left today");
  });
  it("is neutral, not alarming, when over", () => {
    expect(afterThisText(afterThis({ calories: 490 }, total))).toBe("After this: 120 cal over today's target");
  });
  it("never shows negative protein left", () => {
    expect(afterThisText(afterThis({ calories: 1050, protein: 20 }, total))).toBe("After this: 440 cal · 0g protein left today");
  });
});

describe("order description for the share card", () => {
  const ix = bowl();
  it("lists the ingredients in builder order, with doubles and removals", () => {
    let line = comp(lineFromItem(ix, "chicken-bowl"));
    expect(describeOrder(ix, [line])).toBe("White rice, chicken, black beans, tomato salsa, cheese");
    line = unwrap(setComponentQty(ix, line, "chicken", 2));
    line = unwrap(removeComponent(line, "cheese"));
    expect(describeOrder(ix, [line])).toBe("White rice, double chicken, black beans, tomato salsa, no cheese");
  });
  it("describes item lines and multi-line orders", () => {
    const sandwich = lineFromItem(cluck(), "classic-sandwich", ["no-mayo"])!;
    expect(describeOrder(cluck(), [sandwich])).toBe("Classic chicken sandwich, no mayo");
    expect(describeOrder(ix, [lineFromItem(ix, "agua-fresca")!])).toBe("Agua fresca");
  });
});

describe("a default recipe that already has a double", () => {
  it("names a reduction back to one portion 'single X' (an extension of the pipeline wording, which has no such case)", () => {
    const chain = JSON.parse(JSON.stringify(loadChain("bowl-and-co"))) as Chain;
    chain.items.find((i) => i.id === "chicken-bowl")!.components.find((c) => c.id === "chicken")!.qty = 2;
    const ix2 = indexChain(chain);
    const line = comp(lineFromItem(ix2, "chicken-bowl"));
    expect(orderName(ix2, [line])).toBe("Chicken bowl");
    const single = unwrap(setComponentQty(ix2, line, "chicken", 1));
    expect(orderName(ix2, [single])).toBe("Chicken bowl · single chicken");
  });
});
