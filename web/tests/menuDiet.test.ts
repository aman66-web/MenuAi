import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { namesAllergen, passesMenuDiet, uncheckedDiet } from "../lib/mm/menu-view";
import { NO_PREFERENCES, type Chain, type MenuItem, type Preferences } from "../lib/mm/types";

// Founder 2026-11-17: restaurants must show their dishes. Diet choices a restaurant's own data can't check leave out only the dishes whose names say otherwise.
const P = (p: Partial<Preferences>): Preferences => ({ ...NO_PREFERENCES, ...p });
const item = (name: string, extra: Partial<MenuItem> = {}): MenuItem =>
  ({ id: name.toLowerCase().replace(/\W+/g, "-"), name, category: "Mains", serving: "", nutrients: { calories: 500, protein: 20, carbs: 50, fat: 20 }, tags: [], limitedTime: false, rankable: true, components: [], modifiers: [], ...extra }) as MenuItem;
const shown = (items: MenuItem[], prefs: Preferences) => { const u = uncheckedDiet(items, prefs); return items.filter((i) => passesMenuDiet(i, prefs, u)).map((i) => i.name); };

describe("a restaurant that marks no dish vegetarian", () => {
  const menu = [item("Big Mac"), item("Cheeseburger"), item("Chicken McNuggets"), item("Filet-O-Fish"), item("Fries"), item("Veggie Burger"), item("Bacon Roll"), item("Apple Pie")];
  it("shows its menu to a vegetarian with only dishes whose names say meat or fish left out", () => {
    expect(uncheckedDiet(menu, P({ vegetarianOnly: true })).vegetarian).toBe(true);
    expect(shown(menu, P({ vegetarianOnly: true }))).toEqual(["Big Mac", "Fries", "Veggie Burger", "Apple Pie"]);
  });
  it("keeps fish for a pescatarian", () => {
    expect(shown(menu, P({ pescatarianOnly: true }))).toEqual(["Big Mac", "Filet-O-Fish", "Fries", "Veggie Burger", "Apple Pie"]);
  });
  it("still leaves out a fish dish for someone avoiding fish when there are no allergen details", () => {
    expect(shown(menu, P({ pescatarianOnly: true, avoidAllergens: ["fish"] }))).not.toContain("Filet-O-Fish");
  });
});

describe("meat a restaurant doesn't mark vegetarian but shows plainly (review 2026-11-17)", () => {
  const veg = P({ vegetarianOnly: true });
  it("leaves out dishes the restaurant's own data tags as pork or beef, whatever the name", () => {
    const menu = [item("The Boss", { category: "Burgers", tags: ["contains_beef"] }), item("Eggs Benedict", { category: "Breakfast", tags: ["contains_pork"] }), item("Fries", { category: "Sides" })];
    for (const prefs of [veg, P({ pescatarianOnly: true }), P({ veganOnly: true })]) expect(shown(menu, prefs)).toEqual(["Fries"]);
  });
  it("leaves out beef cuts, ribs, mince, pig, tenders by name", () => {
    const names = ["8oz Sirloin", "8oz Rump", "Hereford T-Bone", "Flaming Tomahawk", "The Wagyu", "Baby Back Ribs", "Savoury Mince Pie", "Pig's Head on Toast", "Tenders x 3", "Rib-eye Steak", "Chateaubriand"];
    const menu = [...names.map((n) => item(n)), item("Chips"), item("Mince Pie"), item("Tenderstem Broccoli")];
    expect(shown(menu, veg)).toEqual(["Chips", "Mince Pie", "Tenderstem Broccoli"]);
  });
  it("reads the menu section too: a Whopper in Burgers or strips in Wings and strips are meat; a veggie one stays", () => {
    const menu = [item("WHOPPER®", { category: "Burgers" }), item("Strips", { category: "Wings and strips" }), item("Plant-based WHOPPER®", { category: "Burgers" }), item("Veggie Bean Burger", { category: "Burgers" }), item("Fries", { category: "Sides" })];
    expect(shown(menu, veg)).toEqual(["Plant-based WHOPPER®", "Veggie Bean Burger", "Fries"]);
    // a menu that names no dish vegan goes by name for a vegan too
    const noVegan = menu.filter((i) => !i.name.startsWith("Plant"));
    expect(shown(noVegan, P({ veganOnly: true }))).toEqual(["Veggie Bean Burger", "Fries"]);
    // the dishes of a "Vegetarian burgers" section stay
    expect(shown([item("The Classic", { category: "Vegetarian burgers" }), item("The Classic Beef", { category: "Burgers" })], veg)).toEqual(["The Classic"]);
  });
  it("keeps a fish burger in a Burgers section for a pescatarian", () => {
    const menu = [item("Fish Burger", { category: "Burgers" }), item("Big King", { category: "Burgers" })];
    expect(shown(menu, P({ pescatarianOnly: true }))).toEqual(["Fish Burger"]);
  });
});

