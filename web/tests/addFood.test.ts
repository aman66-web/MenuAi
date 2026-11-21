import { describe, expect, it } from "vitest";
import {
  amountChoices, amountNutrients, loggableFromListed, loggableFromShop, MAX_AMOUNT, MAX_NAME_LENGTH, MAX_SERVINGS, MAX_TYPED_GRAMS, MAX_TYPED_KCAL, MIN_SERVINGS, packAmounts, parseAmount, parseNumber,
  macroShares, MIN_AMOUNT, printedAmount, productEntry, recipeNutrients, startAmount, stepAmount, stepServings, typedEntry, withShopLabel,
} from "../lib/mm/addFood";
import { mergeProducts, type GroceryFile } from "../lib/mm/groceries";
import { decodeShopProducts, type ShopFile } from "../lib/mm/shopProducts";
import { entryMeal, LOG_MEAL_LABEL, LOG_MEALS, loggedGaps, loggedToday, MEAL_SHARE, MEALS } from "../lib/mm/budget";
import { sanitizeLog } from "../lib/mm/user-data";

// The Add food sheet's rules: typed numbers are the person's own (an empty box is no figure, never 0), a product is its label x the amount over 100,
// a recipe is its per-serving figures x the servings, and an entry added from a meal's + stays in that meal.

describe("parseNumber", () => {
  it("reads whole and part numbers, with a point or a comma", () => {
    expect(parseNumber("250")).toBe(250);
    expect(parseNumber(" 12.5 ")).toBe(12.5);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("7.")).toBe(7);
    expect(parseNumber("0,125")).toBe(0.125);
    expect(parseNumber("1,23")).toBe(1.23);
  });
  it("reads a comma that groups thousands as the UK writes it", () => {
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("2,500")).toBe(2500);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("12,345,678")).toBe(12345678);
  });
  it("reads digits typed in another numeral system", () => {
    expect(parseNumber("٢٥٠")).toBe(250); // Arabic-Indic
    expect(parseNumber("১২")).toBe(12); // Bengali
    expect(parseNumber("٣٫٥")).toBe(3.5); // Arabic decimal separator
  });
  it("calls an empty box null and anything else bad", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    for (const bad of ["abc", "12abc", "-5", "1.2.3", "1,2,3", "1e3", "∞", "NaN", "+4"]) expect(parseNumber(bad), bad).toBe("bad");
  });
});

describe("typedEntry", () => {
  const input = { name: "", calories: "", protein: "", carbs: "", fat: "" };
  it("needs the calories", () => {
    expect(typedEntry(input, "Mine")).toEqual({ ok: false, field: "calories", problem: "missing" });
    expect(typedEntry({ ...input, protein: "20" }, "Mine")).toEqual({ ok: false, field: "calories", problem: "missing" });
  });
  it("leaves out the numbers that were left empty (never 0)", () => {
    const r = typedEntry({ ...input, calories: "250" }, "Mine");
    expect(r).toEqual({ ok: true, name: "Mine", nutrients: { calories: 250 } });
    expect(r.ok && "protein" in r.nutrients).toBe(false);
  });
  it("keeps what was typed, calories whole and grams to one place", () => {
    const r = typedEntry({ name: "  Toast   and jam ", calories: "249.6", protein: "7,25", carbs: "40", fat: "0" }, "Mine");
    expect(r).toEqual({ ok: true, name: "Toast and jam", nutrients: { calories: 250, protein: 7.3, carbs: 40, fat: 0 } });
  });
  it("accepts 0 calories (black coffee) and 0 grams", () => {
    expect(typedEntry({ ...input, calories: "0", protein: "0" }, "Mine")).toEqual({ ok: true, name: "Mine", nutrients: { calories: 0, protein: 0 } });
  });
  it("names the box that is wrong", () => {
    expect(typedEntry({ ...input, calories: "lots" }, "Mine")).toEqual({ ok: false, field: "calories", problem: "bad" });
    expect(typedEntry({ ...input, calories: "100", fat: "a bit" }, "Mine")).toEqual({ ok: false, field: "fat", problem: "bad" });
    expect(typedEntry({ ...input, calories: String(MAX_TYPED_KCAL + 1) }, "Mine")).toEqual({ ok: false, field: "calories", problem: "toobig" });
    expect(typedEntry({ ...input, calories: String(MAX_TYPED_KCAL) }, "Mine").ok).toBe(true);
    expect(typedEntry({ ...input, calories: "100", carbs: String(MAX_TYPED_GRAMS + 1) }, "Mine")).toEqual({ ok: false, field: "carbs", problem: "toobig" });
    expect(typedEntry({ ...input, calories: "100", protein: String(MAX_TYPED_GRAMS) }, "Mine").ok).toBe(true);
  });
  it("keeps a name to a sensible length", () => {
    const r = typedEntry({ ...input, name: "x".repeat(200), calories: "1" }, "Mine");
    expect(r.ok && r.name.length).toBe(MAX_NAME_LENGTH);
  });
});

