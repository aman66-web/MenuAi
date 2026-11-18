import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PANTRY } from "../lib/mm/pantry";
import { pieceWeight } from "../lib/mm/recipes";
import { normalizeForSearch } from "../lib/mm/search";
import { decodeShopProducts, hasPrice, type ShopFile, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";

// Writes data/groceries/recipe-candidates/<shop>.csv (WRITE_CANDIDATES=1): every priced product in each shop's list whose name matches a recipe ingredient
// kind by the recipes' own word rules (lib/mm/recipes.ts matching: all / any / none words, the words no recipe ingredient is, piece weights), whether or not its
// label has been read yet. The Chrome label readers (tools/groceries/labels_chrome_next.py --all) read these products first (founder 2026-11-18: "at the end of the
// day we need recipes for each supermarket"). Nutrition conditions (per 100 g or ml, as sold, kcal ranges) are left to the recipes themselves: here a product
// only has to be one a recipe could use once its label is read.
const GLOBAL_NONE = ["meal", "sandwich", "kit", "gift", "hamper", "soup", "chowder", "broth"];
const has = (h: string, w: string) => h.includes(` ${normalizeForSearch(w)}`);

function kindsFor(p: ShopProduct): string[] {
  const h = ` ${normalizeForSearch(p.name)} `;
  const out: string[] = [];
  for (const kind of PANTRY.values()) {
    for (const m of [kind.match, kind.halal?.match].filter(Boolean)) {
      if (!m) continue;
      if (!m.all.every((w) => has(h, w))) continue;
      if (m.any && !m.any.some((w) => has(h, w))) continue;
      if ([...GLOBAL_NONE, ...(m.none ?? [])].some((w) => has(h, w))) continue;
      if (m.pieceWeight) {
        const w = pieceWeight(p.name);
        if (w === null || w < m.pieceWeight[0] || w > m.pieceWeight[1]) continue;
      }
      out.push(kind.key);
      break;
    }
  }
  return out;
}

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

describe("recipe candidates", () => {
  it.skipIf(!process.env.WRITE_CANDIDATES)("writes each shop's products that a recipe could use", () => {
    const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
    const summary: string[] = [];
    for (const r of manifest.retailers) {
      const products = decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8")) as ShopFile);
      const rows: string[] = ["product_id,name,price,page,gtin,kinds"];
      const seen = new Set<string>();
      for (const p of products) {
        if (!hasPrice(p)) continue; // a recipe prices every ingredient
        const kinds = kindsFor(p);
        if (!kinds.length) continue;
        kinds.forEach((k) => seen.add(k));
        rows.push([p.id, p.name, p.price, p.page ?? "", p.gtin ?? "", kinds.join(" ")].map(csv).join(","));
      }
      writeFileSync(`../data/groceries/recipe-candidates/${r.id}.csv`, rows.join("\n") + "\n");
      const missing = [...PANTRY.keys()].filter((k) => !seen.has(k));
      summary.push(`${r.id}: ${rows.length - 1} products, ${seen.size}/${PANTRY.size} kinds; missing: ${missing.join(" ")}`);
    }
    writeFileSync("../data/groceries/recipe-candidates/SUMMARY.txt", summary.join("\n") + "\n");
    expect(summary.length).toBeGreaterThan(0);
  }, 300_000);
});
