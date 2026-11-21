import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Settings › "Clear data on this device" (app/app/_lib/clearData.ts) must empty every store the app keeps about the person. This reads the code: every
// createStore("mm.v1.…") in lib/mm and app/app has to be in clearData.ts's CLEARED table, its LEFT_WITH_THE_ACCOUNT list or its KEPT_ON_CLEAR list (kept on
// purpose, with a reason). A new store that is in none of them fails here until someone decides. (Read as text: the app's files use "@/" imports, which the
// unit tests don't resolve.)

const ROOT = join(__dirname, "..");
const CLEAR_FILE = join(ROOT, "app/app/_lib/clearData.ts");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "locales" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

/** Every store key in the app's code, with the file it is made in. A key given as a constant (APP_SWITCHES_KEY) is looked up in the same file. */
function storeKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of [...sourceFiles(join(ROOT, "lib/mm")), ...sourceFiles(join(ROOT, "app/app"))]) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/createStore(?:<[^(]*?>)?\(\s*([^,)]+)\s*,/g)) {
      const arg = m[1]!.trim();
      const literal = /^["'`](mm\.v1\.[^"'`]+)["'`]$/.exec(arg)?.[1];
      const constant = /^[A-Z][A-Z0-9_]*$/.test(arg) ? new RegExp(`(?:export\\s+)?const\\s+${arg}\\s*=\\s*["'\`](mm\\.v1\\.[^"'\`]+)["'\`]`).exec(text)?.[1] : undefined;
      const key = literal ?? constant;
      if (key) keys.set(key, relative(ROOT, file));
      else if (/^["'`]/.test(arg) || /^[A-Z][A-Z0-9_]*$/.test(arg)) throw new Error(`can't read the store key ${arg} in ${relative(ROOT, file)}`);
    }
  }
  return keys;
}

/** The keys named in one of clearData.ts's lists (from `const NAME` to the text that ends it). */
function listed(text: string, name: string, end: string): string[] {
  const start = text.indexOf(`const ${name}`);
  const stop = text.indexOf(end, start);
  if (start < 0 || stop < 0) throw new Error(`clearData.ts has no ${name}`);
  return [...text.slice(start, stop).matchAll(/["'](mm\.v1\.[A-Za-z0-9]+)["']/g)].map((m) => m[1]!);
}

describe("Clear data on this device", () => {
  const text = readFileSync(CLEAR_FILE, "utf8");
  const cleared = listed(text, "CLEARED", "\n};");
  const leaving = listed(text, "LEFT_WITH_THE_ACCOUNT", "] as const;");
  const kept = listed(text, "KEPT_ON_CLEAR", "} as const;");
  const keys = storeKeys();

  it("finds the stores (the scan itself works)", () => {
    for (const k of ["mm.v1.settings", "mm.v1.log", "mm.v1.mealPlan", "mm.v1.account", "mm.v1.appSwitches", "mm.v1.welcomeProgress"]) expect(keys.has(k), k).toBe(true);
    expect(cleared.length).toBeGreaterThan(15);
  });

  it("clears every store the app keeps, or keeps it on purpose", () => {
    const decided = new Set([...cleared, ...leaving, ...kept]);
    const missing = [...keys.entries()].filter(([k]) => !decided.has(k)).map(([k, file]) => `${k} (${file})`);
    expect(missing, "add each to clearData.ts: CLEARED (with how it is emptied) or KEPT_ON_CLEAR (with why)").toEqual([]);
  });

  it("keeps only what isn't the person's own data", () => {
    expect([...kept].sort()).toEqual(["mm.v1.appSwitches", "mm.v1.hiddenLogos", "mm.v1.paid", "mm.v1.trialOffer", "mm.v1.truthDay"]);
    expect(cleared.filter((k) => kept.includes(k) || leaving.includes(k))).toEqual([]);
  });

  it("empties what the person made: their plan, the people they cook for, Pip's recipes, their lists and their log", () => {
    for (const k of ["mm.v1.settings", "mm.v1.saved", "mm.v1.log", "mm.v1.water", "mm.v1.reminders", "mm.v1.shopping", "mm.v1.mealPlan", "mm.v1.earlierPlans", "mm.v1.household", "mm.v1.myRecipes", "mm.v1.savedRecipes", "mm.v1.cupboard", "mm.v1.compare", "mm.v1.recentItems"]) {
      expect(cleared, k).toContain(k);
    }
    expect(leaving).toEqual(["mm.v1.account", "mm.v1.session", "mm.v1.syncMeta", "mm.v1.community"]);
  });

  // The meeting of 21 November 2026 (Rosa): the settings go whole, but the sheet's list didn't say the diet, allergies and supermarkets go with them.
  it("the sheet's list names what goes with the settings: the goal, targets, diet, allergies and supermarkets", () => {
    expect(cleared).toContain("mm.v1.settings");
    const screen = readFileSync(join(ROOT, "app/app/settings/SettingsScreen.tsx"), "utf8");
    const list = screen.slice(screen.indexOf("const CLEAR_LIST"), screen.indexOf("];", screen.indexOf("const CLEAR_LIST")));
    expect(list).toContain('tk("Your goal, daily targets, diet and allergies")');
    expect(list).toContain('tk("Your supermarkets")');
  });
});
