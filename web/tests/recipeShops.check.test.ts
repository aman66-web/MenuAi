// A writer's tool, not a check (skipped unless asked): which ingredients every shop can supply and price, and which shops can make given recipes.
// Founder 2026-11-21: recipes for every supermarket ("why do the ones that have ingredients not have recipes?"); new recipes are written from the kinds most shops
// have, then checked shop by shop here.
//
//   REPORT=kinds npx vitest run tests/recipeShops.check.test.ts           -> /tmp-free: web/.recipe-shops/kinds.txt: every everyday kind and the shops that have it
//   REPORT=recipes FILE=quickDinners npx vitest run tests/recipeShops.check.test.ts  -> web/.recipe-shops/recipes.txt: each recipe of that recipeBook file, and the
//                                                                                  shops that can make it with a price
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { EVERYDAY_KINDS, PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { candidates, recipeTotals, resolveRecipe, specFromKind, type Recipe } from "../lib/mm/recipes";
import { decodeShopProducts, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";

const SHOPS = ["sainsburys", "morrisons", "waitrose", "iceland", "asda", "aldi", "marks-and-spencer", "tesco"];

function lists(): Map<string, ShopProduct[]> {
  const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
  return new Map(SHOPS.map((id) => {
    const r = manifest.retailers.find((x) => x.id === id)!;
    return [id, decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8")))];
  }));
}

it.skipIf(!process.env.REPORT)("recipe shops report", async () => {
  mkdirSync(".recipe-shops", { recursive: true });
  const shops = lists();
  if (process.env.REPORT === "kinds") {
    const lines: string[] = [];
    for (const key of [...EVERYDAY_KINDS].sort()) {
      const kind = PANTRY.get(key);
      if (!kind) continue;
      const spec = specFromKind(kind, kind.unit === "ml" ? 50 : 100);
      const have = SHOPS.filter((id) => candidates(shops.get(id)!, spec).some((c) => c.usedCost !== null && (!!c.product.nutrition || !!spec.labelOptional)));
      lines.push(`${have.length === SHOPS.length ? "ALL " : have.length >= 7 ? "7/8 " : "    "}${key} (${kind.label}): ${have.length}/${SHOPS.length} ${SHOPS.filter((s) => !have.includes(s)).map((s) => "no " + s).join(", ")}`);
    }
    writeFileSync(".recipe-shops/kinds.txt", lines.join("\n") + "\n");
    return;
  }
  const mod = (await import(`../lib/mm/recipeBook/${process.env.FILE}`)) as Record<string, readonly Recipe[]>;
  const recipes = Object.values(mod).find(Array.isArray) ?? [];
  const ids = new Set(recipes.map((r) => r.id));
  const lines: string[] = [];
  for (const r of RECIPES.filter((x) => ids.has(x.id))) {
    const ok: string[] = [];
    const why: string[] = [];
    for (const id of SHOPS) {
      const res = resolveRecipe(r, shops.get(id)!);
      const t = recipeTotals(res);
      if (res.complete && t && t.costPerServing !== null) ok.push(id);
      else why.push(`${id}: ${res.complete ? "no price" : r.ingredients.filter((_, i) => !res.picks[i]).map((x) => x.key).join("+")}`);
    }
    lines.push(`${r.id} [${r.meal}] makes at ${ok.length}/${SHOPS.length}${why.length ? " | missing " + why.join("; ") : ""}`);
  }
  writeFileSync(".recipe-shops/recipes.txt", lines.join("\n") + "\n");
}, 600_000);
