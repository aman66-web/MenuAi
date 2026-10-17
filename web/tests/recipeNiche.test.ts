import { describe, expect, it } from "vitest";
import { englishT } from "../lib/mm/i18n";
import { RECIPES } from "../lib/mm/recipeBook";
import { isMeatFree } from "../lib/mm/recipes";
import { CUISINES, CUISINE_LINES, NICHES, OCCASIONS, OCCASION_LINES, nicheOf } from "../lib/mm/recipeBook/niches";
import { MIN_NICHE_RECIPES, cuisineOptions, inSeason, matchesNiche, nicheCounts, nicheSearchWords, occasionOptions, parseCuisine, parseOccasion } from "../lib/mm/recipeNiche";

// Cuisine and occasion choices on the Recipes screen (founder 2026-10-16): the catalogue and each recipe's niche (lib/mm/recipeBook/niches.ts), and the rules
// for what is offered, what matches and what each choice would show (lib/mm/recipeNiche.ts).

const IDS = RECIPES.map((r) => r.id);
const idsOf = (cuisine: string) => CUISINE_LINES.filter(([, c]) => c === cuisine).map(([id]) => id);
const JAN = new Date(2027, 0, 4);
const OCT_20 = new Date(2026, 9, 20);
const NOV_15 = new Date(2026, 10, 15);
const JAN_10 = new Date(2027, 0, 10);

describe("which cuisines and occasions are offered", () => {
  it("offers a cuisine only when at least 3 recipes belong to it, in the catalogue's order", () => {
    expect(MIN_NICHE_RECIPES).toBe(3);
    expect(cuisineOptions(idsOf("chinese").slice(0, 2)), "2 recipes: hidden").toEqual([]);
    expect(cuisineOptions(idsOf("chinese").slice(0, 3)).map((o) => o.id), "3 recipes: offered").toEqual(["chinese"]);
    // listed in the reverse of the catalogue's order, offered in the catalogue's
    const mixed = [...idsOf("middle-eastern").slice(0, 3), ...idsOf("indian").slice(0, 3), ...idsOf("british").slice(0, 3)];
    expect(cuisineOptions(mixed).map((o) => o.id)).toEqual(["british", "indian", "middle-eastern"]);
    expect(cuisineOptions([])).toEqual([]);
  });

  it("offers an occasion only with at least 3 recipes, and a seasonal one only inside its dates", () => {
    const picnic = OCCASION_LINES.filter(([, o]) => o === "picnic").map(([id]) => id);
    expect(occasionOptions(picnic.slice(0, 2), JAN)).toEqual([]);
    expect(occasionOptions(picnic.slice(0, 3), JAN).map((o) => o.id)).toEqual(["picnic"]);
    const bonfire = OCCASION_LINES.filter(([, o]) => o === "bonfire-night").map(([id]) => id);
    expect(occasionOptions(bonfire, OCT_20).map((o) => o.id), "in season").toEqual(["bonfire-night"]);
    expect(occasionOptions(bonfire, JAN), "out of season").toEqual([]);
  });

  it("knows a season's dates, both ends included, also over New Year, and an occasion without dates is always in season", () => {
    const bonfire = OCCASIONS.find((o) => o.id === "bonfire-night")!.season;
    const day = (m: number, d: number, y = 2026) => new Date(y, m - 1, d, 12);
    expect([inSeason(bonfire, day(10, 14)), inSeason(bonfire, day(10, 15)), inSeason(bonfire, day(11, 5)), inSeason(bonfire, day(11, 10)), inSeason(bonfire, day(11, 11)), inSeason(bonfire, day(1, 4, 2027)), inSeason(bonfire, day(7, 1))]).toEqual([false, true, true, true, false, false, false]);
    const overNewYear = { from: { month: 11, day: 1 }, to: { month: 1, day: 6 } };
    expect([inSeason(overNewYear, day(10, 31)), inSeason(overNewYear, day(11, 1)), inSeason(overNewYear, day(12, 31)), inSeason(overNewYear, day(1, 1, 2027)), inSeason(overNewYear, day(1, 6, 2027)), inSeason(overNewYear, day(1, 7, 2027))]).toEqual([false, true, true, true, true, false]);
    expect(inSeason(undefined, day(3, 3))).toBe(true);
  });

  it("ships these choices", () => {
    expect(cuisineOptions(IDS).map((o) => o.id)).toEqual(["british", "chinese", "indian", "italian", "mexican", "middle-eastern"]);
    // the January 2027 launch (4 January) is still inside Christmas (1 November to 6 January); Bonfire Night is out of season
    expect(occasionOptions(IDS, JAN).map((o) => o.id)).toEqual(["christmas", "lunchbox", "party-food", "picnic", "summer-barbecue"]);
    expect(occasionOptions(IDS, JAN_10).map((o) => o.id), "Christmas is over").toEqual(["lunchbox", "party-food", "picnic", "summer-barbecue"]);
    expect(occasionOptions(IDS, OCT_20).map((o) => o.id)).toEqual(["bonfire-night", "lunchbox", "party-food", "picnic", "summer-barbecue"]);
    expect(occasionOptions(IDS, NOV_15).map((o) => o.id)).toEqual(["christmas", "lunchbox", "party-food", "picnic", "summer-barbecue"]);
    // the founder's own examples are offered with plenty to choose from
    for (const id of ["chinese", "indian"]) expect(idsOf(id).length, id).toBeGreaterThanOrEqual(8);
    // Christmas (founder 2026-10-17: festive ingredients allowed): offered 1 November to 6 January, with a meat-free and a vegan recipe among them
    expect(OCCASIONS.map((o) => o.id)).toContain("christmas");
  });
});

