import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanText } from "../lib/mm/aiRecipe";
import { EVERYDAY_KINDS, PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { fitRecipe, ing, isMeatFree, recipeForDiet, recipeTotals, resolveRecipe, MEAL_TYPES } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";

// The rules every recipe in the book follows (lib/mm/recipeBook/index.ts), checked against the real Sainsbury's list.

const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const SAFETY = /(no pink|piping hot|cooked through|flakes|opaque|set\b|until (?:just )?set|golden|pink all the way|cooked all the way)/i;
const NEEDS_SAFETY = new Set(["chicken", "chicken-thigh", "beef-mince", "turkey-mince", "lamb-mince", "bacon", "salmon", "cod", "white-fish", "prawns", "eggs", "beef-steak"]);
// Every food a step names must be bought (founder 2026-10-11: "make sure every recipe is fully complete"): a word in the method -> the pantry kinds
// that can be it. A recipe whose method says "the cumin" must have cumin among its ingredients, so nobody gets home without it.
const ANY_OIL = ["olive-oil", "vegetable-oil", "oil-spray"];
const METHOD_FOODS: Array<[RegExp, string[]]> = [
  [/\bcumin\b/i, ["cumin"]], [/\bpaprika\b/i, ["paprika", "smoked-paprika"]], [/\bcinnamon\b/i, ["cinnamon"]], [/\bturmeric\b/i, ["turmeric"]],
  [/\bcurry powder\b/i, ["curry-powder"]], [/\bchilli powder\b/i, ["chilli-powder"]], [/\bchilli flakes\b/i, ["chilli-flakes"]],
  [/\b(?:black|white) pepper\b|\bsalt and pepper\b|\bseason\b|(?<!fajita )\bseasoning\b/i, ["black-pepper", "white-pepper", "salt"]], [/\bsalt\b/i, ["salt"]],
  [/\bgarlic\b/i, ["garlic"]], [/\bginger\b/i, ["ginger"]], [/\blemon\b/i, ["lemon-juice"]], [/\blime\b/i, ["lime-juice"]],
  [/\bspring onions?\b/i, ["spring-onions"]], [/\bred onions?\b/i, ["red-onion"]], [/(?<!spring |red )\bonions?\b/i, ["onion", "red-onion"]],
  [/\bcarrots?\b/i, ["carrots"]], [/\bcelery\b/i, []], [/(?<!black |white |cayenne |salt and |salt, )\bpeppers?\b(?! sauce)/i, ["peppers"]], [/\bchillies\b|\bchilli\b(?! (?:powder|flakes|sauce|con))/i, ["fresh-chilli", "chilli-flakes", "chilli-powder", "sweet-chilli"]],
  [/\bspinach\b/i, ["spinach"]], [/\bcherry tomatoes\b/i, ["cherry-tomatoes"]], [/\bcucumber\b/i, ["cucumber"]], [/\blettuce\b/i, ["lettuce", "salad-leaves"]],
  [/\b(?:salad )?leaves\b|\brocket\b|\bwatercress\b/i, ["salad-leaves", "lettuce", "spinach"]], [/\bgreen beans\b/i, ["green-beans"]], [/\bbroccoli\b/i, ["broccoli"]],
  [/\bmangetout\b|\bsugar snaps?\b/i, ["mangetout"]], [/\bbeansprouts\b/i, ["beansprouts"]], [/\bmushrooms?\b/i, ["mushrooms"]], [/\bbananas?\b/i, ["banana"]],
  [/\bapples?\b/i, ["apple"]], [/\bcoriander\b/i, ["fresh-coriander"]], [/\bparsley\b/i, ["fresh-parsley"]], [/\bbasil\b(?! pesto)/i, ["fresh-basil", "pesto"]],
  [/\bdill\b/i, ["dill"]], [/\bchives\b/i, ["chives"]], [/\bmint\b/i, ["mint"]], [/\bthyme\b/i, ["thyme"]], [/\brosemary\b/i, ["rosemary"]], [/\boregano\b/i, ["oregano"]],
  [/\b(?:dried |mixed )herbs\b/i, ["mixed-herbs", "oregano", "thyme", "rosemary"]], [/\bsesame\b/i, ["sesame-seeds", "mixed-seeds"]], [/\bmustard\b/i, ["mustard"]],
  [/\bhorseradish\b/i, ["horseradish"]], [/\boil spray\b|\bspray\b/i, ANY_OIL], [/\boil\b/i, ANY_OIL], [/\bstock\b/i, ["stock-cube"]], [/\bhoney\b/i, ["honey"]],
  [/\bvegetables\b/i, ["stir-fry-veg", "mixed-veg", "peas", "broccoli", "green-beans", "carrots", "peppers", "onion", "spinach", "sweetcorn", "mushrooms", "mangetout", "cherry-tomatoes"]],
];
const MENTION_OK = /\b(?:if you like|to taste|a splash of (?:hot )?water|boiling water|the rest|seasoning pack)\b/i;
export function missingFoods(r: { method: string[]; ingredients: Array<{ pantry?: string }> }): string[] {
  const have = new Set(r.ingredients.map((i) => i.pantry ?? ""));
  const out: string[] = [];
  for (const step of r.method) for (const [re, kinds] of METHOD_FOODS) {
    const m = re.exec(step);
    if (m && !kinds.some((k) => have.has(k)) && !(MENTION_OK.test(step) && /water/i.test(m[0]))) out.push(`"${m[0]}" in "${step}"`);
  }
  return out;
}

// And the other way round (founder 2026-10-15): everything bought is used, so nobody pays for an ingredient no step uses. A pantry kind ->
// the ways a step names it: its label's own words, plus "season" for salt and pepper, "oil" for any oil (and "spray" for the oil spray),
// "spices" for a ground spice and "herbs" for dried herbs. Every everyday kind needs an entry (a recipe may only use those).
const SPICES = /\bspices?\b/i;
const SEASON = /(?<!fajita )\bseason(?:ing|ed)?\b/i;
const or = (...res: RegExp[]) => new RegExp(res.map((re) => re.source).join("|"), "i");
const USED_AS: Record<string, RegExp> = {
  // protein and dairy
  chicken: /\bchicken\b/i, "chicken-thigh": /\bchicken\b/i, "beef-mince": /\bmince\b|\bbeef\b/i, salmon: /(?<!smoked )\bsalmon\b|\bfish\b/i,
  "smoked-salmon": /\bsmoked salmon\b/i, tuna: /\btuna\b/i, eggs: /\beggs?\b(?! noodles)/i, cheddar: /\bcheddar\b|(?<!soft |cottage )\bcheese\b(?! sauce)/i,
  mozzarella: /\bmozzarella\b|(?<!soft |cottage )\bcheese\b(?! sauce)/i, milk: /(?<!coconut )\bmilk\b/i, bacon: /\bbacon\b/i, ham: /\bham\b/i,
  "greek-yogurt": /\byogh?urt\b/i, "natural-yogurt": /\byogh?urt\b/i, "soft-cheese": /\bsoft cheese\b/i, "cottage-cheese": /\bcottage cheese\b/i,
  "oat-drink": /\boat drink\b/i,
  // carbs
  rice: /\brice\b(?! noodles)/i, "pasta-long": /\bpasta\b|\bspaghetti\b|\blinguine\b/i, "pasta-shapes": /\bpasta\b|\bpenne\b|\bfusilli\b/i, noodles: /\bnoodles\b/i,
  "egg-noodles": /\bnoodles\b/i, wraps: /\bwraps?\b|\btortillas?\b/i, oats: /\boats\b/i, naan: /\bnaans?\b/i, "new-potatoes": /\bpotato(?:es)?\b/i,
  "wheat-biscuits": /\bbiscuits?\b/i, granola: /\bgranola\b/i,
  // tins and frozen
  "baked-beans": /\bbeans\b/i, chickpeas: /\bchickpeas\b/i, "kidney-beans": /\bbeans\b/i, "chopped-tomatoes": /(?<!cherry |sliced )\btomato(?:es)?\b(?! pur)/i,
  passata: /\bpassata\b/i, sweetcorn: /\bsweetcorn\b/i, peas: /\bpeas\b/i, "coconut-milk": /\bcoconut milk\b/i,
  // sauces, pastes and spreads
  "curry-paste": /\bcurry paste\b/i, "chopped-tomato-puree": /\btomato pur[ée]e\b/i, pesto: /\bpesto\b/i, "light-mayo": /\bmayo(?:nnaise)?\b/i,
  "sweet-chilli": /\bsweet chilli\b/i, "bbq-sauce": /\bbarbecue\b|\bbbq\b/i, salsa: /\bsalsa\b/i, soy: /\bsoy\b/i, honey: /\bhoney\b/i,
  "peanut-butter": /\bpeanut butter\b/i, houmous: /\bhoumous\b/i, "stock-cube": /\bstock\b/i, mustard: /\bmustard\b/i, "fajita-seasoning": /\bfajita seasoning\b/i,
  // oils, seasonings and spices
  "olive-oil": /\boil\b/i, "vegetable-oil": /\boil\b/i, "oil-spray": /\boil\b|\bspray\b/i, salt: or(/\bsalt\b/, SEASON),
  "black-pepper": or(/\bblack pepper\b|\bsalt and pepper\b|\bsalt, pepper\b|\bpepper and salt\b/, SEASON), "mixed-herbs": /\bherbs\b/i,
  "chilli-powder": or(/\bchilli powder\b/, SPICES), paprika: or(/\bpaprika\b/, SPICES), "curry-powder": or(/\bcurry powder\b/, SPICES),
  cinnamon: or(/\bcinnamon\b/, SPICES), oregano: or(/\boregano\b/, /\bherbs\b/), cumin: or(/\bcumin\b/, SPICES), turmeric: or(/\bturmeric\b/, SPICES),
  // fresh vegetables and fruit
  onion: /(?<!spring |red )\bonions?\b/i, "red-onion": /(?<!spring )\bonions?\b/i, garlic: /\bgarlic\b/i, "lemon-juice": /\blemon\b/i, carrots: /\bcarrots?\b/i,
  peppers: /(?<!black |white |salt and |salt, |cayenne )\bpeppers?\b(?! and salt)/i, tomatoes: /(?<!cherry |chopped )\btomato(?:es)?\b(?! pur)/i,
  "cherry-tomatoes": /\bcherry tomato(?:es)?\b|\btomatoes\b/i, cucumber: /\bcucumbers?\b/i, lettuce: /\blettuce\b/i, "salad-leaves": /\bleaves\b/i,
  spinach: /\bspinach\b/i, mushrooms: /\bmushrooms?\b/i, broccoli: /\bbroccoli\b/i, "spring-onions": /\bspring onions?\b/i, "stir-fry-veg": /\bvegetables\b/i,
  banana: /\bbananas?\b/i, apple: /\bapples?\b/i, berries: /\bberries\b/i, raisins: /\braisins\b|\bsultanas\b/i, almonds: /\balmonds\b/i,
};
export function unusedIngredients(r: { method: string[]; ingredients: Array<{ key: string; pantry?: string }> }): string[] {
  return r.ingredients.flatMap((i) => {
    const said = USED_AS[i.pantry ?? ""];
    if (!said) return [`${i.key} (no words for it in USED_AS)`];
    return r.method.some((step) => said.test(step)) ? [] : [i.key];
  });
}

describe("the recipe book", () => {
  it("has unique ids and names", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.name.toLowerCase())).size).toBe(RECIPES.length);
  });

  // founder 2026-10-15: every ingredient can be picked up at a small shop (a Tesco Express, a Sainsbury's Local), not only a big one.
  // Substitutes may be any pantry kind: they are only offered as alternatives.
  it("uses only everyday ingredients that nearly every small shop sells", () => {
    expect([...EVERYDAY_KINDS].filter((k) => !PANTRY.has(k)), "everyday kinds that aren't in the pantry").toEqual([]);
    const other = RECIPES.flatMap((r) => r.ingredients.filter((i) => !EVERYDAY_KINDS.has(i.pantry ?? "")).map((i) => `${r.id}: ${i.pantry ?? i.key}`));
    expect(other).toEqual([]);
  });

  // founder 2026-10-15: a shopper never pays for an ingredient no step uses (the check itself is tested here, so it can't go quiet).
  it("knows how a step names every everyday kind, and catches an ingredient no step uses", () => {
    expect([...EVERYDAY_KINDS].filter((k) => !USED_AS[k]), "everyday kinds with no words in USED_AS").toEqual([]);
    const dish = (method: string[]) => ({ method, ingredients: [ing("rice", 150), ing("salt", 1), ing("black-pepper", 1), ing("onion", 150), ing("spring-onions", 30)] });
    expect(unusedIngredients(dish(["Cook the rice.", "Stir in the spring onions and season to taste."]))).toEqual(["onion"]);
    expect(unusedIngredients(dish(["Cook the rice with the onion.", "Add the spring onions, salt and pepper."]))).toEqual([]);
    expect(unusedIngredients(dish(["Cook the rice with the onion and spring onions.", "Add a pinch of salt."]))).toEqual(["black-pepper"]);
  });

  for (const r of RECIPES) {
    it(`${r.id}: well formed, no claims, cooks safely, resolves and fits at Sainsbury's`, () => {
      expect(r.id, "id").toMatch(/^[a-z0-9-]{3,60}$/);
      expect(MEAL_TYPES.some((m) => m.value === r.meal), "meal").toBe(true);
      expect(r.servings, "servings").toBeGreaterThanOrEqual(1);
      expect(r.servings, "servings").toBeLessThanOrEqual(6);
      expect(r.minutes, "minutes").toBeGreaterThanOrEqual(2);
      expect(r.minutes, "minutes").toBeLessThanOrEqual(240);
      expect(r.method.length, "steps").toBeGreaterThanOrEqual(2);
      expect(r.method.length, "steps").toBeLessThanOrEqual(7);
      expect(cleanText(r.name, 60), `name "${r.name}"`).not.toBeNull();
      expect(r.blurb === "" || cleanText(r.blurb, 140) !== null, `blurb "${r.blurb}"`).toBe(true);
      for (const step of r.method) expect(cleanText(step, 300), `step "${step}"`).not.toBeNull();
      expect(r.extras ?? [], "nothing left uncounted").toEqual([]);
      expect(missingFoods(r), "every food the method names is an ingredient").toEqual([]);
      expect(unusedIngredients(r), "every ingredient bought is used in a step").toEqual([]);
      expect(new Set(r.ingredients.map((i) => i.key)).size, "an ingredient twice").toBe(r.ingredients.length);
      for (const i of r.ingredients) {
        expect(i.pantry && PANTRY.has(i.pantry), `pantry kind ${i.key}`).toBe(true);
        expect(i.amount, `${i.key} amount`).toBeGreaterThanOrEqual(PANTRY.get(i.pantry ?? "")?.cupboard ? 1 : 5);
        expect(i.amount / r.servings, `${i.key} per serving`).toBeLessThanOrEqual(450);
        for (const s of i.subs ?? []) expect(PANTRY.has(s.key), `substitute ${s.key} for ${i.key}`).toBe(true);
      }
      if (r.ingredients.some((i) => NEEDS_SAFETY.has(i.pantry ?? ""))) expect(r.method.some((m) => SAFETY.test(m)), "says how to tell it's cooked").toBe(true);
      const resolved = resolveRecipe(r, products);
      expect(resolved.complete, `missing at Sainsbury's: ${r.ingredients.filter((_, k) => !resolved.picks[k]).map((i) => i.key).join(", ")}`).toBe(true);
      const t = recipeTotals(resolved)!;
      expect(t.costPerServing, "a price a serving (every ingredient priced)").not.toBeNull();
      expect(t.perServing.kcal, "kcal a serving as written").toBeGreaterThan(r.meal === "snack" ? 60 : 180);
      expect(t.perServing.kcal, "kcal a serving as written").toBeLessThan(1100);
      expect(fitRecipe(r, products, {}, { kcal: 600, protein: 40 }), "fits").not.toBeNull();
    });
  }

  it("has plenty for every meal and diet", () => {
    const count = (f: (r: (typeof RECIPES)[number]) => boolean) => RECIPES.filter(f).length;
    expect(RECIPES.length).toBeGreaterThanOrEqual(95);
    for (const m of MEAL_TYPES) expect(count((r) => r.meal === m.value), m.value).toBeGreaterThanOrEqual(m.value === "snack" ? 8 : 15);
    expect(count((r) => isMeatFree(r)), "meat-free").toBeGreaterThanOrEqual(30);
    expect(count((r) => recipeForDiet(r, { veganOnly: true }) !== null), "vegan").toBeGreaterThanOrEqual(12);
    expect(count((r) => recipeForDiet(r, { halalOnly: true }) !== null), "halal").toBeGreaterThanOrEqual(45);
    expect(count((r) => recipeForDiet(r, { avoidAllergens: ["gluten"] }) !== null), "no gluten").toBeGreaterThanOrEqual(25);
    expect(count((r) => recipeForDiet(r, { avoidAllergens: ["milk"] }) !== null), "no milk").toBeGreaterThanOrEqual(40);
  });
});
