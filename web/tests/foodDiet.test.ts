import { describe, expect, it } from "vitest";
import { anyFoodDiet, foodDietCaution, foodDietProblem, listedFacts, namedPescatarian, type FoodFacts } from "../lib/mm/foodDiet";
import { NO_PREFERENCES, type Preferences } from "../lib/mm/types";

const veg: Preferences = { ...NO_PREFERENCES, vegetarianOnly: true };
const vegan: Preferences = { ...NO_PREFERENCES, veganOnly: true };
const halal: Preferences = { ...NO_PREFERENCES, halalOnly: true };
const pesc: Preferences = { ...NO_PREFERENCES, pescatarianOnly: true };
const noPork: Preferences = { ...NO_PREFERENCES, noPork: true };
const noBeef: Preferences = { ...NO_PREFERENCES, noBeef: true };
const p = (name: string, more: Partial<FoodFacts> = {}): FoodFacts => ({ name, ...more });

describe("foodDietProblem: vegetarian", () => {
  it("leaves out products whose name, type or category says meat or fish", () => {
    expect(foodDietProblem(p("British Chicken Breast Fillets"), veg)).toBe("meat");
    expect(foodDietProblem(p("Sliced Ham"), veg)).toBe("meat");
    expect(foodDietProblem(p("Tuna Chunks in Spring Water"), veg)).toBe("fish");
    expect(foodDietProblem(p("Large Black Tiger Prawns"), veg)).toBe("fish");
    expect(foodDietProblem(p("Extra Lean Mince", { category: "meat" }), veg)).toBe("meat");
    expect(foodDietProblem(p("Fillets", { category: "fish" }), veg)).toBe("fish");
    expect(foodDietProblem(p("Something", { type: "chicken-breasts" }), veg)).toBe("meat");
    expect(foodDietProblem(p("Rump", { category: "Meat & fish" }), veg)).toBe("meat");
    expect(foodDietProblem(p("Worcester Sauce", { type: "worcestershire-sauces" }), veg)).toBe("fish");
  });
  it("catches dishes that are meat by their own name, unless the word before says otherwise", () => {
    expect(foodDietProblem(p("Chilli con carne"), veg)).toBe("meat");
    expect(foodDietProblem(p("Spaghetti carbonara"), veg)).toBe("meat");
    expect(foodDietProblem(p("2 Scotch Eggs"), veg)).toBe("meat");
    expect(foodDietProblem(p("BLT on malted bread"), veg)).toBe("meat");
    expect(foodDietProblem(p("Lentil bolognese"), veg)).toBeNull();
    expect(foodDietProblem(p("Vegetable Chili Bean Non Carne"), veg)).toBeNull();
    expect(foodDietProblem(p("Lasagne Sheet", { type: "prepared-lasagne" }), veg)).toBeNull();
  });
  it("uses the ingredients and the fish/shellfish allergens", () => {
    expect(foodDietProblem(p("Jelly Sweets", { ingredients: "Glucose Syrup, Sugar, Pork Gelatine" }), veg)).toBe("meat");
    expect(foodDietProblem(p("Thai Curry Paste", { allergens: { contains: ["crustaceans"], mayContain: [] } }), veg)).toBe("fish");
  });
  it("keeps meat-free versions and words that aren't meat", () => {
    expect(foodDietProblem(p("Quorn Vegetarian Chicken Style Pieces"), veg)).toBeNull();
    expect(foodDietProblem(p("This Isn't Bacon Rashers 120g", { category: "Meat & fish" }), veg)).toBeNull();
    expect(foodDietProblem(p("Plant Pioneers Meat Free Mince"), veg)).toBeNull();
    expect(foodDietProblem(p("Mince", { category: "meat-alternatives" }), veg)).toBeNull();
    expect(foodDietProblem(p("British Free Range Eggs", { type: "free-range-chicken-eggs" }), veg)).toBeNull();
    expect(foodDietProblem(p("Beef Tomatoes x2"), veg)).toBeNull();
    expect(foodDietProblem(p("Oyster Mushrooms 150g"), veg)).toBeNull();
    expect(foodDietProblem(p("White Jumbo Hot Dog Rolls x6"), veg)).toBeNull();
    expect(foodDietProblem(p("Cauliflower Steaks"), veg)).toBeNull();
    expect(foodDietProblem(p("Hamburger Buns"), veg)).toBeNull();
    expect(foodDietProblem(p("Wholemeal Loaf"), veg)).toBeNull();
  });
  it("is not about meat when only an allergy or no setting is on", () => {
    expect(foodDietProblem(p("Chicken Breast"), NO_PREFERENCES)).toBeNull();
  });
});