describe("amountNutrients (a label per 100 g or ml, scaled)", () => {
  const beans = { kcal: 78, protein: 4.7, carbs: 11.4, fat: 0.5 };
  it("is the label x amount / 100", () => {
    expect(amountNutrients(beans, 100)).toEqual({ calories: 78, protein: 4.7, carbs: 11.4, fat: 0.5 });
    expect(amountNutrients(beans, 200)).toEqual({ calories: 156, protein: 9.4, carbs: 22.8, fat: 1 });
    expect(amountNutrients(beans, 50)).toEqual({ calories: 39, protein: 2.4, carbs: 5.7, fat: 0.3 });
  });
  it("carries the rest of the label only where it is printed", () => {
    expect(amountNutrients(beans, 100)).not.toHaveProperty("salt");
    expect(amountNutrients({ ...beans, saturates: 0.1, sugars: 4.9, fibre: 3.7, salt: 0.55, kj: 330 }, 250)).toEqual({
      calories: 195, protein: 11.8, carbs: 28.5, fat: 1.3, saturatedFat: 0.3, sugar: 12.3, fiber: 9.3, salt: 1.38, energyKj: 825,
    });
  });
});

describe("parseAmount", () => {
  it("accepts 1 to the maximum, with part amounts", () => {
    expect(parseAmount("250")).toBe(250);
    expect(parseAmount("37,5")).toBe(37.5);
    expect(parseAmount(String(MAX_AMOUNT))).toBe(MAX_AMOUNT);
  });
  it("refuses empty, zero, too much and words", () => {
    for (const bad of ["", "0", "0.5", String(MAX_AMOUNT + 1), "lots", "-3"]) expect(parseAmount(bad), bad).toBeNull();
  });
});

describe("servings", () => {
  it("steps by half a serving between half and six", () => {
    expect(stepServings(1, 1)).toBe(1.5);
    expect(stepServings(1, -1)).toBe(MIN_SERVINGS);
    expect(stepServings(MIN_SERVINGS, -1)).toBe(MIN_SERVINGS);
    expect(stepServings(MAX_SERVINGS, 1)).toBe(MAX_SERVINGS);
    expect(stepServings(5.5, 1)).toBe(6);
  });
  const totals = {
    perServing: { kcal: 512, protein: 31.4, carbs: 60.2, fat: 14.9 },
    label: { kj: 2140, saturates: 4.2, sugars: null, fibre: 6.1, salt: 1.2 },
  };
  it("multiplies the recipe's per-serving figures", () => {
    expect(recipeNutrients(totals, 1)).toEqual({ calories: 512, protein: 31.4, carbs: 60.2, fat: 14.9, saturatedFat: 4.2, fiber: 6.1, salt: 1.2, energyKj: 2140 });
    expect(recipeNutrients(totals, 2)).toEqual({ calories: 1024, protein: 62.8, carbs: 120.4, fat: 29.8, saturatedFat: 8.4, fiber: 12.2, salt: 2.4, energyKj: 4280 });
  });
  it("leaves out a figure some label doesn't print (sugars here), never filling it in", () => {
    expect(recipeNutrients(totals, 1.5)).not.toHaveProperty("sugar");
  });
});

describe("the meal an entry sits under", () => {
  const entry = (hour: number, meal?: "breakfast" | "lunch" | "dinner") => ({ loggedAt: new Date(2026, 9, 15, hour, 0).toISOString(), ...(meal ? { meal } : {}) });
  it("is the row it was added to, else the meal its time falls in", () => {
    expect(entryMeal(entry(8))).toBe("breakfast");
    expect(entryMeal(entry(13))).toBe("lunch");
    expect(entryMeal(entry(19))).toBe("dinner");
    expect(entryMeal(entry(19, "breakfast"))).toBe("breakfast");
    expect(entryMeal(entry(8, "dinner"))).toBe("dinner");
  });
});

