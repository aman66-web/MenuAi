import { describe, expect, it } from "vitest";
import { addToCompare, COMPARE_MAX, compareRows, inCompare, mixedBasis, proteinForAPound, removeFromCompare, sanitizeCompare, type CompareItem } from "../lib/mm/compare";

const food = (id: string, kcal: number, protein: number | null, extra: Partial<CompareItem> = {}): CompareItem => ({
  key: `food:sainsburys:${id}`, kind: "food", name: `Beans ${id}`, from: "Sainsbury's", fromId: "sainsburys", href: `/app/groceries/shop/item?r=sainsburys&id=${id}`,
  basis: "g", source: "label", addedAt: "2026-10-11T12:00:00.000Z",
  numbers: { kcal, protein, carbs: 12, sugars: 4.7, fat: 0.4, saturates: null, fibre: 3.8, salt: 0.6 }, ...extra,
});
const dish = (id: string, kcal: number): CompareItem => ({
  key: `dish:kfc:${id}`, kind: "dish", name: `Burger ${id}`, from: "KFC", fromId: "kfc", href: `/app/item?chain=kfc&item=${id}`, basis: "serving", note: "1 burger",
  source: "restaurant", addedAt: "2026-10-11T12:00:00.000Z", numbers: { kcal, protein: 29, carbs: 43, sugars: null, fat: 19, saturates: null, fibre: null, salt: 2.1 },
});

describe("compare: the list on this device", () => {
  it("adds, replaces a product's older copy, removes, and holds at most six of a kind", () => {
    let list: CompareItem[] = [];
    list = addToCompare(list, food("a", 78, 4.7)).list;
    list = addToCompare(list, dish("x", 463)).list;
    list = addToCompare(list, food("a", 80, 5)).list;
    expect(list.map((i) => i.key)).toEqual(["food:sainsburys:a", "dish:kfc:x"]);
    expect(list[0]!.numbers.kcal).toBe(80);
    for (let n = 0; n < COMPARE_MAX; n++) list = addToCompare(list, food(`b${n}`, 70 + n, 4)).list;
    expect(list.filter((i) => i.kind === "food")).toHaveLength(COMPARE_MAX);
    const full = addToCompare(list, food("z", 90, 5));
    expect(full.full).toBe(true);
    expect(addToCompare(list, dish("y", 500)).full).toBe(false); // the other kind has room
    expect(inCompare(list, "dish:kfc:x")).toBe(true);
    expect(removeFromCompare(list, "dish:kfc:x").some((i) => i.kind === "dish")).toBe(false);
  });
  it("keeps only well-formed items: no foreign photo hosts, links outside the app or made-up fields", () => {
    const ok = food("a", 78, 4.7, { photo: "https://assets.sainsburys-groceries.co.uk/gol/123/image.jpg", price: 0.85, unitPrice: 2.05, unit: "per kg" });
    const out = sanitizeCompare([
      ok,
      { ...food("b", 70, 4), photo: "https://evil.example.com/x.jpg" },
      { ...food("c", 70, 4), href: "https://evil.example.com/" },
      { ...food("d", -5, 4) },
      { ...dish("e", 400), basis: "g" },
      { ...food("f", 70, 4), source: "made up" },
      ok, // duplicate
      "nonsense",
    ]);
    expect(out.map((i) => i.key)).toEqual(["food:sainsburys:a", "food:sainsburys:b"]);
    expect(out[0]).toMatchObject({ photo: "https://assets.sainsburys-groceries.co.uk/gol/123/image.jpg", price: 0.85, unitPrice: 2.05, unit: "per kg" });
    expect(out[1]!.photo).toBeUndefined();
    expect(sanitizeCompare({})).toEqual([]);
  });
});

describe("compare: the rows", () => {
  it("lists every nutrient one of them has, marks the highest and lowest, and never marks a tie", () => {
    const rows = compareRows([food("a", 78, 4.7), food("b", 85, 5.2), food("c", 78, null)]);
    const kcal = rows.find((r) => r.id === "kcal")!;
    expect(kcal.values).toEqual([78, 85, 78]);
    expect(kcal.highest).toEqual([1]);
    expect(kcal.lowest).toEqual([0, 2]);
    const protein = rows.find((r) => r.id === "protein")!;
    expect(protein.values).toEqual([4.7, 5.2, null]); // a figure the label doesn't print stays empty
    expect(rows.find((r) => r.id === "sugars")!.highest).toEqual([]); // all the same: nothing marked
    expect(rows.some((r) => r.id === "saturates")).toBe(false); // nobody has it
    expect(rows.find((r) => r.id === "sugars")!.sub).toBe(true);
  });
  it("adds the shop's price per kg and the protein £1 buys, only from figures shown", () => {
    const a = food("a", 78, 4.7, { price: 0.85, unitPrice: 2.05, unit: "per kg" });
    const b = food("b", 85, 5.2, { price: 1.4, unitPrice: 3.37, unit: "per kg" });
    const c = food("c", 80, 5, { price: 1, unitPrice: 1, unit: "each" }); // "each" can't be turned into per kg
    expect(proteinForAPound(a)).toBe(22.9); // 4.7 g per 100 g = 47 g per kg, / £2.05
    expect(proteinForAPound(c)).toBeNull();
    const rows = compareRows([a, b, c]);
    expect(rows.find((r) => r.id === "perKg")).toMatchObject({ label: "Price per kg", values: [2.05, 3.37, null], lowest: [0], highest: [1] });
    expect(rows.find((r) => r.id === "proteinPound")!.values).toEqual([22.9, 15.4, null]);
    expect(compareRows([dish("x", 463), dish("y", 500)]).some((r) => r.id === "perKg")).toBe(false);
  });
  it("says when the foods don't share one basis", () => {
    expect(mixedBasis([food("a", 78, 4.7), food("b", 85, 5)])).toBe(false);
    expect(mixedBasis([food("a", 78, 4.7), food("b", 45, 3.4, { basis: "ml" })])).toBe(true);
    expect(mixedBasis([food("a", 78, 4.7), food("b", 140, 4, { note: "cooked" })])).toBe(true);
  });
});
