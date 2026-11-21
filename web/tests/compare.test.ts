import { describe, expect, it } from "vitest";
import { addToCompare, COMPARE_MAX, compareRows, inCompare, mixedBasis, notAllLabels, proteinForAPound, removeFromCompare, sanitizeCompare, sanitizeCompareItem, shopNumbersSource, shownFigure, sourceLabel, trafficLightFor, type CompareItem } from "../lib/mm/compare";
import { compareOverview } from "../lib/mm/compareOverview";

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
  it("never puts a cooked label's protein against the price per kg as sold (the second pass, Yusuf #42)", () => {
    const raw = food("raw", 215, 16, { price: 2.5, unitPrice: 8.33, unit: "per kg" });
    const grilled = food("grilled", 287, 24, { price: 2.5, unitPrice: 8.33, unit: "per kg", note: "grilled" });
    expect(proteinForAPound(raw)).toBe(19.2);
    expect(proteinForAPound(grilled)).toBeNull();
    // the price per kg itself is the pack's, cooked label or not
    expect(compareRows([raw, grilled]).find((r) => r.id === "proteinPound")!.values).toEqual([19.2, null]);
    expect(compareRows([raw, grilled]).find((r) => r.id === "perKg")!.values).toEqual([8.33, 8.33]);
  });
  it("marks Highest and Lowest on the figures as printed, so two that read the same are never marked apart", () => {
    // Three Sainsbury's beans: salt 0.58, 0.6 and 0.6 (the table used to print all three as 0.6 and still mark one lowest, one highest).
    const salt = (id: string, v: number) => food(id, 78, 4.7, { numbers: { ...food(id, 78, 4.7).numbers, salt: v } });
    const saltRow = compareRows([salt("a", 0.58), salt("b", 0.6), salt("c", 0.6)]).find((r) => r.id === "salt")!;
    expect(saltRow.values).toEqual([0.58, 0.6, 0.6]); // the stored figures are kept
    expect(saltRow.lowest).toEqual([0]);
    expect(saltRow.highest).toEqual([1, 2]);
    // 91.4 and 91.2 kcal both print as 91: nothing marked
    const kcal = compareRows([food("a", 91.4, 4.7), food("b", 91.2, 4.7)]).find((r) => r.id === "kcal")!;
    expect(kcal.highest).toEqual([]);
    expect(kcal.lowest).toEqual([]);
    expect(kcal.values.map((v) => shownFigure(kcal, v!))).toEqual([91, 91]);
  });
  it("prints grams as the label does (at most 2 decimals) and protein for £1 as before", () => {
    expect(shownFigure({ id: "carbs", unit: "g" }, 12.5)).toBe(12.5);
    expect(shownFigure({ id: "salt", unit: "g" }, 0.58)).toBe(0.58);
    expect(shownFigure({ id: "salt", unit: "g" }, 0.583)).toBe(0.58);
    expect(shownFigure({ id: "perKg", unit: "£" }, 2.054)).toBe(2.05);
    expect(shownFigure({ id: "proteinPound", unit: "g" }, 41.29)).toBe(41);
    expect(shownFigure({ id: "proteinPound", unit: "g" }, 4.94)).toBe(4.9);
    const protein = compareRows([{ ...dish("x", 463), numbers: { ...dish("x", 463).numbers, protein: 45.3 } }, dish("y", 500)]).find((r) => r.id === "protein")!;
    expect(shownFigure(protein, protein.values[0]!)).toBe(45.3); // a dish's 45.3 g protein shows as 45.3, not 45
  });
  it("says when the foods don't share one basis", () => {
    expect(mixedBasis([food("a", 78, 4.7), food("b", 85, 5)])).toBe(false);
    expect(mixedBasis([food("a", 78, 4.7), food("b", 45, 3.4, { basis: "ml" })])).toBe(true);
    expect(mixedBasis([food("a", 78, 4.7), food("b", 140, 4, { note: "cooked" })])).toBe(true);
  });
});

