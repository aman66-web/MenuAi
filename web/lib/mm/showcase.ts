// Step 3 of the welcome screens, "Know before you order": real dishes at a restaurant the person goes to, from the list that fits their goal, with that
// restaurant's own published figures (the onboarding redesign meeting of 20 November 2026, build list 2; approved by the founder). Display only: which list a
// goal opens and which of its dishes are shown here change nothing else. applyPreset (lib/mm/truth/presets.ts), its constants and every ranking constant are
// unchanged (CLAUDE.md rule 8), and every figure is the restaurant's own, read when the screen draws (rule 1). Pure and unit-tested (tests/showcase.test.ts,
// and tests/showcaseData.test.ts against public/menus).
//
// - The goal's list: Lose weight → "Under 500 calories"; Build muscle → "35 g+ protein"; GLP-1 → the small-appetite list, headed "Smaller, protein-first
//   orders at {chain}" (rule 3's words, never "Small appetite"); Maintain, Other or no goal → "Most protein for the calories". If that list gives a restaurant
//   fewer than two dishes, "Most protein for the calories", then "Under 500 calories". The heading always names the list really used.
// - The four kinds of place (SHOWCASE_GROUPS), one chip each: the first restaurant of the group, in the meeting's order, that is real (never a sample), not
//   taken down (public/logos/hidden.json), publishes protein and gives two dishes after the filters below. A group with none is left out.
// - The filters: the app's own diet and allergy filter (lib/mm/menu-view.ts passesDiet: a dish the guide lists an avoided allergen for, or with no allergy
//   information, is left out; vegetarian, vegan and pescatarian as the restaurant marks or names them; halal only where the restaurant says all its food is),
//   then the display-only filter: no limited-time dish, no kids' dish, no sharing box or multipack, no side or drinks section that slips past itemKind
//   (Wagamama's "Lighter bites", Costa's "Frappé"), no part of a dish ("Grated Cheese (jacket potato filling)"), and no near-identical variant of a dish
//   already shown ("...with Ketchup" next to "...with Brown Sauce", the same filling as a sub and as a wrap).
// - FREE_PRESET_RESULTS (2) dishes, each with its kcal, protein and the restaurant's own serving when it publishes one. The free top two every visitor sees on
//   that restaurant's page, so nothing shown here is locked later, and no free daily view is spent.
// - Restaurant menus print no ingredients, so the six diets added on 20 November can't be checked (lib/mm/foodDiet.ts moreDietsOn): the result names them for
//   the screen's plain line (lib/mm/menu-view.ts restaurantDietNote). Where a restaurant's own tags or a dish's own name can tell, they still leave dishes out,
//   as on every restaurant screen (menu-view.ts restaurantPrefs, passesDiet): no red meat leaves out pork, beef and lamb, kosher style pork, no alcohol drinks
//   named as alcohol, and Jain keeps only what the restaurant marks vegetarian.

import { moreDietsOn, type MoreDietKey } from "./foodDiet";
import { isAllHalal } from "./halal";
import { tk } from "./i18n";
import { passesDiet, restaurantPrefs } from "./menu-view";
import { FREE_PRESET_RESULTS } from "./paid";
import { normalizeForSearch } from "./search";
import { itemKind } from "./truth/itemKind";
import { applyPreset, type PresetId } from "./truth/presets";
import type { Chain, Goal, ManifestChain, MenuItem, Preferences } from "./types";

/** The four kinds of place on step 3 (fast food, bakery and sandwiches, coffee shops, sit-down), each restaurant in the meeting's order. */
export const SHOWCASE_GROUPS = [
  { id: "fastFood", chains: ["mcdonalds", "kfc", "burger-king", "five-guys", "popeyes", "wimpy", "taco-bell"] },
  { id: "bakery", chains: ["greggs", "subway", "pret", "leon", "itsu"] },
  { id: "coffee", chains: ["costa", "starbucks", "caffe-nero", "tim-hortons"] },
  { id: "sitDown", chains: ["nandos", "wagamama", "wetherspoon", "pizza-hut"] },
] as const satisfies ReadonlyArray<{ id: string; chains: readonly string[] }>;
export type ShowcaseGroupId = (typeof SHOWCASE_GROUPS)[number]["id"];