describe("foodDietProblem: vegan, pork, beef, halal", () => {
  it("vegan also leaves out milk, eggs and honey unless the plant version is named", () => {
    expect(foodDietProblem(p("Mature Cheddar"), vegan)).toBe("animal");
    expect(foodDietProblem(p("Manuka Honey"), vegan)).toBe("animal");
    expect(foodDietProblem(p("Crackers", { allergens: { contains: ["milk"], mayContain: [] } }), vegan)).toBe("animal");
    expect(foodDietProblem(p("Oat Milk Barista"), vegan)).toBeNull();
    expect(foodDietProblem(p("Smooth Peanut Butter"), vegan)).toBeNull();
    expect(foodDietProblem(p("Butter Beans in Water"), vegan)).toBeNull();
    expect(foodDietProblem(p("Vegan Mayo"), vegan)).toBeNull();
    expect(foodDietProblem(p("Coconut Milk"), vegan)).toBeNull();
    expect(foodDietProblem(p("Tuna"), vegan)).toBe("fish");
  });
  it("no pork catches pork words but not other meats' versions", () => {
    expect(foodDietProblem(p("Smoked Back Bacon"), noPork)).toBe("pork");
    expect(foodDietProblem(p("Pork Sausages"), noPork)).toBe("pork");
    expect(foodDietProblem(p("Wine Gums", { ingredients: "Sugar, Gelatine (Beef)" }), noPork)).toBe("pork");
    expect(foodDietProblem(p("Turkey Rashers"), noPork)).toBeNull();
    expect(foodDietProblem(p("Turkey Ham Slices"), noPork)).toBeNull();
    expect(foodDietProblem(p("Beef Pepperoni"), noPork)).toBeNull();
    expect(foodDietProblem(p("Chicken Breast"), noPork)).toBeNull();
    expect(foodDietProblem(p("Parma Violets"), noPork)).toBeNull();
  });
  it("no beef catches beef words but not fish steaks or beef tomatoes", () => {
    expect(foodDietProblem(p("Sirloin Steak"), noBeef)).toBe("beef");
    expect(foodDietProblem(p("Steak & Ale Pie"), noBeef)).toBe("beef");
    expect(foodDietProblem(p("Tuna Steaks"), noBeef)).toBeNull();
    expect(foodDietProblem(p("Gammon Steaks"), noBeef)).toBeNull();
    expect(foodDietProblem(p("Beef Tomatoes"), noBeef)).toBeNull();
  });
  it("halal leaves out pork, alcohol and meat not named halal; fish stays", () => {
    expect(foodDietProblem(p("Pork Pie"), halal)).toBe("pork");
    expect(foodDietProblem(p("Chicken Thighs"), halal)).toBe("notHalal");
    expect(foodDietProblem(p("Tariq Halal Chicken Thighs"), halal)).toBeNull();
    expect(foodDietProblem(p("Tuna Steak in Brine", { category: "fish" }), halal)).toBeNull();
    expect(foodDietProblem(p("Pale Ale 4x440ml"), halal)).toBe("alcohol");
    expect(foodDietProblem(p("Red Wine", { category: "Beer, wine & spirits" }), halal)).toBe("alcohol");
    expect(foodDietProblem(p("Alcohol Free Lager 0.0%"), halal)).toBeNull();
    expect(foodDietProblem(p("Ginger Ale"), halal)).toBeNull();
    expect(foodDietProblem(p("Cider Vinegar", { type: "cider-vinegars" }), halal)).toBeNull();
    expect(foodDietProblem(p("Mayonnaise", { ingredients: "Rapeseed Oil, Water, Spirit Vinegar, Egg" }), halal)).toBeNull();
  });
});

