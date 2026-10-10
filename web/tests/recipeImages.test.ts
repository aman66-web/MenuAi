import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { MEAL_TYPES, type Recipe } from "../lib/mm/recipes";

// The pictures for our own recipes (founder's decision 2026-10-10: illustrations made with AI, e.g. Nano Banana, captioned as such).
// docs/RECIPE_IMAGE_PROMPTS.md holds one prompt per recipe and is kept in step with the recipe book by this test:
// after adding or changing recipes run  WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts

const DOC = "../docs/RECIPE_IMAGE_PROMPTS.md";
const plain = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();

export function imagePrompt(r: Recipe): string {
  const what = r.ingredients.map((i) => plain(i.label)).join(", ");
  const extras = r.extras.length ? ` Also in the dish: ${r.extras.map(plain).join(", ")}.` : "";
  const serve = r.meal === "snack" ? "a small snack portion on a plain white plate" : "one home-made portion on a plain white plate or in a plain white bowl";
  return (
    `A realistic, appetising food photograph of ${r.name.toLowerCase()}: ${serve}, on a light wooden kitchen table, seen from a three-quarter angle, ` +
    `soft natural daylight, shallow depth of field, landscape 4:3. It is made from ${what}.${extras} ` +
    `Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, ` +
    `numbers, logos or brand names anywhere; no people or hands.`
  );
}

export function promptsDoc(): string {
  const out = [
    "# Recipe picture prompts",
    "",
    "One prompt per recipe in the app's recipe book, for making its picture with an AI image tool (Nano Banana).",
    "Founder's decision 2026-10-10 (CLAUDE.md rule 2): our own recipes may show an illustration made with AI; the app captions it",
    '"Illustration made with AI" and never uses one for a restaurant\'s or a supermarket\'s item.',
    "",
    "How to add the pictures:",
    "",
    "1. Paste a prompt into Nano Banana. Check the picture shows the dish described, with no writing, packaging or logos in it.",
    "2. Save it as `data/recipe-images/<recipe id>.png` (the id is the code after each heading, e.g. `chicken-rice-bowl.png`).",
    "3. Run `python3 tools/recipes/import_recipe_images.py`. It crops to 4:3, resizes to 800 x 600, saves WebP copies in",
    "   `web/public/recipe-images/` and lists them in `web/lib/mm/recipeImages.ts`. Then commit and push.",
    "",
    "Pictures that have been added are ticked. This file is rewritten from the recipe book by",
    "`WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts` (run in `web/`), so don't edit it by hand.",
    "",
    `${RECIPES.length} recipes, ${Object.keys(RECIPE_IMAGES).length} with a picture.`,
  ];
  for (const m of MEAL_TYPES) {
    const list = RECIPES.filter((r) => r.meal === m.value);
    if (!list.length) continue;
    out.push("", `## ${m.label}`);
    for (const r of list) out.push("", `### ${RECIPE_IMAGES[r.id] ? "✓ " : ""}${r.name} · \`${r.id}\``, "", imagePrompt(r));
  }
  return out.join("\n") + "\n";
}

describe("recipe pictures", () => {
  it("every picture belongs to a recipe and its file exists", () => {
    const ids = new Set(RECIPES.map((r) => r.id));
    for (const [id, src] of Object.entries(RECIPE_IMAGES)) {
      expect(ids.has(id), `${id} is a recipe`).toBe(true);
      expect(src).toMatch(new RegExp(`^/recipe-images/${id}-[0-9a-f]{10}\\.webp$`));
      expect(existsSync(`public${src}`), `${src} exists`).toBe(true);
    }
  });

  it("the prompts in docs/RECIPE_IMAGE_PROMPTS.md match the recipe book", () => {
    const doc = promptsDoc();
    if (process.env.WRITE_PROMPTS) writeFileSync(DOC, doc);
    expect(existsSync(DOC) ? readFileSync(DOC, "utf8") : "", "run WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts").toBe(doc);
  });

  it("prompts never ask for writing, packaging or brands", () => {
    for (const r of RECIPES) {
      const p = imagePrompt(r);
      expect(p).toContain("no labels, writing");
      expect(p.split("No packaging")[0], r.id).not.toMatch(/sainsbury|tesco|asda|aldi|lidl|waitrose|morrisons|patak|blue dragon|quorn|heinz|branded|logo/i);
    }
  });
});