describe("a restaurant that marks vegetarian dishes", () => {
  const menu = [item("Margherita", { tags: ["vegetarian"] }), item("Pepperoni"), item("Garlic Bread")];
  it("follows the restaurant's own marks (strict, as before)", () => {
    expect(uncheckedDiet(menu, P({ vegetarianOnly: true })).vegetarian).toBe(false);
    expect(shown(menu, P({ vegetarianOnly: true }))).toEqual(["Margherita"]);
  });
});

describe("allergens", () => {
  it("names an allergen only from the dish's own words, never promising the rest", () => {
    expect(namesAllergen({ name: "Cheese Toastie" }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "Oat Milk Latte" }, ["milk"])).toBe(false);
    expect(namesAllergen({ name: "Prawn Cocktail" }, ["crustaceans"])).toBe(true);
    expect(namesAllergen({ name: "Oyster Mushroom Bao" }, ["molluscs"])).toBe(false);
    expect(namesAllergen({ name: "Doughnut" }, ["nuts"])).toBe(false);
    expect(namesAllergen({ name: "Butternut Squash Soup" }, ["milk"])).toBe(false);
  });
  it("lets a free-from word clear only its own allergen (review 2026-11-17)", () => {
    // a nut is still a nut in a vegan, gluten-free or almond-milk dish
    expect(namesAllergen({ name: "Vegan Almond Croissant" }, ["nuts"])).toBe(true);
    expect(namesAllergen({ name: "Gluten-Free Pollo Pesto" }, ["nuts"])).toBe(true);
    expect(namesAllergen({ name: "Almond Milk Latte" }, ["nuts"])).toBe(true);
    expect(namesAllergen({ name: "Vegan Nut Roast" }, ["nuts"])).toBe(true);
    // gluten-free doesn't clear milk; oat doesn't clear eggs or gluten; vegan doesn't clear gluten
    expect(namesAllergen({ name: "Gluten Free Bagel Box with Salmon & Cream Cheese" }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "Sandwich, Egg Mayo (Oat)" }, ["eggs"])).toBe(true);
    expect(namesAllergen({ name: "Vegan Margherita Pizza" }, ["gluten"])).toBe(true);
    expect(namesAllergen({ name: "Vegan Impossible Burger" }, ["gluten"])).toBe(true);
    expect(namesAllergen({ name: "Oat Cookie" }, ["gluten"])).toBe(true);
    expect(namesAllergen({ name: "Porridge Oats with Whole Milk" }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "Dairy-free Egg Mayo Sandwich" }, ["eggs"])).toBe(true);
    // each free-from word still clears its own allergen
    expect(namesAllergen({ name: "Gluten-free Brownie" }, ["gluten"])).toBe(false);
    expect(namesAllergen({ name: "Vegan Mayo Wrap" }, ["eggs"])).toBe(false);
    expect(namesAllergen({ name: "Soya Latte" }, ["milk"])).toBe(false);
    expect(namesAllergen({ name: "Dairy-free Cheese Toastie" }, ["milk"])).toBe(false);
    expect(namesAllergen({ name: "Nut-free Brownie" }, ["nuts"])).toBe(false);
  });
  it("doesn't take a flavour for a plant milk, and still sees other dairy beside one (second review 2026-11-17)", () => {
    expect(namesAllergen({ name: "White Chocolate & Hazelnut Latte - Large" }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "Hazelnut Latte - Semi Skimmed Milk" }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "Coconut Mocha" }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "Hazelnut Milk Chocolate Cookie" }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "Oat Milk Hot Chocolate with Whipped Cream" }, ["milk"])).toBe(true);
    // a plant milk named as the milk still clears the drink, in its section too
    expect(namesAllergen({ name: "Soy Milk" }, ["milk"])).toBe(false);
    expect(namesAllergen({ name: "Hazelnut Latte with Oat Milk" }, ["milk"])).toBe(false);
    expect(namesAllergen({ name: "Oat Milk Latte", category: "Lattes" }, ["milk"])).toBe(false);
    expect(namesAllergen({ name: "Coconut Milk Curry" }, ["milk"])).toBe(false);
  });
  it("names cheesecake, creamed and buttered dishes as milk", () => {
    for (const name of ["Biscoff Cheesecake", "New York Cheesecake", "Buttered Mashed Potato", "Creamed Spinach"]) expect(namesAllergen({ name }, ["milk"])).toBe(true);
    expect(namesAllergen({ name: "New York Cheesecake" }, ["gluten"])).toBe(true);
  });
  it("uses the allergen guide where the restaurant has one", () => {
    const menu = [item("Salad", { allergens: { contains: ["milk"], mayContain: [] } }), item("Soup", { allergens: { contains: [], mayContain: [] } })];
    expect(shown(menu, P({ avoidAllergens: ["milk"] }))).toEqual(["Soup"]);
  });
});

