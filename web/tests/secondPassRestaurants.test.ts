import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isOrderSaved } from "../lib/mm/menu-view";
import type { OrderLine } from "../lib/mm/order";

// The second pass of the 21 November 2026 meeting (fixer 2: restaurants, the meal plan's double taps and accessibility). The screens aren't rendered in these
// tests, so the rules are checked on the helpers they call and on the source lines that carry them.

const src = (path: string) => readFileSync(path, "utf8");

describe("the meal plan's 'Added to {meal}' pill (Arjun #55: tapping it logged the portion again)", () => {
  const plan = src("app/app/plan/page.tsx");
  it("does nothing once added, and says so to a screen reader, keeping its look", () => {
    expect(plan).toContain("aria-disabled={isAdded || undefined} onClick={() => { if (!isAdded) logMine(m.candidate, m.meal, addKey); }}");
    expect(plan).not.toContain("onClick={() => logMine(m.candidate, m.meal, addKey)}");
  });
  it("logMine itself never logs a portion already added (a tap that reaches it through the paywall too); Undo still clears the key", () => {
    const logMine = plan.slice(plan.indexOf("const logMine = "), plan.indexOf("const undoLog = "));
    expect(logMine).toMatch(/gate\("log", \(\) => \{\s*\/\/[^\n]*\n\s*if \(loggedKeys\.has\(key\)\) return;/);
    expect(logMine.indexOf("if (loggedKeys.has(key)) return;")).toBeLessThan(logMine.indexOf("addLogEntry("));
    const undo = plan.slice(plan.indexOf("const undoLog = "));
    expect(undo).toContain("next.delete(logged.key)");
  });
});

describe("the dish page's Save (Arjun #56: every tap added another copy, using up the 3 free saves)", () => {
  const line: OrderLine = { kind: "item", itemId: "big-mac", qty: 1, modifierIds: [] };
  it("an order with the same restaurant and the same lines counts as saved, whatever order its keys came back in", () => {
    expect(isOrderSaved([{ chainId: "mcdonalds", lines: [line] }], "mcdonalds", [line])).toBe(true);
    // a synced copy may come back with its keys reordered
    const reordered = { modifierIds: [], qty: 1, itemId: "big-mac", kind: "item" } as unknown as OrderLine;
    expect(isOrderSaved([{ chainId: "mcdonalds", lines: [reordered] }], "mcdonalds", [line])).toBe(true);
  });
  it("another restaurant, another dish, another amount or extras, or no lines at all, is not", () => {
    expect(isOrderSaved([{ chainId: "burger-king", lines: [line] }], "mcdonalds", [line])).toBe(false);
    expect(isOrderSaved([{ chainId: "mcdonalds", lines: [{ ...line, itemId: "fries" }] }], "mcdonalds", [line])).toBe(false);
    expect(isOrderSaved([{ chainId: "mcdonalds", lines: [{ ...line, qty: 2 }] }], "mcdonalds", [line])).toBe(false);
    expect(isOrderSaved([{ chainId: "mcdonalds", lines: [{ ...line, modifierIds: ["no-pickles"] }] }], "mcdonalds", [line])).toBe(false);
    expect(isOrderSaved([{ chainId: "mcdonalds", lines: [line, line] }], "mcdonalds", [line])).toBe(false);
    expect(isOrderSaved([{ chainId: "mcdonalds", lines: [] }], "mcdonalds", [])).toBe(false);
    expect(isOrderSaved([], "mcdonalds", [line])).toBe(false);
  });
  it("both Save buttons say Saved with a filled heart once the dish is in My meals, and add it only when it isn't (checked again as the tap lands)", () => {
    const item = src("app/app/item/ItemScreen.tsx");
    expect(item).toContain("const savedOrders = useStore(savedStore);");
    expect(item).toContain("const alreadySaved = isOrderSaved(savedOrders, chain.id, lines);");
    expect(item).toMatch(/const save = \(nutrients: Nutrients, name: string\) => \{\s*if \(alreadySaved\) return;\s*gate\("saveLimit", \(\) => \{\s*if \(isOrderSaved\(savedStore\.get\(\), chain\.id, lines\)\) return;\s*addSavedOrder\(/);
    expect(item.match(/aria-disabled=\{alreadySaved \|\| undefined\} onClick=\{\(\) => save\(/g)).toHaveLength(2);
    expect(item.match(/<HeartIcon aria-hidden filled=\{alreadySaved\} className="h-5 w-5" \/>\s*\{saveLabel\}/g)).toHaveLength(2);
    expect(item).toContain('const saveLabel = alreadySaved ? t("Saved") : t("Save");');
    // the only place a dish page adds to My meals
    expect(item.match(/addSavedOrder\(/g)).toHaveLength(1);
    // the store hook is called with the others, before the page's early returns
    expect(item.indexOf("useStore(savedStore)")).toBeLessThan(item.indexOf('if (status === "loading") return'));
  });
});

describe("show-more buttons name their panel only while it is on the page (Sam #1)", () => {
  it.each([
    ["app/app/eat-out/page.tsx", 'aria-expanded={moreOpen} aria-controls={moreOpen ? "more-ways" : undefined}'],
    ["app/app/eat-out/page.tsx", 'aria-expanded={finder.open} aria-controls={finder.open ? "find-by-numbers" : undefined}'],
    ["app/app/item/ItemScreen.tsx", 'aria-expanded={detail} aria-controls={detail ? "more-detail" : undefined}'],
    ["app/app/_components/DietPicker.tsx", "aria-controls={showMore ? `${id}-more` : undefined}"],
    ["app/app/chain/ChainScreen.tsx", 'aria-expanded={halalOpen} aria-controls={halalOpen ? "halal-quote" : undefined}'],
  ])("%s: %s", (file, line) => {
    expect(src(file)).toContain(line);
  });
  it("no restaurant file names a panel that may be closed", () => {
    for (const file of ["app/app/eat-out/page.tsx", "app/app/item/ItemScreen.tsx", "app/app/_components/DietPicker.tsx", "app/app/chain/ChainScreen.tsx"]) {
      expect(src(file), file).not.toMatch(/aria-controls="[^"]+"|aria-controls=\{`[^`]+`\}/);
    }
  });
});

describe("screen readers", () => {
  it("Search's loading status has its words inside it, so 'Loading search' is spoken (Sam #3)", () => {
    const search = src("app/app/search/page.tsx");
    const skeleton = search.slice(search.indexOf("function SearchSkeleton"), search.indexOf("const RECENT_KEY"));
    expect(skeleton).toMatch(/<div role="status" className=\{chainGroupClass\}>\s*<span className="sr-only">\{t\("Loading search"\)\}<\/span>/);
    expect(skeleton).not.toContain("aria-label");
  });
  it("protein, carbs and fat are read once on Home and Today: the figures are hidden only when the bar says them (Sam #0)", () => {
    const home = src("app/app/_components/HomeToday.tsx");
    const row = home.slice(home.indexOf("export function MacroRow"), home.indexOf("export function HomeToday"));
    expect(row).toContain('<p className="app-numbers mt-0.5 text-[0.9375rem] leading-snug" aria-hidden={target ? true : undefined}>');
    // the bar, shown only with a target, says both figures
    expect(row).toContain('aria-valuetext={t("{eaten} grams of {target} grams", { eaten: formatInt(eaten), target: formatInt(target) })}');
    expect(row).toMatch(/\{target \? \(\s*<div className="mt-2 h-2[^>]*role="progressbar"/);
  });
});
