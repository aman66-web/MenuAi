import { describe, expect, it } from "vitest";
import { compareOverview } from "../lib/mm/compareOverview";
import type { CompareItem } from "../lib/mm/compare";

const food = (name: string, p: Partial<CompareItem> & { n?: Partial<CompareItem["numbers"]> } = {}): CompareItem => ({
  key: `food:t:${name}`, kind: "food", name, from: "Tesco", fromId: "tesco", href: "/x", basis: "g", unitPrice: 5, unit: "per kg", source: "label", addedAt: "2026-11-17",
  numbers: { kcal: 100, protein: 10, carbs: 10, sugars: 5, fat: 5, saturates: 1, fibre: 1, salt: 0.5, ...(p.n ?? {}) }, ...p,
});
const dish = (name: string, n: Partial<CompareItem["numbers"]>): CompareItem => ({
  key: `dish:c:${name}`, kind: "dish", name, from: "KFC", fromId: "kfc", href: "/x", basis: "serving", source: "restaurant", addedAt: "2026-11-17",
  numbers: { kcal: 500, protein: 25, carbs: 40, sugars: null, fat: 20, saturates: null, fibre: null, salt: null, ...n },
});
const by = (o: ReturnType<typeof compareOverview>, id: string) => o.entries.find((e) => e.id === id);

describe("compare overview", () => {
  it("names the cheapest, the most protein, the best protein for the money and the fewest calories, from the figures", () => {
    const a = food("A", { unitPrice: 2, n: { kcal: 90, protein: 8 } });
    const b = food("B", { unitPrice: 10, n: { kcal: 300, protein: 25 } });
    const o = compareOverview([a, b]);
    expect(by(o, "price")).toMatchObject({ winners: [0], value: 2 });
    expect(by(o, "protein")).toMatchObject({ winners: [1], value: 25 });
    expect(by(o, "proteinMoney")).toMatchObject({ winners: [0] }); // A: 8*10/2 = 40 g for £1; B: 25
    expect(by(o, "calories")).toMatchObject({ winners: [0], value: 90 });
    expect(o.mixed).toBe(false);
  });
  it("names every item that ties, and nothing when all are equal or only one has the figure", () => {
    const o = compareOverview([food("A", { n: { protein: 12 } }), food("B", { n: { protein: 12 } }), food("C", { n: { protein: 5 } })]);
    expect(by(o, "protein")).toMatchObject({ winners: [0, 1], value: 12 });
    const same = compareOverview([food("A"), food("B")]);
    expect(same.entries.length).toBe(0);
    const one = compareOverview([food("A", { n: { sugars: 3 } }), food("B", { n: { sugars: null } })]);
    expect(by(one, "sugars")).toBeUndefined();
  });
  it("never compares per 100 g with per 100 ml, and needs two items", () => {
    const o = compareOverview([food("Milk", { basis: "ml", unit: "per litre" }), food("Bar")]);
    expect(o).toEqual({ entries: [], mixed: true });
    expect(compareOverview([food("A")]).entries).toEqual([]);
  });
  it("dishes: protein, protein for the calories, fewest calories and lowest sugars where published", () => {
    const big = dish("Big", { kcal: 900, protein: 40, sugars: 10 });
    const small = dish("Small", { kcal: 300, protein: 24, sugars: 2 });
    const o = compareOverview([big, small]);
    expect(by(o, "protein")).toMatchObject({ winners: [0], value: 40 });
    expect(by(o, "proteinCalories")).toMatchObject({ winners: [1], value: 8 }); // 24/300*100; big is 4.4
    expect(by(o, "calories")).toMatchObject({ winners: [1], value: 300 });
    expect(by(o, "sugars")).toMatchObject({ winners: [1], value: 2 });
    expect(by(o, "price")).toBeUndefined();
  });
});
