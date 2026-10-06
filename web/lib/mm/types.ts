// Types mirroring data/schema/chain.schema.json and manifest.schema.json exactly (docs/DATA.md).
// Keep this file free of UI imports: everything in lib/mm is pure and unit-tested.

export type Tag = "vegetarian" | "contains_pork" | "contains_beef";

/**
 * calories in kcal; grams for the rest; sodium in mg. Optional keys are omitted when not published.
 * UK guides publish salt (g, 2 decimals) instead of sodium; US guides publish sodium. They are never converted.
 */
export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat?: number;
  sodium?: number;
  sugar?: number;
  fiber?: number;
  salt?: number;
}

export const REQUIRED_NUTRIENTS = ["calories", "protein", "carbs", "fat"] as const;
export const OPTIONAL_NUTRIENTS = ["saturatedFat", "sodium", "sugar", "fiber", "salt"] as const;
export type NutrientKey = (typeof REQUIRED_NUTRIENTS)[number] | (typeof OPTIONAL_NUTRIENTS)[number];

export const COMPONENT_GROUPS = ["base", "wrap", "protein", "topping", "sauce", "side", "drink", "extra"] as const;
export type ComponentGroup = (typeof COMPONENT_GROUPS)[number];

export interface ComponentRef {
  id: string;
  qty: number; // 1 or 2 in menu data
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
