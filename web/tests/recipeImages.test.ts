import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { RECIPE_LOOKS } from "../lib/mm/recipeBook/looks";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { MEAL_TYPES, type Recipe } from "../lib/mm/recipes";

// The pictures for our own recipes (founder's decision 2026-10-10: illustrations made with AI, captioned as such; 2026-10-16: made with Midjourney, every one
// a bird's-eye view). docs/RECIPE_IMAGE_PROMPTS.md holds one Midjourney prompt per recipe and is kept in step with the recipe book by this test: a recipe's
// "look" (what the camera sees from above) is in lib/mm/recipeBook/looks.ts; after adding or changing recipes or looks run
// WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts

const DOC = "../docs/RECIPE_IMAGE_PROMPTS.md";

/** The same style for every picture, so the 100-odd cards look like one set. */
export const STYLE =
  "Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, " +
  "soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling.";
/** Midjourney's settings: 4:3 like the app's pictures, version 7 with its plainer "raw" style, and what must never appear. */
export const PARAMS = "--ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam";

export function imagePrompt(r: Recipe): string {
  const look = RECIPE_LOOKS[r.id];
  if (!look) throw new Error(`recipe ${r.id} has no look in lib/mm/recipeBook/looks.ts`);
  return `${look} ${STYLE} ${PARAMS}`;
}

