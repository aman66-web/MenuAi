// A reviewer's tool, not a check (skipped unless asked): works out, for every recipe in the book, its numbers at every shop that can make it and writes a JSON
// report for a cook's read of anything that looks off (founder 2026-11-23: "go through every single recipe and make sure everything is perfect").
//   REPORT=audit AUDIT_OUT=/some/path/report.json npx vitest run tests/recipeAudit.check.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { recipeTotals, resolveRecipe } from "../lib/mm/recipes";
import { decodeShopProducts, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";

const SHOPS = ["sainsburys", "morrisons", "waitrose", "iceland", "asda", "aldi", "marks-and-spencer"];

function lists(): Map<string, ShopProduct[]> {
  const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
  return new Map(SHOPS.map((id) => {
    const r = manifest.retailers.find((x) => x.id === id)!;
    return [id, decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8")))];
  }));
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

it.skipIf(process.env.REPORT !== "audit")("recipe audit report", () => {
  const shops = lists();
  const rows = RECIPES.map((r) => {
    const per: Record<string, { kcal: number; protein: number; carbs: number; fat: number; cost: number | null; community: number; notCounted: number }> = {};
    for (const [id, products] of shops) {
      const t = recipeTotals(resolveRecipe(r, products));
      if (t) per[id] = { kcal: Math.round(t.perServing.kcal), protein: Math.round(t.perServing.protein * 10) / 10, carbs: Math.round(t.perServing.carbs * 10) / 10, fat: Math.round(t.perServing.fat * 10) / 10, cost: t.costPerServing === null ? null : Math.round(t.costPerServing * 100) / 100, community: t.community.length, notCounted: t.notCounted.length };
    }
    const ids = Object.keys(per);
    const kcals = ids.map((i) => per[i]!.kcal);
    const med = kcals.length ? median(kcals) : null;
    const dev = med ? ids.filter((i) => Math.abs(per[i]!.kcal - med) / med > 0.25) : [];
    const atwater = ids.filter((i) => { const p = per[i]!; const calc = 4 * p.protein + 4 * p.carbs + 9 * p.fat; return p.kcal > 0 && Math.abs(calc - p.kcal) / p.kcal > 0.2; });
    const grams = r.ingredients.reduce((n, i) => n + i.amount, 0);
    const stepMinutes = r.method.reduce((n, s) => { let m = 0; for (const x of s.matchAll(/(\d+)(?: to (\d+))? minutes?/gi)) m += Number(x[2] ?? x[1]); return n + m; }, 0);
    return { id: r.id, meal: r.meal ?? null, servings: r.servings, minutes: r.minutes, ingredients: r.ingredients.length, steps: r.method.length, gramsPerServing: Math.round(grams / r.servings), stepMinutes, shopsComplete: ids, medianKcal: med, kcalDeviants: dev, atwaterOff: atwater, per };
  });
  writeFileSync(process.env.AUDIT_OUT ?? "recipe-audit.json", JSON.stringify(rows));
  console.log(`audited ${rows.length} recipes`);
});

//   REPORT=export EXPORT_DIR=/some/dir npx vitest run tests/recipeAudit.check.test.ts   -> batches of recipes as plain JSON for a cook's read
it.skipIf(process.env.REPORT !== "export")("recipe export for reviewers", async () => {
  const { mkdirSync } = await import("node:fs");
  const dir = process.env.EXPORT_DIR ?? "recipe-export";
  mkdirSync(dir, { recursive: true });
  const size = Number(process.env.BATCH ?? 48);
  const plain = RECIPES.map((r) => ({
    id: r.id, name: r.name, meal: r.meal ?? null, servings: r.servings, minutes: r.minutes, tags: r.tags ?? [],
    ingredients: r.ingredients.map((i) => `${i.label}: ${i.amount} ${i.unit}${i.note ? ` (${i.note})` : ""}`),
    method: r.method,
  }));
  for (let b = 0; b * size < plain.length; b++) writeFileSync(`${dir}/batch-${String(b + 1).padStart(2, "0")}.json`, JSON.stringify(plain.slice(b * size, (b + 1) * size), null, 1));
  console.log(`exported ${plain.length} recipes in ${Math.ceil(plain.length / size)} batches`);
});