describe("reading a choice from the address", () => {
  const cuisines = cuisineOptions(IDS);
  const occasions = occasionOptions(IDS, JAN);
  it("accepts an offered choice, in any case, and nothing else", () => {
    expect(parseCuisine("chinese", cuisines)).toBe("chinese");
    expect(parseCuisine(" Middle-Eastern ", cuisines)).toBe("middle-eastern");
    expect(parseOccasion("PICNIC", occasions)).toBe("picnic");
    for (const bad of [null, undefined, "", "klingon", "thai", "japanese", ["chinese"], 7, {}, "chinese,indian", "constructor", "__proto__"]) expect(parseCuisine(bad, cuisines), String(bad)).toBeNull();
    // an occasion that exists but is out of season is not on offer, so it is no choice
    expect(parseOccasion("bonfire-night", occasions)).toBeNull();
    expect(parseOccasion("bonfire-night", occasionOptions(IDS, OCT_20))).toBe("bonfire-night");
    expect(parseOccasion("christmas", occasionOptions(IDS, JAN_10))).toBeNull();
    expect(parseOccasion("christmas", occasionOptions(IDS, NOV_15))).toBe("christmas");
  });
});

describe("which recipes match a choice", () => {
  it("is any when nothing is chosen, one field when one is, and both together when both are", () => {
    for (const id of IDS) expect(matchesNiche(id, null, null), id).toBe(true);
    expect(matchesNiche("chicken-chow-mein", "chinese", null)).toBe(true);
    expect(matchesNiche("chicken-chow-mein", "indian", null)).toBe(false);
    expect(matchesNiche("chicken-chow-mein", null, "picnic")).toBe(false);
    expect(matchesNiche("chicken-wraps", null, "picnic")).toBe(true);
    expect(matchesNiche("chicken-wraps", "chinese", "picnic")).toBe(false);
    expect(matchesNiche("chicken-shawarma-wraps", "middle-eastern", "summer-barbecue")).toBe(true);
    expect(matchesNiche("chicken-shawarma-wraps", "middle-eastern", "picnic")).toBe(false);
    expect(matchesNiche("no-such-recipe", null, null)).toBe(true);
    expect(matchesNiche("no-such-recipe", "chinese", null)).toBe(false);
  });
});

describe("how many recipes each choice would show", () => {
  const some = ["chicken-chow-mein", "egg-fried-rice", "chicken-curry", "chickpea-curry", "chicken-wraps", "houmous-veg-sticks", "chicken-shawarma-wraps", "overnight-oats"];
  it("counts a cuisine and an occasion over what is left, honouring the other field and not its own", () => {
    const none = nicheCounts(some, null, null);
    expect(none.cuisine.get("chinese")).toBe(2);
    expect(none.cuisine.get("indian")).toBe(2);
    expect(none.cuisine.get("middle-eastern")).toBe(2);
    expect(none.occasion.get("picnic")).toBe(2);
    expect(none.occasion.get("lunchbox")).toBe(2);
    expect(none.occasion.get("summer-barbecue")).toBe(1);
    // with Picnic chosen, a cuisine's count is the picnic recipes of it; Picnic's own count is not narrowed by itself
    const picnic = nicheCounts(some, null, "picnic");
    expect(picnic.cuisine.get("middle-eastern")).toBe(1);
    expect(picnic.cuisine.get("chinese") ?? 0).toBe(0);
    expect(picnic.occasion.get("picnic")).toBe(2);
    // with Middle Eastern chosen, an occasion's count is the Middle Eastern recipes for it; the cuisine's own count is not narrowed by itself
    const me = nicheCounts(some, "middle-eastern", null);
    expect(me.occasion.get("picnic")).toBe(1);
    expect(me.occasion.get("summer-barbecue")).toBe(1);
    expect(me.occasion.get("lunchbox")).toBe(1);
    expect(me.cuisine.get("middle-eastern")).toBe(2);
    // a recipe with no niche is in no count
    expect([...nicheCounts(["overnight-oats"], null, null).cuisine.values()]).toEqual([]);
  });

  it("agrees with matching: the number beside a choice is the number of recipes that choosing it shows", () => {
    for (const [cuisine, occasion] of [[null, null], ["italian", null], [null, "party-food"], ["mexican", "picnic"], ["chinese", "lunchbox"]] as const) {
      const counts = nicheCounts(IDS, cuisine, occasion);
      for (const c of CUISINES) expect(counts.cuisine.get(c.id) ?? 0, `${c.id} with ${occasion}`).toBe(IDS.filter((id) => matchesNiche(id, c.id, occasion)).length);
      for (const o of OCCASIONS) expect(counts.occasion.get(o.id) ?? 0, `${o.id} with ${cuisine}`).toBe(IDS.filter((id) => matchesNiche(id, cuisine, o.id)).length);
    }
  });
});