describe("every published restaurant", () => {
  const dir = new URL("../public/menus/", import.meta.url);
  const chains = readdirSync(dir).filter((f) => f.startsWith("chain-")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Chain).filter((c) => !c.sample);
  it("shows dishes to a vegetarian and to a pescatarian at every restaurant (unless it tags every dish with pork or beef itself)", () => {
    const meatOnly = (c: Chain) => c.items.every((i) => i.tags.includes("contains_pork") || i.tags.includes("contains_beef")); // Papa's fries its chips in beef dripping
    for (const prefs of [P({ vegetarianOnly: true }), P({ pescatarianOnly: true })]) {
      const empty = chains.filter((c) => !meatOnly(c) && shown(c.items, prefs).length === 0).map((c) => c.id);
      expect(empty).toEqual([]);
    }
  });
  it("never shows a dish the restaurant tags with pork or beef to a vegetarian, pescatarian or vegan", () => {
    for (const prefs of [P({ vegetarianOnly: true }), P({ pescatarianOnly: true }), P({ veganOnly: true })]) {
      for (const c of chains) {
        const u = uncheckedDiet(c.items, prefs);
        expect(c.items.filter((i) => passesMenuDiet(i, prefs, u) && (i.tags.includes("contains_pork") || i.tags.includes("contains_beef"))).map((i) => `${c.id}: ${i.name}`)).toEqual([]);
      }
    }
  });
  it("never shows a dish a restaurant tags with pork to someone avoiding pork", () => {
    for (const c of chains) {
      const u = uncheckedDiet(c.items, P({ noPork: true }));
      expect(c.items.filter((i) => passesMenuDiet(i, P({ noPork: true }), u) && i.tags.includes("contains_pork")).map((i) => i.name)).toEqual([]);
    }
  });
});

describe("a restaurant that marks hardly any dish vegetarian", () => {
  it("counts as not marking them, keeping the few it does mark", () => {
    const menu = [item("Vegan Roll", { tags: ["vegetarian"] }), ...Array.from({ length: 30 }, (_, n) => item(n % 2 ? `Cheese Bake ${n}` : `Sausage Roll ${n}`))];
    expect(uncheckedDiet(menu, P({ vegetarianOnly: true })).vegetarian).toBe(true);
    const names = shown(menu, P({ vegetarianOnly: true }));
    expect(names).toContain("Vegan Roll");
    expect(names).toContain("Cheese Bake 1");
    expect(names.some((n) => n.startsWith("Sausage"))).toBe(false);
  });
});

