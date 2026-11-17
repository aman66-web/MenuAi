import { describe, expect, it } from "vitest";
import type { CompareItem } from "../lib/mm/compare";
import {
  canonicalize, checkPick, comparable, dietWords, flipPick, MAX_DEVICE_PICKS, pickKey, reasonFor, reasonLine, rememberPick, resolvePick, sanitizeComparePicks,
  toPickItem, validSentence, type PickInput, type PickItem, type StoredPick,
} from "../lib/mm/comparePick";
import type { Preferences } from "../lib/mm/types";

const item = (id: string, kcal: number, protein: number | null, extra: Omit<Partial<PickItem>, "numbers"> & { numbers?: Partial<PickItem["numbers"]> } = {}): PickItem => ({
  key: `food:sainsburys:${id}`, kind: "food", name: `Beans ${id}`, from: "Sainsbury's", basis: "g", perKg: null,
  ...extra,
  numbers: { kcal, protein, carbs: 12, sugars: 4.7, fat: 0.4, saturates: 0.1, fibre: 3.8, salt: 0.6, ...extra.numbers },
});
const input = (a: PickItem, b: PickItem, goal: PickInput["goal"] = "lose", diet: PickInput["diet"] = []): PickInput => ({ items: [a, b], goal, diet });

const A = item("a", 100, 10, { numbers: { sugars: 4.7, salt: 0.58, saturates: 0.1, fibre: 6.1, fat: 0.4 } });
const B = item("b", 200, 12, { numbers: { sugars: 9.2, salt: 1.08, saturates: 1.4, fibre: 3.8, fat: 3.9 } });
const SAY = "Pip would reach for the beans with more protein for their calories.";

describe("pick key", () => {
  it("is the same whichever item was added first, and is a SHA-256 hex", async () => {
    const k = await pickKey(input(A, B));
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(await pickKey(input(B, A))).toBe(k);
  });
  it("changes when a figure, a name, the price, the goal or the diet changes", async () => {
    const k = await pickKey(input(A, B));
    const differs = async (i: PickInput) => expect(await pickKey(i)).not.toBe(k);
    await differs(input({ ...A, numbers: { ...A.numbers, kcal: 101 } }, B));
    await differs(input(A, { ...B, numbers: { ...B.numbers, protein: 12.5 } }));
    await differs(input(A, { ...B, numbers: { ...B.numbers, salt: null } }));
    await differs(input({ ...A, perKg: 4.2 }, B));
    await differs(input({ ...A, name: "Other beans" }, B));
    await differs(input(A, { ...B, key: "food:sainsburys:c" }));
    await differs(input(A, B, "buildMuscle"));
    await differs(input(A, B, "lose", ["vegan"]));
  });
  it("does not depend on the order the diet words came in", async () => {
    expect(await pickKey(input(A, B, "lose", ["vegan", "halal"]))).toBe(await pickKey(input(A, B, "lose", ["halal", "vegan"])));
  });
  it("flips the pick with the order and leaves a tie alone", () => {
    const one = canonicalize(input(A, B));
    const two = canonicalize(input(B, A));
    expect(one.items.map((i) => i.key)).toEqual(two.items.map((i) => i.key));
    expect(one.flipped).not.toBe(two.flipped);
    const p: StoredPick = { pick: 0, sentence: SAY, reasons: ["moreProtein"] };
    expect(flipPick(p, false).pick).toBe(0);
    expect(flipPick(p, true).pick).toBe(1);
    expect(flipPick({ ...p, pick: "tie" }, true).pick).toBe("tie");
  });
});