describe("allergens", () => {
  const avoid: Preferences = { ...NO_PREFERENCES, avoidAllergens: ["peanuts"] };
  it("hides a listed allergen and unknown allergens, but can't filter a list that never carries them", () => {
    expect(foodDietProblem(p("Bar", { allergens: { contains: [], mayContain: ["peanuts"] } }), avoid)).toBe("allergen");
    expect(foodDietProblem(p("Bar", { allergens: null }), avoid)).toBe("allergen");
    expect(foodDietProblem(p("Bar", { allergens: { contains: ["milk"], mayContain: [] } }), avoid)).toBeNull();
    expect(foodDietProblem(p("Bar"), avoid)).toBeNull();
  });
});

describe("helpers", () => {
  it("anyFoodDiet includes halal and allergies", () => {
    expect(anyFoodDiet(NO_PREFERENCES)).toBe(false);
    expect(anyFoodDiet(halal)).toBe(true);
    expect(anyFoodDiet({ ...NO_PREFERENCES, avoidAllergens: ["milk"] })).toBe(true);
  });
  it("listedFacts reads every shop's own name and ingredients", () => {
    const f = listedFacts({ name: "Fillets", brand: "X", category: "other", allergens: null, byRetailer: { a: { name: "Fillets", ingredients: "Salmon (Fish)" } } });
    expect(foodDietProblem(f, veg)).toBe("fish");
  });
  it("the caution names what can't be promised", () => {
    expect(foodDietCaution(NO_PREFERENCES)).toBeNull();
    expect(foodDietCaution({ ...veg, halalOnly: true })).toBe("We go by each product's name, type and label, so this can't promise a product is vegetarian or halal. Always check the pack.");
  });
});

describe("other shops' aisle names", () => {
  it("reads Asda, Lidl and Aldi aisles", () => {
    expect(foodDietProblem({ name: "Something", category: "Meat, Poultry & Fish" }, veg)).toBe("meat");
    expect(foodDietProblem({ name: "Something", category: "Meat & Poultry" }, veg)).toBe("meat");
    expect(foodDietProblem({ name: "Something", category: "Fish & Seafood" }, veg)).toBe("fish");
    expect(foodDietProblem({ name: "Something", category: "Meat & Fish" }, veg)).toBe("meat");
    expect(foodDietProblem({ name: "Something", category: "Fish & Seafood" }, halal)).toBeNull();
    expect(foodDietProblem({ name: "Something", category: "Wine, Beer & Spirits" }, halal)).toBe("alcohol");
    expect(foodDietProblem({ name: "Something", category: "Beer, Wine & Spirits" }, halal)).toBe("alcohol");
    expect(foodDietProblem({ name: "Something", category: "Alcohol" }, halal)).toBe("alcohol");
    expect(foodDietProblem({ name: "Something", category: "Chilled Food" }, halal)).toBeNull();
    expect(foodDietProblem({ name: "Quorn Vegetarian Pieces", category: "Meat & Poultry" }, veg)).toBeNull();
  });
});

