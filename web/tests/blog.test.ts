import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARTICLES, ARTICLE_TAGS, articleById } from "../lib/mm/blog";
import type { Article, Block } from "../lib/mm/blog/types";
import { RETAILERS, retailerName } from "../lib/mm/groceries";
import { CHAIN_LOGOS, SHOP_LOGOS } from "../lib/mm/logos";

// Numbite's own articles (Community › Food blogs, lib/mm/blog/). They are text only and bundled in the app, so they must never carry a number that
// looks like data we didn't copy (CLAUDE.md rule 1), never call food good or bad or make a health claim (rule 3), and never name a restaurant or shop.

const BLOG_DIR = new URL("../lib/mm/blog/", import.meta.url).pathname;
const MANIFEST = JSON.parse(readFileSync(new URL("../public/menus/menus-manifest.json", import.meta.url).pathname, "utf8")) as { chains: Array<{ id: string; name: string }> };

const ALLOWED_TAGS = ["Eating out", "Groceries", "Recipes", "Numbers", "Allergies", "Using Numbite"] as const;

const textOf = (b: Block): string[] => ("h" in b ? [b.h] : "p" in b ? [b.p] : b.ul);
const allText = (a: Article): string[] => [a.title, a.summary, ...a.tags, ...a.blocks.flatMap(textOf)];
const bodyWords = (a: Article): number => a.blocks.flatMap(textOf).join(" ").split(/\s+/).filter(Boolean).length;
const norm = (s: string): string => s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
const camel = (id: string): string => id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const isRealDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};

// ---- the content rules, as functions so the tests below can also prove they catch what they should ----

// Words that would turn a plain explanation into a claim: whole words or stems, any case.
const BANNED: Array<[string, RegExp]> = [
  ["healthy", /\b(?:un)?health/i],
  ["good for you", /good for you/i],
  ["bad for you", /bad for you/i],
  ["clean eating", /clean eating/i],
  ["junk", /\bjunk/i],
  ["guilt", /\bguilt/i],
  ["cheat", /\bcheat/i],
  ["detox", /\bdetox/i],
  ["cure", /\bcur(?:e|es|ed|ing)\b/i],
  ["superfood", /\bsuperfood/i],
  ["lean", /\blean(?:er|est)?\b/i],
  ["burn", /\bburn/i],
  ["lose weight", /\blos(?:e|es|ing|t) (?:\w+ )?weight/i],
  ["weight", /\bweight/i],
  ["fat loss", /\bfat loss\b/i],
  ["boost", /\bboost/i],
  ["metabolism", /\bmetabolis/i],
  ["diet culture", /diet culture/i],
  ["doctor", /\bdoctors?\b/i],
  ["disease", /\bdisease/i],
  ["diabetes", /\bdiabet/i],
  ["cancer", /\bcancer/i],
  ["GLP-1", /\bglp\b|\bozempic\b|\bwegovy\b/i],
  ["earn / deserve", /\bearn(?:ed|s|ing)?\b|\bdeserv/i],
  ["be good", /\bbe good\b/i],
  ["good or bad food", /\b(?:good|bad) (?:food|foods|choice|choices|option|options)\b|\b(?:better|worse|best|worst) (?:food|foods|choice|choices|option|options)\b/i],
];
function bannedWordsIn(text: string): string[] {
  const t = norm(text);
  return BANNED.filter(([, re]) => re.test(t)).map(([name]) => name);
}

// A number straight in front of a nutrition unit is a claim about data (rule 1), so no sentence may have one. Arithmetic about a made-up amount
// ("200 g is two portions of 100 g") is written without a nutrition unit after the number, so it passes.
const NUMBER_WITH_UNIT = /\d[\d,.]*\s*(?:kcal|calories?|cals?|kj|g\s+(?:of\s+)?protein|g\s+(?:carbs?|carbohydrates?|fat|sugars?|salt|fibre)|grams?|%)/i;
function numberClaimsIn(text: string): string[] {
  return norm(text)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => NUMBER_WITH_UNIT.test(sentence));
}

