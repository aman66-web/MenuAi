import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { uncheckedDiet } from "../lib/mm/menu-view";
import { NO_PREFERENCES, type MenuItem } from "../lib/mm/types";

// The order builder (app/app/builder/BuilderScreen.tsx), the second pass of the 30-person meeting, 21 November 2026. The screen's file uses "@/" imports, which
// the unit tests don't resolve, so its code is read as text; the diet check it calls is run for real.

const src = readFileSync("app/app/builder/BuilderScreen.tsx", "utf8");
/** The Save button's handler, from its guard to its label. */
const saveHandler = src.slice(src.indexOf("if (saving.current) return; // already saved"), src.indexOf('{start.savedId ? t("Save changes") : t("Save")}'));
/** The "Add to today" sheet's handler. */
const addHandler = src.slice(src.indexOf("onAdd={(meal) => {"), src.indexOf("setTimeout(() => { adding.current = false; }, 600);"));

describe("a half-built order survives a tab tap (Dina: 'The order builder throws away a half-built order on any tab tap')", () => {
  it("is kept for this visit only, one order, under mm.builderDraft", () => {
    expect(src).toContain('const DRAFT_KEY = "mm.builderDraft";');
    expect(src).toContain("sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ search: window.location.search, lines, customName }))");
    expect(src).not.toMatch(/localStorage\.(set|get)Item\(DRAFT_KEY/);
  });

  it("is read back only for the same address, well formed, and with everything still on the menu", () => {
    const read = src.slice(src.indexOf("function readDraft"), src.indexOf("function forgetDraft"));
    expect(read).toContain("search !== window.location.search");
    expect(read).toContain("!lines.every(isOrderLine)");
    expect(read).toContain("!isOrderAvailable(ix, lines)");
    expect(read).toMatch(/catch \{\s*return null;/);
    expect(src).toContain("const [lines, setLines] = useState<OrderLine[]>(() => draft?.lines ?? start.lines);");
  });

  it("is forgotten once the order is saved, its changes saved, or it is added to today", () => {
    const changes = saveHandler.slice(saveHandler.indexOf("if (start.savedId) {"), saveHandler.indexOf('gate("saveLimit"'));
    const save = saveHandler.slice(saveHandler.indexOf('gate("saveLimit"'));
    expect(changes.indexOf("forgetDraft();")).toBeGreaterThan(changes.indexOf("updateSavedOrder("));
    expect(save.indexOf("forgetDraft();")).toBeGreaterThan(save.indexOf("addSavedOrder(entry);"));
    expect(addHandler.indexOf("forgetDraft();")).toBeGreaterThan(addHandler.indexOf("addLogEntry("));
  });
});

describe("Save saves once (Arjun: 'Builder Save can save twice when tapped again before the navigation lands')", () => {
  it("returns at once while a save is on its way, and is set before the order is written", () => {
    expect(src).toContain("const saving = useRef(false);");
    expect(saveHandler.startsWith("if (saving.current) return;")).toBe(true);
    const changes = saveHandler.slice(saveHandler.indexOf("if (start.savedId) {"), saveHandler.indexOf('gate("saveLimit"'));
    expect(changes.indexOf("saving.current = true;")).toBeGreaterThan(-1);
    expect(changes.indexOf("saving.current = true;")).toBeLessThan(changes.indexOf("updateSavedOrder("));
    // inside the gate's callback: a tap that only opened Premium's sheet saved nothing, so it doesn't lock Save
    const save = saveHandler.slice(saveHandler.indexOf('gate("saveLimit", () => {'));
    expect(save.indexOf("saving.current = true;")).toBeGreaterThan(-1);
    expect(save.indexOf("saving.current = true;")).toBeLessThan(save.indexOf("addSavedOrder(entry);"));
  });
});

describe("the builder's diet check knows the restaurant (first pass leftover: it called uncheckedDiet without the chain id)", () => {
  it("passes the chain id, as the menu page does", () => {
    expect(src).toContain("uncheckedDiet(ix.chain.items, prefs, ix.chain.id)");
    expect(src).not.toMatch(/uncheckedDiet\(ix\.chain\.items, prefs\)/);
  });

  it("so a Halal person at a restaurant that says all its food is halal isn't told its dishes can't be checked for pork", () => {
    const items = [{ id: "wrap", name: "Chicken Wrap", category: "Mains", serving: "", nutrients: { calories: 500, protein: 30, carbs: 40, fat: 20 }, tags: [], limitedTime: false, rankable: true, components: [], modifiers: [] }] as unknown as MenuItem[];
    const prefs = { ...NO_PREFERENCES, halalOnly: true };
    expect(uncheckedDiet(items, prefs, "afrikana").pork).toBe(false);
    expect(uncheckedDiet(items, prefs).pork).toBe(true); // what the builder said before
  });
});