describe("traffic lights on Compare (FSA colours, foods per 100 g only)", () => {
  const food = (n: Partial<CompareItem["numbers"]>, over: Partial<CompareItem> = {}): CompareItem => ({
    key: "food:t:a", kind: "food", name: "A", from: "Tesco", fromId: "tesco", href: "/x", basis: "g", source: "label", addedAt: "2026-11-17",
    numbers: { kcal: 100, protein: 10, carbs: 10, sugars: 3, fat: 2, saturates: 1, fibre: 1, salt: 0.2, ...n }, ...over,
  });
  it("colours fat, saturates, sugars and salt by the official per 100 g limits (low at or under, high over)", () => {
    const low = food({ fat: 3, saturates: 1.5, sugars: 5, salt: 0.3 });
    expect(["fat", "saturates", "sugars", "salt"].map((r) => trafficLightFor(low, r))).toEqual(["green", "green", "green", "green"]);
    const mid = food({ fat: 17.5, saturates: 5, sugars: 22.5, salt: 1.5 });
    expect(["fat", "saturates", "sugars", "salt"].map((r) => trafficLightFor(mid, r))).toEqual(["amber", "amber", "amber", "amber"]);
    const high = food({ fat: 17.6, saturates: 5.1, sugars: 22.6, salt: 1.6 });
    expect(["fat", "saturates", "sugars", "salt"].map((r) => trafficLightFor(high, r))).toEqual(["red", "red", "red", "red"]);
  });
  it("never colours calories, protein, carbohydrate or fibre, a missing figure, a per 100 ml product, a dish or a label for the cooked food", () => {
    const f = food({});
    for (const r of ["kcal", "protein", "carbs", "fibre", "perKg", "proteinPound"]) expect(trafficLightFor(f, r)).toBeNull();
    expect(trafficLightFor(food({ sugars: null }), "sugars")).toBeNull();
    expect(trafficLightFor(food({ sugars: 30 }, { basis: "ml" }), "sugars")).toBeNull();
    expect(trafficLightFor(food({ sugars: 30 }, { kind: "dish", basis: "serving" }), "sugars")).toBeNull();
    expect(trafficLightFor(food({ sugars: 30 }, { note: "cooked" }), "sugars")).toBeNull();
  });
});

describe("where each column's figures come from (the review of 2026-11-20)", () => {
  it("names the source of a column: the shop's label, the same product's label at another shop, community numbers, the government's figures", () => {
    expect(sourceLabel(food("a", 80, 5))).toBe("Shop label");
    expect(sourceLabel(food("a", 80, 5, { source: "same", sourceShop: "Tesco" }))).toBe("Same product's label at Tesco");
    expect(sourceLabel(food("a", 80, 5, { source: "community" }))).toBe("Open Food Facts (community)");
    expect(sourceLabel(food("a", 80, 5, { source: "government" }))).toBe("UK government figures");
    expect(notAllLabels([food("a", 80, 5), food("b", 80, 5, { source: "same", sourceShop: "Tesco" })])).toBe(false);
    expect(notAllLabels([food("a", 80, 5), food("b", 80, 5, { source: "community" })])).toBe(true);
  });

  it("keeps the new sources when stored, and reads an older item's English government note as the government source", () => {
    expect(sanitizeCompareItem(food("a", 80, 5, { source: "same", sourceShop: "Tesco" }))).toMatchObject({ source: "same", sourceShop: "Tesco" });
    expect(sanitizeCompareItem(food("a", 80, 5, { source: "government" }))!.source).toBe("government");
    const old = sanitizeCompareItem(food("a", 30, 1, { note: "UK government food data" }))!;
    expect(old.source).toBe("government");
    expect(old.note).toBeUndefined();
    expect(sanitizeCompareItem(food("a", 80, 5, { sourceShop: "Tesco" }))!.sourceShop).toBeUndefined(); // only a "same" label names another shop
  });

  it("a product from a shop's list says where its numbers are from", () => {
    expect(shopNumbersSource({ govFood: "Onions, raw" })).toEqual({ source: "government" });
    expect(shopNumbersSource({ sameAs: "tesco" })).toEqual({ source: "same", sourceShop: "Tesco" });
    expect(shopNumbersSource({ community: true })).toEqual({ source: "community" });
    expect(shopNumbersSource({})).toEqual({ source: "label" });
  });

  it("an overview lead that rests on community numbers says so", () => {
    const o = compareOverview([food("a", 80, 5), food("b", 60, 9, { source: "community" })]);
    expect(o.entries.find((e) => e.id === "protein")).toMatchObject({ winners: [1], notLabel: true });
    expect(o.entries.find((e) => e.id === "calories")).toMatchObject({ winners: [1], notLabel: true });
    expect(compareOverview([food("a", 80, 5), food("b", 60, 9)]).entries.every((e) => !e.notLabel)).toBe(true);
  });
});
