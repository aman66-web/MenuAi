// A writer's tool, not a check (skipped unless asked): how many of our recipes Meal plan has for each realistic set of answers a person can give, so the
// thin spots can be filled with new recipes (founder 2026-11-26: "if my app hasn't good foods suitable for every possible input please make more recipes").
//
//   REPORT=gaps npx vitest run tests/recipeGaps.check.test.ts            -> web/.recipe-shops/gaps.json and gaps.md
//   REPORT=gaps SHOPS=sainsburys npx vitest run tests/recipeGaps.check.test.ts   (one shop, quicker)
//
// A recipe counts for a meal when the plan could use it: it suits the diet and the foods left out, every ingredient is at the shop with a price, and fitted to
// the meal's size it lands within MAX_SWAP_DISTANCE of it (the furthest the plan ever swaps to). The aims are three reference people (the plan's own sizing may
// differ: lib/mm/bodyGoal.ts); a style counts the recipes of that style fitted the way the style fits them (styleTargets).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { EATING_STYLES, MAX_SWAP_DISTANCE, STYLE_FIT, fitsStyle, leavesOut, planCandidates, slotTargets, styleInDiet, type DayShape, type EatingStyle, type PlanCandidate } from "../lib/mm/mealPlan";
import type { DietPrefs } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { CUISINES, nicheOf } from "../lib/mm/recipeBook/niches";
import { RECIPE_COVERAGE } from "../lib/mm/recipeCoverage";
import { type MealType, type Recipe } from "../lib/mm/recipes";
import { MIN_RECIPE_COVERAGE, decodeShopProducts, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";
import { ALLERGEN_KEYS, type AllergenKey } from "../lib/mm/types";

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const SHAPE: DayShape = { meals: ["breakfast", "lunch", "dinner"], snacks: 1 };
/** Three reference people: the day's calories and protein for each aim (keep steady and just eat well share one). */
const AIMS = { eatWell: { kcal: 2000, protein: 100 }, loseFat: { kcal: 1600, protein: 130 }, muscle: { kcal: 2800, protein: 170 } } as const;
type Aim = keyof typeof AIMS;
/** How likely each answer is, roughly (UK shares, our judgement): only used to put the thin spots in order. */
const DIETS: Array<[string, DietPrefs, number]> = [
  ["any", {}, 0.6], ["vegetarian", { vegetarianOnly: true }, 0.07], ["halal", { halalOnly: true }, 0.07], ["pescatarian", { pescatarianOnly: true }, 0.04],
  ["vegan", { veganOnly: true }, 0.03], ["no pork", { noPork: true }, 0.03], ["no beef", { noBeef: true }, 0.03], ["no alcohol", { noAlcohol: true }, 0.02],
  ["no onion or garlic", { noOnionGarlic: true }, 0.01], ["kosher style", { kosherStyle: true }, 0.005], ["Jain", { jain: true }, 0.002],
];
const STYLE_W: Record<EatingStyle, number> = {
  balanced: 0.3, highProtein: 0.2, lowerCarb: 0.08, quick: 0.08, mediterranean: 0.06, longevity: 0.05, lowFat: 0.04, lowerSugar: 0.04, keto: 0.03, highFibre: 0.03,
  lowerSalt: 0.02, vegetarian: 0.02, vegan: 0.01, pescatarian: 0.01, paleo: 0.01,
};
const AIM_W: Record<Aim, number> = { loseFat: 0.45, muscle: 0.2, eatWell: 0.35 };
const SHOP_W: Record<string, number> = { sainsburys: 0.15, asda: 0.12, aldi: 0.1, morrisons: 0.08, "marks-and-spencer": 0.04, waitrose: 0.05, iceland: 0.025 };
const ALLERGEN_W: Partial<Record<AllergenKey, number>> = { milk: 0.04, gluten: 0.04, eggs: 0.015, nuts: 0.02, peanuts: 0.02, fish: 0.01, crustaceans: 0.01, soya: 0.008, sesame: 0.006, mustard: 0.003, celery: 0.003, molluscs: 0.003, sulphites: 0.003, lupin: 0.001 };
/** A meal with fewer than this many recipes can't have a different one each day of the week. */
const THIN = 7;

/** Sweet or savoury, for a breakfast: its own tag, else what is in it (fruit, honey, oats... with no egg, meat, cheese, beans or vegetables is sweet). */
const SWEET_KINDS = new Set(["banana", "apple", "berries", "raisins", "honey", "granola", "wheat-biscuits", "cinnamon", "peanut-butter", "oats", "almonds"]);
const SAVOURY_KINDS = new Set(["eggs", "bacon", "ham", "cheddar", "mozzarella", "soft-cheese", "baked-beans", "tomatoes", "cherry-tomatoes", "mushrooms", "smoked-salmon", "salmon", "spinach",
  "onion", "red-onion", "chickpeas", "kidney-beans", "peppers", "houmous", "tuna", "chicken", "beef-mince", "spring-onions", "garlic", "salsa", "chopped-tomatoes", "cottage-cheese", "cucumber"]);
export function breakfastKind(r: Recipe): "sweet" | "savoury" {
  if (r.tags?.includes("Sweet")) return "sweet";
  if (r.tags?.includes("Savoury")) return "savoury";
  const kinds = r.ingredients.map((i) => i.pantry ?? i.key);
  return kinds.some((k) => SAVOURY_KINDS.has(k)) ? "savoury" : kinds.some((k) => SWEET_KINDS.has(k)) ? "sweet" : "savoury";
}

function lists(ids: string[]): Map<string, ShopProduct[]> {
  const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
  return new Map(ids.map((id) => {
    const r = manifest.retailers.find((x) => x.id === id)!;
    return [id, decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8")))];
  }));
}

const usable = (list: readonly PlanCandidate[] | undefined) => (list ?? []).filter((c) => c.distance <= MAX_SWAP_DISTANCE);
type Cands = Map<MealType, PlanCandidate[]>;

interface Row { key: string; shop: string; meal: MealType; n: number; w: number; ids?: string[] }

it.skipIf(process.env.REPORT !== "gaps")("recipe gaps report", () => {
  mkdirSync(".recipe-shops", { recursive: true });
  const offered = Object.entries(RECIPE_COVERAGE).filter(([, n]) => n >= MIN_RECIPE_COVERAGE).map(([id]) => id);
  const shopIds = process.env.SHOPS ? process.env.SHOPS.split(",") : offered;
  const shops = lists(shopIds);
  const rows: Row[] = [];
  const add = (key: string, shop: string, meal: MealType, list: readonly PlanCandidate[], w: number) => rows.push({ key, shop, meal, n: list.length, w, ...(list.length < THIN ? { ids: list.map((c) => c.recipe.id) } : {}) });
  const t0 = Date.now();
  for (const [shop, products] of shops) {
    const sw = SHOP_W[shop] ?? 0.03;
    for (const [dname, diet, dw] of DIETS) {
      // the aims, as fitted for a balanced week, and every style for each aim
      for (const aim of Object.keys(AIMS) as Aim[]) {
        const targets = slotTargets(SHAPE, AIMS[aim]);
        const byFit = new Map<string, Cands>();
        const candsFor = (style: EatingStyle): Cands => {
          const fit = STYLE_FIT[style];
          let c = byFit.get(fit);
          if (!c) {
            const t = fit === "own" ? targets : Object.fromEntries(Object.entries(targets).map(([m, x]) => [m, fit === "protein" ? { ...x, protein: Math.max(x.protein ?? 0, Math.round((x.kcal * 0.32) / 4)) } : fit === "keto" ? { ...x, carbsMax: Math.round((x.kcal * 0.1) / 4) } : { ...x, fatMax: Math.round((x.kcal * 0.2) / 9) }]));
            c = planCandidates(RECIPES, products, diet, t, [], shop);
            byFit.set(fit, c);
          }
          return c;
        };
        for (const style of EATING_STYLES) {
          if (style !== "balanced" && styleInDiet(style, diet)) continue;
          const c = candsFor(style);
          for (const meal of MEALS) add(`diet=${dname} aim=${aim} style=${style}`, shop, meal, usable(c.get(meal)).filter((x) => fitsStyle(x, style)), sw * dw * AIM_W[aim] * STYLE_W[style] * (meal === "snack" ? 0.5 : 1));
        }
        const own = candsFor("balanced");
        if (aim !== "eatWell") continue;
        // cooking time, breakfast kind, spice and cuisines, for a balanced week
        for (const limit of [15, 30, 45]) for (const meal of MEALS) add(`diet=${dname} time<=${limit}`, shop, meal, usable(own.get(meal)).filter((x) => x.recipe.minutes <= limit), sw * dw * (limit === 15 ? 0.15 : limit === 30 ? 0.35 : 0.2));
        const bf = usable(own.get("breakfast"));
        add(`diet=${dname} breakfast=sweet`, shop, "breakfast", bf.filter((x) => breakfastKind(x.base) === "sweet"), sw * dw * 0.4);
        add(`diet=${dname} breakfast=savoury`, shop, "breakfast", bf.filter((x) => breakfastKind(x.base) === "savoury"), sw * dw * 0.4);
        add(`diet=${dname} breakfast=quick(<=10min)`, shop, "breakfast", bf.filter((x) => x.recipe.minutes <= 10), sw * dw * 0.4);
        for (const meal of MEALS) add(`diet=${dname} spice=mild`, shop, meal, usable(own.get(meal)).filter((x) => !leavesOut(x.recipe, ["spicy"])), sw * dw * 0.3);
        for (const meal of ["lunch", "dinner"] as const) add(`diet=${dname} spice=hot`, shop, meal, usable(own.get(meal)).filter((x) => leavesOut(x.recipe, ["spicy"])), sw * dw * 0.1);
        for (const cu of CUISINES) for (const meal of ["lunch", "dinner"] as const) add(`diet=${dname} cuisine=${cu.id}`, shop, meal, usable(own.get(meal)).filter((x) => nicheOf(x.recipe.id).cuisine === cu.id), sw * dw * 0.05);
      }
      // allergens: each of the 14 left out, at Sainsbury's and the smallest-range shop, for the commonest diets
      if (!["sainsburys", "aldi", "asda"].includes(shop) || !["any", "vegetarian", "vegan", "halal", "pescatarian"].includes(dname)) continue;
      for (const a of ALLERGEN_KEYS) {
        for (const aim of ["eatWell", "loseFat"] as Aim[]) {
          const c = planCandidates(RECIPES, products, { ...diet, avoidAllergens: [a] }, slotTargets(SHAPE, AIMS[aim]), [], shop);
          for (const meal of MEALS) add(`diet=${dname} aim=${aim} no=${a}`, shop, meal, usable(c.get(meal)), sw * dw * (ALLERGEN_W[a] ?? 0.003) * AIM_W[aim]);
          if (aim === "loseFat" || dname !== "any") continue;
          const hp = planCandidates(RECIPES, products, { ...diet, avoidAllergens: [a] }, Object.fromEntries(Object.entries(slotTargets(SHAPE, AIMS[aim])).map(([m, x]) => [m, { ...x, protein: Math.max(x.protein ?? 0, Math.round((x.kcal * 0.32) / 4)) }])), [], shop);
          for (const meal of MEALS) add(`diet=${dname} style=highProtein no=${a}`, shop, meal, usable(hp.get(meal)).filter((x) => fitsStyle(x, "highProtein")), sw * dw * (ALLERGEN_W[a] ?? 0.003) * STYLE_W.highProtein);
        }
      }
      for (const pair of [["gluten", "milk"], ["milk", "eggs"], ["nuts", "peanuts"], ["gluten", "eggs"], ["milk", "soya"], ["fish", "crustaceans"]] as AllergenKey[][]) {
        const c = planCandidates(RECIPES, products, { ...diet, avoidAllergens: pair }, slotTargets(SHAPE, AIMS.eatWell), [], shop);
        for (const meal of MEALS) add(`diet=${dname} no=${pair.join("+")}`, shop, meal, usable(c.get(meal)), sw * dw * 0.01);
      }
    }
    console.log(`${shop} done at ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  writeFileSync(".recipe-shops/gaps.json", JSON.stringify(rows));
  // worst first: the likeliest answers with the fewest recipes (missing recipes times how likely the answers are)
  const thin = rows.filter((r) => r.n < THIN).map((r) => ({ ...r, score: r.w * (THIN - r.n) })).sort((a, b) => b.score - a.score);
  const md = ["| # | answers | shop | meal | recipes | score |", "|---|---|---|---|---|---|", ...thin.slice(0, 400).map((r, i) => `| ${i + 1} | ${r.key} | ${r.shop} | ${r.meal} | ${r.n} | ${(r.score * 1e4).toFixed(2)} |`)];
  writeFileSync(".recipe-shops/gaps.md", md.join("\n") + "\n");
  console.log(`${rows.length} combinations, ${thin.length} thin (under ${THIN})`);
}, 3_600_000);
