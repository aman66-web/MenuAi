import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { candidatesFor, rank } from "../lib/mm/ranking";
import { NO_PREFERENCES, type Chain, type Profile } from "../lib/mm/types";

// The restaurant screens' fixes from the 21 November 2026 meeting (fixer 7: menus, dishes, Best for you, Near me). The screens aren't rendered in these
// tests, so the rules are checked on the data they read and on the source lines that carry them.

const src = (path: string) => readFileSync(path, "utf8");
const chainScreen = src("app/app/chain/ChainScreen.tsx");
const load = (id: string) => JSON.parse(readFileSync(new URL(`../public/menus/chain-${id}.json`, import.meta.url), "utf8")) as Chain;
const profile: Profile = { goal: "maintain", dailyCalories: 2000, glp1MealCap: 500 };

describe("Best for you only where it has something to rank (Olivia: 'Nothing here matches your filters.' at Chipotle with no filter on)", () => {
  it("Chipotle and six other full-figure restaurants have no dish or meal Best for you suggests, so rank() has nothing to pick", () => {
    for (const id of ["chipotle", "baskin-robbins", "be-at-one", "bens-cookies", "pilpel", "soho-coffee-co", "third-space"]) {
      const chain = load(id);
      expect(chain.nutritionLevel, id).not.toBe("calories");
      expect(candidatesFor(chain).some((c) => c.nutrients.calories > 0), id).toBe(false);
      expect(rank({ chain, profile, loggedCalories: 0, meal: "lunch", preferences: NO_PREFERENCES }).mode, id).toBe("noMatches");
    }
    expect(candidatesFor(load("dominos")).some((c) => c.nutrients.calories > 0)).toBe(true);
  });
  it("the page leaves out the Best for you card, its pill and its section note there, and puts the diet line by the Full menu heading", () => {
    expect(chainScreen).toContain("const noBest = caloriesOnly || !candidates.some((c) => c.nutrients.calories > 0);");
    expect(chainScreen).toContain("const ranks = !noBest && !anyUnchecked(unchecked);");
    expect(chainScreen).toContain("{!noBest && (");
    expect(chainScreen).toContain("{noBest && <div className=\"mb-4 px-1\">{dietLines}</div>}");
    expect(chainScreen).toContain("{bestOffScreen && !noBest && (");
    expect(chainScreen).toContain("{allExtras && !noBest && <p");
  });
});

describe("the restaurant page's other fixes", () => {
  it("Quick answers never list a 'top 5' for a choice the restaurant's data can't check, calories-only restaurants included", () => {
    expect(chainScreen).toContain('notChecked={anyUnchecked(unchecked) ? t("Can\'t pick for your diet or allergies here.") : null}');
  });
  it("'Which meal?' is not offered for the GLP-1 goal, whose picks don't change with the meal", () => {
    expect(chainScreen).toContain('{ranks && settings.goal !== "glp1" && (');
  });
  it("Back from a dish keeps the search (in the history entry) and the visit's diet, sort, 'Show all' and opened sections (sessionStorage, mm.chain.<id>)", () => {
    expect(chainScreen).toContain("const [query, setQuery] = useEntryQuery();");
    expect(chainScreen).toContain("const visitStoreKey = (chainId: string) => `mm.chain.${chainId}`;");
    expect(chainScreen).toMatch(/useState<Preferences>\(\(\) => \{\s*if \(visit\?\.prefs\) return visit\.prefs;/);
    expect(chainScreen).toContain('useState<SortKind>(() => visit?.sort ?? "menu")');
    expect(chainScreen).toContain("useState(() => visit?.everyDish ?? false)");
    expect(chainScreen).toContain("new Set(visit?.expanded ?? [])");
    // every storage read and write is guarded: a private window or blocked storage only means the page opens afresh
    const visitCode = chainScreen.slice(chainScreen.indexOf("function readVisit"));
    expect(visitCode.match(/try \{/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it("the section chips are announced as the current section, not as toggles, and every jump moves the focus to its heading", () => {
    expect(chainScreen).toContain('aria-pressed={undefined} aria-current={active === c ? "true" : undefined}');
    expect(chainScreen).toContain('<h3 tabIndex={-1} className="text-lg');
    expect(chainScreen).toContain('<h2 id="best-heading" tabIndex={-1}');
    expect(chainScreen).toContain('<h2 id="full-menu" tabIndex={-1}');
    expect(chainScreen).toContain('jumpAndFocus(el, el.querySelector("h3"))');
    expect(chainScreen).toContain('document.getElementById("best-heading")?.focus({ preventScroll: true });');
    expect(chainScreen).toContain("heading?.focus({ preventScroll: true });");
  });
  it("Halal is checked against the restaurant's own word that all its food is halal (uncheckedDiet gets the chain's id)", () => {
    expect(chainScreen).toContain("uncheckedDiet(chain.items, prefs, chain.id)");
  });
});

describe("the dish page", () => {
  it("a new dish starts a new page, so the Truth sheet of the dish before never stays open (See the swap's full numbers)", () => {
    expect(src("app/app/item/page.tsx")).toContain("<ItemScreen key={`${chain}/${item}`} chainId={chain} itemId={item} />");
  });
  it("says '{chain} publishes calories only' only at a restaurant that does (Tenpin and Chozen publish full figures)", () => {
    const item = src("app/app/item/ItemScreen.tsx");
    expect(item).toContain('{chain.nutritionLevel === "calories" && <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("{chain} publishes calories only, so only the calories are counted."');
    const truth = src("app/app/_components/truth/TruthBody.tsx");
    expect(truth).toMatch(/: chain\.nutritionLevel === "calories"\s*\? t\("Same restaurant, same part of the menu, with fewer calories\. \{chain\} doesn't publish protein, so only calories are compared\."/);
    expect(truth).toContain(': t("Same restaurant, same part of the menu, with fewer calories.")}');
  });
  it("a link to a restaurant no longer in the app shows the missing page with 'See all restaurants', never a red error with Try again", () => {
    const item = src("app/app/item/ItemScreen.tsx");
    expect(item).toContain('if (status === "error" && error === UNKNOWN_CHAIN) {');
    expect(item.indexOf('error === UNKNOWN_CHAIN')).toBeLessThan(item.indexOf("<ErrorBox"));
    expect(item).toContain('{t("See all restaurants")}');
  });
});

describe("Near me and the restaurant tiles", () => {
  it("a type chip that is no longer offered stops filtering", () => {
    const map = src("app/app/map/page.tsx");
    expect(map).toContain("new Set([...types].filter((id) => typeChips.some((g) => g.id === id)))");
    expect(map).toContain("shownTypes.size === 0 ? inRange : inRange.filter((b) => shownTypes.has(");
  });
  it("only coffee, cafés and tea get the cup: a Steakhouse doesn't ('tea' inside the word)", () => {
    const mark = src("app/app/_components/ChainMark.tsx");
    const m = /\[\/(.+?)\/(\w*), \(c\) => <CoffeeGlyph/.exec(mark);
    expect(m).not.toBeNull();
    const coffee = new RegExp(m![1]!, m![2]);
    for (const cuisine of ["Coffee", "Cafe", "British cafe", "Café", "Tea rooms", "Diner & cafe"]) expect(coffee.test(cuisine), cuisine).toBe(true);
    for (const cuisine of ["Steakhouse", "Steak house", "Tex-Mex", "Teppanyaki"]) expect(coffee.test(cuisine), cuisine).toBe(false);
  });
});
