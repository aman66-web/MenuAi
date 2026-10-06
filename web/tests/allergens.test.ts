import { describe, expect, it } from "vitest";
import { allergenPhrases, orderAllergens, unionAllergens } from "../lib/mm/allergens";
import { indexChain } from "../lib/mm/chain-index";
import type { Allergens, Chain } from "../lib/mm/types";

const nut = { calories: 100, protein: 5, carbs: 10, fat: 4 };
const comp = (id: string, allergens?: Allergens) => ({ id, group: "base" as const, name: id, portion: "", nutrients: nut, tags: [], removable: true, allowDouble: false, ...(allergens ? { allergens } : {}) });
const item = (id: string, allergens?: Allergens) => ({ id, name: id, category: "C", serving: "", nutrients: nut, tags: [], limitedTime: false, rankable: true, components: [], modifiers: [], ...(allergens ? { allergens } : {}) });
const chain = (over: Partial<Chain>): Chain => ({ schemaVersion: 1, id: "t", name: "T", cuisine: "x", builderType: "standard", aliases: [], sample: true, source: { title: "", url: "https://x", checkedOn: "2026-10-06" }, categories: ["C"], components: [], items: [], combinations: [], ...over });

describe("allergens", () => {
  it("names the specific cereals and tree nuts the guide gives, and only for 'contains'", () => {
    const a: Allergens = { contains: ["gluten", "milk", "nuts"], mayContain: ["sesame"], cereals: ["wheat", "barley"], nuts: ["almond"] };
    expect(allergenPhrases(a, "contains")).toEqual(["Cereals containing gluten (wheat, barley)", "Milk", "Tree nuts (almond)"]);
    expect(allergenPhrases(a, "mayContain")).toEqual(["Sesame"]);
    expect(allergenPhrases({ contains: ["gluten"], mayContain: [] }, "contains")).toEqual(["Cereals containing gluten"]);
  });
  it("unions parts in the legal order, and 'may contain' never repeats a 'contains'", () => {
    const u = unionAllergens([
      { contains: ["milk"], mayContain: ["eggs", "nuts"] },
      { contains: ["eggs", "celery"], mayContain: [], cereals: ["wheat"] },
    ]);
    expect(u).toEqual({ contains: ["celery", "eggs", "milk"], mayContain: ["nuts"], cereals: ["wheat"] });
  });
  it("an order's allergens come from its parts; any part without published allergens means none at all", () => {
    const ix = indexChain(chain({
      builderType: "build_your_own",
      components: [comp("rice", { contains: [], mayContain: [] }), comp("cheese", { contains: ["milk"], mayContain: [] }), comp("mystery")],
      items: [item("side", { contains: ["mustard"], mayContain: ["sesame"] }), item("unknown")],
    }));
    const bowl = { kind: "components" as const, itemId: "bowl", components: [{ id: "rice", qty: 1 }, { id: "cheese", qty: 2 }] };
    expect(orderAllergens(ix, [bowl, { kind: "item", itemId: "side", qty: 1, modifierIds: [] }])).toEqual({ allergens: { contains: ["milk", "mustard"], mayContain: ["sesame"] }, changesNotCovered: false });
    // removing the cheese component does remove milk: the guide lists each component separately
    expect(orderAllergens(ix, [{ ...bowl, components: [{ id: "rice", qty: 1 }] }])?.allergens.contains).toEqual([]);
    expect(orderAllergens(ix, [{ ...bowl, components: [{ id: "mystery", qty: 1 }] }])).toBeNull();
    expect(orderAllergens(ix, [{ kind: "item", itemId: "unknown", qty: 1, modifierIds: [] }])).toBeNull();
    expect(orderAllergens(ix, [])).toBeNull();
  });
  it("modified items keep the whole item's allergens and say the change isn't covered", () => {
    const ix = indexChain(chain({ items: [item("burger", { contains: ["gluten", "milk"], mayContain: [], cereals: ["wheat"] })] }));
    const r = orderAllergens(ix, [{ kind: "item", itemId: "burger", qty: 1, modifierIds: ["no-cheese"] }]);
    expect(r?.allergens.contains).toEqual(["gluten", "milk"]);
    expect(r?.changesNotCovered).toBe(true);
  });
});
