import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { englishT, format, LOCALES, placeholders, translate } from "../lib/mm/i18n";
import { PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { MEAL_TYPES } from "../lib/mm/recipes";

// Every piece of our own text, and every language's dictionary for it (lib/mm/i18n.ts). The keys are found in the code
// (t("…") and tk("…") with a plain double-quoted literal) and in the data we write ourselves (the recipe book, the pantry).
// After adding or changing text run  WRITE_I18N=1 npx vitest run tests/i18n.test.ts  to rewrite lib/mm/locales/keys.json,
// then translate the new keys into each language file.

const KEYS_FILE = "lib/mm/locales/keys.json";
const CALL = /\bt[k]?\(\s*"((?:[^"\\]|\\.)*)"/g;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Keys written in the code. */
function codeKeys(): string[] {
  const out: string[] = [];
  for (const f of [...files("app/app"), ...files("lib/mm")]) {
    for (const m of readFileSync(f, "utf8").matchAll(CALL)) out.push(JSON.parse(`"${m[1]}"`) as string);
  }
  return out;
}

/** Keys that come from data we write ourselves and that screens pass through t(x). */
function dataKeys(): string[] {
  const out: string[] = [];
  const add = (s: string | undefined) => { if (s && s.trim()) out.push(s); };
  for (const r of RECIPES) {
    add(r.name); add(r.blurb);
    r.method.forEach(add);
    r.extras.forEach(add);
    for (const i of r.ingredients) { add(i.label); add(i.note); }
  }
  for (const k of PANTRY.values()) { add(k.label); add(k.note); add(k.halal?.label); }
  for (const m of MEAL_TYPES) add(m.label);
  // our own grocery type names (tools/groceries/build_groceries.py writes them into the manifest)
  const groceries = JSON.parse(readFileSync("public/groceries/groceries-manifest.json", "utf8")) as { categories?: Array<{ label: string }> };
  for (const c of groceries.categories ?? []) add(c.label);
  return out;
}

const allKeys = () => [...new Set([...codeKeys(), ...dataKeys()])].sort();

describe("translations", () => {
  it("t() fills in values and falls back to English", () => {
    expect(format("{n} of {total}", { n: 2, total: 5 })).toBe("2 of 5");
    expect(translate({ "Hello {name}": "Cześć {name}" }, "Hello {name}", { name: "Pip" })).toBe("Cześć Pip");
    expect(translate({}, "Missing", undefined)).toBe("Missing");
    expect(translate({ Blank: "  " }, "Blank")).toBe("Blank");
    expect(englishT("{n} kcal", { n: 300 })).toBe("300 kcal");
  });

  it("keys.json lists every key in the code and our data", () => {
    const keys = allKeys();
    if (process.env.WRITE_I18N) writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 1) + "\n");
    const saved = existsSync(KEYS_FILE) ? (JSON.parse(readFileSync(KEYS_FILE, "utf8")) as string[]) : [];
    expect(saved, "run WRITE_I18N=1 npx vitest run tests/i18n.test.ts").toEqual(keys);
  });

  for (const l of LOCALES.filter((x) => x.code !== "en")) {
    it(`${l.english} (${l.code}) translates every key, keeps every {placeholder}, and has nothing extra`, () => {
      const keys = JSON.parse(readFileSync(KEYS_FILE, "utf8")) as string[];
      const dict = JSON.parse(readFileSync(`lib/mm/locales/${l.code}.json`, "utf8")) as Record<string, string>;
      const missing = keys.filter((k) => typeof dict[k] !== "string" || dict[k]!.trim() === "");
      expect(missing.length, `missing ${missing.length}, e.g. ${JSON.stringify(missing.slice(0, 3))}`).toBe(0);
      const extra = Object.keys(dict).filter((k) => !keys.includes(k));
      expect(extra, "keys no longer used").toEqual([]);
      for (const k of keys) expect(placeholders(dict[k]!), `${l.code}: "${k}"`).toEqual(placeholders(k));
    });
  }
});
