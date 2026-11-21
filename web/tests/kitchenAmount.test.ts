import { describe, expect, it } from "vitest";
import { kitchenSize, methodAmount, placeAmounts, scaleMethodStep, spoonText } from "../lib/mm/kitchenAmount";
import { scaleServings } from "../lib/mm/recipes";
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

// Review of 17 Nov: a step's own words must never contradict the amount placed beside them.
const show = (r: { pieces: ReturnType<typeof placeAmounts>["pieces"] }) => r.pieces.map((p) => ("amount" in p ? `[${p.amount}]` : p.text)).join("");
const yogurt = { key: "y", pantry: "natural-yogurt", label: "Natural yogurt", amount: { full: "50 g", short: "50 g" } };
const oil = { key: "o", pantry: "vegetable-oil", label: "Vegetable or sunflower oil", amount: { full: "2 tbsp, 30 ml", short: "2 tbsp" } };
const salt = { key: "s", pantry: "salt", label: "Salt", amount: { full: "a pinch", short: "a pinch" } };
const pepper = { key: "p", pantry: "black-pepper", label: "Ground black pepper", amount: { full: "½ tsp, 1 g", short: "½ tsp" } };

describe("words in the step that measure part of an ingredient", () => {
  it("says the amount is the recipe's total after 'half the', 'most of the', '20 ml of the'", () => {
    expect(show(placeAmounts("Stir half the yogurt until smooth.", [yogurt]))).toBe("Stir half the yogurt[50 g in all] until smooth.");
    expect(show(placeAmounts("Toss with 20 ml of the oil.", [oil]))).toBe("Toss with 20 ml of the oil[2 tbsp vegetable or sunflower oil in all].");
    expect(show(placeAmounts("Heat most of the oil.", [oil]))).toBe("Heat most of the oil[2 tbsp vegetable or sunflower oil in all].");
    expect(show(placeAmounts("Stir in the yogurt.", [yogurt]))).toBe("Stir in the yogurt[50 g].");
  });
  it("also after 'a small spoonful of', 'a big handful of', 'a spoonful each of A and B' and a large scaled 'N ml of the oil'", () => {
    expect(show(placeAmounts("Add a small spoonful of yogurt on the side.", [yogurt]))).toBe("Add a small spoonful of yogurt[50 g in all] on the side.");
    expect(show(placeAmounts("Top with a big spoonful of yogurt.", [yogurt]))).toBe("Top with a big spoonful of yogurt[50 g in all].");
    expect(show(placeAmounts("Scatter over a heaped handful of yogurt.", [yogurt]))).toBe("Scatter over a heaped handful of yogurt[50 g in all].");
    const salsa = { key: "x", pantry: "salsa", label: "Salsa", amount: { full: "200 g", short: "200 g" } };
    expect(show(placeAmounts("Add a spoonful each of salsa and yogurt.", [salsa, yogurt]))).toBe("Add a spoonful each of salsa[200 g in all] and yogurt[50 g in all].");
    expect(show(placeAmounts("Pour in 80\u00a0ml of the oil.", [oil]))).toBe("Pour in 80\u00a0ml of the oil[2 tbsp vegetable or sunflower oil in all].");
    expect(show(placeAmounts("Add the salsa and yogurt.", [salsa, yogurt]))).toBe("Add the salsa[200 g] and yogurt[50 g].");
  });
  it("also after 'two thirds of the', 'three quarters of the', 'a few drops of', 'a thin layer of' and 'a little more salt or'", () => {
    const mince = { key: "m", pantry: "mincemeat", label: "Mincemeat", amount: { full: "1½ tbsp, 30 g", short: "1½ tbsp" } };
    expect(show(placeAmounts("Stir in two thirds of the mincemeat for 1 minute.", [mince]))).toBe("Stir in two thirds of the mincemeat[1½ tbsp, 30 g in all] for 1 minute.");
    expect(show(placeAmounts("Stir in two-thirds of the mincemeat.", [mince]))).toBe("Stir in two-thirds of the mincemeat[1½ tbsp, 30 g in all].");
    expect(show(placeAmounts("Stir in three quarters of the yogurt.", [yogurt]))).toBe("Stir in three quarters of the yogurt[50 g in all].");
    const lemon = { key: "l", pantry: "lemon-juice", label: "Lemon juice", amount: { full: "4 tbsp, 60 ml", short: "4 tbsp" } };
    expect(show(placeAmounts("Sprinkle a few drops of lemon juice over each bite.", [lemon]))).toBe("Sprinkle a few drops of lemon juice[4 tbsp, 60 ml in all] over each bite.");
    expect(show(placeAmounts("Spread a thin layer of yogurt over each slice.", [yogurt]))).toBe("Spread a thin layer of yogurt[50 g in all] over each slice.");
    expect(show(placeAmounts("Spread a very thin layer of yogurt over the cheese.", [yogurt]))).toBe("Spread a very thin layer of yogurt[50 g in all] over the cheese.");
    expect(show(placeAmounts("Taste and add a little more salt or black pepper if it needs it.", [pepper]))).toBe("Taste and add a little more salt or black pepper[½ tsp, 1 g in all] if it needs it.");
  });
  it("leaves 'a pinch of' as the step says it, with no spoon amount beside it", () => {
    const r = placeAmounts("Add a pinch of black pepper and stir.", [pepper]);
    expect(show(r)).toBe("Add a pinch of black pepper and stir.");
    expect(r.unplaced).toEqual([]);
    expect(show(placeAmounts("Toss with a pinch of salt and black pepper.", [salt, pepper]))).toBe("Toss with a pinch of salt and black pepper.");
    expect(show(placeAmounts("Add a good grind of black pepper.", [pepper]))).toBe("Add a good grind of black pepper.");
  });
  it("puts a shared bracket after 'salt and pepper', whatever the order of the ingredients", () => {
    const want = "Add salt and pepper[a pinch of salt, ½ tsp ground black pepper] to taste.";
    expect(show(placeAmounts("Add salt and pepper to taste.", [salt, pepper]))).toBe(want);
    expect(show(placeAmounts("Add salt and pepper to taste.", [pepper, salt]))).toBe("Add salt and pepper[½ tsp ground black pepper, a pinch of salt] to taste.");
  });
  it("keeps 'slices', 'strips' and 'wedges' with the name", () => {
    const ham = { key: "h", pantry: "ham", label: "Ham", amount: { full: "60 g", short: "60 g" } };
    expect(show(placeAmounts("Peel the ham slices apart.", [ham]))).toBe("Peel the ham slices[60 g] apart.");
  });
});