describe("menu sections and meat-free names (review 2026-11-17)", () => {
  const veg = P({ vegetarianOnly: true });
  it("doesn't read a mixed or extras section as meat", () => {
    const menu = [item("Cinnamon Stix", { category: "Pretzels, nuggets & stix" }), item("Hot Honey Halloumi", { category: "Ciabattas, wraps & lunch burger" }), item("Beer Cheese", { category: "Burger add-ons" }), item("Cheese Topping", { category: "Burgers" })];
    expect(shown(menu, veg)).toEqual(["Cinnamon Stix", "Hot Honey Halloumi", "Beer Cheese", "Cheese Topping"]);
  });
  it("keeps meat-free dishes named by their own words in a meat section, and corn ribs", () => {
    const menu = [item("Buffalo Cluckless Tenders (6)", { category: "Cluckless tenders" }), item("McPlant", { category: "Burgers" }), item("Spicy Bean & Slaw", { category: "Burgers" }), item("Corn Ribs", { category: "Small plates" }), item("Big Mac", { category: "Burgers" })];
    expect(shown(menu, veg)).toEqual(["Buffalo Cluckless Tenders (6)", "McPlant", "Spicy Bean & Slaw", "Corn Ribs"]);
  });
});

describe("the restaurant's own vegetarian mark and mixed sections (second review 2026-11-17)", () => {
  const marked = [
    item("Beetroot Carrot Vada", { category: "Burgers", tags: ["vegetarian"] }),
    item("Korean Fried Chick+n", { category: "Burgers", tags: ["vegetarian"] }),
    item("Spiced Cauliflower Wings", { category: "Small plates", tags: ["vegetarian"] }),
    item("Sesame Tender Stem Broccoli", { category: "Small plates", tags: ["vegetarian"] }),
    item("Tender Stem Broccoli", { category: "Sides" }),
    item("Big Mac", { category: "Burgers" }),
  ];
  it("never leaves out a dish the restaurant marks vegetarian by its name or section rule, for a vegetarian", () => {
    // 4 marks in 106 dishes: too few to count as marking them, so the menu goes by name, keeping the marked ones
    const menu = [...marked, ...Array.from({ length: 100 }, (_, n) => item(`Side Salad ${n}`, { category: "Sides" }))];
    expect(uncheckedDiet(menu, P({ vegetarianOnly: true })).vegetarian).toBe(true);
    expect(shown(menu, P({ vegetarianOnly: true })).slice(0, 5)).toEqual(["Beetroot Carrot Vada", "Korean Fried Chick+n", "Spiced Cauliflower Wings", "Sesame Tender Stem Broccoli", "Tender Stem Broccoli"]);
  });
  it("doesn't let a vegetarian mark clear a burger or wings name for a vegan (a vegetarian mark says nothing about dairy or eggs; third review 2026-11-17)", () => {
    // "Spiced Cauliflower Wings" stays by its own name, not by the mark; this menu marks 4 of 7 dishes, so the unmarked broccoli isn't shown to a vegan either
    expect(shown([...marked, item("Spiced BBQ Panko Burger", { category: "Burgers & dogs", tags: ["vegetarian"] })], P({ veganOnly: true }))).toEqual(["Spiced Cauliflower Wings", "Sesame Tender Stem Broccoli"]);
    // a dish named vegan in a burgers section still stays
    expect(shown([item("Vegan Chick'n Burger", { category: "Burgers", tags: ["vegetarian"] }), item("Big Mac", { category: "Burgers" })], P({ veganOnly: true }))).toEqual(["Vegan Chick'n Burger"]);
  });
  it("doesn't let a meat-free word in a mixed section clear the meat in a dish's own name", () => {
    const section = "Chicken & plant-based";
    const menu = [item("Chicken Wrap (excl. sauce)", { category: section }), item("Chicken Strips & Chips (excl. sauce)", { category: section }), item("Club Sandwich", { category: section }), item("Spicy Bean Burger", { category: section }), item("Fries", { category: "Sides" })];
    expect(shown(menu, P({ vegetarianOnly: true }))).toEqual(["Spicy Bean Burger", "Fries"]);
    expect(shown(menu, P({ pescatarianOnly: true }))).toEqual(["Spicy Bean Burger", "Fries"]);
    expect(shown(menu, P({ veganOnly: true }))).toEqual(["Spicy Bean Burger", "Fries"]);
  });
  it("reads meat named inside another word or a brand name", () => {
    const names = ["Mighty Meaty®, Classic Crust - Large", "Meateor", "Meatilicious", "Meatzza", "Mixed Grill", "Philly Cheesesteak Toastie", "Chickenjoy", "Add a Smashed Patty"];
    const menu = [...names.map((n) => item(n)), item("Meat-free Feast"), item("Veggie Patty"), item("Vegetable Patty"), item("Sage & Onion Patty"), item("Chips")];
    expect(shown(menu, P({ vegetarianOnly: true }))).toEqual(["Meat-free Feast", "Veggie Patty", "Vegetable Patty", "Sage & Onion Patty", "Chips"]);
  });
});