describe("M&S's own aisle names (its everyday food range, founder 2026-10-16)", () => {
  it("'Meat Alternatives' is meat-free, 'Meat' and 'Poultry' are meat, 'Fish & Seafood' is fish", () => {
    expect(foodDietProblem({ name: "Plant Kitchen Chicken Style Pieces 200 g", category: "Meat Alternatives" }, veg)).toBeNull();
    expect(foodDietProblem({ name: "Plant Kitchen Smoky Veggie Sausages 300 g", category: "Meat Alternatives" }, vegan)).toBeNull();
    expect(foodDietProblem({ name: "Beef Mince 500 g", category: "Meat" }, veg)).toBe("meat");
    expect(foodDietProblem({ name: "Free Range Whole Bird 1.6 kg", category: "Poultry" }, veg)).toBe("meat");      // the name names no meat; the aisle does
    expect(foodDietProblem({ name: "Free Range Whole Bird 1.6 kg", category: "Poultry" }, pesc)).toBe("meat");
    expect(foodDietProblem({ name: "Free Range Whole Bird 1.6 kg", category: "Poultry" }, halal)).toBe("notHalal");
    expect(foodDietProblem({ name: "Fillets 240 g", category: "Fish & Seafood" }, veg)).toBe("fish");
    expect(foodDietProblem({ name: "Fillets 240 g", category: "Fish & Seafood" }, pesc)).toBeNull();
    expect(foodDietProblem({ name: "Free Range Eggs 6", category: "Eggs" }, veg)).toBeNull();
    // "Cured & Ready to Eat Meats": 25 of its 125 products name no meat ("Mortadella", "Roast Drumsticks", "Ox Tongue", "Jamon de Bellota")
    for (const name of ["Italian Mortadella 107 g", "Sticky BBQ Drumsticks 380 g", "M&S Collection British Traditional Ox Tongue (4 Slices) 95 g"]) {
      expect(foodDietProblem({ name, category: "Cured & Ready to Eat Meats" }, veg), name).toBe("meat");
      expect(foodDietProblem({ name, category: "Cured & Ready to Eat Meats" }, pesc), name).toBe("meat");
      expect(foodDietProblem({ name, category: "Cured & Ready to Eat Meats" }, halal), name).toBe("notHalal");
    }
    expect(foodDietProblem({ name: "Cured Meat Free Slices 90 g", category: "Cured & Ready to Eat Meats" }, veg)).toBeNull();   // a meat-free version stays
    expect(foodDietProblem({ name: "Pigs in Blankets 211 g", category: "Food on the Move" }, veg)).toBe("meat");
    expect(foodDietProblem({ name: "Pigs in Blankets 211 g", category: "Food on the Move" }, noPork)).toBe("pork");
    // the catalogue's own kebab-case type still counts as meat-free
    expect(foodDietProblem({ name: "Mince", category: "meat-alternatives" }, veg)).toBeNull();
    expect(foodDietProblem({ name: "Mince", category: "Meat-Alternatives" }, veg)).toBeNull();
    // and an aisle that merely starts with the word is not taken for it
    expect(foodDietProblem({ name: "Mincemeat 411 g", category: "Meat alternatives and more" }, veg)).toBe("meat");
  });
});