describe("oil measured in a step follows the servings in spoons", () => {
  it("scales 'N ml of the oil' exactly, and water by the usual rule", () => {
    expect(scaleMethodStep("Heat 20 ml of the oil and 800 ml of water.", 1, 4)).toBe("Heat 1 tsp of the oil and 200 ml of water.");
    expect(scaleMethodStep("Toss with the last 5 ml of oil.", 1, 4)).toBe("Toss with the last ¼ tsp of oil.");
    expect(scaleMethodStep("Toss with the last 5 ml of oil.", 8, 4)).toBe("Toss with the last 2 tsp of oil.");
    expect(scaleMethodStep("Heat 20 ml of the oil.", 4, 4)).toBe("Heat 20 ml of the oil.");
    expect(scaleMethodStep("Heat 40 ml of the oil.", 12, 4)).toBe("Heat 120\u00a0ml of the oil."); // scaled once, never again as water
  });
});

describe("every recipe's method, as the page shows it", () => {
  const render = (n: number) => {
    const out: Array<{ id: string; text: string; scaled: boolean }> = [];
    for (const r of RECIPES) {
      const v = scaleServings(r, n);
      const uses = firstMentions(r.method, v.ingredients);
      const byKey = new Map(v.ingredients.map((s) => [s.key, s]));
      r.method.forEach((step, i) => {
        const { text } = splitStep(scaleMethodStep(step, v.servings, r.servings));
        const items = (uses.get(i) ?? []).map((key) => {
          const spec = byKey.get(key)!;
          const count = spec.note && /^about \d/.test(spec.note) ? spec.note : null;
          return { key, pantry: spec.original?.pantry ?? spec.pantry, label: spec.label, amount: methodAmount(spec, count, `${spec.amount} ${spec.unit}`) };
        });
        out.push({ id: `${r.id} @${n} step ${i + 1}`, text: show(placeAmounts(text, items)), scaled: v.servings !== r.servings });
      });
    }
    return out;
  };
  const steps = [1, 2, 4, 12].flatMap(render);
  it("never puts a measured amount after 'a pinch of' or 'a grind of'", () => {
    expect(steps.filter((s) => /\b(?:pinch|grind)(?: each)? of (?:the )?(?:salt and )?(?:ground )?[a-z]+(?: [a-z]+)?\[/i.test(s.text)).map((s) => `${s.id}: ${s.text}`)).toEqual([]);
  });
  it("marks the total after words that take only part of it", () => {
    // every partial word the book uses, spelt with or without a hyphen ("two thirds of the mincemeat", "a few drops of lemon juice", "a thin layer of soft cheese")
    const partial = /\b(?:half|most|two[- ]thirds|three[- ]quarters|(?:a|one) (?:third|quarter)|a little(?: more)?|a few(?: (?:drops|specks))?|some|a splash|a (?:very )?thin layer|a (?:[a-z]+ )?(?:spoonful|handful|drizzle|sprinkle)(?: each)?|the rest|(?:the )?remaining|another|\d+[ \u00a0](?:ml|g|tsp|tbsp))(?: of)?(?: the)? (?:salt (?:or|and) )?(?!each\b)[a-z]+(?: [a-z]+)?\[(?![^\]]*in all\])/i;
    expect(steps.filter((s) => partial.test(s.text)).map((s) => `${s.id}: ${s.text}`)).toEqual([]);
    // "a spoonful each of salsa and yogurt": every name in that list is part of the whole
    expect(steps.filter((s) => /\beach of [^.[]*\[[^\]]*in all\](?:,| and) [a-z]+(?: [a-z]+)?\[(?![^\]]*in all\])/i.test(s.text)).map((s) => `${s.id}: ${s.text}`)).toEqual([]);
  });
  it("never says more oil in a step than the recipe has: no 'N ml of the oil' once the servings change", () => {
    expect(steps.filter((s) => s.scaled && /\d ml of (?:the )?oil\b/.test(s.text)).map((s) => `${s.id}: ${s.text}`)).toEqual([]);
  });
  it("puts a shared salt-and-pepper bracket after both words, and never inside a name", () => {
    expect(steps.filter((s) => /\bsalt\[[^\]]*\] and pepper|\] (?:slices|strips|wedges)\b/.test(s.text)).map((s) => `${s.id}: ${s.text}`)).toEqual([]);
  });
});

