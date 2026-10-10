import type { AllergenKey } from "./types";

// The pantry: every kind of ingredient a recipe can use (our own recipes and the ones Pip writes with AI). Each kind says how to find it in a
// shop's full list (words in the product name, plus a kcal range that fixes the form: dry rice, drained beans, light coconut milk), which
// part of a meal it plays when amounts are fitted to someone's numbers, and what it plainly is: meat, fish, from an animal, and the
// allergens it contains by its nature (milk in cheese, gluten in pasta). Those flags only let a recipe be LEFT OUT for a diet; they never
// promise a product is free of anything (we haven't read the products' allergen labels), so the app always says to check each pack.

export interface IngredientMatch {
  /** Every one of these words must start a word in the product name. */
  all: string[];
  /** At least one of these, if given. */
  any?: string[];
  /** None of these. */
  none?: string[];
  /** kcal per 100 g/ml must be inside this range: it fixes the form (dry rice, drained beans, light coconut milk). */
  kcal?: [number, number];
  minProtein?: number;
  maxFat?: number;
}

export type IngredientRole = "protein" | "carb" | "other";
export type MeatKind = "chicken" | "beef" | "lamb" | "turkey" | "pork";

export interface PantryKind {
  key: string;
  label: string;
  unit: "g" | "ml";
  match: IngredientMatch;
  /** The amount is the drained weight: only labels per 100 g drained (or products sold ready-drained) count. */
  drained?: boolean;
  /** Shown after the amount ("uncooked"). */
  note?: string;
  /** What it does when a recipe is fitted to someone's calories and protein: protein and carb amounts move, the rest stays as written. */
  role: IngredientRole;
  meat?: MeatKind;
  /** Fish or seafood. */
  fish?: boolean;
  /** Comes from an animal (meat, fish, eggs, milk): never in a vegan recipe. */
  animal?: boolean;
  /** Allergens it contains by its nature (never a promise that others are absent). */
  contains: AllergenKey[];
  /** For halal diets: the same kind, matched only to products the shop names "Halal". A meat kind without one is left out for halal. */
  halal?: { label: string; match: IngredientMatch };
  /** One piece in grams, to say "about 4 eggs" (a cooking guide only: the numbers always use grams). */
  pieceGrams?: number;
  pieceName?: [string, string];
}

const PROCESSED = ["sliced", "cooked", "roast", "bites", "goujon", "cured", "hunters", "just cook", "sizzlers", "kyiv", "kiev", "italian", "cajun", "steaks", "battered", "tempura", "buttermilk", "firecracker", "chunks", "escalope", "burger", "sauce", "with", "marinated", "coated", "breaded", "smoked", "chargrill", "tikka", "piri", "fajita", "slices", "pieces", "strips", "skewer", "wrapped", "stuffed", "southern", "katsu", "bbq", "spiced", "lemon", "garlic", "herb", "glaze", "seasoned", "meatballs"];

