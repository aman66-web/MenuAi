import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanText } from "../lib/mm/aiRecipe";
import { EVERYDAY_KINDS, FESTIVE_KINDS, PANTRY } from "../lib/mm/pantry";
import { OCCASION_LINES } from "../lib/mm/recipeBook/niches";
import { RECIPES } from "../lib/mm/recipeBook";
import { fitRecipe, ing, isMeatFree, recipeForDiet, recipeTotals, resolveRecipe, MEAL_TYPES } from "../lib/mm/recipes";
import { splitStep } from "../lib/mm/recipeSteps";
import { decodeShopProducts } from "../lib/mm/shopProducts";
import { USED_AS } from "../lib/mm/stepIngredients";

// The rules every recipe in the book follows (lib/mm/recipeBook/index.ts), checked against the real Sainsbury's list.

const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const SAFETY = /(no pink|piping hot|cooked through|flakes|opaque|set\b|until (?:just )?set|golden|pink all the way|cooked all the way)/i;
const NEEDS_SAFETY = new Set(["chicken", "chicken-thigh", "beef-mince", "turkey-mince", "lamb-mince", "bacon", "salmon", "cod", "white-fish", "prawns", "eggs", "beef-steak", "turkey-breast", "pork-chipolatas", "gammon-steaks"]);
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
  [/\bapples?\b(?! sauce)/i, ["apple"]], [/\bcoriander\b/i, ["fresh-coriander"]], [/\bparsley\b/i, ["fresh-parsley"]], [/\bbasil\b(?! pesto)/i, ["fresh-basil", "pesto"]],
  [/\bdill\b/i, ["dill"]], [/\bchives\b/i, ["chives"]], [/\bmint\b/i, ["mint"]], [/\bthyme\b/i, ["thyme"]], [/\brosemary\b/i, ["rosemary"]], [/\boregano\b/i, ["oregano"]],
  [/\b(?:dried |mixed )herbs\b/i, ["mixed-herbs", "oregano", "thyme", "rosemary"]], [/\bsesame\b/i, ["sesame-seeds", "mixed-seeds"]], [/\bmustard\b/i, ["mustard"]],
  [/\bbread\b/i, ["bread", "white-bread"]], [/\bhorseradish\b/i, ["horseradish"]], [/\boil spray\b|\bspray\b/i, ANY_OIL], [/\boil\b/i, ANY_OIL], [/\bstock\b/i, ["stock-cube"]], [/\bhoney\b/i, ["honey"]],
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
export function unusedIngredients(r: { method: string[]; ingredients: Array<{ key: string; pantry?: string }> }): string[] {
  return r.ingredients.flatMap((i) => {
    const said = USED_AS[i.pantry ?? ""];
    if (!said) return [`${i.key} (no words for it in USED_AS)`];
    return r.method.some((step) => said.test(step)) ? [] : [i.key];
  });
}