// The everyday size beside each weight in the ingredient list (founder 2026-11-21: "80 grams slash half a pepper ... salt and herbs and stuff, you can use
// teaspoons")
describe("the everyday size in the ingredient list", () => {
  const size = (amount: number, pantry: string, unit: "g" | "ml" = "g", countsOk = true) => kitchenSize({ amount, unit, pantry }, countsOk);
  it("says pieces of vegetables and fruit: halves and quarters of a cut one, whole ones counted", () => {
    expect(size(80, "peppers")).toEqual({ text: "½ pepper", spoon: false });
    expect(size(160, "peppers")).toEqual({ text: "1 pepper", spoon: false });
    expect(size(75, "cucumber")).toEqual({ text: "¼ cucumber", spoon: false });
    expect(size(225, "onion")).toEqual({ text: "1½ onions", spoon: false });
    expect(size(10, "fresh-garlic")).toEqual({ text: "2 cloves", spoon: false });
    expect(size(50, "broccoli")).toEqual({ text: "3 florets", spoon: false });
    expect(size(120, "eggs")).toEqual({ text: "2 eggs", spoon: false });
    expect(size(30, "spinach")).toEqual({ text: "a handful", spoon: false });
  });
  it("gives salt, spices, dried herbs and oils in level spoons, said first", () => {
    expect(size(6, "salt")).toEqual({ text: "1 tsp", spoon: true });
    expect(size(1, "oregano")).toEqual({ text: "1 tsp", spoon: true });
    expect(size(2, "dill")).toEqual({ text: "2 tsp", spoon: true });
    expect(size(15, "olive-oil", "ml")).toEqual({ text: "1 tbsp", spoon: true });
    expect(size(1, "black-pepper")).toEqual({ text: "½ tsp", spoon: true });
  });
  it("says nothing for what has no everyday size, a sliver too small to count, or a product in much smaller pieces", () => {
    expect(size(120, "rice")).toBeNull();
    expect(size(200, "milk", "ml")).toBeNull();
    expect(size(20, "peppers")).toBeNull();
    expect(size(85, "tomatoes", "g", false)).toBeNull();
  });
});