/** The lists step 3 can show (never "5 g sugar or less"). */
export type ShowcasePreset = Exclude<PresetId, "sugar-5">;

/** Each list's heading, with the restaurant's name. */
export const SHOWCASE_HEADING: Readonly<Record<ShowcasePreset, string>> = {
  "under-500": tk("Under 500 calories at {chain}"),
  "protein-35": tk("35 g+ protein at {chain}"),
  "small-appetite": tk("Smaller, protein-first orders at {chain}"),
  "most-protein": tk("Most protein for the calories at {chain}"),
};

/** The list a goal opens (display only). No goal yet (Skip on step 1) is Most protein for the calories. */
export function presetForGoal(goal: Goal | null | undefined): ShowcasePreset {
  switch (goal) {
    case "lose":
      return "under-500";
    case "buildMuscle":
      return "protein-35";
    case "glp1":
      return "small-appetite";
    default:
      return "most-protein";
  }
}

/** The lists tried in turn: the goal's, then Most protein for the calories, then Under 500 calories. */
export function presetOrder(goal: Goal | null | undefined): ShowcasePreset[] {
  return [...new Set<ShowcasePreset>([presetForGoal(goal), "most-protein", "under-500"])];
}

// ------------------------------------------------------------------------------------------------ the display-only dish filter

/** A sharing box or a multipack, by its own name or serving ("9 Chicken Selects Sharebox", "Pizza Box 4 Pack", "Bucket", a "Serves 2-3" serving). */
const SHARING_NAME = /\b(?:share ?box(?:es)?|sharers?|sharing|buckets?|multi ?packs?|\d+\s*packs?|packs? of \d+|family|feast|platters?|party)\b/i;
const SHARING_SERVING = /\bserves\s*\d|\bsharing\b|\bfor \d+ people\b/i;
/**
 * A section of small dishes that itemKind reads as mains (it knows "Sides", not these): starters, small plates and bites, snacks, gyoza and bao, minis, parts,
 * sharers and bundles, and Pret's children's range ("Little Pret Stars"), as the showcase restaurants name their sections.
 */
const SIDE_SECTION = /\b(?:lighter bites|big flavour bites|small plates?|bar snacks|snacks?|nibbles|starters?|sides?|sidekicks|crisps|extras?|parts|add[- ]?ons?|to share|sharers?|bundles?|gyoza|bao buns?|minis?|little pret stars)\b/i;
/** A part of a dish named in brackets ("Grated Cheese (jacket potato filling)", "(burger add-on)", "(kids side)"); "(excl. sauce)" is still the dish. */
const PART_NOTE = /\((?![^)]*\bexcl)[^)]*\b(?:add[- ]?ons?|fillings?|toppings?|sides?|extras?|additions?|dip pots?)\b[^)]*\)/i;
/** A drinks section itemKind can miss: Costa's "Frappé" (its word boundary stops at the é) and "Fruit Coolers". */
const DRINK_SECTION = /frapp|\bcoolers?\b|\bdrinks?\b|\bcoffee\b|\bteas?\b|\bshakes?\b|\bsmoothies?\b|\bjuices?\b/i;
/** Flavour, style, size and count words that make a variant of the same dish ("Spicy", "Classic", "Little", "Double", "5", "1/4"). */
const VARIANT_WORDS = /\b(?:spicy|classic|original|plain|hot|mild|extra|regular|little|large|small|medium|mini|express|single|double|\d+)\b/g;
/** The form a filling comes in: the same filling as a sub and as a wrap is the same dish to a person choosing. */
const FORMS = new Set(["sub", "subs", "wrap", "wraps", "salad", "sandwich", "roll", "baguette", "panini", "toastie", "melt", "bowl", "flatbread", "pitta", "bagel", "muffin", "pot", "box"]);