describe("more meat a menu names plainly (third review 2026-11-17)", () => {
  it("leaves out boneless chicken, chick'n spellings, strips, dogs, gyros and Scotch pie", () => {
    const names = [
      "Boneless Bites x 8", "8 Boneless Bites & Wedges Combo", "Chick 'n' Mix", "Chick n Rice", "Chick N' Rice", "Chick'n Pitta", "Chickn Wrap", "Thic Chick", "Chickadee", "Hot Chick",
      "Kids Meal – Strips", "Tender Strips – 5", "Chicken Strip B.L.T", "Original Pretzel Dog", "Cheese Dog", "Mini Pretzel Dogs", "Yorkshire Greek Gyros", "Chicken Gyro", "Scotch Pie",
    ];
    const keep = [
      "No Chick'n Sweet & Sour", "Vegan Fried Chick'n", "Plant-based Chick'n Burger", "Cluckless Chick'n Strips", "Katsu Chickisn't (VG)", "Easter Chick Biscuit", "Tahini Greens + Chickpeas", "Chick Pea Curry",
      "Pepper & Cucumber Strips", "Sweet Potato Strips", "Halloumi Strips", "Vegan Strips", "Falafel Gyro", "Scotch Bonnet Chilli Dip", "White Scotch Baps", "Garlic Dough Bites", "Chips",
    ];
    const menu = [...names.map((n) => item(n)), ...keep.map((n) => item(n))];
    for (const prefs of [P({ vegetarianOnly: true }), P({ pescatarianOnly: true })]) expect(shown(menu, prefs)).toEqual(keep);
    // for a vegan the dairy words still count ("Halloumi Strips"), so only check that none of the meat is shown
    expect(shown(menu, P({ veganOnly: true })).filter((n) => names.includes(n))).toEqual([]);
  });
  it("keeps a chick'n dish whose menu section says it is vegan or plant-based", () => {
    const menu = [item("Chick'n Burger", { category: "Vegan" }), item("Crispy Chick'n Wrap", { category: "Plant-based & vegan" }), item("Chick'n Wrap", { category: "Vegan & sharing" }), item("Chick'n Burger 2", { category: "Burgers" })];
    expect(shown(menu, P({ vegetarianOnly: true }))).toEqual(["Chick'n Burger", "Crispy Chick'n Wrap", "Chick'n Wrap"]);
  });
  it("keeps cauliflower wings, a plant burger, burger add-ons and the restaurant's own (V) mark for a vegetarian; a (V) mark doesn't clear a burger for a vegan", () => {
    const menu = [item("Cauliflower Wings (Regular)", { category: "Starters" }), item("Sunshine Plant Burger", { category: "Burgers" }), item("Beanie Patty", { category: "Extras" }), item("Tomato chutney (burger add-on)", { category: "Add-ons & extras" }), item("Spicy Bean (V) Burger", { category: "Burgers" }), item("Halloumi (V) Wrap", { category: "Wraps" }), item("Quinoa Burger (V)", { category: "Burgers" }), item("Plant Patty (VE) Sub", { category: "Subs" }), item("Big Mac", { category: "Burgers" })];
    expect(shown(menu, P({ vegetarianOnly: true }))).toEqual(menu.slice(0, 8).map((i) => i.name));
    expect(shown(menu, P({ veganOnly: true }))).not.toContain("Quinoa Burger (V)");
    expect(shown(menu, P({ veganOnly: true }))).toContain("Plant Patty (VE) Sub");
  });
  it("leaves out chicken fused into another word, Chikn/Chkn spellings and pasties named without their meat (a Cornish pasty is beef)", () => {
    const names = ["California Kimchicken", "Chikn Burrito", "Chkn Bowl", "Traditional Pasty", "Large Traditional Pasty", "Cornish Pasty", "Traditional Cornish Pasty", "Christmas Dinner Pasty", "U/B Christmas Pasty (40)", "U/B Roast Dinner Pasty (32)"];
    const keep = ["Cheese & Onion Pasty", "Cornish Cheddar & Onion Pasty", "Garden Vegetable Pasty", "Sweet Apple & Cinnamon Pasty", "Chickpea Salad"];
    const menu = [...names.map((n) => item(n)), ...keep.map((n) => item(n))];
    for (const prefs of [P({ vegetarianOnly: true }), P({ pescatarianOnly: true })]) expect(shown(menu, prefs)).toEqual(keep);
    expect(shown(menu, P({ veganOnly: true })).filter((n) => names.includes(n))).toEqual([]);
  });
  it("keeps a chip shop's rock dog (dogfish) for a pescatarian", () => {
    expect(shown([item("The Rock dog and chips", { category: "Takeaway: Fish and Chips" }), item("Original Pretzel Dog", { category: "Pretzel dogs" })], P({ pescatarianOnly: true }))).toEqual(["The Rock dog and chips"]);
  });
});

