// Types mirroring data/schema/chain.schema.json and manifest.schema.json exactly (docs/DATA.md).
// Keep this file free of UI imports: everything in lib/mm is pure and unit-tested.

export type Tag = "vegetarian" | "contains_pork" | "contains_beef";

/**
 * calories in kcal; grams for the rest; sodium in mg. Optional keys are omitted when not published.
 * UK guides publish salt (g, 2 decimals) instead of sodium; US guides publish sodium. They are never converted.
 */
export interface Nutrients {
  calories: number;
  // protein, carbs and fat are always present for chains that publish full nutrition. Chains with
  // `nutritionLevel: "calories"` (docs/DATA.md) publish calories only, so these are absent there: never defaulted to 0.
  protein?: number;
  carbs?: number;
  fat?: number;
  saturatedFat?: number;
  sodium?: number;
  sugar?: number;
  fiber?: number;
  salt?: number;
  // Extra figures some UK guides print per serving (docs/DATA.md "Extra nutrients"); shown only when published.
  energyKj?: number;
  weight?: number; // grams
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  transFat?: number;
  caffeine?: number; // mg
}

export const REQUIRED_NUTRIENTS = ["calories", "protein", "carbs", "fat"] as const;
export const OPTIONAL_NUTRIENTS = ["saturatedFat", "sodium", "sugar", "fiber", "salt", "energyKj", "weight", "monounsaturatedFat", "polyunsaturatedFat", "transFat", "caffeine"] as const;
export type NutrientKey = (typeof REQUIRED_NUTRIENTS)[number] | (typeof OPTIONAL_NUTRIENTS)[number];

export const COMPONENT_GROUPS = ["base", "wrap", "protein", "topping", "sauce", "side", "drink", "extra"] as const;
export type ComponentGroup = (typeof COMPONENT_GROUPS)[number];

export interface ComponentRef {
  id: string;
  qty: number; // 1 or 2 in menu data
}

/** The 14 allergens UK law requires to be declared (docs/DATA.md "Allergens"). */
export const ALLERGEN_KEYS = ["celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts", "sesame", "soya", "sulphites"] as const;
export type AllergenKey = (typeof ALLERGEN_KEYS)[number];

/** Copied from the chain's own allergen guide; present only when that guide was read completely. */
export interface Allergens {
  contains: AllergenKey[];
  mayContain: AllergenKey[];
  cereals?: string[]; // which cereals containing gluten, as the guide names them
  nuts?: string[]; // which tree nuts
}

export interface AllergenGuide {
  title: string;
  url: string;
  checkedOn: string;
  mayContainPublished: boolean;
  /** false: the guide couldn't be read completely, so nothing carries allergens and the app only links to it. */
  complete: boolean;
}

export interface MenuComponent {
  id: string;
  group: ComponentGroup;
  name: string;
  portion: string;
  nutrients: Nutrients;
  tags: Tag[];
  removable: boolean;
  allowDouble: boolean;
  allergens?: Allergens;
}

export interface Modifier {
  id: string;
  label: string;
  kind: "remove" | "add";
  nutrients: Nutrients;
  tags: Tag[];
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  serving: string;
  nutrients: Nutrients;
  tags: Tag[];
  limitedTime: boolean;
  rankable: boolean;
  addedOn?: string; // yyyy-MM-dd
  /** The chain's own photo of this item, "<chain-id>/<file>.webp" under /menu-images/ (see lib/mm/images.ts); absent when none. */
  image?: string;
  allergens?: Allergens;
  components: ComponentRef[];
  modifiers: Modifier[];
}

export interface Combination {
  id: string;
  name: string;
  kind: "variation" | "combo";
  baseItemId: string | null;
  components: ComponentRef[];
  items: { itemId: string; modifierIds: string[] }[];
  nutrients: Nutrients;
  tags: Tag[];
  itemCount: number;
}

export interface Chain {
  schemaVersion: 1;
  id: string;
  name: string;
  cuisine: string;
  builderType: "build_your_own" | "standard";
  aliases: string[];
  sample: boolean;
  source: { title: string; url: string; checkedOn: string };
  note?: string; // a limit of the published data (docs/DATA.md note.txt), shown under the source
  allergenGuide?: AllergenGuide;
  /** "calories": the chain publishes calories only (docs/DATA.md); absent = full nutrition. */
  nutritionLevel?: "calories";
  categories: string[];
  components: MenuComponent[];
  items: MenuItem[];
  combinations: Combination[];
}

export interface ManifestChain {
  id: string;
  name: string;
  file: string;
  sha256: string;
  contentHash: string;
  cuisine?: string; // older manifests don't have it
  /** "full" = calories, protein, carbs and fat for every item; "calories" = the chain publishes calories only. Absent = full. */
  nutritionLevel?: "full" | "calories";
  sample: boolean;
  itemCount: number;
  checkedOn: string;
}

export interface Manifest {
  schemaVersion: 1;
  dataVersion: number;
  generatedAt: string;
  chains: ManifestChain[];
  /** The compact search index (docs/DATA.md); absent in older manifests. */
  search?: { file: string; sha256: string };
}

// ---- user-facing settings types (SPEC §5, §6)

export type Goal = "lose" | "maintain" | "buildMuscle" | "glp1";
export type Meal = "breakfast" | "lunch" | "dinner";

export interface Preferences {
  vegetarianOnly: boolean;
  noPork: boolean;
  noBeef: boolean;
}

export const NO_PREFERENCES: Preferences = { vegetarianOnly: false, noPork: false, noBeef: false };

export interface Profile {
  goal: Goal;
  dailyCalories: number;
  dailyProtein?: number;
  glp1MealCap?: number;
}