describe("the words that find a recipe by its cuisine or occasion", () => {
  const offered = { cuisines: cuisineOptions(IDS), occasions: occasionOptions(IDS, JAN) };
  it("adds the name, the name in the reader's language and the extra words, lower case, for what is on offer", () => {
    const words = nicheSearchWords("chicken-shawarma-wraps", englishT, offered);
    expect(words).toEqual(expect.arrayContaining(["middle eastern", "summer barbecue", "bbq", "barbeque", "barbecue"]));
    // no "asian" umbrella word: Thai and Japanese-style dishes are not filed under Chinese, so it would answer with a list that looks complete and is not
    expect(nicheSearchWords("chicken-chow-mein", englishT, offered)).toEqual(expect.arrayContaining(["chinese"]));
    expect(nicheSearchWords("chicken-chow-mein", englishT, offered)).not.toContain("asian");
    const spanish = nicheSearchWords("chicken-chow-mein", (k: string) => (k === "Chinese" ? "China" : k), offered);
    expect(spanish).toEqual(expect.arrayContaining(["chinese", "china"]));
    for (const w of nicheSearchWords("houmous-veg-sticks", englishT, offered)) expect(w, w).toBe(w.toLowerCase());
    expect(nicheSearchWords("overnight-oats", englishT, offered)).toEqual([]);
  });
  it("adds nothing for an occasion that is not on offer (no 'bonfire' in January) or a cuisine that is not", () => {
    expect(nicheSearchWords("beef-chilli", englishT, offered)).not.toContain("bonfire night");
    expect(nicheSearchWords("beef-chilli", englishT, { cuisines: offered.cuisines, occasions: occasionOptions(IDS, OCT_20) })).toContain("bonfire night");
    expect(nicheSearchWords("chicken-chow-mein", englishT, { cuisines: [], occasions: [] })).toEqual([]);
  });
});

