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