const KINDS: PantryKind[] = [
  // ---- protein
  {
    key: "chicken", label: "Chicken breast fillets", unit: "g", role: "protein", meat: "chicken", animal: true, contains: [],
    match: { all: ["chicken", "breast"], none: [...PROCESSED, "thigh", "halal"], kcal: [90, 170], minProtein: 20, maxFat: 5 },
    halal: { label: "Halal chicken breast fillets", match: { all: ["halal", "chicken", "breast"], none: PROCESSED, kcal: [90, 170], minProtein: 20, maxFat: 5 } },
  },
  {
    key: "chicken-thigh", label: "Chicken thigh fillets", unit: "g", role: "protein", meat: "chicken", animal: true, contains: [],
    match: { all: ["chicken", "thigh"], any: ["fillets", "boneless"], none: [...PROCESSED, "skin on", "halal"], kcal: [110, 200], minProtein: 15 },
  },
  {
    key: "beef-mince", label: "5% fat beef mince", unit: "g", role: "protein", meat: "beef", animal: true, contains: [],
    match: { all: ["beef", "mince"], none: ["pie", "burger", "meatball", "chilli", "lasagne", "cottage", "pork", "halal"], kcal: [100, 190], minProtein: 18, maxFat: 6 },
    halal: { label: "Halal beef mince", match: { all: ["halal", "beef", "mince"], none: ["pie", "burger", "meatball", "kofta", "kebab"], kcal: [100, 280], minProtein: 15 } },
  },
  {
    key: "turkey-mince", label: "Turkey mince", unit: "g", role: "protein", meat: "turkey", animal: true, contains: [],
    match: { all: ["turkey", "mince"], none: ["meatball", "burger"], kcal: [90, 190], minProtein: 18, maxFat: 8 },
  },
  {
    key: "lamb-mince", label: "Lamb mince", unit: "g", role: "protein", meat: "lamb", animal: true, contains: [],
    match: { all: ["lamb", "mince"], any: ["10%"], none: ["kofta", "kebab", "meatball", "burger", "halal"], kcal: [140, 230], minProtein: 15 },
  },
  {
    key: "salmon", label: "Salmon fillets", unit: "g", role: "protein", fish: true, animal: true, contains: ["fish"],
    match: { all: ["salmon", "fillets"], none: ["smoked", "sauce", "with", "coated", "breaded", "fishcake", "thai", "chilli", "teriyaki", "honey", "lemon", "garlic", "herb", "marinated", "hot", "flakes", "parcels", "en croute"], kcal: [110, 250], minProtein: 18 },
  },
  {
    key: "cod", label: "Cod fillets", unit: "g", role: "protein", fish: true, animal: true, contains: ["fish"],
    match: { all: ["cod"], any: ["fillets", "loin"], none: ["battered", "dusted", "breaded", "fishcakes", "crumb", "sauce", "with", "smoked", "fingers", "beer", "chunky"], kcal: [60, 120], minProtein: 15 },
  },
  {
    key: "tuna", label: "Tuna chunks in brine or spring water", unit: "g", role: "protein", drained: true, fish: true, animal: true, contains: ["fish"],
    match: { all: ["tuna"], any: ["brine", "spring water"], none: ["mayo", "sweetcorn", "pasta", "salad", "paste", "pate", "steak", "oil", "lemon", "chilli", "pepper", "flavour", "twist"], kcal: [80, 140], minProtein: 18 },
  },
  {
    key: "prawns", label: "King prawns", unit: "g", role: "protein", fish: true, animal: true, contains: ["crustaceans"],
    match: { all: ["prawns"], none: ["cocktail", "crackers", "tempura", "breaded", "sauce", "toast", "garlic", "chilli", "sweet", "katsu", "salt", "pepper", "spicy", "skewers", "ring"], kcal: [45, 110], minProtein: 10 },
  },
  {
    key: "eggs", label: "Free-range eggs", unit: "g", role: "protein", animal: true, contains: ["eggs"], pieceGrams: 60, pieceName: ["egg", "eggs"],
    match: { all: ["eggs"], any: ["free range", "large", "medium", "mixed"], none: ["boiled", "chocolate", "scotch", "mayo", "fried", "noodle", "custard", "quail", "pasta", "liquid", "white", "duck"], kcal: [120, 160], minProtein: 11 },
  },
  {
    key: "tofu", label: "Firm tofu", unit: "g", role: "protein", contains: ["soya"],
    match: { all: ["tofu"], any: ["firm", "block"], none: ["silken", "marinated", "smoked", "pieces", "stir fry"], kcal: [80, 180], minProtein: 10 },
  },
  {
    key: "quorn", label: "Quorn pieces", unit: "g", role: "protein", animal: true, contains: ["eggs"],
    match: { all: ["quorn", "pieces"], none: ["nuggets", "sausages", "sauce", "with", "fillets"], kcal: [70, 140], minProtein: 10 },
  },
  {
    key: "halloumi", label: "Halloumi", unit: "g", role: "protein", animal: true, contains: ["milk"],
    match: { all: ["halloumi"], none: ["quiche", "rolls", "wrap", "fries", "bites", "burger", "kebab", "skewer"], kcal: [260, 360], minProtein: 18 },
  },
  {
    key: "cottage-cheese", label: "Cottage cheese", unit: "g", role: "protein", animal: true, contains: ["milk"],
    match: { all: ["cottage", "cheese"], none: ["pineapple", "chive", "onion", "pepper", "with", "salmon"], kcal: [55, 120], minProtein: 8 },
  },
  {
    key: "greek-yogurt", label: "Fat-free Greek-style yogurt", unit: "g", role: "other", animal: true, contains: ["milk"],
    match: { all: ["greek", "yogurt"], any: ["fat free", "0%"], none: ["honey", "strawberry", "raspberry", "cherry", "mango", "lemon", "coconut", "vanilla", "peach", "blueberry", "fruit", "pot", "x4", "4x", "kids"], maxFat: 1, kcal: [40, 75] },
  },
  {
    key: "cheddar", label: "Mature cheddar", unit: "g", role: "other", animal: true, contains: ["milk"],
    match: { all: ["mature", "cheddar"], none: ["crackers", "sauce", "bake", "pie", "sandwich", "pasta", "snack", "bites", "sticks", "mini", "cubes", "lunchbox", "mozzarella", "spread", "lighter", "reduced", "onion", "chutney", "pickle", "jalapeno", "chilli", "cranberr", "tomato"], kcal: [380, 450] },
  },
  {
    key: "feta", label: "Feta", unit: "g", role: "other", animal: true, contains: ["milk"],
    match: { all: ["feta"], none: ["chicken", "quiche", "salad", "pastry", "spinach", "with", "olives", "couscous"], kcal: [230, 320] },
  },
  {
    key: "milk", label: "Semi-skimmed milk", unit: "ml", role: "other", animal: true, contains: ["milk"],
    match: { all: ["semi", "skimmed", "milk"], none: ["chocolate", "strawberry", "banana", "powder", "evaporated", "condensed", "milkshake", "coffee", "protein", "drink"], kcal: [40, 55] },
  },
  // ---- beans and pulses (tinned, drained)
  {
    key: "chickpeas", label: "Chickpeas in water", unit: "g", role: "protein", drained: true, contains: [],
    match: { all: ["chickpeas"], none: ["falafel", "houmous", "hummus", "curry", "smoked", "paprika", "spicy", "roasted", "crunchy", "snack", "flour", "bulgur", "rice", "tagine", "dhal", "soup", "salad", "couscous", "lentil", "tuna", "pizza"], kcal: [90, 180] },
  },
  {
    key: "kidney-beans", label: "Red kidney beans in water", unit: "g", role: "protein", drained: true, contains: [],
    match: { all: ["kidney", "beans"], none: ["chilli", "sauce", "mixed", "spicy", "lentils", "tuna", "salad"], kcal: [70, 140] },
  },
  {
    key: "black-beans", label: "Black beans in water", unit: "g", role: "protein", drained: true, contains: [],
    match: { all: ["black", "beans"], none: ["chilli", "sauce", "mexican", "eye", "spicy", "rice"], kcal: [70, 140] },
  },
  {
    key: "butter-beans", label: "Butter beans in water", unit: "g", role: "protein", drained: true, contains: [],
    match: { all: ["butter", "beans"], none: ["sauce", "salad", "spicy", "tomato"], kcal: [70, 140] },
  },
  {
    key: "green-lentils", label: "Green lentils in water", unit: "g", role: "protein", drained: true, contains: [],
    match: { all: ["lentils"], any: ["green", "in water"], none: ["red", "puy", "soup", "dhal", "spicy", "cajun", "tomatoey", "salad", "pasta"], kcal: [60, 130] },
  },
  // ---- carbs (dry or as sold)
  {
    key: "rice", label: "Rice", unit: "g", role: "carb", note: "uncooked", contains: [],
    match: { all: ["rice"], any: ["basmati", "jasmine", "long grain", "fragrant", "hom mali", "easy cook"], none: ["microwave", "pouch", "ready", "pilau", "with", "flavour", "express", "steam", "golden", "egg fried", "mushroom", "lemon", "coconut", "wild", "noodles", "flour", "cakes", "pots", "heat", "mix", "boil in"], kcal: [320, 400] },
  },
  {
    key: "pasta-long", label: "Spaghetti or linguine", unit: "g", role: "carb", note: "uncooked", contains: ["gluten"],
    match: { all: [], any: ["spaghetti", "linguine", "tagliatelle"], none: ["hoops", "rings", "sauce", "bolognese", "carbonara", "meatballs", "sausages", "fresh", "squash", "recipe mix"], kcal: [300, 400] },
  },
  {
    key: "pasta-shapes", label: "Pasta shapes (penne, fusilli)", unit: "g", role: "carb", note: "uncooked", contains: ["gluten"],
    match: { all: [], any: ["penne", "fusilli", "tortiglioni", "casareccia", "rigatoni", "farfalle", "macaroni", "conchiglie"], none: ["sauce", "bake", "salad", "chicken", "cheese", "bolognese", "fresh", "lentil", "pea", "meal", "gluten free", "free from"], kcal: [300, 400] },
  },
  {
    key: "noodles", label: "Ready-to-wok noodles", unit: "g", role: "carb", contains: ["gluten", "eggs"], animal: true,
    match: { all: ["noodles"], any: ["udon", "medium", "thick", "thin", "straight to wok", "ready to wok"], none: ["pot", "chicken", "beef", "prawn", "soup", "instant", "cup", "sauce", "flavour", "rice noodles", "egg", "glass", "soba", "ramen", "curry", "spicy"], kcal: [90, 200] },
  },
  {
    key: "wraps", label: "Tortilla wraps", unit: "g", role: "carb", contains: ["gluten"], pieceName: ["wrap", "wraps"],
    match: { all: ["wraps"], any: ["tortilla", "wholewheat", "plain", "white", "soft"], none: ["chicken", "salad", "falafel", "lettuce", "egg", "gluten free"], kcal: [240, 350] },
  },
  {
    key: "oats", label: "Porridge oats", unit: "g", role: "carb", contains: ["gluten"],
    match: { all: ["porridge", "oats"], none: ["sachet", "pot", "syrup", "apple", "berry", "chocolate", "golden", "flavour", "instant", "banana", "honey"], kcal: [330, 420] },
  },
  // ---- everything else stays as written when a recipe is fitted
  { key: "chopped-tomatoes", label: "Chopped tomatoes", unit: "g", role: "other", contains: [], match: { all: ["chopped", "tomatoes"], none: ["garlic", "herb", "chilli", "basil", "onion", "olive", "pepper", "oregano"], kcal: [10, 45] } },
  { key: "passata", label: "Passata", unit: "g", role: "other", contains: [], match: { all: ["passata"], none: ["garlic", "basil", "herb", "onion", "chilli", "pepper"], kcal: [15, 45] } },
  { key: "mixed-veg", label: "Mixed vegetables in water (tin)", unit: "g", role: "other", drained: true, contains: [], match: { all: ["mixed", "vegetables"], any: ["in water"], none: ["casserole", "pickled", "chargrilled", "gravy"], kcal: [25, 90] } },
  { key: "coconut-light", label: "Light coconut milk", unit: "ml", role: "other", contains: [], match: { all: ["coconut", "milk"], any: ["light", "reduced"], none: ["drink", "yogurt", "powder"], kcal: [30, 110] } },
  { key: "curry-paste", label: "Curry paste", unit: "g", role: "other", contains: [], match: { all: ["curry", "paste"], any: ["tikka", "korma", "madras", "balti", "jalfrezi", "rogan josh", "tandoori"], none: ["sauce", "marinade", "thai"] } },
  // Thai pastes are usually made with shrimp paste or fish sauce: treated as fish so a vegetarian recipe never uses one.
  { key: "thai-curry-paste", label: "Thai curry paste", unit: "g", role: "other", fish: true, animal: true, contains: ["fish", "crustaceans"], match: { all: ["thai", "curry", "paste"], none: ["sauce"] } },
  { key: "soy", label: "Soy sauce", unit: "ml", role: "other", contains: ["soya", "gluten"], match: { all: ["soy", "sauce"], none: ["sweet", "noodle", "chicken", "dark", "mushroom", "teriyaki", "garlic", "chilli", "vinegar", "pack"], kcal: [20, 120] } },
  { key: "peanut-butter", label: "Peanut butter", unit: "g", role: "other", contains: ["peanuts"], match: { all: ["peanut", "butter"], none: ["cups", "chocolate", "cookies", "bar", "biscuit", "bites", "powder", "jelly", "protein", "honey", "spread with"], kcal: [550, 700] } },
  { key: "houmous", label: "Houmous", unit: "g", role: "other", contains: ["sesame"], match: { all: ["houmous"], none: ["pepper", "chilli", "caramelised", "lemon", "garlic", "pine", "beetroot", "snack", "dippers", "pot", "x4", "4x", "olive", "harissa", "smoked", "jalapeno", "basil", "coriander", "edamame", "moroccan", "aromatic", "style", "topped", "spiced", "sweet", "falafel"], kcal: [150, 340] } },
];