describe("meat and fish a menu names in other words (fourth review 2026-11-17)", () => {
  const veg = P({ vegetarianOnly: true }), pesc = P({ pescatarianOnly: true }), vegan = P({ veganOnly: true });
  it("reads burger and kebab inside a longer word, in a dish's name and in its menu section", () => {
    const meat = [item("Yumburger", { category: "Yumburgers" }), item("Yumburger Meal", { category: "Yumburgers" }), item("Cheesy Yumburger", { category: "Yumburgers" }), item("Double Yumburger with Cheese", { category: "Yumburgers" }), item("Family Meal", { category: "Yumburgers" }), item("2pc Burgersteak With Rice"), item("Just Kebabin'", { category: "Specials" })];
    const keep = [item("Veggieburger", { category: "Yumburgers" }), item("Spicy Bean Burger", { category: "Yumburgers" }), item("Peach Mango Pie", { category: "Desserts" }), item("Chips", { category: "Sides" })];
    for (const prefs of [veg, pesc]) expect(shown([...meat, ...keep], prefs)).toEqual(keep.map((i) => i.name));
    expect(shown([...meat, ...keep], vegan).filter((n) => meat.some((i) => i.name === n))).toEqual([]);
  });
  it("reads a bites dish named by its flavour as chicken", () => {
    const menu = [item("BBQ Bites Meal Box", { category: "Hot food" }), item("Spicy BBQ Chicken Bites", { category: "Hot food" }), item("Southern Fried Bites", { category: "Hot food" }), item("Milk Choc Popcorn Bites", { category: "Snacks" }), item("Garlic Dough Bites", { category: "Hot food" }), item("Spicy Cauliflower Bites", { category: "Hot food" }), item("Cheese Bake", { category: "Hot food" })];
    expect(shown(menu, veg)).toEqual(["Milk Choc Popcorn Bites", "Garlic Dough Bites", "Spicy Cauliflower Bites", "Cheese Bake"]);
  });
  it("shows a vegan only the dishes a restaurant marks vegetarian, where it marks them but names none vegan", () => {
    const tagged = ["Fries", "Corn on the Cob", "Side Salad", "Pickles"].map((n) => item(n, { category: "Sides", tags: ["vegetarian"] }));
    const menu = [...tagged, item("10pc Dave's Bites w/ Fries", { category: "Bites" }), item("Juicy Stack", { category: "Top Buns" }), item("Fino Pitta", { category: "Pittas" }), item("Plain Rice", { category: "Sides" })];
    const u = uncheckedDiet(menu, vegan);
    expect(u.vegan).toBe(true);
    expect(u.vegetarianMarks).toBe(true);
    expect(shown(menu, vegan)).toEqual(["Fries", "Corn on the Cob", "Side Salad", "Pickles"]);
    // a menu that marks nothing still goes by name, so it isn't emptied
    const unmarked = menu.map((i) => ({ ...i, tags: [] }));
    expect(uncheckedDiet(unmarked, vegan).vegetarianMarks).toBe(false);
    expect(shown(unmarked, vegan)).toContain("Plain Rice");
  });
  it("reads the Japanese words for fish, seafood and chicken on a sushi menu that marks nothing", () => {
    const fish = ["Ebi Bites", "Ebi Nigiri (1 pc)", "Aka Ebi House Roll", "Crispy Ebi", "Maguro Nigiri (1 pc)", "Shake Nigiri (1 pc)", "Shake Tataki", "Shake Yaki Nigiri (2 pcs)", "Hiramasa Ceviche", "Hotate Kataifi", "Kani Korokke", "Inari Ikura Nigiri (1 pc)", "California Saba Mustard", "Eel Nigiri", "Toro sashimi", "Yellowtail Sushi", "Takoyaki", "Tuna, Tobiko & Mayo Onigiri"];
    const meat = ["Karaage", "Chicken Karaage", "Yakitori", "Char siu pork buns"];
    const keep = ["Tamago Nigiri (1 pc)", "Abokado Nigiri (1 pc)", "Kinoko Nigiri (1 pc)", "Inari Nigiri (1 pc)", "Vanilla Shake", "Tofu Karaage", "Cauliflower Karaage", "Dressing Pot - Tonkatsu BBQ"];
    const menu = [...fish, ...meat, ...keep].map((n) => item(n, { category: "À la carte" }));
    expect(shown(menu, veg)).toEqual(keep);
    expect(shown(menu, pesc)).toEqual([...fish, ...keep]);
    const forVegan = shown(menu, vegan);
    expect(forVegan.filter((n) => fish.includes(n) || meat.includes(n) || n.startsWith("Tamago"))).toEqual([]);
    expect(forVegan).toContain("Abokado Nigiri (1 pc)");
  });
  it("names the Japanese seafood and egg words as allergens", () => {
    expect(namesAllergen({ name: "Ebi Nigiri" }, ["crustaceans"])).toBe(true);
    expect(namesAllergen({ name: "Kani Korokke" }, ["crustaceans"])).toBe(true);
    expect(namesAllergen({ name: "Hotate Kataifi" }, ["molluscs"])).toBe(true);
    expect(namesAllergen({ name: "Takoyaki" }, ["molluscs"])).toBe(true);
    expect(namesAllergen({ name: "Shake Nigiri (1 pc)" }, ["fish"])).toBe(true);
    expect(namesAllergen({ name: "Maguro Sashimi" }, ["fish"])).toBe(true);
    expect(namesAllergen({ name: "Inari Ikura Nigiri" }, ["fish"])).toBe(true);
    expect(namesAllergen({ name: "Tamago Nigiri" }, ["eggs"])).toBe(true);
    expect(namesAllergen({ name: "Vanilla Shake" }, ["fish"])).toBe(false);
    expect(namesAllergen({ name: "Tims® Shake Brownie (small)" }, ["fish"])).toBe(false);
  });
  it("keeps toppings and buns that only name the burger or hot dog they go on", () => {
    const menu = [item("Gherkins (hot dog topping)", { category: "Add-ons" }), item("Crispy Onions (hot dog topping)", { category: "Add-ons" }), item("Curry Topping for Hot Dog", { category: "Add-ons" }), item("Hot Dog", { category: "Hot Snacks" }),
      item("Burger Bun", { category: "Burger & hot dog parts" }), item("Hot Dog Bun", { category: "Burger & hot dog parts" }), item("Beef Burger Patty", { category: "Burger & hot dog parts" }), item("Bacon", { category: "Burger & hot dog parts" }), item("Hot Dog (sausage only)", { category: "Burger & hot dog parts" })];
    expect(shown(menu, veg)).toEqual(["Gherkins (hot dog topping)", "Crispy Onions (hot dog topping)", "Curry Topping for Hot Dog", "Burger Bun", "Hot Dog Bun"]);
  });
});