describe("M&S's everyday range: its own meat-free lines, and dishes its aisle or a missing word would misjudge (review 2026-10-16)", () => {
  // names and aisles exactly as the published M&S list has them
  const plantKitchen: Array<[string, string]> = [
    ["Plant Kitchen No Beef Steak Pie 200 g", "Ready to Cook"],
    ["Plant Kitchen No Pork Sausage Roll 95 g", "Food on the Move"],
    ["Plant Kitchen 2 No Pork Sausage Rolls 120 g", "Deli"],
    ["Plant Kitchen No Chicken and Chorizo Sandwich 188 g", "Food on the Move"],
    ["Plant Kitchen Mushroom Spaghetti Bolognese 400 g", "Ready to Cook"],
    ["Plant Kitchen Melt in the Middle No Fishcakes 290 g", "Fish & Seafood"],
    ["Plant Kitchen Grated Mature Style Cheddar 200 g", "Dairy"],
    ["Plant Kitchen Cheese Flavour Twists 125 g", "Dairy"],
  ];
  it("Plant Kitchen is M&S's vegan range: nothing in it is hidden by a meat, fish or dairy word in its name or by its aisle", () => {
    for (const [name, category] of plantKitchen) {
      for (const [label, prefs] of [["vegetarian", veg], ["vegan", vegan], ["pescatarian", pesc], ["halal", halal], ["no pork", noPork], ["no beef", noBeef]] as const) {
        expect(foodDietProblem({ name, category }, prefs), `${name} / ${label}`).toBeNull();
      }
    }
  });
  it("a title that STARTS with 'No <meat or fish>' is the meat-free version, but a product that merely says what it leaves out is still meat", () => {
    expect(foodDietProblem(p("No Chicken Nuggets 200 g"), veg)).toBeNull();
    expect(foodDietProblem(p("No Fish Fingers 240 g"), veg)).toBeNull();
    expect(foodDietProblem(p("Halal Chicken Sausages (No Pork) 300 g"), veg)).toBe("meat");
    expect(foodDietProblem(p("Beef Sausages No Pork 340 g"), veg)).toBe("meat");
    expect(foodDietProblem(p("Beef Burger No Bun 227 g"), veg)).toBe("meat");
  });
  it("halloumi kebabs, sage and onion stuffing and a vegetable haggis are not meat because of the Meat aisle they sit in", () => {
    for (const name of ["Chilli Halloumi Kebabs 225 g", "Herby Halloumi Kebabs 225 g", "Sage and Onion Stuffing 225 g", "Spiced Vegetable and Lentil Haggis 454 g", "Veg Haggis 340 g"]) {
      expect(foodDietProblem({ name, category: "Meat" }, veg), name).toBeNull();
      expect(foodDietProblem({ name, category: "Meat" }, halal), name).toBeNull();
    }
    // a meat word in the name still counts, and so does a real meat product in that aisle
    for (const name of ["British Outdoor Bred Pork, Sage and Onion Stuffing 340 g", "Scottish Haggis 454 g", "Chicken and Halloumi Kebabs 300 g", "Beef Mince 500 g", "Free Range Whole Bird 1.6 kg"]) {
      expect(foodDietProblem({ name, category: "Meat" }, veg), name).toBe("meat");
    }
  });
  it("a vegan is not shown cheeses, crème fraîche or milkshakes whose names carry none of the usual dairy words", () => {
    for (const name of ["Parmigiano Reggiano 175 g", "Italian Burrata 260 g", "Comté 2 Year Vintage AOP 200 g", "Comte 200 g", "Aged Goat's Gouda 180 g", "Swiss Le Gruyere 200 g", "Mature Blue Stilton 150 g", "Roquefort Révélation 100 g",
      "Bleu D'Auvergne PDO 145 g", "Pave D'Affinois 150 g", "Blacksticks Blue 150 g", "Red Leicester 300 g", "Edam Slices 250 g", "Creamy Lancashire 150 g", "Cheshire 300 g", "Creme Fraiche 200 ml",
      "British Crème Fraîche 300 ml", "Belgian Chocolate Milkshake 750 ml", "Cheeseboard Bites 450 g", "British Four Cheeseboard Bake 150 g", "Iced Coffee Latte 750 ml", "Pecorino Romano PDO 175 g"]) {
      expect(foodDietProblem({ name, category: "Dairy" }, vegan), name).toBe("animal");
      expect(foodDietProblem({ name, category: "Dairy" }, veg), name).toBeNull();      // dairy is fine for a vegetarian
    }
    // what is plant-based or just shares a word stays
    for (const name of ["Plant Kitchen Whole Oat Drink 1 l", "Only 3 Ingredients Oat Drink 1 l", "Plant Kitchen Salted Caramel Oatshake 750 ml", "Oat Milkshake 330 ml", "Vegan Gouda Style Slices 150 g", "Filo Pastry 270 g",
      "Ready Rolled Puff Pastry 320 g", "Pizza Dough 400 g", "Membrillo Quince Paste 120 g", "Reduced Fat Olive Oil Spread 500 g", "Edamame Beans 200 g", "Real Lancashire Eccles Cakes 4 pack", "Lancashire Tea 80 Tea Bags 250 g",
      "Cheeseboard Chutney 290 g", "Oat Iced Latte 250 ml", "Plant Kitchen Chilled Cold Brew Oat Latte 750 ml"]) {
      expect(foodDietProblem({ name, category: "Dairy" }, vegan), name).toBeNull();
    }
  });
  it("dishes that are meat by their own name are left out for a vegetarian, their meat-free versions are not", () => {
    for (const name of ["Mighty Meaty Pizza 440 g", "Taste Buds Mighty Meaty Pasta 225 g", "Classic Hawaiian Pizza 463 g", "Cumberland Pie 400 g", "All Day Breakfast Sandwich 234 g", "The Club Sandwich 234 g",
      "The BBB Sandwich 244 g", "Dinky and Mighty Shareable Cumberland Snack Eggs 300 g", "Chicago Town Deep Dish Mega Meaty Pizzas 2 X 157G"]) {
      expect(foodDietProblem(p(name), veg), name).toBe("meat");
      expect(foodDietProblem(p(name), pesc), name).toBe("meat");
    }
    for (const name of ["Vegetarian All Day Breakfast 400 g", "Meat Free Hawaiian Pizza 360 g", "Veggie Cumberland Pie 400 g", "Quorn Cumberland Sausages 336 g", "Plant Pioneers Cumberland Shroomdogs 300 g",
      "Sushi Rice 500 g", "Hawaiian Oat Granola 400 g", "Walkers Meaty Variety Crisps 6 x 25 g", "Vegetarian Club Sandwich 220 g"]) {
      expect(foodDietProblem(p(name), veg), name).toBeNull();
    }
  });
});