describe("the catalogue and the recipe book", () => {
  it("names only recipes that are in the book, once each: one cuisine per recipe and no occasion twice", () => {
    const ids = new Set(IDS);
    for (const [id] of [...CUISINE_LINES, ...OCCASION_LINES]) expect(ids.has(id), `${id} is a recipe in the book`).toBe(true);
    const cuisineIds = CUISINE_LINES.map(([id]) => id);
    expect(cuisineIds.filter((id, i) => cuisineIds.indexOf(id) !== i), "a recipe with two cuisines").toEqual([]);
    const pairs = OCCASION_LINES.map(([id, o]) => `${id}|${o}`);
    expect(pairs.filter((p, i) => pairs.indexOf(p) !== i), "an occasion listed twice for one recipe").toEqual([]);
    expect(Object.keys(NICHES).sort()).toEqual([...new Set([...cuisineIds, ...OCCASION_LINES.map(([id]) => id)])].sort());
    expect(nicheOf("nothing-here")).toEqual({});
  });

  it("has well-formed entries: kebab-case ids, plain labels, lower-case words, no duplicates", () => {
    for (const list of [CUISINES, OCCASIONS] as const) {
      const entries: ReadonlyArray<{ id: string; label: string; words: readonly string[] }> = list;
      expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
      expect(new Set(entries.map((e) => e.label)).size).toBe(entries.length);
      for (const e of entries) {
        expect(e.id, e.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
        expect(e.label.trim(), e.id).toBe(e.label);
        expect(e.label.length, e.id).toBeGreaterThan(2);
        for (const w of e.words) expect(w, `${e.id}: ${w}`).toBe(w.toLowerCase());
      }
    }
    // the options are written in alphabetical order, so the list is easy to scan
    for (const list of [CUISINES, OCCASIONS]) expect(list.map((e) => e.label)).toEqual([...list.map((e) => e.label)].sort((a, b) => a.localeCompare(b, "en-GB")));
  });

  it("agrees with the cuisine words the recipes carried in their own tags before the catalogue", () => {
    const named: Record<string, string> = { Italian: "italian", British: "british", Indian: "indian", Chinese: "chinese", Mexican: "mexican", "Middle Eastern": "middle-eastern" };
    const notOffered = ["Thai", "Japanese"]; // tagged once, with too few recipes to offer: they must not be filed under another cuisine
    let checked = 0;
    for (const r of RECIPES) {
      for (const tag of r.tags ?? []) {
        if (named[tag]) { expect(nicheOf(r.id).cuisine, `${r.id} is tagged ${tag}`).toBe(named[tag]); checked++; }
        if (notOffered.includes(tag)) expect(nicheOf(r.id).cuisine, `${r.id} is tagged ${tag}`).toBeUndefined();
      }
    }
    expect(checked, "recipes with a cuisine tag").toBeGreaterThanOrEqual(30);
  });

  it("leaves someone who eats no meat or fish something under every choice, and files the generic and the cold the same way each time", () => {
    const byId = new Map(RECIPES.map((r) => [r.id, r]));
    for (const c of CUISINES) expect(CUISINE_LINES.filter(([id, k]) => k === c.id && isMeatFree(byId.get(id)!)).length, `a meat-free ${c.id} recipe`).toBeGreaterThanOrEqual(1);
    for (const o of OCCASIONS) expect(OCCASION_LINES.filter(([id, k]) => k === o.id && isMeatFree(byId.get(id)!)).length, `a meat-free ${o.id} recipe`).toBeGreaterThanOrEqual(2);
    // a dish with nothing that makes it one cuisine's kind of food stays unlabelled (soy sauce and stir-fry vegetables on rice are not a Chinese dish by themselves)
    expect(nicheOf("chicken-rice-bowl").cuisine).toBeUndefined();
    expect(nicheOf("tuna-bean-salad").cuisine).toBeUndefined();
    // Summer barbecue: cooked on the barbecue or under a grill, or a cold salad that keeps; a pan-cooked wrap with barbecue sauce is neither
    expect(nicheOf("chicken-caesar-wraps").occasions ?? []).not.toContain("summer-barbecue");
    for (const id of ["potato-egg-salad", "chickpea-tomato-salad", "pesto-pasta-mozzarella-salad", "curried-rice-salad", "tuna-sweetcorn-pasta-salad"]) expect(nicheOf(id).occasions, id).toContain("summer-barbecue");
    // the meat-free version of a warm pie goes where the pie goes
    expect(nicheOf("bean-cottage-pie").occasions).toContain("bonfire-night");
  });

  it("covers the new recipes: four Chinese, two Middle Eastern, two for a summer barbecue", () => {
    for (const id of ["egg-chow-mein", "egg-tomato-stir-fry", "chicken-mushroom-noodle-soup", "chinese-style-chicken-curry"]) expect(nicheOf(id).cuisine, id).toBe("chinese");
    for (const id of ["spiced-chicken-rice-bowl", "chickpea-spinach-egg-stew"]) expect(nicheOf(id).cuisine, id).toBe("middle-eastern");
    for (const id of ["chicken-pepper-kebabs", "bbq-chicken-thigh-skewers"]) expect(nicheOf(id).occasions, id).toContain("summer-barbecue");
  });

  it("files a dish named after a cuisine's own dishes under that cuisine, and never a main dish for a barbecue or Bonfire Night as a snack", () => {
    const named: Array<[RegExp, string]> = [[/chow mein/i, "chinese"], [/bolognese|carbonara|linguine|spaghetti|minestrone/i, "italian"], [/\bmexican\b|fajita|burrito|quesadilla|huevos/i, "mexican"], [/\bmoroccan\b|shawarma|shakshuka|houmous/i, "middle-eastern"], [/jalfrezi|keema/i, "indian"]];
    for (const r of RECIPES) for (const [re, id] of named) if (re.test(r.name)) expect(nicheOf(r.id).cuisine, `${r.id}: "${r.name}"`).toBe(id);
    for (const [id, o] of OCCASION_LINES) if (o === "summer-barbecue" || o === "bonfire-night") expect(RECIPES.find((r) => r.id === id)!.meal, `${id} (${o})`).not.toBe("snack");
  });
});