/** The dish's name as its variants share it: no "(...)", nothing from " with " or " - " on (a "+" is Wagamama's "and"), no flavour, size or count words. */
export function variantKey(name: string): string {
  const base = normalizeForSearch(name.replace(/\([^)]*\)/g, " ").split(/\s+(?:with|w\/|[-–—])\s+/i)[0] ?? name);
  return base.replace(VARIANT_WORDS, " ").replace(/\s+/g, " ").trim();
}

const words = (key: string): string[] => key.split(" ").filter(Boolean);

/**
 * Two dishes a person would see as the same thing: the same variant name; the same filling in another form ("Chicken & Bacon Sub" and "... Wrap"); or the
 * same kind of dish ("...Twister", "...breast") with almost the same figures.
 */
export function nearIdentical(a: MenuItem, b: MenuItem): boolean {
  const ka = variantKey(a.name);
  const kb = variantKey(b.name);
  if (ka === kb) return true;
  const wa = words(ka);
  const wb = words(kb);
  const formOf = (w: string[]) => (w.length > 1 && FORMS.has(w[w.length - 1]!) ? w.slice(0, -1).join(" ") : null);
  if (formOf(wa) !== null && formOf(wa) === formOf(wb)) return true;
  const kcalClose = Math.abs(a.nutrients.calories - b.nutrients.calories) <= 0.03 * Math.max(a.nutrients.calories, b.nutrients.calories);
  const proteinClose = a.nutrients.protein !== undefined && b.nutrients.protein !== undefined && Math.abs(a.nutrients.protein - b.nutrients.protein) <= 1.5;
  return kcalClose && proteinClose && wa.length > 0 && wa[wa.length - 1] === wb[wb.length - 1];
}

/** The diet as a restaurant's own data can check it: the one mapping every restaurant screen uses (lib/mm/menu-view.ts restaurantPrefs). */
export const showcasePrefs = (prefs: Preferences): Preferences => restaurantPrefs(prefs);

/** Whether the restaurant can be in the showcase at all for this diet (halal is chain-level: only a restaurant that says all its food is halal). */
const chainFits = (chain: Pick<Chain, "id">, prefs: Preferences): boolean => !prefs.halalOnly || isAllHalal(chain.id);

/**
 * Whether a dish may be shown as a real order for this person: it publishes protein, passes the diet and allergy filter, and isn't limited-time, a kids' dish,
 * a sharing box, in a side or drinks section, or a part of a dish. Also used to check Home's Start here dish again against the account's own settings after
 * sign-in.
 */
export function dishFits(chain: Pick<Chain, "id">, item: MenuItem, prefs: Preferences): boolean {
  if (!chainFits(chain, prefs) || item.limitedTime) return false;
  if (item.nutrients.protein === undefined) return false;
  if (itemKind({ name: item.name, category: item.category, calories: item.nutrients.calories }) === "kids") return false;
  if (SHARING_NAME.test(item.name) || SHARING_SERVING.test(item.serving) || SIDE_SECTION.test(item.category) || DRINK_SECTION.test(item.category) || PART_NOTE.test(item.name)) return false;
  return passesDiet(item, showcasePrefs(prefs));
}

// ------------------------------------------------------------------------------------------------ the dishes and the chips

export interface ShowcaseDish {
  itemId: string;
  name: string;
  /** The restaurant's own figures, as published. */
  kcal: number;
  protein: number;
  /** The restaurant's own serving ("1 slice (of 8)"), when it publishes one. */
  serving?: string;
}

export interface ShowcaseResult {
  chainId: string;
  chainName: string;
  /** The list really used (the goal's, or a fallback). */
  preset: ShowcasePreset;
  /** Its heading, a tk() key with {chain}. */
  heading: string;
  /** A fallback list was used, because the goal's gave fewer than two dishes. */
  fallback: boolean;
  /** Exactly FREE_PRESET_RESULTS dishes. */
  dishes: ShowcaseDish[];
  /** The day the restaurant's own figures were checked ("From {chain}'s own published figures, checked {date}."). */
  checkedOn: string;
  /** The newer diets that are on and that a restaurant's menu can't be checked for (named on the screen, never promised). */
  notChecked: MoreDietKey[];
}