describe("pescatarian (founder 2026-10-15: people are also pescatarian)", () => {
  it("leaves out meat and keeps fish, seafood, dairy and eggs", () => {
    expect(foodDietProblem(p("British Chicken Breast Fillets"), pesc)).toBe("meat");
    expect(foodDietProblem(p("Sliced Ham"), pesc)).toBe("meat");
    expect(foodDietProblem(p("Extra Lean Mince", { category: "meat" }), pesc)).toBe("meat");
    expect(foodDietProblem(p("Chilli con carne"), pesc)).toBe("meat");
    expect(foodDietProblem(p("Fruit Gums made with pork gelatine"), pesc)).toBe("meat");
    expect(foodDietProblem(p("Tuna Chunks in Spring Water"), pesc)).toBeNull();
    expect(foodDietProblem(p("Large Black Tiger Prawns"), pesc)).toBeNull();
    expect(foodDietProblem(p("Fillets", { category: "fish" }), pesc)).toBeNull();
    expect(foodDietProblem(p("Mature Cheddar"), pesc)).toBeNull();
    expect(foodDietProblem(p("Free Range Eggs"), pesc)).toBeNull();
    expect(foodDietProblem(p("Quorn Chicken Style Pieces"), pesc)).toBeNull(); // meat-free version
  });
  it("is a setting foodDietProblem acts on, with its own word in the caution line", () => {
    expect(anyFoodDiet(pesc)).toBe(true);
    expect(foodDietCaution(pesc)).toContain("pescatarian");
  });
  it("a restaurant dish counts when its own name names fish or seafood and no meat", () => {
    for (const n of ["Salmon fillet", "Fish and chips", "Prawn linguine", "Tuna melt", "King prawn curry", "Battered cod", "Calamari", "Smoked mackerel pate"]) expect(namedPescatarian(n), n).toBe(true);
    for (const n of ["Lobster Surf & Turf", "Surf & Turf - Lemon, Garlic & Chilli Prawns", "Turf & Surf prawns", "Chicken and prawn pad thai", "Surf and turf", "Cheeseburger", "Margherita pizza", "Caesar salad", "Bacon and egg roll", "Prawn crackers with pork belly"]) expect(namedPescatarian(n), n).toBe(false);
    expect(namedPescatarian("Oyster mushroom risotto")).toBe(false); // a mushroom, not seafood
    expect(namedPescatarian("Sticky toffee pudding (Seafood Restaurant)")).toBe(false); // the restaurant's name, not the dish
    expect(namedPescatarian("Hot & spicy king prawn (Bún tôm Huế)")).toBe(true);
    expect(namedPescatarian("Salad (add chicken)")).toBe(false);
    for (const n of ["Pan Fried Stonebass", "Fishcakes", "Toro sashimi", "Hot shellfish", "Salmone alla Griglia"]) expect(namedPescatarian(n), n).toBe(true);
  });
});