describe("Snacks (founder 2026-11-19: \"you have breakfast, lunch, and dinner, but also have one for like snacks\")", () => {
  const base = { id: "s", loggedAt: new Date(2026, 9, 15, 15, 0).toISOString(), chainId: "", chainName: "", name: "Apple", source: "custom", nutrients: { calories: 80, protein: 0.4, carbs: 19, fat: 0.3 } };
  it("is the fourth row of the day, after Dinner", () => {
    expect(LOG_MEALS).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(LOG_MEAL_LABEL.snack).toBe("Snacks");
  });
  it("keeps an entry added to Snacks there (the sanitiser keeps the row; the clock never picks it)", () => {
    const [kept] = sanitizeLog([{ ...base, meal: "snack" }]);
    expect(kept?.meal).toBe("snack");
    expect(entryMeal(kept!)).toBe("snack");
    expect(entryMeal({ loggedAt: base.loggedAt })).toBe("lunch");
    expect(sanitizeLog([{ ...base, meal: "supper" }])[0]).not.toHaveProperty("meal");
  });
  it("counts in the day's total, and has no meal share of its own: the three meals' shares are unchanged", () => {
    const list = sanitizeLog([{ ...base, meal: "snack" }, { ...base, id: "t", meal: "lunch", nutrients: { calories: 500, protein: 30, carbs: 50, fat: 15 } }]);
    expect(loggedToday(list, new Date(2026, 9, 15, 18, 0)).calories).toBe(580);
    expect(MEALS).toEqual(["breakfast", "lunch", "dinner"]);
    expect(MEAL_SHARE).toEqual({ breakfast: 0.25, lunch: 0.35, dinner: 0.4 });
  });
});

describe("a logged entry without protein, carbs or fat", () => {
  const base = { id: "a", loggedAt: new Date(2026, 9, 15, 9, 0).toISOString(), chainId: "", chainName: "", name: "Toast", source: "custom" };
  it("is kept by the sanitiser, and counts only what it has", () => {
    const list = sanitizeLog([{ ...base, nutrients: { calories: 200 } }, { ...base, id: "b", nutrients: { calories: 100, protein: 5, carbs: 10, fat: 2 } }]);
    expect(list).toHaveLength(2);
    expect(loggedToday(list, new Date(2026, 9, 15, 12, 0))).toEqual({ calories: 300, protein: 5, carbs: 10, fat: 2 });
  });
  it("is counted in loggedGaps (today's entries only), never as 0 grams", () => {
    const today = new Date(2026, 9, 15, 12, 0);
    const list = sanitizeLog([
      { ...base, nutrients: { calories: 200 } },
      { ...base, id: "b", nutrients: { calories: 100, protein: 5 } },
      { ...base, id: "c", nutrients: { calories: 50, protein: 0, carbs: 0, fat: 0 } }, // typed zeros are figures
      { ...base, id: "d", loggedAt: new Date(2026, 9, 14, 12, 0).toISOString(), nutrients: { calories: 9 } }, // yesterday
    ]);
    expect(loggedGaps(list, today)).toEqual({ protein: 1, carbs: 2, fat: 2, any: true });
    expect(loggedGaps([], today)).toEqual({ protein: 0, carbs: 0, fat: 0, any: false });
    expect(loggedGaps(sanitizeLog([{ ...base, nutrients: { calories: 1, protein: 1, carbs: 1, fat: 1 } }]), today).any).toBe(false);
  });
  it("still refuses calories that are not a number, or a protein that is not", () => {
    expect(sanitizeLog([{ ...base, nutrients: { calories: "200" } }])).toEqual([]);
    expect(sanitizeLog([{ ...base, nutrients: { calories: 200, protein: "x" } }])).toEqual([]);
    expect(sanitizeLog([{ ...base, nutrients: { calories: Infinity } }])).toEqual([]);
    expect(sanitizeLog([{ ...base, nutrients: {} }])).toEqual([]);
  });
  it("keeps a known meal and drops one it doesn't know", () => {
    const [kept, dropped] = sanitizeLog([{ ...base, meal: "lunch", nutrients: { calories: 1 } }, { ...base, id: "c", meal: "supper", nutrients: { calories: 1 } }]);
    expect(kept?.meal).toBe("lunch");
    expect(dropped).toBeDefined();
    expect(dropped && "meal" in dropped).toBe(false);
  });
});