// founder 2026-10-16: "the instructions to making the recipes are not descriptive enough, you need more steps and more detail". A method now reads like a
// real recipe: a get-ready step, the heat and the pan, a time and a sign for each stage, how to tell it is done, and how to serve.
// founder 2026-11-16 (on a recipe app they like; readers include uni students): "make it into clear steps for the person to do". Each step is
// "Short title: instruction." (lib/mm/recipeSteps.ts shows the title in bold), one job a step, at most STEP_WORDS words of instruction.
const MIN_STEPS: Record<string, number> = { snack: 4, breakfast: 5, lunch: 6, dinner: 8 };
const MIN_WORDS: Record<string, number> = { snack: 40, breakfast: 60, lunch: 80, dinner: 110 };
const STEP_WORDS = 45;
const OVEN_GAS: Record<number, [number, number]> = { 140: [120, 1], 150: [130, 2], 160: [140, 3], 180: [160, 4], 190: [170, 5], 200: [180, 6], 220: [200, 7], 230: [210, 8], 240: [220, 9] };
const JARGON = /\b(?:sweat(?:ed|ing)?|deglaze|julienne|blanch(?:ed|ing)?|sear(?:ed|ing)?|baste|zest(?:ed)?|knob of|glug|chiffonade|reduce the sauce|al dente)\b/i;
const PEOPLE_COUNT = /\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:plates|bowls|portions|servings|people|diners|helpings)\b/i;
export function methodProblems(r: { method: string[] }): string[] {
  const out: string[] = [];
  r.method.forEach((step, i) => {
    const at = `step ${i + 1}`;
    const parts = splitStep(step);
    if (!parts.title) out.push(`${at} needs a short title first ("Soften the onion: ..."): "${step.slice(0, 60)}"`);
    else if (parts.text.trim().split(/\s+/).length > STEP_WORDS) out.push(`${at} ("${parts.title}") is over ${STEP_WORDS} words: split it or say it more simply`);
    if (step.length < 30) out.push(`${at} is too short to say anything useful: "${step}"`);
    if (!/^[A-Z]/.test(step)) out.push(`${at} should start with a capital letter`);
    if (!/[.!?]$/.test(step)) out.push(`${at} should end with a full stop`);
    if (/\s{2,}/.test(step) || /\s[.,]/.test(step)) out.push(`${at} has stray spaces`);
    if (JARGON.test(step)) out.push(`${at} uses cook's jargon: ${JARGON.exec(step)?.[0]}`);
    if (PEOPLE_COUNT.test(step)) out.push(`${at} counts people or plates, which change with Serves: ${PEOPLE_COUNT.exec(step)?.[0]}`);
    if ((step.match(/\b\d[\d,.]* ml\b/g) ?? []).length > 1) out.push(`${at} names more than one amount in ml`);
    for (const m of step.matchAll(/(?<!\()(\d{3})°C(?! \(\d{3}°C fan, gas \d\))/g)) out.push(`${at}: write the oven as "200°C (180°C fan, gas 6)", not "${m[0]}"`);
    for (const m of step.matchAll(/(\d{3})°C \((\d{3})°C fan, gas (\d)\)/g)) {
      const want = OVEN_GAS[Number(m[1])];
      if (!want || want[0] !== Number(m[2]) || want[1] !== Number(m[3])) out.push(`${at}: ${m[0]} is not a standard oven setting`);
    }
  });
  return out;
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
    // founder 2026-10-17: the Christmas recipes (and only those) may also use the festive kinds
    const christmas = new Set(OCCASION_LINES.filter(([, o]) => o === "christmas").map(([id]) => id));
    const other = RECIPES.flatMap((r) => r.ingredients.filter((i) => !EVERYDAY_KINDS.has(i.pantry ?? "") && !(christmas.has(r.id) && FESTIVE_KINDS.has(i.pantry ?? ""))).map((i) => `${r.id}: ${i.pantry ?? i.key}`));
    expect(other).toEqual([]);
  });

  // The festive kinds are kept apart from the everyday ones, and each still resolves to a product whose label we have read (nothing is ever estimated).
  it("keeps the festive kinds to Christmas recipes, each resolving to a read label", () => {
    expect([...FESTIVE_KINDS].filter((k) => !PANTRY.has(k)), "festive kinds that aren't in the pantry").toEqual([]);
    expect([...FESTIVE_KINDS].filter((k) => EVERYDAY_KINDS.has(k)), "kinds in both sets").toEqual([]);
    expect([...FESTIVE_KINDS].filter((k) => !USED_AS[k]), "festive kinds with no words in USED_AS").toEqual([]);
    const christmas = new Set(OCCASION_LINES.filter(([, o]) => o === "christmas").map(([id]) => id));
    expect(christmas.size, "Christmas recipes").toBeGreaterThanOrEqual(8);
    const used = new Set<string>();
    for (const r of RECIPES) for (const i of r.ingredients) if (FESTIVE_KINDS.has(i.pantry ?? "")) { used.add(i.pantry ?? ""); expect(christmas.has(r.id), `${r.id} uses ${i.pantry} but is not a Christmas recipe`).toBe(true); }
    expect([...FESTIVE_KINDS].filter((k) => !used.has(k)), "festive kinds no recipe uses").toEqual([]);
    for (const k of FESTIVE_KINDS) {
      const kind = PANTRY.get(k)!;
      const probe = resolveRecipe({ id: `probe-${k}`, name: k, blurb: "", servings: 1, minutes: 5, ingredients: [ing(k, kind.cupboard ? 2 : 100)], method: [] }, products);
      expect(probe.complete, `${k} finds a product`).toBe(true);
      expect(probe.picks[0]?.product.nutrition, `${k}: the product's label is read`).toBeTruthy();
    }
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
      expect(r.method.length, "steps").toBeGreaterThanOrEqual(MIN_STEPS[r.meal ?? ""] ?? 6);
      expect(r.method.length, "steps").toBeLessThanOrEqual(16);
      expect(r.method.join(" ").split(/\s+/).length, "words in the whole method").toBeGreaterThanOrEqual(MIN_WORDS[r.meal ?? ""] ?? 100);
      expect(methodProblems(r), "method style").toEqual([]);
      expect(cleanText(r.name, 60), `name "${r.name}"`).not.toBeNull();
      expect(r.blurb === "" || cleanText(r.blurb, 140) !== null, `blurb "${r.blurb}"`).toBe(true);
      for (const step of r.method) expect(cleanText(step, 420), `step "${step}"`).not.toBeNull();
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