// Restaurant and supermarket names from the app's own lists: the chains in the menu manifest (the ids in logos.ts are their ids) and the shops in
// groceries.ts (the ids in SHOP_LOGOS). Several words or an "&"/apostrophe: matched in any case. A single word ("Pure", "Goals", "Haven") is matched
// as written, so the ordinary words of the same spelling don't trip the check.
function brandNames(): string[] {
  const names = new Set<string>();
  for (const c of MANIFEST.chains) names.add(c.name);
  for (const id of Object.keys(CHAIN_LOGOS)) {
    const c = MANIFEST.chains.find((x) => x.id === id);
    if (c) names.add(c.name);
  }
  for (const r of RETAILERS) names.add(r.name);
  for (const id of Object.keys(SHOP_LOGOS)) names.add(retailerName(id));
  return [...names].map(norm).filter((n) => n.length >= 3);
}
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function brandNamesIn(text: string, names: readonly string[] = brandNames()): string[] {
  const t = norm(text);
  return names.filter((name) => {
    const single = /^[\p{L}\p{N}]+$/u.test(name);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, single ? "u" : "iu");
    return re.test(t);
  });
}

describe("the articles are well formed", () => {
  it("there are at least the eight first articles", () => {
    expect(ARTICLES.length).toBeGreaterThanOrEqual(8);
  });

  it("every id is short kebab-case, unique, and matches its file and its export name", () => {
    const ids = ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ARTICLES) {
      expect(a.id, a.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(a.id.length, a.id).toBeLessThanOrEqual(40);
      expect(existsSync(`${BLOG_DIR}${a.id}.ts`), `${a.id}.ts`).toBe(true);
      expect(readFileSync(`${BLOG_DIR}${a.id}.ts`, "utf8"), a.id).toContain(`export const ${camel(a.id)}: Article`);
    }
  });

  it("every article file in the folder is listed (no orphans)", () => {
    const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts").map((f) => f.replace(/\.ts$/, ""));
    expect(files.sort()).toEqual(ARTICLES.map((a) => a.id).sort());
  });

  it("titles and summaries are present, plain and the right length", () => {
    for (const a of ARTICLES) {
      expect(a.title.trim(), a.id).toBe(a.title);
      expect(a.title.length, a.id).toBeGreaterThan(8);
      expect(a.title.length, a.id).toBeLessThanOrEqual(70);
      expect(a.title, a.id).not.toMatch(/[.!]$/);
      expect(a.title[0], a.id).toBe(a.title[0]!.toUpperCase());
      expect(a.summary.trim(), a.id).toBe(a.summary);
      expect(a.summary.length, a.id).toBeGreaterThan(20);
      expect(a.summary.length, a.id).toBeLessThanOrEqual(140);
      expect(a.summary, a.id).toMatch(/[.]$/);
      expect(norm(a.summary).replace(/\.$/, ""), a.id).not.toMatch(/\.\s/); // one sentence
    }
  });

  it("each article is 350 to 600 words and its reading time is honest (about 200 words a minute)", () => {
    for (const a of ARTICLES) {
      const words = bodyWords(a);
      expect(words, `${a.id}: ${words} words`).toBeGreaterThanOrEqual(350);
      expect(words, `${a.id}: ${words} words`).toBeLessThanOrEqual(600);
      expect(Number.isInteger(a.minutes), a.id).toBe(true);
      expect(a.minutes, a.id).toBeGreaterThanOrEqual(1);
      expect(a.minutes, a.id).toBeLessThanOrEqual(6);
      expect(Math.abs(a.minutes - Math.ceil(words / 200)), `${a.id}: ${words} words, ${a.minutes} min`).toBeLessThanOrEqual(1);
    }
  });

  it("dates are real calendar dates, not in the future", () => {
    const today = todayLocal();
    for (const a of ARTICLES) {
      expect(isRealDate(a.date), `${a.id}: ${a.date}`).toBe(true);
      expect(a.date >= "2026-09-01", `${a.id}: ${a.date}`).toBe(true);
      expect(a.date <= today, `${a.id}: ${a.date} is after ${today}`).toBe(true);
    }
  });

  it("tags come only from the allowed set, with no repeats", () => {
    for (const a of ARTICLES) {
      expect(a.tags.length, a.id).toBeGreaterThanOrEqual(1);
      expect(a.tags.length, a.id).toBeLessThanOrEqual(3);
      expect(new Set(a.tags).size, a.id).toBe(a.tags.length);
      for (const tag of a.tags) expect(ALLOWED_TAGS as readonly string[], `${a.id}: ${tag}`).toContain(tag);
    }
  });

  it("blocks: each has exactly one kind and real text; headings and paragraphs are laid out like an article", () => {
    for (const a of ARTICLES) {
      const kinds = a.blocks.map((b) => Object.keys(b));
      for (const k of kinds) expect(k, a.id).toHaveLength(1);
      for (const b of a.blocks) for (const t of textOf(b)) {
        expect(typeof t, a.id).toBe("string");
        expect(t.trim(), a.id).toBe(t);
        expect(t.length, a.id).toBeGreaterThan(2);
        expect(t, a.id).not.toMatch(/ {2,}|\n|\t/);
      }
      const heads = a.blocks.filter((b) => "h" in b);
      const paras = a.blocks.filter((b) => "p" in b);
      const lists = a.blocks.filter((b): b is { ul: string[] } => "ul" in b);
      expect(heads.length, a.id).toBeGreaterThanOrEqual(1);
      expect(paras.length, a.id).toBeGreaterThanOrEqual(2);
      expect(lists.length, `${a.id}: a list or two at most`).toBeLessThanOrEqual(2);
      for (const l of lists) {
        expect(l.ul.length, a.id).toBeGreaterThanOrEqual(3);
        expect(l.ul.length, a.id).toBeLessThanOrEqual(5);
        for (const item of l.ul) expect(item.split(/\s+/).length, `${a.id}: "${item}"`).toBeLessThanOrEqual(30);
      }
      for (const h of heads) {
        const text = (h as { h: string }).h;
        expect(text.length, `${a.id}: ${text}`).toBeLessThanOrEqual(70);
        expect(text, `${a.id}: ${text}`).not.toMatch(/[.!?]$/);
      }
      // starts with a heading, never ends on one, never two in a row; no section runs on for more than about 220 words
      expect("h" in a.blocks[0]!, `${a.id} starts with a heading`).toBe(true);
      expect("h" in a.blocks[a.blocks.length - 1]!, `${a.id} ends on a heading`).toBe(false);
      let words = 0;
      a.blocks.forEach((b, i) => {
        if ("h" in b) {
          expect(i > 0 && "h" in a.blocks[i - 1]!, `${a.id}: two headings in a row`).toBe(false);
          words = 0;
        } else {
          words += textOf(b).join(" ").split(/\s+/).length;
          expect(words, `${a.id}: a section is too long`).toBeLessThanOrEqual(220);
        }
      });
    }
  });

  it("no emoji, markup, links or straight double quotes inside the text", () => {
    for (const a of ARTICLES) for (const t of allText(a)) {
      expect(t, a.id).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(t, a.id).not.toMatch(/[<>]|https?:|www\.|\.com\b/i);
      expect(t, a.id).not.toMatch(/"/);
    }
  });
});

describe("order and lookup", () => {
  it("ARTICLES is sorted newest first, then by title", () => {
    for (let i = 1; i < ARTICLES.length; i++) {
      const prev = ARTICLES[i - 1]!;
      const cur = ARTICLES[i]!;
      const ok = prev.date > cur.date || (prev.date === cur.date && prev.title.localeCompare(cur.title) <= 0);
      expect(ok, `${prev.id} (${prev.date}) before ${cur.id} (${cur.date})`).toBe(true);
    }
  });

  it("ARTICLE_TAGS is the distinct tags of the articles, sorted", () => {
    const expected = [...new Set(ARTICLES.flatMap((a) => a.tags))].sort((a, b) => a.localeCompare(b));
    expect([...ARTICLE_TAGS]).toEqual(expected);
    for (const tag of ARTICLE_TAGS) expect(ALLOWED_TAGS as readonly string[]).toContain(tag);
  });

  it("articleById finds an article by its id and nothing else", () => {
    for (const a of ARTICLES) expect(articleById(a.id)).toBe(a);
    for (const bad of [undefined, null, "", "no-such-article", "__proto__", "constructor", "toString", " reading-menu-figures", "READING-MENU-FIGURES"]) {
      expect(articleById(bad), String(bad)).toBeUndefined();
    }
  });
});

describe("the content rules (CLAUDE.md rules 1 to 3)", () => {
  it("no banned word or stem anywhere in the text", () => {
    for (const a of ARTICLES) for (const t of allText(a)) {
      expect(bannedWordsIn(t), `${a.id}: "${t.slice(0, 80)}"`).toEqual([]);
    }
  });

  it("no number in front of a nutrition unit, not even in a sentence that says it is an example", () => {
    for (const a of ARTICLES) for (const t of allText(a)) {
      expect(numberClaimsIn(t), `${a.id}`).toEqual([]);
    }
  });

  it("names no restaurant and no supermarket", () => {
    const names = brandNames();
    expect(names.length).toBeGreaterThan(200); // the manifest's chains and the shops were really read
    for (const needle of ["KFC", "Nando's", "Tesco", "Sainsbury's", "M&S", "Co-op", "Pret A Manger"]) expect(names, needle).toContain(needle);
    for (const a of ARTICLES) for (const t of allText(a)) {
      expect(brandNamesIn(t, names), `${a.id}: "${t.slice(0, 80)}"`).toEqual([]);
    }
  });
});

// The articles tell people where to tap, so every screen name and button they quote must be a real label in the app (keys.json lists every
// string the code passes through t()/tk(), regenerated by tests/i18n.test.ts). A renamed or invented label fails here instead of in a reader's hands.
describe("the screen names and buttons the articles quote", () => {
  const KEYS = new Set(JSON.parse(readFileSync(new URL("../lib/mm/locales/keys.json", import.meta.url).pathname, "utf8")) as string[]);
  const UI_LABELS = [
    "Find by numbers or allergies", "Your numbers", "Use my meal numbers", "Best for you", "Report a number", "More detail", "Protein for £1",
    "Add all to my shopping list", "Save to My meals", "Got a list from a friend? Open it", "Share list", "Add from another shop", "I have this",
    "Use something else instead", "Swap", "Compare", "Highest", "Lowest", "Add to my list", "Shopping list", "What can I cook with this?",
    "You might also need", "Restaurant dishes", "Allergies to avoid", "Eat out", "Groceries", "Recipes", "Settings",
  ];

  it("each one is a label the app really has", () => {
    for (const label of UI_LABELS) expect(KEYS.has(label), label).toBe(true);
  });

  it("the finder is quoted by its own name, not as part of More ways to find a restaurant", () => {
    const text = ARTICLES.flatMap(allText).join("\n");
    expect(text).toContain("Find by numbers or allergies");
    expect(text).not.toMatch(/More ways to find a restaurant, then Your numbers/);
  });
});

describe("the checks catch what they should", () => {
  it("banned words", () => {
    expect(bannedWordsIn("This is a healthy snack.")).toContain("healthy");
    expect(bannedWordsIn("Good for you, and a superfood.")).toEqual(expect.arrayContaining(["good for you", "superfood"]));
    expect(bannedWordsIn("It can boost your metabolism and burn fat.")).toEqual(expect.arrayContaining(["boost", "metabolism", "burn"]));
    expect(bannedWordsIn("Ask your doctor about weight loss.")).toEqual(expect.arrayContaining(["doctor", "weight"]));
    expect(bannedWordsIn("A lean cut, guilt-free, no cheat days.")).toEqual(expect.arrayContaining(["lean", "guilt", "cheat"]));
    expect(bannedWordsIn("The best choice and a bad food.")).toContain("good or bad food");
    expect(bannedWordsIn("A plain sentence about reading a label and a serving.")).toEqual([]);
    expect(bannedWordsIn("It is a secure bag. The decline continues.")).toEqual([]); // stems start at a word, so "secure" is fine
  });

  it("number claims", () => {
    expect(numberClaimsIn("A burger has 500 kcal.")).toHaveLength(1);
    expect(numberClaimsIn("It gives 30 g protein and 12% of the rest.")).toHaveLength(1);
    expect(numberClaimsIn("There are 40 grams in a serving. And 300 calories.")).toHaveLength(2);
    expect(numberClaimsIn("For example, a chicken wrap has 450 kcal.")).toHaveLength(1); // an example is no excuse for a number about a named food
    expect(numberClaimsIn("For instance, aim for 30 g protein.")).toHaveLength(1);
    expect(numberClaimsIn("Say you have 200 g of something, which is two portions of 100 g.")).toEqual([]);
    expect(numberClaimsIn("Numbers are per 100 g or per 100 ml.")).toEqual([]);
  });

  it("brand names, whole words only", () => {
    const names = ["Tesco", "Nando's", "Pret A Manger", "Pure", "M&S"];
    expect(brandNamesIn("We went to Tesco.", names)).toEqual(["Tesco"]);
    expect(brandNamesIn("Try nando’s or pret a manger.", names)).toEqual(["Nando's", "Pret A Manger"]);
    expect(brandNamesIn("M&S sells it.", names)).toEqual(["M&S"]);
    expect(brandNamesIn("A pure sentence with tescos and the pureed word.", names)).toEqual([]); // not whole words, and the ordinary word is not the chain
    expect(brandNamesIn("Pure is a chain.", names)).toEqual(["Pure"]);
  });
});