describe("a supermarket product from a shop's list, a scan or a product page (founder 2026-11-20: scan it, then add it to the food diary)", () => {
  const shopFile: ShopFile = {
    v: 1, retailer: "asda", name: "Asda", checkedOn: "2026-10-08", pageBase: "https://www.asda.com/groceries/search/", pageSearch: true, photoBase: "", photoTemplate: "https://asdagroceries.scene7.com/is/image/asdagroceries/{photo}",
    categories: ["Chilled Food"], schemes: [],
    products: [
      ["1000", "ASDA British Milk Semi Skimmed 2 Litres", 2.08, 1.04, "per litre", null, null, 0, "5063089019924", "5063089019924", [50, 3.6, 4.8, 1.8, 1.1, 4.8, 0, 0.1, 209, "ml", ""]],
      ["1001", "ASDA White Mushrooms 400g", 1.1, 2.75, "per kg", null, null, 0, "5050000000001", "5050000000001", [8, 1.8, 0.4, 0.5, null, null, 1.1, null, null, "g", ""]],
      ["1002", "Unread Thing 200g", 1, 5, "per kg", null, null, 0, "", "", null],
      ["1003", "Community Beans 415g", 0.5, 1.2, "per kg", null, null, 0, "", "5050000000002", [80, 5, 12, 0.5, null, null, null, null, null, "g", "", "off"]],
    ],
  };
  const [milk, mushrooms, unread, beans] = decodeShopProducts(shopFile);

  it("is the shop's label per 100, its shop and its photo; a product with no numbers can't be logged", () => {
    const m = loggableFromShop(shopFile, milk!)!;
    expect(m).toMatchObject({ name: "ASDA British Milk Semi Skimmed 2 Litres", shop: "asda", per: "ml", source: { kind: "shop", shop: "asda" }, size: "2 Litres" });
    expect(m.label).toEqual({ kcal: 50, protein: 3.6, carbs: 4.8, fat: 1.8, saturates: 1.1, sugars: 4.8, fibre: 0, salt: 0.1, kj: 209 });
    expect(m.photos[0]!.src).toBe("https://asdagroceries.scene7.com/is/image/asdagroceries/5063089019924");
    expect(loggableFromShop(shopFile, unread!)).toBeNull();
    expect(loggableFromShop(shopFile, beans!)!.source).toEqual({ kind: "community" });
  });

  it("adds the label x the amount, with source 'product', and only the figures the label prints", () => {
    const m = loggableFromShop(shopFile, mushrooms!)!;
    const e = productEntry(m, 200, "Asda");
    expect(e).toEqual({ chainId: "", chainName: "Asda", name: "ASDA White Mushrooms 400g (200 g)", source: "product", nutrients: { calories: 16, protein: 3.6, carbs: 0.8, fat: 1, fiber: 2.2 } });
  });

  it("logs the shop's label, not the community record, for a product that has both (2026-11-20: mushrooms logged as 108 kcal)", () => {
    const catalogue: GroceryFile = { v: 1, retailer: "asda", name: "Asda", generatedOn: "2026-10-17", source: "off", products: [
      { gtin: "5050000000001", name: "White Mushrooms", brand: "Asda", size: "400 g", per: "g", kcal: 108, protein: 2, carbs: 1, fat: 11, allergens: null, category: "vegetables" },
    ] };
    const listed = mergeProducts([catalogue])[0]!;
    const fromCatalogue = loggableFromListed(listed, "asda");
    expect(fromCatalogue.source).toEqual({ kind: "community" });
    const logged = withShopLabel(fromCatalogue, loggableFromShop(shopFile, mushrooms!)!);
    expect(logged.source).toEqual({ kind: "shop", shop: "asda" });
    expect(productEntry(logged, 100, "Asda").nutrients).toEqual({ calories: 8, protein: 1.8, carbs: 0.4, fat: 0.5, fiber: 1.1 });
    // community numbers never replace anything
    expect(withShopLabel(fromCatalogue, loggableFromShop(shopFile, beans!)!)).toBe(fromCatalogue);
  });

  it("offers one-tap amounts from the label and the pack, and starts on one portion where the label prints one", () => {
    expect(printedAmount("1 bar (45g)")).toEqual({ amount: 45, unit: "g" });
    expect(printedAmount("1.5 kg")).toEqual({ amount: 1500, unit: "g" });
    expect(printedAmount("33cl")).toEqual({ amount: 330, unit: "ml" });
    expect(printedAmount("6 pack")).toBeNull();
    expect(packAmounts("4 x 125g")).toEqual({ each: 125, count: 4, unit: "g" });
    expect(packAmounts("400g")).toEqual({ each: 400, count: 1, unit: "g" });
    expect(amountChoices({ per: "g", size: "4 x 125g", portion: "125g" })).toEqual([{ kind: "portion", amount: 125 }, { kind: "hundred", amount: 100 }]);
    expect(amountChoices({ per: "g", size: "4 x 125g", portion: "" })).toEqual([{ kind: "item", amount: 125, count: 4 }, { kind: "hundred", amount: 100 }]);
    expect(amountChoices({ per: "g", size: "400g", portion: "40g" })).toEqual([{ kind: "portion", amount: 40 }, { kind: "pack", amount: 400 }, { kind: "hundred", amount: 100 }]);
    // a pack bigger than anyone eats at once, or in the wrong unit, isn't offered
    expect(amountChoices({ per: "g", size: "2kg", portion: "" })).toEqual([{ kind: "hundred", amount: 100 }]);
    expect(amountChoices({ per: "ml", size: "400g", portion: "30g" })).toEqual([{ kind: "hundred", amount: 100 }]);
    expect(startAmount({ per: "g", size: "400g", portion: "40g" })).toBe(40);
    expect(startAmount({ per: "g", size: "400g", portion: "" })).toBe(100);
    expect(startAmount({ per: "g", size: "10x36g", portion: "" })).toBe(36); // one sachet of ten (founder 2026-11-20: scan the box, add what you had)
    // a label for the cooked or prepared food: never the dry pack's weight (the 30-person meeting, 21 November 2026, Grace)
    expect(amountChoices({ per: "g", size: "500g", portion: "", state: "cooked" })).toEqual([{ kind: "hundred", amount: 100 }]);
    expect(amountChoices({ per: "g", size: "4 x 125g", portion: "", state: "prepared" })).toEqual([{ kind: "hundred", amount: 100 }]);
    expect(amountChoices({ per: "g", size: "500g", portion: "75g", state: "cooked" })).toEqual([{ kind: "portion", amount: 75 }, { kind: "hundred", amount: 100 }]);
    expect(startAmount({ per: "g", size: "10x36g", portion: "", state: "cooked" })).toBe(100);
    expect(amountChoices({ per: "g", size: "500g", portion: "", state: "" })).toEqual([{ kind: "pack", amount: 500 }, { kind: "hundred", amount: 100 }]);
  });
});