export const PANTRY: ReadonlyMap<string, PantryKind> = new Map(KINDS.map((k) => [k.key, k]));
export const PANTRY_KEYS: readonly string[] = KINDS.map((k) => k.key);

export interface DietPrefs {
  vegetarianOnly?: boolean;
  veganOnly?: boolean;
  halalOnly?: boolean;
  noPork?: boolean;
  noBeef?: boolean;
  avoidAllergens?: readonly AllergenKey[];
}

/** Why a kind is left out for these preferences, or null when it may be used. Shellfish and anything without a halal-named product are left out for halal. */
export function kindExcluded(kind: PantryKind, prefs: DietPrefs): string | null {
  if (prefs.veganOnly && kind.animal) return "vegan";
  if ((prefs.vegetarianOnly || prefs.veganOnly) && (kind.meat || kind.fish)) return "vegetarian";
  if (prefs.noPork && kind.meat === "pork") return "no pork";
  if (prefs.noBeef && kind.meat === "beef") return "no beef";
  if (prefs.halalOnly && ((kind.meat && !kind.halal) || kind.contains.includes("crustaceans") || kind.contains.includes("molluscs"))) return "halal";
  const hit = (prefs.avoidAllergens ?? []).find((a) => kind.contains.includes(a));
  return hit ? hit : null;
}

/** The kind as these preferences need it: for halal, a meat kind is matched only to products named "Halal". */
export function kindForDiet(kind: PantryKind, prefs: DietPrefs): PantryKind {
  return prefs.halalOnly && kind.meat && kind.halal ? { ...kind, label: kind.halal.label, match: kind.halal.match } : kind;
}

/** The kinds a recipe may use for these preferences (what Pip is offered when it writes one). */
export function pantryForDiet(prefs: DietPrefs): PantryKind[] {
  return KINDS.filter((k) => kindExcluded(k, prefs) === null).map((k) => kindForDiet(k, prefs));
}