export function promptsDoc(): string {
  const out = [
    "# Recipe picture prompts (Midjourney, bird's-eye view)",
    "",
    "One Midjourney prompt per recipe in the app's recipe book. Founder's decisions: 2026-10-10 (CLAUDE.md rule 2) our own recipes may show an illustration made with AI, which the app captions",
    '"Illustration made with AI, not a photo of the products below." and never uses for a restaurant\'s or a supermarket\'s item; 2026-10-16 the pictures are made with Midjourney and every one is a bird\'s-eye view.',
    "",
    "Pictures that have been added are ticked. This file is rewritten from the recipe book by `WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts` (run in `web/`), so don't edit it by hand;",
    "each recipe's description of how it looks from above is in `web/lib/mm/recipeBook/looks.ts`, the shared style and settings are at the top of `web/tests/recipeImages.test.ts`.",
    "",
    "## Read first: Midjourney's rules",
    "",
    "Midjourney's Community Guidelines say it has no API and that **automating interactions with Midjourney is prohibited; accounts that do not comply may be blocked**",
    "(https://docs.midjourney.com/docs/community-guidelines). Letting Claude in Chrome paste the prompts and click through the site is automation of that kind, so it could put the founder's account at risk: read the current terms and decide.",
    "The safe way is for a person to paste each prompt (108 of them) and download the pictures; the hand-over below also works for a person following it. Images made on a paid plan can be used commercially under Midjourney's terms (check the",
    "current plan rules: a company above a revenue threshold needs the Pro plan). If Midjourney is not wanted, the same descriptions work in Nano Banana: drop the `--` settings at the end of each prompt.",
    "",
    "## Hand-over for Claude in Chrome (or for a person)",
    "",
    "You are making one picture per recipe with Midjourney for Numbite, a UK calories and protein app. The founder is logged in to Midjourney in this browser with a paid plan. Work in the Midjourney tab only, one recipe at a time, one job at a time.",
    "",
    "1. Open https://www.midjourney.com/imagine. The prompts already say `--v 7 --ar 4:3 --style raw`.",
    "2. Take the recipes below in order. Paste each prompt **exactly as written** (do not edit, shorten or add words; the only addition allowed is the `--sref` in step 5), submit it, and wait until the four pictures have finished.",
    "3. Choose the best of the four that passes **every** point: (a) taken straight down from above, not tilted, the plate or bowl fully in view and centred with space around it; (b) it shows the dish described and no other food (no lemon wedge, herbs, sauce pot or side dish that the prompt does not mention);",
    "   (c) no writing, letters, numbers, logos, brand names, packaging, jars, tins or bottles anywhere; (d) no hands, people, cutlery or steam; (e) natural food colours, appetising, nothing that looks plastic, burnt or half-raw; (f) one portion, on a light wooden table; (g) not nearly the same picture as another recipe's.",
    "4. Open the chosen picture, upscale it (Upscale Subtle) if offered, and download the PNG. Save it as **`<recipe id>.png`** (the id is the code in the heading, for example `overnight-oats.png`) in one folder, `numbite-recipe-images`, in Downloads.",
    "   If none of the four passes, run the same prompt again (or Vary Subtle on the closest), at most three tries; if it still fails, write the id on a NEEDS ATTENTION list and move on.",
    "5. **One look for the whole set:** when the first picture (`overnight-oats`) has been chosen, copy its image link and add ` --sref <that link>` to the end of every later prompt. If the pictures start to look too alike, stop adding it.",
    "6. Pace: send the next prompt only after the previous one is finished; never several at once; if Midjourney asks you to slow down or wait, wait.",
    "7. **Stop and tell the founder** if Midjourney shows a CAPTCHA or human-verification step, a login or payment page, an error about too many jobs, or any warning about the account. Do not try to get past it.",
    "8. Keep a running list in your replies: done, and NEEDS ATTENTION. When finished, say which ids are done, which need attention, and where the files are. Do not upload other images, change the prompts, or add text or branding to any picture.",
    "",
    "Then, on the founder's computer: copy the PNG files into `data/recipe-images/` (named `<recipe id>.png`), run `python3 tools/recipes/import_recipe_images.py` (it crops to 4:3, resizes to 800 x 600, writes WebP copies into `web/public/recipe-images/`",
    "and lists them in `web/lib/mm/recipeImages.ts`), then commit and push. Or send the files to Claude and it does this.",
    "",
    `${RECIPES.length} recipes, ${Object.keys(RECIPE_IMAGES).length} with a picture.`,
  ];
  for (const m of MEAL_TYPES) {
    const list = RECIPES.filter((r) => r.meal === m.value);
    if (!list.length) continue;
    out.push("", `## ${m.label}`);
    for (const r of list) out.push("", `### ${RECIPE_IMAGES[r.id] ? "✓ " : ""}${r.name} · \`${r.id}\``, "", "```", imagePrompt(r), "```");
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

  it("every recipe has a look, every look belongs to a recipe, and the looks follow the rules", () => {
    const ids = new Set(RECIPES.map((r) => r.id));
    for (const id of Object.keys(RECIPE_LOOKS)) expect(ids.has(id), `${id} in looks.ts is a recipe`).toBe(true);
    // never: tools or hands or people, writing, packaging, steam, drink, brand names, claims about health or food, camera or table words (the shared style says those)
    const banned = /\b(healthy|fresh|light|lean|protein|low-calorie|clean|nutritious|wholesome|diet|fork|knife|spoon|chopsticks?|hands?|person|people|text|writing|label|jar|tin|bottle|carton|packet|bag|steam|smoke|wine|beer|menu|recipe|photo|overhead|table)\b/i;
    const brands = /sainsbury|tesco|asda|aldi|lidl|waitrose|morrisons|patak|blue dragon|quorn|heinz|branded|logo/i;
    for (const r of RECIPES) {
      const look = RECIPE_LOOKS[r.id];
      expect(look, `${r.id} needs a look in lib/mm/recipeBook/looks.ts`).toBeTruthy();
      const words = look!.trim().split(/\s+/).length;
      expect(words, `${r.id}: a look is 22 to 55 words`).toBeGreaterThanOrEqual(22);
      expect(words, `${r.id}: a look is 22 to 55 words`).toBeLessThanOrEqual(55);
      expect(look, `${r.id}: banned word in the look`).not.toMatch(banned);
      expect(look, `${r.id}: brand name in the look`).not.toMatch(brands);
    }
  });

  it("prompts are bird's-eye Midjourney prompts that forbid writing, packaging and people", () => {
    for (const r of RECIPES) {
      const p = imagePrompt(r);
      expect(p, r.id).toContain("bird's-eye view shot straight down from directly above");
      expect(p, r.id).toMatch(/ --ar 4:3 --v 7 --style raw --no [^]*text[^]*logo[^]*packaging[^]*hands[^]*people/);
      expect(p.split(" --ar")[0], r.id).not.toMatch(/sainsbury|tesco|asda|aldi|lidl|waitrose|morrisons|patak|blue dragon|quorn|heinz|branded|logo/i);
    }
  });
});