describe("How much? (founder 2026-11-20: a scanned product's amount, with − and +)", () => {
  it("steps 5 at a time below 50, 10 up to 500 and 50 above, landing on a round amount", () => {
    expect(stepAmount(30, 1)).toBe(35);
    expect(stepAmount(37, 1)).toBe(40);
    expect(stepAmount(37, -1)).toBe(35);
    expect(stepAmount(45, 1)).toBe(50);
    expect(stepAmount(50, 1)).toBe(60);
    expect(stepAmount(50, -1)).toBe(45);
    expect(stepAmount(100, -1)).toBe(90);
    expect(stepAmount(330, 1)).toBe(340);
    expect(stepAmount(500, 1)).toBe(550);
    expect(stepAmount(500, -1)).toBe(490);
  });
  it("stays between the least and the most, and starts from nothing typed", () => {
    expect(stepAmount(5, -1)).toBe(MIN_AMOUNT);
    expect(stepAmount(1, -1)).toBe(MIN_AMOUNT);
    expect(stepAmount(MAX_AMOUNT, 1)).toBe(MAX_AMOUNT);
    expect(stepAmount(null, 1)).toBe(5);
    expect(stepAmount(null, -1)).toBe(MIN_AMOUNT);
  });
  it("draws the ring from the grams themselves, adding to 1, and nothing when there are none", () => {
    expect(macroShares({ protein: 10, carbs: 30, fat: 10 })).toEqual({ protein: 0.2, carbs: 0.6, fat: 0.2 });
    expect(macroShares({ protein: 0, carbs: 0, fat: 0 })).toEqual({ protein: 0, carbs: 0, fat: 0 });
    expect(macroShares({ protein: undefined, carbs: 4, fat: undefined })).toEqual({ protein: 0, carbs: 1, fat: 0 });
  });
});