describe("pick: what two items can be compared", () => {
  it("needs the same basis, kind and note", () => {
    expect(comparable(A, B)).toBe(true);
    expect(comparable(A, { ...B, basis: "ml" })).toBe(false);
    expect(comparable(A, { ...B, note: "cooked" })).toBe(false);
    expect(comparable({ ...A, note: "cooked" }, { ...B, note: "cooked" })).toBe(true);
    expect(comparable(A, { ...B, kind: "dish", basis: "serving" })).toBe(false);
  });
  it("builds an item from the Compare list without anything about the person", () => {
    const c: CompareItem = {
      key: "food:sainsburys:a", kind: "food", name: "Beans a", from: "Sainsbury's", fromId: "sainsburys", href: "/app/groceries/shop/item?r=sainsburys&id=a",
      basis: "g", source: "label", addedAt: "2026-11-17T10:00:00.000Z", price: 0.85, unitPrice: 2.05, unit: "per kg", photo: "/grocery-images/x.webp",
      numbers: { kcal: 78, protein: 4.7, carbs: 12, sugars: 4.7, fat: 0.4, saturates: null, fibre: 3.8, salt: 0.6 },
    };
    const p = toPickItem(c);
    expect(p).toEqual({ key: "food:sainsburys:a", kind: "food", name: "Beans a", from: "Sainsbury's", basis: "g", numbers: c.numbers, perKg: 2.05 });
    expect(JSON.stringify(p)).not.toMatch(/photo|href|addedAt|price"/);
    expect(toPickItem({ ...c, basis: "ml" }).perKg).toBeNull(); // per kg doesn't match a per 100 ml label
    expect(toPickItem({ ...c, note: "cooked" }).note).toBe("cooked");
  });
  it("words the diet choices as context", () => {
    const base = { vegetarianOnly: false, noPork: false, noBeef: false } as Preferences;
    expect(dietWords(base)).toEqual([]);
    expect(dietWords({ ...base, vegetarianOnly: true, noPork: true, halalOnly: true })).toEqual(["halal", "no pork", "vegetarian"]);
  });
});

describe("pick: Pip's sentence", () => {
  it("accepts a plain short sentence in any wording that passes", () => {
    expect(validSentence(SAY)).toBe(SAY);
    expect(validSentence("  Pip likes   the oat bar: it keeps protein high for its calories! ")).toBe("Pip likes the oat bar: it keeps protein high for its calories!");
    expect(validSentence("Pip likes the Nestlé bar for its protein.")).not.toBeNull();
    expect(validSentence("These are very close for your goal.")).not.toBeNull();
  });
  it("refuses digits, symbols, links and markup", () => {
    for (const s of [
      "This one has 4 g more protein than the other one.", "That is 20% more protein for you.", "Pip picks the £2 beans, they are cheaper.",
      "Pip likes these beans, see numbite.com for more.", "Visit www example for more beans please.", "Pip <b>loves</b> these beans a lot really.", "Pip picks beans/peas over the rest.",
    ]) expect(validSentence(s), s).toBeNull();
  });
  it("refuses good, bad, healthy and medical wording (CLAUDE.md rule 3)", () => {
    for (const s of [
      "Pip says this is a healthy choice for you.", "This one is good for you and your goal.", "This one is bad for your goal really.", "A clean pick for you right here.",
      "That one is junk compared to these beans.", "A guilt free pick for your goal here.", "A real superfood pick for you here.", "This will help with your diabetes goal.",
      "Pip says it can cure your hunger well.", "Good for your heart and your goal.", "Pip would not worry about your doctor here.", "Great for your GLP-1 medication plan.",
      "Pip thinks it is the worse one for your goal.", "A nutritious pick for your goal here.", "Better for your health and your goal.",
    ]) expect(validSentence(s), s).toBeNull();
  });
  it("refuses positions and spelled-out numbers", () => {
    for (const s of ["Pip picks the first one for your goal.", "The one on the left suits your goal.", "Pip picks the second tin for you.", "That one has twice the protein you need.", "Pip picks the right one for you."])
      expect(validSentence(s), s).toBeNull();
  });
  it("refuses every spelled-out number, fraction and quantity, not only two to ten", () => {
    for (const s of [
      "Go with the beans: twenty grams more protein for your goal.", "The chicken wrap has eleven grams more protein for your goal.",
      "The yogurt has a third of the sugar for your goal.", "The soup has zero sugar, which suits your goal.", "Pick the beans, a quarter of the fat.",
      "The wrap has fifty fewer calories for your goal.", "The oats have nineteen more grams of fibre here.", "The bar has a million reasons to win today.",
      "The beans have ninety per cent less salt for you.", "The yogurt has one gram less sugar for your goal.", "The soup has a gram less salt for your goal.",
      "The beans have a fifth of the fat for your goal.", "The wrap has thirteen grams more protein for building muscle.",
    ]) expect(validSentence(s), s).toBeNull();
    // the "-fold" multiples, the British "gramme", "an extra gram" and the ordinals above tenth are figures too
    for (const s of [
      "The beans have fourfold the fibre for your goal.", "The wrap has twofold the protein for your goal.", "The oats have a tenfold lead on fibre here.",
      "The soup has one gramme less salt for your goal.", "The yogurt has two grammes more protein for you.", "The yogurt has a hundredth of the fat for you.",
      "The wrap has an extra gram of protein here.", "The bar has an eleventh of the sugar for you.", "The soup has a twentieth of the salt for you.",
      "The beans have a single extra calorie for your goal.", "The drink has one more millilitre than the other.",
    ]) expect(validSentence(s), s).toBeNull();
    // inflections of the multiples, "fourth", "one fewer <unit>" and "a couple of <unit>" are figures too
    for (const s of [
      "The beans have a fourth of the fat for your goal.", "The soup has three fourths of the salt here.", "The beans have doubled the fibre for your goal.",
      "The oats have tripled the fibre for your goal.", "The wrap quadrupled the protein for your goal.", "The wrap doubles the protein for your goal.",
      "Doubling the protein suits your goal here.", "The beans trebled the fibre for your goal.", "Halving the sugar suits your goal here.",
      "The wrap has one fewer calorie for your goal.", "The soup has one less gram of salt here.", "The bar has a fewer calorie count for you.",
      "The wrap has a couple of grams more protein here.", "The wrap has a couple grams more protein here.",
    ]) expect(validSentence(s), s).toBeNull();
    // "a couple" with extra/more/fewer/less/additional, "additional" after one/a/an, hyphenated forms and "trillion" are figures too
    for (const s of [
      "Pip picks the wrap for a couple more grams of protein.", "Pip picks the wrap for a couple of extra grams of protein.", "Pip picks the wrap for a couple more calories.",
      "Pip picks the wrap for a couple fewer calories.", "Pip picks the wrap for a couple less grams of sugar.", "Pip picks the wrap for a couple of additional grams of protein.",
      "Pip picks the wrap for its one-gram protein lead.", "Pip picks the wrap, a single-calorie gap aside.", "Pip picks the wrap for an additional gram of protein.",
      "Pip picks the wrap for one additional calorie.", "Pip picks the wrap at a trillion calories less.", "Pip picks the wrap for trillions of reasons.",
      "Pip picks the wrap for its a couple-gram lead.", "Pip picks the wrap for one extra-gram of protein.", "Pip picks the wrap for a single-gramme lead in protein.",
    ]) expect(validSentence(s), s).toBeNull();
    // the words alone are not figures
    for (const s of ["Pip picks the wrap for the extra protein.", "Pip picks the wrap for additional protein for your goal.", "Pip picks the wrap: a couple of reasons suit your goal."])
      expect(validSentence(s), s).not.toBeNull();
    // "one" on its own is not a figure ("this one", "the one with ...")
    expect(validSentence("Pip picks the one with more protein for your goal.")).not.toBeNull();
  });
  it("refuses nutrition and diet claims the recipe text also refuses (CLAUDE.md rule 3)", () => {
    for (const s of [
      "Pick the oats: they're more nourishing and full of vitamins.", "The salad is lighter and leaner for losing weight.", "The chicken is a high-protein, low-calorie option for slimming.",
      "The lean mince suits your goal nicely.", "The yogurt is rich in protein for your goal.", "The bar is low in sugar for your goal.", "A smart pick for your goal here.",
      "The beans are packed with minerals for you.", "The drink is sugar-free for your goal.", "The soup is low-fat for your goal today.",
    ]) expect(validSentence(s), s).toBeNull();
    // a pick for the person's goal is the point of the feature
    expect(validSentence("The wrap is the better pick for losing weight.")).not.toBeNull();
    expect(validSentence("Pip picks the light mayo for its fewer calories.")).not.toBeNull(); // "light" alone can be a product's own name
  });
  it("lets Pip name either product by its own name, even when the name holds a claim or number word", () => {
    const lighter = ["Cathedral City Lighter Mature Cheddar 350g", "Cathedral City Mature Cheddar 350g"];
    expect(validSentence("Pip picks the Cathedral City Lighter for your goal.")).toBeNull(); // without the names it is a claim
    expect(validSentence("Pip picks the Cathedral City Lighter for your goal.", lighter)).toBe("Pip picks the Cathedral City Lighter for your goal.");
    expect(validSentence("Pip picks the cathedral city lighter cheddar for your goal.", lighter)).not.toBeNull(); // any case
    expect(validSentence("Pip picks the Lighter for your goal.", lighter)).not.toBeNull(); // one capitalised word of the name
    expect(validSentence("Pip picks the Philadelphia Lightest for your goal.", ["Philadelphia Lightest Soft Cheese 180g", "Philadelphia Original 180g"])).not.toBeNull();
    expect(validSentence("Pip picks the still mineral water for your goal.", ["Highland Spring Still Mineral Water 1.5L", "Sainsbury's Lemonade 2L"])).not.toBeNull();
    expect(validSentence("Pip picks the Smarties for your goal today.", ["Nestlé Smarties Milk Chocolate 38g", "Maltesers 37g"])).not.toBeNull();
    expect(validSentence("Pip picks the Quarter Pounder for your goal.", ["Quarter Pounder with Cheese", "McPlant"])).not.toBeNull();
    expect(validSentence("Pip picks the double cream for your goal.", ["Sainsbury's Double Cream 300ml", "Sainsbury's Single Cream 300ml"])).not.toBeNull();
  });
  it("still refuses claims and figures beside a product's name, and never lets a name carry rule 3 words", () => {
    const lighter = ["Cathedral City Lighter Mature Cheddar 350g", "Cathedral City Mature Cheddar 350g"];
    for (const s of [
      "The Cathedral City Lighter is lighter for your goal.", // the second "lighter" is Pip's own claim
      "The Cathedral City Lighter has a quarter of the fat.",
      "The Cathedral City Lighter is a healthy pick for you.",
      "The Cathedral City Lighter is the first one to pick.",
      "The Cathedral City Lighter has 30 percent less fat.",
      "Pip says the oats. Lighter suits your goal.", // a capital at the start of a sentence is not a name
      "Lighter is what suits your goal here.",
    ]) expect(validSentence(s, lighter), s).toBeNull();
    // a word of the name that is a figure is never a name on its own, and a run of the name needs a word that is not a figure, a claim or a nutrient
    expect(validSentence("Pip picks the Double for your goal.", ["Sainsbury's Double Cream 300ml", "Single Cream"])).toBeNull();
    expect(validSentence("The yogurt is low fat for your goal.", ["Sainsbury's Low Fat Natural Yogurt 500g", "Greek Style Yogurt"])).toBeNull();
    expect(validSentence("The one with half fat suits your goal.", ["Half Fat Creme Fraiche 300ml", "Creme Fraiche 300ml"])).toBeNull();
    expect(validSentence("Pip picks the half fat creme fraiche here.", ["Half Fat Creme Fraiche 300ml", "Creme Fraiche 300ml"])).not.toBeNull();
    // rule 3 and medical words stay refused even in a product's own name
    expect(validSentence("Pip picks the Heart Healthy oats for your goal.", ["Heart Healthy Oats 500g", "Porridge Oats 1kg"])).toBeNull();
    // a one-word name never whitelists the word in lower case
    expect(validSentence("The salad is lighter for your goal.", ["Lighter", "Salad"])).toBeNull();
  });
  it("keeps it short: 3 to 25 words", () => {
    expect(validSentence(Array(25).fill("word").join(" "))).not.toBeNull();
    expect(validSentence(Array(26).fill("word").join(" "))).toBeNull();
    expect(validSentence("Pip picks")).toBeNull();
    expect(validSentence("")).toBeNull();
    expect(validSentence(12 as unknown)).toBeNull();
    expect(validSentence(null)).toBeNull();
  });
});

describe("pick: the reason lines come from the figures", () => {
  it("works out protein for the calories, calories, salt, sugar, saturates, fibre, fat and protein", () => {
    expect(reasonFor("moreProteinPerKcal", A, B)).toEqual({ key: "moreProteinPerKcal", n: 4, per: "100kcal" }); // 10 vs 6 g per 100 kcal
    expect(reasonFor("fewerKcal", A, B)).toEqual({ key: "fewerKcal", n: 100, per: "100g" });
    expect(reasonFor("lessSalt", A, B)).toEqual({ key: "lessSalt", n: 0.5, per: "100g" });
    expect(reasonFor("lessSugar", A, B)).toEqual({ key: "lessSugar", n: 4.5, per: "100g" });
    expect(reasonFor("lessSatFat", A, B)).toEqual({ key: "lessSatFat", n: 1.3, per: "100g" });
    expect(reasonFor("moreFibre", A, B)).toEqual({ key: "moreFibre", n: 2.3, per: "100g" });
    expect(reasonFor("lessFat", A, B)).toEqual({ key: "lessFat", n: 3.5, per: "100g" });
    expect(reasonFor("moreProtein", B, A)).toEqual({ key: "moreProtein", n: 2, per: "100g" });
  });
  it("works out what 100 g of protein costs from the shop's price per kg", () => {
    const cheap = item("c", 120, 20, { perKg: 8 }); // £8/kg over 200 g of protein per kg = £4.00 per 100 g of protein
    const dear = item("d", 120, 10, { perKg: 6 }); // £6/kg over 100 g of protein per kg = £6.00
    expect(reasonFor("cheaperProtein", cheap, dear)).toEqual({ key: "cheaperProtein", n: 2, per: "100gProtein" });
    expect(reasonFor("cheaperProtein", dear, cheap)).toBeNull();
    expect(reasonFor("cheaperProtein", cheap, item("e", 1, 10))).toBeNull(); // no price on one of them
  });
  it("says nothing when the picked item is not ahead, a figure is missing, or rounding hides the gap", () => {
    expect(reasonFor("fewerKcal", B, A)).toBeNull();
    expect(reasonFor("lessSugar", A, item("n", 100, 10, { numbers: { sugars: null } }))).toBeNull();
    expect(reasonFor("lessSugar", item("m", 100, 10, { numbers: { sugars: null } }), A)).toBeNull();
    expect(reasonFor("lessSalt", A, item("o", 100, 10, { numbers: { salt: 0.5804 } }))).toBeNull(); // 0.0004 g is not a gap
    expect(reasonFor("moreProtein", A, item("p", 100, 10))).toBeNull(); // equal
    expect(reasonFor("moreProteinPerKcal", item("q", 100, null), A)).toBeNull();
  });
  it("works the gap out from the figures as the table prints them, so a line never claims a gap the table doesn't show", () => {
    expect(reasonFor("fewerKcal", item("r", 99.6, 10), item("s", 100.4, 10))).toBeNull(); // both print as 100 kcal
    expect(reasonFor("fewerKcal", item("t", 99.4, 10), item("u", 100.5, 10))).toEqual({ key: "fewerKcal", n: 2, per: "100g" }); // 99 and 101 in the table
    expect(reasonFor("lessSalt", item("v", 100, 10, { numbers: { salt: 1.226 } }), item("w", 100, 10, { numbers: { salt: 1.234 } }))).toBeNull(); // both print 1.23
    expect(reasonFor("lessFat", item("x", 100, 10, { numbers: { fat: 0 } }), item("y", 100, 10, { numbers: { fat: 1.06 } }))).toEqual({ key: "lessFat", n: 1.06, per: "100g" });
    expect(reasonFor("moreProtein", item("z", 100, 4.734), item("zz", 100, 0.2))).toEqual({ key: "moreProtein", n: 4.53, per: "100g" }); // 4.73 - 0.2
  });
  it("writes the line in words with the figure in it, per the label's basis", () => {
    expect(reasonLine({ key: "moreProteinPerKcal", n: 4.2, per: "100kcal" })).toBe("4.2 g more protein per 100 kcal");
    expect(reasonLine({ key: "lessSalt", n: 0.5, per: "100g" })).toBe("0.5 g less salt per 100 g");
    expect(reasonLine({ key: "lessSugar", n: 4.5, per: "100ml" })).toBe("4.5 g less sugar per 100 ml");
    expect(reasonLine({ key: "fewerKcal", n: 120, per: "serving" })).toBe("120 fewer kcal per serving");
    expect(reasonLine({ key: "cheaperProtein", n: 1.1, per: "100gProtein" })).toBe("£1.10 less per 100 g of protein");
    expect(reasonLine({ key: "lessSatFat", n: 1.3, per: "100g" })).toBe("1.3 g less saturated fat per 100 g");
    expect(reasonLine({ key: "moreFibre", n: 2.3, per: "100g" })).toBe("2.3 g more fibre per 100 g");
    expect(reasonLine({ key: "lessFat", n: 3.5, per: "serving" })).toBe("3.5 g less fat per serving");
    expect(reasonLine({ key: "moreProtein", n: 2, per: "100g" })).toBe("2 g more protein per 100 g");
  });
});

describe("pick: checking an answer", () => {
  const items = canonicalize(input(A, B)).items;
  const ahead = items[0].key === A.key ? 0 : 1; // the position of A in the canonical order
  it("keeps a pick with the reasons the figures support, in order, once each, at most three", () => {
    const out = checkPick({ pick: ahead, sentence: SAY, reasons: ["fewerKcal", "fewerKcal", "lessSalt", "moreProtein", "lessSugar", "lessFat"] }, items);
    // moreProtein is B's, so it is dropped; the rest are A's
    expect(out).toEqual({ pick: ahead, sentence: SAY, reasons: ["fewerKcal", "lessSalt", "lessSugar"] });
  });
  it("refuses a pick with no reason the figures support, unknown keys, and bad picks", () => {
    expect(checkPick({ pick: ahead, sentence: SAY, reasons: ["moreProtein"] }, items)).toBeNull(); // A is not ahead on protein
    expect(checkPick({ pick: ahead, sentence: SAY, reasons: [] }, items)).toBeNull();
    expect(checkPick({ pick: ahead, sentence: SAY, reasons: ["invented"] }, items)).toBeNull();
    expect(checkPick({ pick: ahead, sentence: SAY }, items)).toBeNull();
    expect(checkPick({ pick: 2, sentence: SAY, reasons: ["fewerKcal"] }, items)).toBeNull();
    expect(checkPick({ pick: "first", sentence: SAY, reasons: ["fewerKcal"] }, items)).toBeNull();
    expect(checkPick(null, items)).toBeNull();
    expect(checkPick("x", items)).toBeNull();
  });
  it("refuses a bad sentence even with good reasons", () => {
    expect(checkPick({ pick: ahead, sentence: "A healthy pick for you and your goal.", reasons: ["fewerKcal"] }, items)).toBeNull();
    expect(checkPick({ pick: ahead, sentence: "It has 100 fewer kcal than the other.", reasons: ["fewerKcal"] }, items)).toBeNull();
  });
  it("lets the sentence name the two products being compared", () => {
    const named = canonicalize(input({ ...A, name: "Cathedral City Lighter Mature Cheddar 350g" }, { ...B, name: "Cathedral City Mature Cheddar 350g" })).items;
    const pos = named[0].name.includes("Lighter") ? 0 : 1;
    const sentence = "Pip picks the Cathedral City Lighter for your goal.";
    expect(checkPick({ pick: pos, sentence, reasons: ["fewerKcal"] }, named)?.sentence).toBe(sentence);
    expect(checkPick({ pick: ahead, sentence, reasons: ["fewerKcal"] }, items)).toBeNull(); // other products: "Lighter" is Pip's claim
  });
  it("lets a tie stand with the sentence only", () => {
    expect(checkPick({ pick: "tie", sentence: "These are very close for your goal.", reasons: ["fewerKcal"] }, items)).toEqual({ pick: "tie", sentence: "These are very close for your goal.", reasons: [] });
  });
});

describe("pick: what the card shows", () => {
  it("names the right item whichever order the person added them in, with the lines worked out from the figures", () => {
    const forward = input(A, B);
    const backward = input(B, A);
    const canon = canonicalize(forward).items;
    const stored: StoredPick = { pick: canon[0].key === A.key ? 0 : 1, sentence: SAY, reasons: ["moreProteinPerKcal", "fewerKcal"] };
    for (const i of [forward, backward]) {
      const flippedStored = flipPick(stored, canonicalize(i).flipped); // as the card gets it: the phone keeps the canonical one
      expect(flippedStored.pick === "tie").toBe(false);
      const shown = resolvePick(stored, i);
      expect(shown?.chosen?.key).toBe(A.key);
      expect(shown?.reasons.map((r) => r.n)).toEqual([4, 100]);
      expect(shown?.sentence).toBe(SAY);
    }
  });
  it("shows a tie with no item and no lines", () => {
    expect(resolvePick({ pick: "tie", sentence: "These are very close for your goal.", reasons: [] }, input(A, B))).toEqual({ chosen: null, sentence: "These are very close for your goal.", reasons: [] });
  });
  it("drops an answer whose reasons the figures no longer support", () => {
    const i = input(A, B);
    const canon = canonicalize(i).items;
    const wrongWay: StoredPick = { pick: canon[0].key === A.key ? 1 : 0, sentence: SAY, reasons: ["fewerKcal"] }; // says B is ahead on calories
    expect(resolvePick(wrongWay, i)).toBeNull();
  });
});

describe("pick: what the phone remembers", () => {
  const key = (n: number) => n.toString(16).padStart(64, "0");
  it("keeps only well-formed entries", () => {
    const ok = { key: key(1), pick: 0, sentence: SAY, reasons: ["fewerKcal"], at: 1 };
    const out = sanitizeComparePicks([
      ok,
      { ...ok, key: "short" },
      { ...ok, key: key(2), sentence: "A healthy choice for your goal, really." },
      { ...ok, key: key(3), pick: 5 },
      { ...ok, key: key(4), reasons: [] }, // a pick needs a reason
      { ...ok, key: key(5), reasons: ["fewerKcal", "made-up", "fewerKcal"] },
      { ...ok, key: key(6), pick: "tie", reasons: ["fewerKcal"] },
      { ...ok, key: key(7), at: "yesterday" },
      ok, // duplicate
      "nonsense",
    ]);
    expect(out.map((e) => e.key)).toEqual([key(1), key(5), key(6)]);
    expect(out[1]!.reasons).toEqual(["fewerKcal"]);
    expect(out[2]!.reasons).toEqual([]);
    expect(sanitizeComparePicks({})).toEqual([]);
    expect(sanitizeComparePicks(null)).toEqual([]);
  });
  it("keeps an answer that names its products, and leaves the name check to the card (resolvePick), which knows the names", () => {
    const sentence = "Pip picks the Cathedral City Lighter for your goal.";
    const kept = sanitizeComparePicks([
      { key: key(1), pick: 0, sentence, reasons: ["fewerKcal"], at: 1 },
      { key: key(2), pick: 0, sentence: "The Cathedral City Lighter is a healthy pick.", reasons: ["fewerKcal"], at: 1 },
      { key: key(3), pick: 0, sentence: "The Cathedral City Lighter has 30 g less fat.", reasons: ["fewerKcal"], at: 1 },
    ]);
    expect(kept.map((e) => e.key)).toEqual([key(1)]);
    const named = input({ ...A, name: "Cathedral City Lighter Mature Cheddar 350g" }, { ...B, name: "Cathedral City Mature Cheddar 350g" });
    const pos = canonicalize(named).items[0].name.includes("Lighter") ? 0 : 1;
    expect(resolvePick({ pick: pos, sentence, reasons: ["fewerKcal"] }, named)?.sentence).toBe(sentence);
    expect(resolvePick({ pick: canonicalize(input(A, B)).items[0].key === A.key ? 0 : 1, sentence, reasons: ["fewerKcal"] }, input(A, B))).toBeNull();
  });
  it("remembers newest first, replaces an older copy and holds at most 200", () => {
    let list = sanitizeComparePicks([]);
    const p: StoredPick = { pick: 0, sentence: SAY, reasons: ["fewerKcal"] };
    for (let n = 0; n < MAX_DEVICE_PICKS + 20; n++) list = rememberPick(list, key(n), p, n);
    expect(list).toHaveLength(MAX_DEVICE_PICKS);
    expect(list[0]!.key).toBe(key(MAX_DEVICE_PICKS + 19));
    expect(list.some((e) => e.key === key(0))).toBe(false);
    list = rememberPick(list, key(100), { ...p, pick: 1 }, 999);
    expect(list[0]).toMatchObject({ key: key(100), pick: 1, at: 999 });
    expect(list.filter((e) => e.key === key(100))).toHaveLength(1);
    expect(list).toHaveLength(MAX_DEVICE_PICKS);
  });
});
