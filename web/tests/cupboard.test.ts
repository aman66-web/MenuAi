import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addKind, addWords, COMMON_KINDS, countable, hasPieces, isStaple, itemAmount, listRecipeFor, MAX_CUPBOARD_ITEMS, matchRecipe, matchSubs, parsePreset, pickableKinds,
  qtyStart, qtyStep, recipeHref, recipesForCupboard, recipesFromCupboard, removeItem, sanitizeCupboard, sanitizeItem, searchKinds, setLevel, setQty, STAPLE_KINDS, stapleKeys, toBuy,
  unitWord, type CupboardItem,
} from "../lib/mm/cupboard";
import { SYNC_STORES } from "../lib/mm/syncMerge";
import { PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { recipeForDiet, scaleSpec, subSpec } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";

const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const SHOP = "sainsburys";
const recipe = (id: string) => RECIPES.find((r) => r.id === id)!;
const kind = (key: string, extra: Partial<CupboardItem> = {}): CupboardItem => ({ id: `k:${key}`, kind: key, name: PANTRY.get(key)!.label, level: "some", ...extra });

describe("the list kept on the device", () => {
  it("reads back only real items: unknown kinds, bad words and duplicates are dropped", () => {
    const list = sanitizeCupboard([
      { kind: "chicken", level: "little" },
      { kind: "chicken", level: "plenty" }, // the same kind twice: the first stays
      { kind: "not-a-kind", level: "some" },
      { kind: "", name: "  Baked   beans " },
      { kind: "", name: "!!" },
      { kind: "", name: "x" },
      { kind: "", name: "<script>alert(1)</script>" },
      { kind: "", name: "a".repeat(80) },
      "chicken",
      null,
      42,
    ]);
    expect(list.map((i) => i.id)).toEqual(["k:chicken", "w:baked beans"]);
    expect(list[0]).toMatchObject({ kind: "chicken", name: "Chicken breast fillets", level: "little" });
    expect(list[1]).toMatchObject({ kind: "", name: "Baked beans", level: "some" });
    expect(sanitizeCupboard("nope")).toEqual([]);
    expect(sanitizeCupboard(undefined)).toEqual([]);
  });

  it("an amount is a level or one exact number, never both; bad numbers fall back to 'some'", () => {
    expect(sanitizeItem({ kind: "chicken", qty: 300 })).toEqual({ id: "k:chicken", kind: "chicken", name: "Chicken breast fillets", qty: 300 });
    expect(sanitizeItem({ kind: "chicken", qty: 300, level: "plenty" })).toMatchObject({ qty: 300 });
    expect(sanitizeItem({ kind: "chicken", qty: 300, level: "plenty" })!.level).toBeUndefined();
    for (const bad of [0, -5, 6000, NaN, Infinity, "300"]) expect(sanitizeItem({ kind: "chicken", qty: bad, level: "little" })).toMatchObject({ level: "little" });
    expect(sanitizeItem({ kind: "chicken", qty: 12.6 })).toMatchObject({ qty: 13 });
    // whole pieces only for a kind that comes in pieces, and at most 60
    expect(sanitizeItem({ kind: "eggs", qty: 6, pieces: true })).toMatchObject({ qty: 6, pieces: true });
    expect(sanitizeItem({ kind: "eggs", qty: 61, pieces: true })).toMatchObject({ level: "some" });
    expect(sanitizeItem({ kind: "chicken", qty: 6, pieces: true })).toMatchObject({ qty: 6 });
    expect(sanitizeItem({ kind: "chicken", qty: 6, pieces: true })!.pieces).toBeUndefined();
    // typed words have no unit: only a rough amount
    expect(sanitizeItem({ kind: "", name: "Baked beans", qty: 200 })).toMatchObject({ level: "some" });
    expect(sanitizeItem({ kind: "", name: "Baked beans", qty: 200 })!.qty).toBeUndefined();
  });

  it("a store-cupboard kind (salt, oil, spices) is always 'plenty': no amount to keep", () => {
    expect(sanitizeItem({ kind: "salt", qty: 5 })).toEqual({ id: "k:salt", kind: "salt", name: "Salt", level: "plenty" });
    expect(sanitizeItem({ kind: "cumin", level: "little" })).toMatchObject({ level: "plenty" });
  });

  it("keeps at most 60 items", () => {
    const many = [...PANTRY.keys()].slice(0, 100).map((k) => ({ kind: k }));
    expect(sanitizeCupboard(many)).toHaveLength(MAX_CUPBOARD_ITEMS);
  });

  it("adding, changing and removing", () => {
    let list = addKind([], "chicken");
    expect(list).toEqual([{ id: "k:chicken", kind: "chicken", name: "Chicken breast fillets", level: "some" }]);
    expect(addKind(list, "chicken")).toEqual(list);
    expect(addKind(list, "nope")).toEqual(list);
    list = addKind(list, "salt");
    expect(list[1]).toMatchObject({ level: "plenty" });
    list = setLevel(list, "k:chicken", "little");
    expect(list[0]!.level).toBe("little");
    list = setLevel(list, "k:salt", "little"); // a staple has no amount
    expect(list[1]!.level).toBe("plenty");
    list = setQty(list, "k:chicken", 400);
    expect(list[0]).toEqual({ id: "k:chicken", kind: "chicken", name: "Chicken breast fillets", qty: 400 });
    list = setQty(list, "k:chicken", 99999);
    expect(list[0]!.qty).toBe(5000);
    list = setQty(list, "k:chicken", 0);
    expect(list[0]!.qty).toBe(1);
    list = setLevel(list, "k:chicken", "plenty"); // back to a rough amount drops the number
    expect(list[0]).toEqual({ id: "k:chicken", kind: "chicken", name: "Chicken breast fillets", level: "plenty" });
    list = addWords(list, "Baked beans");
    expect(list.map((i) => i.id)).toEqual(["k:chicken", "k:salt", "w:baked beans"]);
    expect(addWords(list, "baked  BEANS")).toEqual(list);
    expect(addWords(list, "!!")).toEqual(list);
    expect(setQty(list, "w:baked beans", 200)).toEqual(list); // typed words have no unit
    expect(setQty(list, "k:salt", 200)).toEqual(list);
    expect(removeItem(list, "k:salt").map((i) => i.id)).toEqual(["k:chicken", "w:baked beans"]);
  });

  it("whole pieces and their words", () => {
    const eggs = PANTRY.get("eggs")!;
    expect(hasPieces(eggs)).toBe(true);
    expect(hasPieces(PANTRY.get("chicken"))).toBe(false);
    expect(unitWord(eggs, true)).toBe("eggs");
    expect(unitWord(eggs, false)).toBe("g");
    expect(unitWord(PANTRY.get("milk")!, false)).toBe("ml");
    expect(qtyStep(eggs, true)).toBe(1);
    expect(qtyStep(eggs, false)).toBe(50);
    expect(qtyStart(eggs, true)).toBe(4);
    expect(itemAmount({ ...kind("eggs"), level: undefined, qty: 6, pieces: true })).toBe(6 * eggs.pieceGrams!);
    expect(itemAmount({ ...kind("chicken"), level: undefined, qty: 300 })).toBe(300);
    expect(itemAmount(kind("chicken"))).toBeNull();
  });
});

describe("it is never synced or sent anywhere", () => {
  it("is not one of the synced stores, and no cupboard code can send anything", () => {
    expect([...SYNC_STORES]).not.toContain("cupboardItems");
    expect(SYNC_STORES.some((s) => s.toLowerCase().includes("cupboarditems"))).toBe(false);
    const account = readFileSync("app/app/_lib/account.ts", "utf8");
    // beside the water and the reminders (reset when another person signs in), never in the adapters
    expect(account).toMatch(/localStores:\s*\[[^\]]*cupboardItemsStore/);
    const adapters = /createSyncAdapters\(\{[\s\S]*?\}\),/.exec(account)![0];
    expect(adapters).not.toMatch(/cupboardItems/);
    for (const file of [
      "lib/mm/cupboard.ts", "lib/mm/cupboardItems.ts", "app/app/_lib/cupboardRecipes.ts",
      "app/app/recipes/cupboard/page.tsx", "app/app/recipes/cupboard/CupboardPicker.tsx", "app/app/recipes/cupboard/CupboardResults.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      for (const sender of [/\bfetch\s*\(/, /sendBeacon/, /XMLHttpRequest/, /\boutbox\b/, /\btrack(?:Event)?\s*\(/, /navigator\.share/]) expect(src, `${file} ${sender}`).not.toMatch(sender);
    }
  });

  it("Clear data empties it, and so does another person signing in on the same phone", () => {
    expect(readFileSync("app/app/settings/page.tsx", "utf8")).toMatch(/cupboardItemsStore\.reset\(\)/);
    expect(readFileSync("app/app/_lib/account.ts", "utf8")).toMatch(/localStores:\s*\[[^\]]*cupboardItemsStore/);
  });
});

describe("what to offer", () => {
  const everyone = pickableKinds({});
  it("every common and store-cupboard choice is a real kind, and the store-cupboard ones are staples", () => {
    for (const k of [...COMMON_KINDS, ...STAPLE_KINDS]) expect(PANTRY.has(k), k).toBe(true);
    for (const k of STAPLE_KINDS) expect(isStaple(PANTRY.get(k)), k).toBe(true);
    for (const k of COMMON_KINDS) expect(isStaple(PANTRY.get(k)), k).toBe(false);
    expect(everyone.slice(0, COMMON_KINDS.length).map((k) => k.key)).toEqual([...COMMON_KINDS]);
  });

  it("only kinds a recipe can use, and none the diet or allergies leave out", () => {
    const used = new Set(RECIPES.flatMap((r) => r.ingredients.flatMap((i) => [i.pantry!, ...(i.subs ?? []).map((s) => s.key)])));
    for (const k of everyone) expect(used.has(k.key), k.key).toBe(true);
    const vegan = pickableKinds({ veganOnly: true }).map((k) => k.key);
    for (const bad of ["chicken", "eggs", "milk", "cheddar", "salmon", "honey"]) expect(vegan, bad).not.toContain(bad);
    expect(vegan).toContain("rice");
    expect(pickableKinds({ vegetarianOnly: true }).map((k) => k.key)).not.toContain("chicken");
    expect(pickableKinds({ vegetarianOnly: true }).map((k) => k.key)).toContain("eggs");
    const noMilk = pickableKinds({ avoidAllergens: ["milk"] }).map((k) => k.key);
    expect(noMilk).not.toContain("milk");
    expect(noMilk).not.toContain("cheddar");
  });

  it("searching finds kinds by the words of their name", () => {
    const keys = (q: string) => searchKinds(q, everyone).map((k) => k.key);
    expect(keys("chick")).toContain("chicken");
    expect(keys("chicken breast")).toEqual(expect.arrayContaining(["chicken"]));
    expect(keys("mince")).toEqual(expect.arrayContaining(["beef-mince"]));
    expect(keys("TOMATOES")).toEqual(expect.arrayContaining(["chopped-tomatoes", "tomatoes"]));
    expect(keys("  ")).toEqual([]);
    expect(keys("zzzz")).toEqual([]);
    expect(keys("ham")).not.toContain("graham"); // a word must start a word
  });
});

describe("what the cupboard makes", () => {
  const curry = recipe("chicken-curry");
  const spec = (r: typeof curry, key: string) => r.ingredients.find((i) => i.pantry === key)!;

  it("ranks recipes by how much of them the cupboard covers, main ingredients first", () => {
    const { matches } = recipesForCupboard([kind("chicken", { level: "plenty" }), kind("rice", { level: "plenty" }), kind("onion", { level: "plenty" })], {}, products, SHOP);
    expect(matches.length).toBeGreaterThan(3);
    const scores = matches.map((m) => m.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // the best recipes use the chicken and the rice, not just the onion
    const best = matches[0]!;
    const uses = (m: typeof best, key: string) => m.recipe.ingredients.some((i) => i.pantry === key);
    expect(uses(best, "chicken") && uses(best, "rice")).toBe(true);
    // an onion-only cupboard still finds recipes
    expect(recipesForCupboard([kind("onion", { level: "plenty" })], {}, products, SHOP).matches.length).toBeGreaterThan(0);
  });

  it("uses what you have: with chicken, rice and eggs the best match puts at least two of them to use, not a two-ingredient recipe that uses one", () => {
    const { matches } = recipesForCupboard(["chicken", "rice", "eggs"].map((k) => kind(k, { level: "plenty" })), {}, products, SHOP);
    const used = (m: (typeof matches)[number]) => new Set(m.recipe.ingredients.filter((_, i) => m.have.includes(i)).map((i) => i.pantry!)).size;
    expect(used(matches[0]!)).toBeGreaterThanOrEqual(2);
    // a recipe that uses all three outranks one that uses only one of them, however few ingredients that one has
    const all3 = matches.filter((m) => used(m) === 3);
    const one = matches.filter((m) => used(m) === 1);
    if (all3.length && one.length) expect(matches.indexOf(all3[0]!)).toBeLessThan(matches.indexOf(one[0]!));
    // and the same cupboard with a staple added ranks the same: staples never count either way
    const withSalt = recipesForCupboard([...["chicken", "rice", "eggs"].map((k) => kind(k, { level: "plenty" })), kind("salt", { level: "plenty" })], {}, products, SHOP).matches;
    expect(withSalt.map((m) => m.recipe.id)).toEqual(matches.map((m) => m.recipe.id));
  });

  it("every ingredient is exactly one of have, short, swap, missing or store cupboard; the counts add up", () => {
    const items = ["chicken", "rice", "eggs", "onion", "chickpeas", "milk", "peas", "salt"].map((k) => kind(k, { level: "some" }));
    const { matches } = recipesForCupboard(items, {}, products, SHOP, ["cumin"]);
    expect(matches.length).toBeGreaterThan(10);
    for (const m of matches) {
      const n = m.recipe.ingredients.length;
      const all = [...m.have, ...m.short, ...m.swaps.map((s) => s.index), ...m.missing, ...m.staples].sort((a, b) => a - b);
      expect(all, m.recipe.id).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(m.ingredients.map((x) => x.index)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(countable(m)).toBe(n - m.staples.length);
      expect(m.score).toBeGreaterThan(0);
      expect(m.score).toBeLessThanOrEqual(1);
      expect(m.servings).toBeGreaterThanOrEqual(1);
      expect(m.servings).toBeLessThanOrEqual(Math.min(12, m.recipe.servings));
      expect(m.recipe.scaledFrom).toBeUndefined();
      for (const i of m.staples) expect(m.recipe.ingredients[i]!.cupboard, m.recipe.id).toBe(true);
      for (const i of [...m.have, ...m.short, ...m.missing]) expect(m.recipe.ingredients[i]!.cupboard, m.recipe.id).not.toBe(true);
    }
  });

  it("a number of grams feeds as many people as it covers, by the recipe's own scaling", () => {
    const chicken = spec(curry, "chicken");
    const W = curry.servings;
    const forTwo = scaleSpec(chicken, 2, W).amount;
    const alone = (grams: number) => matchRecipe([kind("chicken", { level: undefined, qty: grams })], curry, products, SHOP, new Set())!;
    expect(alone(forTwo).servings).toBe(Math.min(W, 2));
    expect(alone(forTwo).have).toContain(curry.ingredients.indexOf(chicken));
    // 5 g short of two people's worth: feeds one, and says so only when even one is more than there is
    expect(alone(forTwo - 5).servings).toBe(Math.min(W, 1));
    const one = scaleSpec(chicken, 1, W).amount;
    const tiny = alone(Math.max(5, one - 5));
    expect(tiny.servings).toBe(1);
    expect(tiny.short).toContain(curry.ingredients.indexOf(chicken)); // not quite enough for even one
    expect(toBuy(tiny)).toContain(curry.ingredients.indexOf(chicken));
    // plenty of it: as many as the recipe is written for, never more
    const lots = alone(5000);
    expect(lots.servings).toBe(Math.min(12, W));
  });

  it("'a little' feeds 1, 'some' feeds 2, 'plenty' as many as the recipe is written for", () => {
    const at = (level: "little" | "some" | "plenty") => matchRecipe([kind("chicken", { level })], curry, products, SHOP, new Set())!.servings;
    expect(at("little")).toBe(1);
    expect(at("some")).toBe(Math.min(2, curry.servings));
    expect(at("plenty")).toBe(curry.servings);
  });

  it("the main ingredient with the least limits the servings; a minor one that falls short is 'not quite enough'", () => {
    const items = [kind("chicken", { level: "plenty" }), kind("rice", { level: undefined, qty: scaleSpec(spec(curry, "rice"), 2, curry.servings).amount })];
    const m = matchRecipe(items, curry, products, SHOP, new Set())!;
    expect(m.servings).toBe(Math.min(2, curry.servings));
    // an ingredient of another role that can't cover the servings is "short", not silently counted as had
    const onion = spec(curry, "onion");
    if (onion) {
      const m2 = matchRecipe([kind("chicken", { level: "plenty" }), kind("onion", { level: "little" })], curry, products, SHOP, new Set())!;
      expect(m2.servings).toBe(curry.servings); // the onion isn't a main ingredient: it doesn't shrink the dish
      expect(curry.servings > 1 ? m2.short : m2.have).toContain(curry.ingredients.indexOf(onion));
    }
  });

  it("a substitute the recipe allows counts as a swap, takes nothing off the list, and is put into the recipe's address", () => {
    // chickpea recipes allow kidney beans (and the other way round): find one where the cupboard has only the other
    const chilli = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "kidney-beans" && i.subs?.some((s) => s.key === "chickpeas")))!;
    expect(chilli).toBeTruthy();
    const m = matchRecipe([kind("chickpeas", { level: "plenty" })], chilli, products, SHOP, new Set())!;
    expect(m).not.toBeNull();
    const beans = chilli.ingredients.findIndex((i) => i.pantry === "kidney-beans");
    expect(m.swaps).toEqual([{ index: beans, sub: "chickpeas" }]);
    expect(m.ingredients[beans]!.state).toBe("swap");
    expect(toBuy(m)).not.toContain(beans);
    expect(matchSubs(m)).toEqual({ [chilli.ingredients[beans]!.key]: "chickpeas" });
    expect(recipeHref(m, SHOP)).toBe(`/app/recipes/view?id=${chilli.id}&r=${SHOP}&n=${m.servings}&w=1&s=${chilli.ingredients[beans]!.key}:chickpeas`);
    // a substitute counts only when there is enough of it for the people shown: a pinch of chickpeas doesn't stand in for the kidney beans
    const beanSpec = chilli.ingredients[beans]!;
    const pinch = matchRecipe([kind("chickpeas", { level: undefined, qty: 5 }), kind("rice", { level: "plenty" })], chilli, products, SHOP, new Set());
    if (pinch) {
      expect(pinch.ingredients[beans]!.state).toBe("missing");
      expect(pinch.swaps).toEqual([]);
      expect(toBuy(pinch)).toContain(beans);
    }
    const sub = beanSpec.subs!.find((s) => s.key === "chickpeas")!;
    const subAmount = (people: number) => scaleSpec(subSpec(beanSpec, sub)!, people, chilli.servings).amount;
    const withChickpeas = (qty: number) => matchRecipe([kind("chickpeas", { level: undefined, qty }), kind("rice", { level: "plenty" })], chilli, products, SHOP, new Set())!;
    // beans are a minor ingredient: too few don't shrink the dish, so the recipe stays at its people and the beans stay to buy; enough for all of them is a swap
    expect(beanSpec.role).toBe("other");
    expect(withChickpeas(subAmount(chilli.servings - 1)).ingredients[beans]!.state).toBe("missing");
    expect(withChickpeas(subAmount(chilli.servings)).ingredients[beans]!.state).toBe("swap");
    // the exact kind wins over a substitute, and a substitute never takes what another ingredient needs
    const both = matchRecipe([kind("chickpeas", { level: "plenty" }), kind("kidney-beans", { level: "plenty" })], chilli, products, SHOP, new Set())!;
    expect(both.swaps).toEqual([]);
    expect(both.ingredients[beans]!.state).toBe("have");
  });

  it("store-cupboard kinds are left out of the counts, and ticked ones are noted", () => {
    const m = matchRecipe([kind("chicken", { level: "plenty" })], curry, products, SHOP, new Set(["cumin"]))!;
    const cumin = curry.ingredients.findIndex((i) => i.pantry === "cumin");
    if (cumin >= 0) {
      expect(m.staples).toContain(cumin);
      expect(m.ingredients[cumin]).toMatchObject({ state: "staple", ticked: true });
      expect(toBuy(m)).not.toContain(cumin);
    }
    const salt = curry.ingredients.findIndex((i) => i.pantry === "salt");
    if (salt >= 0) expect(m.ingredients[salt]).toMatchObject({ state: "staple", ticked: false });
    // salt alone doesn't make a recipe
    expect(recipesForCupboard([kind("salt", { level: "plenty" })], {}, products, SHOP).matches).toEqual([]);
    expect(stapleKeys([kind("salt"), kind("chicken")], ["cumin"])).toEqual(new Set(["cumin", "salt"]));
  });

  it("words the person typed match by name only, like a typed shopping-list item", () => {
    const typed: CupboardItem = { id: "w:chicken", kind: "", name: "chicken", level: "plenty" };
    const m = recipesFromCupboard([typed], RECIPES, products, SHOP, new Set());
    expect(m.length).toBeGreaterThan(5);
    expect(m.every((x) => x.recipe.ingredients.some((i) => i.match.all.includes("chicken")))).toBe(true);
    expect(recipesFromCupboard([{ id: "w:zzzzqq", kind: "", name: "zzzzqq", level: "some" }], RECIPES, products, SHOP, new Set())).toEqual([]);
  });

  it("an empty cupboard, or no shop list, makes nothing", () => {
    expect(recipesForCupboard([], {}, products, SHOP).matches).toEqual([]);
    expect(recipesForCupboard([kind("chicken")], {}, [], SHOP).matches).toEqual([]);
  });

  it("the diet and allergies are respected exactly as the Recipes page respects them", () => {
    const items = ["chicken", "eggs", "milk", "rice", "peas", "onion", "chopped-tomatoes", "cheddar", "salmon", "chickpeas", "wraps"].map((k) => kind(k, { level: "plenty" }));
    const all = recipesForCupboard(items, {}, products, SHOP);
    expect(all.leftOut).toBe(0);
    for (const diet of [{ vegetarianOnly: true }, { veganOnly: true }, { pescatarianOnly: true }, { halalOnly: true }, { avoidAllergens: ["milk" as const] }, { avoidAllergens: ["eggs" as const, "gluten" as const] }]) {
      const { matches, leftOut } = recipesForCupboard(items, diet, products, SHOP);
      const allowed = RECIPES.filter((r) => recipeForDiet(r, diet)).length;
      expect(leftOut).toBe(RECIPES.length - allowed);
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        expect(recipeForDiet(recipe(m.recipe.id), diet), JSON.stringify(diet) + m.recipe.id).not.toBeNull();
        for (const i of m.recipe.ingredients) {
          const k = PANTRY.get(i.pantry!)!;
          if (diet.vegetarianOnly || diet.veganOnly) expect(!k.meat && !k.fish, `${m.recipe.id} ${k.key}`).toBe(true);
          if (diet.veganOnly) expect(!k.animal, `${m.recipe.id} ${k.key}`).toBe(true);
          if (diet.pescatarianOnly) expect(!k.meat, `${m.recipe.id} ${k.key}`).toBe(true);
          for (const a of diet.avoidAllergens ?? []) expect(k.contains, `${m.recipe.id} ${k.key}`).not.toContain(a);
        }
      }
    }
    // a vegetarian with chicken in the cupboard is never offered a chicken dish (and is not told there is one)
    const veg = recipesForCupboard([kind("chicken", { level: "plenty" })], { vegetarianOnly: true }, products, SHOP).matches;
    expect(veg).toEqual([]);
  });

  it("what to buy is the recipe's own pick at the shop for the servings shown, enough packs, with the swaps put in", () => {
    const m = matchRecipe([kind("chicken", { level: "some" })], curry, products, SHOP, new Set())!;
    const lr = listRecipeFor(m, products);
    expect(lr.recipe.servings).toBe(m.servings);
    expect(lr.missing).toEqual(toBuy(m));
    for (const i of lr.missing) {
      const pick = lr.resolved.picks[i];
      expect(pick, `${curry.id} ${i}`).not.toBeNull();
      expect(pick!.packs).toBeGreaterThanOrEqual(1);
      expect(pick!.spec.amount).toBe(scaleSpec(curry.ingredients[i]!, m.servings, curry.servings).amount);
    }
    expect(lr.missing).not.toContain(curry.ingredients.indexOf(spec(curry, "chicken")));
  });
});

describe("the recipe page opened from the cupboard", () => {
  const from = (q: string) => { const p = new URLSearchParams(q); return parsePreset((k) => p.get(k)); };
  it("reads the servings, swaps and 'as written', checking every part", () => {
    expect(from("id=x&n=3&w=1&s=beans:chickpeas")).toEqual({ servings: 3, asWritten: true, subs: { beans: "chickpeas" } });
    expect(from("n=1")).toEqual({ servings: 1 });
    expect(from("n=12")).toEqual({ servings: 12 });
    expect(from("id=x")).toBeUndefined();
    for (const bad of ["n=0", "n=13", "n=2.5", "n=abc", "n=", "n=-1", "w=0", "w=true", "s=", "s=a", "s=a:", "s=:b", "s=a:b:c", "s=A:b", "s=a b:c", `s=${"a".repeat(41)}:b`]) expect(from(bad), bad).toBeUndefined();
    expect(from("s=a:b,bad,c:d:e,f:g")).toEqual({ subs: { a: "b", f: "g" } });
    expect(Object.keys(from(`s=${Array.from({ length: 30 }, (_, i) => `k${i}:v${i}`).join(",")}`)!.subs!)).toHaveLength(12);
  });

  it("an address built for a match reads back as the same preset", () => {
    const m = recipesForCupboard([kind("chicken", { level: "some" }), kind("rice", { level: "some" })], {}, products, SHOP).matches[0]!;
    const url = new URL(recipeHref(m, SHOP), "https://x.test");
    expect(url.pathname).toBe("/app/recipes/view");
    expect(url.searchParams.get("id")).toBe(m.recipe.id);
    expect(parsePreset((k) => url.searchParams.get(k))).toMatchObject({ servings: m.servings, asWritten: true });
  });
});
