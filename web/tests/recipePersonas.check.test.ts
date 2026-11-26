// A writer's tool, not a check (skipped unless asked): for each kind of person Meal plan has to feed (docs/RECIPE_PERSONAS_2026-11-26.md), how many of our
// recipes the plan could use for each meal, in each diet, at each of the big shops, and how close the plan's week comes to their day (founder 2026-11-26: "it
// needs to suit literally everyone ... a professional footballer ... someone who does rugby might need more ... make the best diet plan for like each individual").
//
//   REPORT=personas npx vitest run tests/recipePersonas.check.test.ts                  -> web/.recipe-shops/personas.json and personas.md
//   REPORT=personas SHOPS=sainsburys npx vitest run tests/recipePersonas.check.test.ts (one shop, quicker)
//
// A recipe counts for a meal exactly as tests/recipeGaps.check.test.ts counts it: it suits the diet, every ingredient is at the shop with a price, and fitted to
// the persona's meal (slotTargets for their day and shape, under their meal cap) it lands within MAX_SWAP_DISTANCE. Each meal is also counted within 15, 30 and
// 45 minutes, and for the personas who need it: carb-heavy (carbs at least half the fitted serving's calories: training days), soft (older adults), or cheap (a
// serving at most £1.50: a tight budget). Then the plan itself is made (planForBudget, variety 4) and its average day compared with the persona's calories.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { MAX_SWAP_DISTANCE, planCandidates, planForBudget, planSlots, slotTargets, type DayShape, type PlanCandidate } from "../lib/mm/mealPlan";
import type { DietPrefs } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { fitDistance, fitRecipe, recipeForDiet, recipeTotals, resolveRecipe, type MealType, type Recipe } from "../lib/mm/recipes";
import { decodeShopProducts, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";
import { ALLERGEN_KEYS, type AllergenKey } from "../lib/mm/types";

export interface Persona {
  id: string;
  kcal: number;
  protein: number;
  shape: DayShape;
  /** A meal cap (GLP-1 users). */
  cap?: number;
  /** Extra counts this persona needs, per meal. */
  needs?: Array<"carbHeavy" | "soft" | "cheap">;
  /** A meal with fewer than this is thin for them (variety: a different recipe each day of two weeks). */
  thin?: number;
  /** How common the persona is among Meal plan's users (our judgement; only orders the list). */
  w: number;
}

const THREE = ["breakfast", "lunch", "dinner"] as MealType[];
export const PERSONAS: Persona[] = [
  { id: "footballer", kcal: 3300, protein: 150, shape: { meals: THREE, snacks: 2 }, needs: ["carbHeavy"], w: 0.04 },
  { id: "rugby", kcal: 4000, protein: 200, shape: { meals: THREE, snacks: 3 }, w: 0.02 },
  { id: "rugby-4500", kcal: 4500, protein: 220, shape: { meals: THREE, snacks: 3 }, w: 0.01 },
  { id: "endurance", kcal: 3200, protein: 120, shape: { meals: THREE, snacks: 2 }, needs: ["carbHeavy"], w: 0.04 },
  { id: "power", kcal: 2900, protein: 160, shape: { meals: THREE, snacks: 1 }, w: 0.02 },
  { id: "combat", kcal: 2800, protein: 150, shape: { meals: THREE, snacks: 1 }, needs: ["carbHeavy"], w: 0.015 },
  { id: "gym-cut", kcal: 1800, protein: 130, shape: { meals: THREE, snacks: 1 }, w: 0.12 },
  { id: "gym-bulk", kcal: 3000, protein: 160, shape: { meals: THREE, snacks: 1 }, w: 0.06 },
  { id: "budget-loss", kcal: 1500, protein: 100, shape: { meals: THREE, snacks: 1 }, needs: ["cheap"], w: 0.15 },
  { id: "student", kcal: 2300, protein: 110, shape: { meals: THREE, snacks: 1 }, needs: ["cheap"], w: 0.08 },
  { id: "shift-worker", kcal: 2200, protein: 110, shape: { meals: THREE, snacks: 2 }, w: 0.06 },
  { id: "parent", kcal: 2000, protein: 100, shape: { meals: THREE, snacks: 1 }, w: 0.12 },
  { id: "older-adult", kcal: 1800, protein: 80, shape: { meals: THREE, snacks: 1 }, needs: ["soft"], w: 0.08 },
  { id: "glp1", kcal: 1400, protein: 100, shape: { meals: THREE, snacks: 2 }, cap: 450, w: 0.08 },
  { id: "small-day", kcal: 1200, protein: 90, shape: { meals: THREE, snacks: 1 }, w: 0.04 },
  { id: "variety", kcal: 2000, protein: 100, shape: { meals: THREE, snacks: 1 }, thin: 14, w: 0.06 },
];

/** Every diet the app has (the 14 allergens are counted for the commonest diets below). */
const DIETS: Array<[string, DietPrefs, number]> = [
  ["any", {}, 0.6], ["vegetarian", { vegetarianOnly: true }, 0.07], ["halal", { halalOnly: true }, 0.07], ["pescatarian", { pescatarianOnly: true }, 0.04],
  ["vegan", { veganOnly: true }, 0.03], ["no pork", { noPork: true }, 0.03], ["no beef", { noBeef: true }, 0.03], ["no alcohol", { noAlcohol: true }, 0.02],
  ["no onion or garlic", { noOnionGarlic: true }, 0.01], ["kosher style", { kosherStyle: true }, 0.005], ["Jain", { jain: true }, 0.002],
];
const ALLERGEN_W: Partial<Record<AllergenKey, number>> = { milk: 0.04, gluten: 0.04, eggs: 0.015, nuts: 0.02, peanuts: 0.02, fish: 0.01, crustaceans: 0.01, soya: 0.008, sesame: 0.006, mustard: 0.003, celery: 0.003, molluscs: 0.003, sulphites: 0.003, lupin: 0.001 };
const SHOP_W: Record<string, number> = { sainsburys: 0.15, asda: 0.12, morrisons: 0.08, waitrose: 0.05, iceland: 0.025 };
export const BIG_SHOPS = ["sainsburys", "morrisons", "waitrose", "iceland", "asda"];
const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const THIN = 7;

/** Soft to eat: by the dish's own words (older adults; the persona brief's list). */
export const SOFT = /\b(soup|stew|pie|mash|mashed|scrambled|porridge|oats|rice pudding|risotto|curry|chilli|dhal|kedgeree|omelette|frittata|shakshuka|baked eggs|poached|congee|smoothie|yogurt|flaked|fishcakes?|hash|cottage cheese|pudding|bake)\b/i;
export const isSoft = (r: Recipe): boolean => SOFT.test(`${r.name} ${r.blurb}`) || !!r.tags?.includes("Soft");
const carbHeavy = (c: PlanCandidate) => c.perServing.carbs * 4 >= c.perServing.kcal * 0.5;

function lists(ids: string[]): Map<string, ShopProduct[]> {
  const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
  return new Map(ids.map((id) => {
    const r = manifest.retailers.find((x) => x.id === id)!;
    return [id, decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8")))];
  }));
}

interface Row { persona: string; diet: string; shop: string; meal: MealType; filter: string; n: number; thin: number; w: number }
interface PlanRow { persona: string; diet: string; shop: string; target: number; avg: number | null; maxMeal: number | null; mealTarget: number; snackTarget: number }

it.skipIf(process.env.REPORT !== "personas")("recipe personas report", () => {
  mkdirSync(".recipe-shops", { recursive: true });
  const shops = lists(process.env.SHOPS ? process.env.SHOPS.split(",") : BIG_SHOPS);
  const rows: Row[] = [];
  const plans: PlanRow[] = [];
  const t0 = Date.now();
  for (const [shop, products] of shops) {
    const sw = SHOP_W[shop] ?? 0.03;
    for (const p of PERSONAS) {
      const targets = slotTargets(p.shape, { kcal: p.kcal, protein: p.protein }, p.cap ?? null, null);
      const thin = p.thin ?? THIN;
      const diets: Array<[string, DietPrefs, number]> = [...DIETS];
      for (const a of ALLERGEN_KEYS) diets.push([`no ${a}`, { avoidAllergens: [a] }, (ALLERGEN_W[a] ?? 0.003) * 0.6]);
      for (const a of ["milk", "gluten", "eggs", "soya", "nuts"] as AllergenKey[]) {
        diets.push([`vegan, no ${a}`, { veganOnly: true, avoidAllergens: [a] }, 0.03 * (ALLERGEN_W[a] ?? 0.003)]);
        diets.push([`vegetarian, no ${a}`, { vegetarianOnly: true, avoidAllergens: [a] }, 0.07 * (ALLERGEN_W[a] ?? 0.003)]);
      }
      for (const [dname, diet, dw] of diets) {
        const cands = planCandidates(RECIPES, products, diet, targets, [], shop);
        const w = sw * dw * p.w;
        for (const meal of MEALS) {
          if (!(meal === "snack" ? p.shape.snacks : p.shape.meals.includes(meal))) continue;
          const usable = (cands.get(meal) ?? []).filter((c) => c.distance <= MAX_SWAP_DISTANCE);
          const mw = meal === "snack" ? 0.5 : 1;
          const add = (filter: string, list: PlanCandidate[], fw: number) => rows.push({ persona: p.id, diet: dname, shop, meal, filter, n: list.length, thin, w: w * mw * fw });
          add("any", usable, 1);
          for (const limit of [15, 30, 45]) add(`<=${limit} min`, usable.filter((c) => c.recipe.minutes <= limit), p.id === "parent" && limit === 15 ? 0.8 : limit === 15 ? 0.15 : limit === 30 ? 0.35 : 0.2);
          if (p.needs?.includes("carbHeavy")) add("carb-heavy", usable.filter(carbHeavy), 0.6);
          if (p.needs?.includes("soft")) add("soft", usable.filter((c) => isSoft(c.base)), 0.8);
          if (p.needs?.includes("cheap")) add("<=£1.50", usable.filter((c) => c.cost <= 1.5), 0.8);
        }
        // the plan itself, for the commonest diets: how close its average day comes to the persona's calories
        if (["any", "vegetarian", "vegan", "halal"].includes(dname)) {
          const slots = planSlots(p.shape);
          const plan = planForBudget(cands, null, () => null, slots, 4);
          const avg = plan ? Math.round(plan.week.days.reduce((s, d) => s + d.kcal, 0) / plan.week.days.length) : null;
          const maxMeal = plan ? Math.round(Math.max(...plan.week.days.flatMap((d) => d.meals.filter((m) => m.meal !== "snack").map((m) => m.candidate.perServing.kcal)))) : null;
          plans.push({ persona: p.id, diet: dname, shop, target: p.kcal, avg, maxMeal, mealTarget: targets.lunch?.kcal ?? 0, snackTarget: targets.snack?.kcal ?? 0 });
        }
      }
    }
    console.log(`${shop} done at ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  const tag = process.env.TAG ? `-${process.env.TAG}` : "";
  writeFileSync(`.recipe-shops/personas${tag}.json`, JSON.stringify({ rows, plans }));
  const thinRows = rows.filter((r) => r.n < r.thin).map((r) => ({ ...r, score: r.w * (r.thin - r.n) })).sort((a, b) => b.score - a.score);
  const md = [
    `${rows.length} counts, ${thinRows.length} thin (under 7, or 14 for the variety persona).`, "",
    "| # | persona | diet | shop | meal | filter | recipes | score |", "|---|---|---|---|---|---|---|---|",
    ...thinRows.slice(0, 500).map((r, i) => `| ${i + 1} | ${r.persona} | ${r.diet} | ${r.shop} | ${r.meal} | ${r.filter} | ${r.n} | ${(r.score * 1e6).toFixed(2)} |`),
    "", "## The plan's average day", "", "| persona | diet | shop | target kcal | meal / snack size | plan's average day | biggest meal |", "|---|---|---|---|---|---|---|",
    ...plans.map((x) => `| ${x.persona} | ${x.diet} | ${x.shop} | ${x.target} | ${x.mealTarget} / ${x.snackTarget} | ${x.avg ?? "no plan"} | ${x.maxMeal ?? "-"} |`),
  ];
  writeFileSync(`.recipe-shops/personas${tag}.md`, md.join("\n") + "\n");
  console.log(`${rows.length} counts, ${thinRows.length} thin`);
}, 7_200_000);

// For whoever writes recipes: how each recipe of one recipe-book file sizes for the personas' meals, at each big shop.
//   REPORT=fit FILE=wave2Snacks npx vitest run tests/recipePersonas.check.test.ts   -> web/.recipe-shops/fit-wave2Snacks.md
// For each recipe: the serving as written at Sainsbury's (kcal, protein, carbs' share of the kcal, cost), the diets it suits, the shops that make it, and for each
// meal size the personas need, how many of the five shops fit it within MAX_SWAP_DISTANCE, with Sainsbury's fitted kcal and protein.
const FIT_SIZES: Record<MealType, Array<[string, number, number]>> = {
  breakfast: [["rugby-4500", 1250, 61], ["rugby", 1080, 54], ["footballer", 930, 45], ["endurance", 900, 34], ["bulk", 920, 49], ["eat-well", 600, 29], ["budget", 450, 30], ["glp1", 370, 27]],
  lunch: [["rugby-4500", 1250, 61], ["rugby", 1080, 54], ["footballer", 930, 45], ["endurance", 900, 34], ["bulk", 920, 49], ["eat-well", 600, 29], ["budget", 450, 30], ["glp1", 370, 27]],
  dinner: [["rugby-4500", 1250, 61], ["rugby", 1080, 54], ["footballer", 930, 45], ["endurance", 900, 34], ["bulk", 920, 49], ["eat-well", 600, 29], ["budget", 450, 30], ["glp1", 370, 27]],
  snack: [["big", 250, 12], ["bulk", 250, 15], ["eat-well", 200, 10], ["cut", 180, 13], ["glp1", 140, 10], ["small", 120, 9]],
};
const FIT_DIETS: Array<[string, DietPrefs]> = [["vegan", { veganOnly: true }], ["veg", { vegetarianOnly: true }], ["halal", { halalOnly: true }], ["Jain", { jain: true }], ["no-onion", { noOnionGarlic: true }],
  ["no-gluten", { avoidAllergens: ["gluten"] }], ["no-milk", { avoidAllergens: ["milk"] }], ["no-eggs", { avoidAllergens: ["eggs"] }], ["no-nuts", { avoidAllergens: ["nuts", "peanuts"] }], ["no-soya", { avoidAllergens: ["soya"] }]];

it.skipIf(process.env.REPORT !== "fit")("fit report for one file", async () => {
  mkdirSync(".recipe-shops", { recursive: true });
  const file = process.env.FILE ?? "wave2Snacks";
  const mod = (await import(`../lib/mm/recipeBook/${file}.ts`)) as Record<string, unknown>;
  const recipes = Object.values(mod).find((v) => Array.isArray(v) && v.length && typeof (v[0] as Recipe).id === "string") as Recipe[] | undefined;
  const shops = lists(BIG_SHOPS);
  const out: string[] = [`# ${file}: ${recipes?.length ?? 0} recipes`, "", "Each size: shops (of 5) where it fits within 0.3, then Sainsbury's fitted kcal/protein. Diets: the recipe suits them.", ""];
  for (const r of recipes ?? []) {
    const sb = resolveRecipe(r, shops.get("sainsburys")!);
    const t = sb.complete ? recipeTotals(sb) : null;
    const ps = t?.perServing;
    const diets = FIT_DIETS.filter(([, d]) => recipeForDiet(r, d)).map(([n]) => n).join(" ");
    const makes = BIG_SHOPS.filter((s) => { const x = resolveRecipe(r, shops.get(s)!); return x.complete && recipeTotals(x)?.costPerServing != null; });
    out.push(`## ${r.id} (${r.meal}, ${r.minutes} min, serves ${r.servings})`);
    out.push(`as written at Sainsbury's: ${ps ? `${Math.round(ps.kcal)} kcal, ${Math.round(ps.protein)} g protein, carbs ${Math.round((ps.carbs * 400) / Math.max(1, ps.kcal))}% of kcal, fat ${Math.round(ps.fat)} g, £${t?.costPerServing?.toFixed(2)} a serving` : "NOT MADE"}`);
    const costs = BIG_SHOPS.map((s) => { const x = resolveRecipe(r, shops.get(s)!); const c = x.complete ? recipeTotals(x)?.costPerServing : null; return `${s.slice(0, 4)} ${c == null ? "-" : `£${c.toFixed(2)}`}`; }).join(", ");
    out.push(`made at: ${makes.join(", ") || "none"} | diets: ${diets || "none of the special ones"} | a serving as written: ${costs}`);
    const sizes: string[] = [];
    for (const [name, kcal, protein] of FIT_SIZES[r.meal ?? "dinner"]) {
      let n = 0;
      let at = "";
      for (const s of BIG_SHOPS) {
        const f = fitRecipe(r, shops.get(s)!, {}, { kcal, protein });
        if (!f) continue;
        const d = fitDistance(f.totals.perServing, { kcal, protein });
        if (d <= MAX_SWAP_DISTANCE) n++;
        if (s === "sainsburys") at = `${Math.round(f.totals.perServing.kcal)}/${Math.round(f.totals.perServing.protein)}${d <= MAX_SWAP_DISTANCE ? "" : " (off)"}`;
      }
      sizes.push(`${name} ${kcal}/${protein}: ${n}/5 ${at}`);
    }
    out.push(sizes.join(" | "), "");
  }
  writeFileSync(`.recipe-shops/fit-${file}.md`, out.join("\n") + "\n");
}, 1_800_000);