/** The top dishes of one list, near-identical variants skipped, up to `n`. */
function topDishes(id: ShowcasePreset, items: readonly MenuItem[], n: number): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of applyPreset(id, items)) {
    if (out.some((kept) => nearIdentical(kept, item))) continue;
    out.push(item);
    if (out.length === n) break;
  }
  return out;
}

/** The two dishes a restaurant shows for this goal and diet, or null when no list gives two (the restaurant is then not offered). */
export function showcaseDishes(chain: Chain, goal: Goal | null | undefined, prefs: Preferences): ShowcaseResult | null {
  if (chain.sample || chain.nutritionLevel === "calories" || !chainFits(chain, prefs)) return null;
  const items = chain.items.filter((i) => dishFits(chain, i, prefs));
  const order = presetOrder(goal);
  for (const preset of order) {
    const top = topDishes(preset, items, FREE_PRESET_RESULTS);
    if (top.length < FREE_PRESET_RESULTS) continue;
    return {
      chainId: chain.id,
      chainName: chain.name,
      preset,
      heading: SHOWCASE_HEADING[preset],
      fallback: preset !== order[0],
      dishes: top.map((i) => ({ itemId: i.id, name: i.name, kcal: i.nutrients.calories, protein: i.nutrients.protein!, ...(i.serving.trim() ? { serving: i.serving.trim() } : {}) })),
      checkedOn: chain.source.checkedOn,
      notChecked: moreDietsOn(prefs),
    };
  }
  return null;
}

/**
 * The restaurants worth loading for each group, in order: real, not taken down, and publishing protein (as the menus' manifest says; a restaurant missing from
 * it is left out). On the website the first of each is loaded after step 2; the next only if the first gives fewer than two dishes.
 */
export function showcaseCandidates(manifest: readonly Pick<ManifestChain, "id" | "sample" | "nutritionLevel">[], hidden: Iterable<string> = []): Array<{ group: ShowcaseGroupId; chainIds: string[] }> {
  const known = new Map(manifest.map((c) => [c.id, c]));
  const down = new Set(hidden);
  return SHOWCASE_GROUPS.map((g) => ({
    group: g.id,
    chainIds: g.chains.filter((id) => {
      const c = known.get(id);
      return !!c && !c.sample && c.nutritionLevel !== "calories" && !down.has(id);
    }),
  }));
}

/** One chip of step 3: the group, its restaurant and the dishes it shows. */
export interface ShowcaseChip extends ShowcaseResult {
  group: ShowcaseGroupId;
}

/**
 * The chips: for each group, the first candidate whose menu gives two dishes. `menu(id)` is the restaurant's menu, null when it couldn't be loaded (the next
 * candidate is tried), or undefined while it is still on its way: that stops the group there (nothing is skipped past a menu still loading), so its chip appears
 * once the menu arrives. `pending` names the menu each waiting group needs next, so the screen knows what to load.
 */
export function showcaseChips(
  candidates: ReadonlyArray<{ group: ShowcaseGroupId; chainIds: readonly string[] }>,
  menu: (id: string) => Chain | null | undefined,
  goal: Goal | null | undefined,
  prefs: Preferences,
): { chips: ShowcaseChip[]; pending: Array<{ group: ShowcaseGroupId; chainId: string }> } {
  const chips: ShowcaseChip[] = [];
  const pending: Array<{ group: ShowcaseGroupId; chainId: string }> = [];
  for (const { group, chainIds } of candidates) {
    for (const id of chainIds) {
      const chain = menu(id);
      if (chain === undefined) {
        pending.push({ group, chainId: id });
        break;
      }
      const result = chain ? showcaseDishes(chain, goal, prefs) : null;
      if (result) {
        chips.push({ group, ...result });
        break;
      }
    }
  }
  return { chips, pending };
}
