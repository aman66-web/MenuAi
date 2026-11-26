"use client";

import Link from "next/link";
import { AllergenTable } from "../_components/Allergens";
import { recipeAllergens } from "@/lib/mm/recipeAllergens";
import { useRouter } from "next/navigation";
import type { AllergenKey, LogMeal, Preferences } from "@/lib/mm/types";
import { useEffect, useMemo, useState } from "react";
import { addAtLeast, formatPrice, formatUsedPrice, listForShop, MAX_SHOPPING_ITEMS, withPhoto, type ShoppingItem } from "@/lib/mm/groceries";
import { ADD_TO, ADDED_TO, MAX_SERVINGS as MAX_LOG_SERVINGS, MIN_SERVINGS as MIN_LOG_SERVINGS, recipeNutrients, stepServings } from "@/lib/mm/addFood";
import { mealSlotFor } from "@/lib/mm/budget";
import { MORE_DIET_LABEL } from "@/lib/mm/foodDiet";
import { BETTER } from "@/lib/mm/mealPlan";
import type { DietPrefs } from "@/lib/mm/pantry";
import { formatCalories, formatDate, formatGrams, formatInt, nutrientAriaLabel } from "@/lib/mm/format";
import { tk, type T } from "@/lib/mm/i18n";
import { firstMentions } from "@/lib/mm/stepIngredients";
import { recipeTicks } from "@/lib/mm/listRecipes";
import { kitchenSize, methodAmount, placeAmounts, scaleMethodStep } from "@/lib/mm/kitchenAmount";
import { LOCAL_RANGE_SHOP, LOCAL_SHOP_PRODUCTS } from "@/lib/mm/localRange";
import { localTipFor } from "@/lib/mm/localTips";
import { MAX_RECIPE_SERVINGS, MEAL_TYPES, candidates, countsSuit, fitOutcome, haveKey, isMeatFree, noteForPick, pickFor, recipeTotals, recipeView, resolveRecipe, roundedAmountsMatter, scaleServings, scaleSpec, subSpec, type IngredientPick, type IngredientSpec, type MealTarget, type Recipe } from "@/lib/mm/recipes";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { USUAL_PORTION, portionReason, samePortion } from "@/lib/mm/recipePortion";
import { splitStep, stepTime } from "@/lib/mm/recipeSteps";
import { nutritionBasis, productKey, shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { PANTRY } from "@/lib/mm/pantry";
import { addLogEntry, countProAction, cupboardStore, deleteLogEntry, savedRecipesStore, shoppingStore, toggleCupboard, toggleSavedRecipe } from "@/lib/mm/stores";
import { analytics } from "@/lib/mm/analytics";
import { halves } from "@/lib/mm/user-data";
import { site } from "@/site.config";
import { CheckIcon, ChevronRightIcon, HeartIcon, InfoIcon, LeafIcon, MinusIcon, PlusIcon, SwapIcon, TodayIcon } from "../_components/icons";
import { Button, Chip, ChoiceMark, LinkButton, Segmented, Sheet, radioKeyNav } from "../_components/ui";
import { Note } from "../_components/Note";
import { Toast } from "../_components/Toast";
import { useGate } from "../_components/Paywall";
import { ALLERGEN_SHORT, dietWords } from "../_components/DietPicker";
import { travelBack, useBack } from "../_lib/backNav";
import { useRecipePhoto } from "../_lib/recipePhotos";
import { PageHeader } from "../_components/PageHeader";
import { useSettings, useStore } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { PhotoTile } from "../groceries/ProductPhoto";
import { ProductMini } from "../groceries/ProductMini";
import { MEAL_LOOK, RecipeHeroArt } from "./RecipeTile";
import { ShopMark } from "../_components/ChainMark";

// One recipe filled with a shop's own products, fitted to the person's meal (Recipes › Your meal) unless they ask to see it as written.
// They can swap any ingredient for another product that matches, or for one of the recipe's substitutes (also used on its own when the
// shop doesn't sell an ingredient); every figure is arithmetic on the labels of the products shown, for the amounts shown (lib/mm/recipes.ts). Used for our recipes, Pip's saved recipes and a recipe Pip has just written.
// Laid out like the founder's reference picture (2026-10-14): the dish big at the top with Back and a heart, a sheet with the name in the
// middle, "− Serves 4 +", then Ingredients and Method as two tabs and "Add all to my shopping list" kept in reach.
// Restyled 2026-10-15 to match Home: the serving's numbers as Home's pair of cards (the calories big beside protein, carbs and fat as
// spaced-capital rows), white cards with 20 px corners everywhere, grey circles for − and +, one card for the method, and
// the main action a black pill with its words (and a plain plus, no circle).

// Founder 2026-11-17: the ingredients can come from several of the person's shops ("add next to Sainsbury's a plus button, so they can add more stores ... or
// remove Sainsbury's. And if they did this, then the ingredients for the recipe would change"): `files` are the shops in the order they're used (the first one
// ticked first; lib/mm/recipes.ts candidates), each product carries its shop (tagShopProducts), and every price, photo, link and logo is that product's own shop's.
// With one shop the page reads exactly as before.

const amountText = (s: IngredientSpec) => `${formatInt(s.amount)} ${s.unit}`;
const listNames = (names: readonly string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
/** A name inside a sentence: only its first letter lower case ("fat-free Greek-style yogurt", never "greek-style"), and none when the first word is a short
 *  capital ("BBQ sauce", "M&S"). */
export const lowerFirst = (s: string): string => (/^(?:\p{Lu}[\p{Lu}&\d]|(?:Italian|Greek|English|Dijon|Brussels|Quorn|Thai|Indian|Chinese|Mexican|Jersey|British|Scottish)\b)/u.test(s) ? s : s.charAt(0).toLocaleLowerCase("en-GB") + s.slice(1));
/** A number of servings as a cook says it: whole, or with a quarter, a half or three quarters ("5¼" for a household plan's 5.25). */
const servingsWords = (n: number): string => {
  const whole = Math.floor(n);
  const part = ({ 0.25: "¼", 0.5: "½", 0.75: "¾" } as Record<number, string>)[Math.round((n - whole) * 4) / 4] ?? "";
  return `${whole || (part ? "" : "0")}${part}`;
};
/** The recipe's title size by its length, so a long name never fills the screen (≤45 characters 2rem, ≤70 1.625rem, longer 1.375rem). */
const titleSize = (name: string): string => (name.length <= 45 ? "text-[2rem]" : name.length <= 70 ? "text-[1.625rem]" : "text-[1.375rem]");
/** Words for why a diet leaves an ingredient out (kindExcluded's reasons), as Settings names those diets. */
const DIET_REASON: Readonly<Record<string, string>> = {
  vegan: tk("Vegan"), vegetarian: tk("Vegetarian"), pescatarian: tk("Pescatarian"), halal: tk("Halal"), "no pork": tk("No pork"), "no beef": tk("No beef"),
  jain: MORE_DIET_LABEL.jain, "no onion or garlic": MORE_DIET_LABEL.noOnionGarlic, "kosher style": MORE_DIET_LABEL.kosherStyle, "no red meat": MORE_DIET_LABEL.noRedMeat,
  "no alcohol": MORE_DIET_LABEL.noAlcohol,
};
const isAllergen = (reason: string): reason is AllergenKey => reason in ALLERGEN_SHORT;

/** The shop's better products in place of the usual ones, as a meal plan made with better produce chose them (lib/mm/mealPlan.ts betterCandidate: the first
 *  better product the Swap sheet would offer for each ingredient, cupboard things left as they are), so a plan card and its recipe page agree. */
function betterChoices(recipe: Recipe, products: readonly ShopProduct[]): Record<string, string> {
  const meatFree = isMeatFree(recipe);
  const out: Record<string, string> = {};
  for (const pick of resolveRecipe(recipe, products).picks) {
    if (!pick || pick.spec.cupboard || BETTER.test(pick.product.name)) continue;
    const alt = candidates(products, pick.spec, meatFree).find((a) => BETTER.test(a.product.name));
    if (alt) out[pick.spec.key] = productKey(alt.product);
  }
  return out;
}

function PickPhoto({ file, product }: { file: ShopFile; product: ShopProduct }) {
  return <PhotoTile sources={shopPhotoSources(file, product)} />;
}

const NOT_ON_LABEL = tk("not on every label");
/** A logged recipe's name with its servings, as Choose a recipe writes it (RecipePick): "½ serving", like "½ portion" on the Today page; "1½ servings". */
const NAME_WITH_SERVINGS = tk("{name} ({n} servings)");
const NAME_WITH_SERVING = tk("{name} ({n} serving)");
const MAX_SERVINGS = MAX_RECIPE_SERVINGS; // scaleServings keeps a recipe between 1 and 12 servings

type RecipeTab = "ingredients" | "method";
const TABS: ReadonlyArray<{ value: RecipeTab; label: string }> = [
  { value: "ingredients", label: tk("Ingredients") },
  { value: "method", label: tk("Method") },
];

// Counted notes ("about 2 eggs", "about 1 pepper"), one pair per pantry kind sold or used by the piece, so each language can say them properly.
const PIECE_NOTES: Record<string, [string, string]> = {
  egg: [tk("about 1 egg"), tk("about {n} eggs")], wrap: [tk("about 1 wrap"), tk("about {n} wraps")], onion: [tk("about 1 onion"), tk("about {n} onions")],
  "red onion": [tk("about 1 red onion"), tk("about {n} red onions")], pepper: [tk("about 1 pepper"), tk("about {n} peppers")],
  carrot: [tk("about 1 carrot"), tk("about {n} carrots")], cucumber: [tk("about 1 cucumber"), tk("about {n} cucumbers")],
  banana: [tk("about 1 banana"), tk("about {n} bananas")], apple: [tk("about 1 apple"), tk("about {n} apples")], clove: [tk("about 1 clove"), tk("about {n} cloves")],
  "stock cube": [tk("about 1 stock cube"), tk("about {n} stock cubes")], biscuit: [tk("about 1 biscuit"), tk("about {n} biscuits")],
  tomato: [tk("about 1 tomato"), tk("about {n} tomatoes")], "bunch of spring onions": [tk("about 1 bunch of spring onions"), tk("about {n} bunches of spring onions")],
  slice: [tk("about 1 slice"), tk("about {n} slices")], chipolata: [tk("about 1 chipolata"), tk("about {n} chipolatas")], "red cabbage": [tk("about 1 red cabbage"), tk("about {n} red cabbages")],
};
const PIECE_WORD = new Map<string, string>([...PANTRY.values()].flatMap((k) => (k.pieceName ? [[k.pieceName[0], k.pieceName[0]], [k.pieceName[1], k.pieceName[0]]] as Array<[string, string]> : [])));

/** An ingredient's note in the reader's language: the counted ones ("about 2 eggs", "about 1 pepper") with their number as a value. */
function noteText(t: T, note: string): string {
  const m = /^about (\d+) ([a-z ]+)$/.exec(note);
  const pair = m ? PIECE_NOTES[PIECE_WORD.get(m[2]!) ?? ""] : undefined;
  if (!m || !pair) return t(note);
  const n = Number(m[1]);
  return n === 1 ? t(pair[0]) : t(pair[1], { n });
}

/** Save at the photo's top right, in place of the Settings cog (founder 2026-11-20: "Move the save into the top right instead of settings"): a photo chip
 *  like Back, an ink heart, outline with "Save" and filled with "Saved". */
const SAVE_BUTTON = "photo-chip inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full ps-3 pe-3.5 text-[0.9375rem] font-bold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
/** Two cards side by side, stacked when the text is large (the minimum width is in rem, so it grows with the text size), as on Home. */
const PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3";
const CARD = "glass rounded-[1.25rem]";
const LABEL = "text-[0.8125rem] font-semibold text-muted";
const HEADING = "text-xl font-[800] tracking-[-0.01em]";
/** A small white circle with the 1.5 px edge inside a 44 px tap area, like Home's calendar button; at a limit the face is the quiet "can't press yet" fill, never faded. */
const ROUND_BUTTON = "group grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-90 disabled:cursor-not-allowed disabled:active:scale-100";
const ROUND_FACE = "grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-[color:var(--edge)] bg-soft transition-colors group-hover:bg-[var(--fill)] group-disabled:border-transparent group-disabled:bg-soft-strong group-disabled:text-muted";
/** A fact about the recipe beside the servings stepper (minutes, meal, no meat or fish): flat words with an ink icon, no pill (colour meeting, 19 November 2026:
 *  white pills looked like buttons), as tall as the stepper. */
const INFO_CHIP = "inline-flex min-h-[3.25rem] items-center gap-1.5 px-2 text-[0.9375rem] font-semibold text-foreground";
/** "I have this" when ticked: lime with the 2 px dark-green edge (a 1.5 px border and a half-pixel ring, so it is the size of the unticked one) and its tick; the
 *  unticked one shows the empty tick ring in the same place (ChoiceMark), so the words never jump. */
const HAVE_ON = "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]";
/** A secondary action inside a white card: a light grey pill. */
const SOFT_PILL = "inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-full border-[1.5px] border-[color:var(--edge)] bg-soft px-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-[var(--fill)]";
/** "Add a serving to today" in the main buttons' look (founder 2026-11-26: white "is easily missed ... make that button the same background colour as the add all
 *  to my shopping list button"): ink with white words, which follows the person's colour scheme like every main button. */
const LOG_PILL = "inline-flex min-h-12 max-w-full items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-[0.9375rem] font-bold text-on-ink transition active:scale-[0.97] hover:bg-ink-pressed active:bg-ink-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A figure from the full label ("56.1 g", "688 kcal · 2,880 kJ"): the numbers in DM Mono like Home's rows, each unit in the text face, so the
 *  mono font's wide space doesn't open a gap before the "g". */
function Amount({ text }: { text: string }) {
  return (
    <>
      {text.split(" · ").map((part, i) => {
        const m = /^(\S+) (.+)$/.exec(part);
        return (
          <span key={i} className="whitespace-nowrap">
            {i > 0 && <span className="text-muted"> · </span>}
            {m ? <><span className="font-mono text-[0.8125rem]">{m[1]}</span> {m[2]}</> : part}
          </span>
        );
      })}
    </>
  );
}

/** One macro of a serving, like Home's rows: the name in the small label style and the grams in DM Mono, in ink. No dot (colour meeting, 19 November 2026:
 *  a coloured dot hints "good") and no bar: on Home a bar means progress toward a day's target, and a serving has none. */
function MacroRow({ label, grams, dot }: { label: string; grams: number; dot: string }) {
  // each macro's small colour dot beside its word (founder 2026-11-20: "the colours back for protein carbs and fats"; a label, never good or bad)
  return (
    <p className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
      <span className="inline-flex min-w-0 items-center gap-2"><span aria-hidden className={`dot ${dot}`} /><span className={LABEL}>{label}</span></span>
      <span className="app-numbers whitespace-nowrap text-[0.8125rem] font-normal text-foreground"><span className="font-mono">{Math.round(grams)}</span> g</span>
    </p>
  );
}

/** `photo`: the person's own photo of the dish (Make it at home), shown at the top in place of the drawing; it is on this phone only and never saved with the recipe.
 *  `files`: the recipe's own shop first (founder 2026-11-17: a recipe is made for one shop), then any other shops loaded so one ingredient can be swapped to them;
 *  `products` are theirs, tagged with their shop. Every ingredient comes from the first shop unless the person swaps it to another shop's product.
 *  `onChangeShops`: when given, the shop in the header is a button that opens the screen's choice of shop. `onNeedOtherShops`: called when the Swap sheet opens,
 *  so the screen loads the other shops (they're not loaded for a plain look at a recipe); `othersLoading` says they are on their way. */
export function RecipeDetail({ recipe, files, products, backHref, actions, photo, onChangeShops, onNeedOtherShops, othersLoading, diet, save, kept, haveKeys, startServings, startAsWritten, dietClash = [], planTarget, better }: { /** Opened from a household meal plan: everyone's servings (quarters allowed), as written. */ startServings?: number; startAsWritten?: boolean; /** What in this recipe doesn't suit the diet (lib/mm/recipes.ts dietClashes): an amber note says so, and the page never says it was chosen for the diet. */ dietClash?: ReadonlyArray<{ label: string; pantry: string; reason: string }>; /** From a meal plan: the slot's meal size, which the recipe is fitted to as its plan card was (instead of the Recipes tab's meal size). */ planTarget?: MealTarget | null; /** From a meal plan made with better produce: the shop's better products, as the plan chose them. */ better?: boolean; /** Ingredients the person said they have (Cook with what you have): they start ticked "I have this". */ haveKeys?: readonly string[]; recipe: Recipe; files: readonly ShopFile[]; products: readonly ShopProduct[]; backHref: string; actions?: React.ReactNode; photo?: string; onChangeShops?: () => void; onNeedOtherShops?: () => void; othersLoading?: boolean; /** The diet this recipe was made for (Make it at home's "What to exclude") or is checked against (a household's plan), when it isn't the one in Settings. */ diet?: DietPrefs; /** A recipe Pip has just written (Make it at home): a Save button at the top, and Back asks to save it first while it isn't saved. */ save?: { saved: boolean; onSave: () => void }; /** A recipe Pip wrote, opened from My recipes: the top right chip says Saved (filled heart); a tap takes it out as the page's Remove does (said, with Undo), and Save puts it back. */ kept?: { saved: boolean; onToggle: () => void } }) {
  const t = useT();
  const poss = usePossessive();
  const first = files[0]!;
  // each product's own shop (a product with no shop on it is from the only shop)
  const fileOf = useMemo(() => {
    const byShop = new Map(files.map((f) => [f.retailer, f]));
    return (p: ShopProduct): ShopFile => (p.shop ? byShop.get(p.shop) : undefined) ?? first;
  }, [files, first]);
  const several = files.length > 1;
  // Back goes to the page before when this one was reached from another page of the app; `backHref` (the recipes, at the right shop) is the fallback
  const back = useBack(backHref);
  const router = useRouter();
  // a recipe made from the person's own photo shows that photo at the top (RecipeHeroArt), labelled under it in the sheet
  const ownPhoto = useRecipePhoto(recipe.id);
  // Back on a recipe Pip has just written that isn't saved yet asks first (founder 2026-11-17: "would you like to save your recipe first? So that they don't lose it")
  const [leaving, setLeaving] = useState(false);
  const goBack = () => { if (!travelBack(router, backHref)) router.push(back.href); };
  // our recipe book's words are translated; what Pip wrote with AI is shown as it wrote it. Ingredient labels and notes come from our pantry either way.
  const rt = (s: string) => (recipe.ai ? s : t(s));
  const settings = useSettings();
  // snacks are shown as written: a meal-sized target would double them. From a meal plan, the plan slot's own size (the plan fitted it, snacks too)
  const targetKey = JSON.stringify(planTarget ?? (recipe.meal === "snack" ? null : mealTargetFor(settings)));
  const target = useMemo(() => JSON.parse(targetKey) as ReturnType<typeof mealTargetFor>, [targetKey]);
  // founder 2026-11-16: a recipe opens for one person ("Serves 1 should be the norm"); + cooks for more, and the amounts, the numbers shown and the steps follow
  const [servings, setServings] = useState(() => Math.min(MAX_SERVINGS, Math.max(1, startServings ?? 1)));
  // a plan made with better produce: the same better products here (the recipe's own shop's, worked out once when the page opens)
  const [chosen, setChosen] = useState<Record<string, string>>(() => (better ? betterChoices(recipe, files.length <= 1 ? products : products.filter((p) => p.shop === files[0]!.retailer)) : {}));
  const [subs, setSubs] = useState<Record<string, string>>({});
  const [asWritten, setAsWritten] = useState(startAsWritten ?? false);
  // founder 2026-11-20: "Usual portion" fits the same recipe to a usual serving of about 600 kcal (lib/mm/recipePortion.ts) instead of the person's meal ("My
  // meal size", the first choice), with the same fitting on the same labels
  const [usual, setUsual] = useState(false);
  const fitTo = asWritten || !target ? null : usual ? USUAL_PORTION : target;
  // the person moving their own photo (tap it, drag, Done: RecipeHeroArt); "Drag to move it" and Done sit under the photo, never on it
  const [moving, setMoving] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  // which shop's products the Swap sheet lists (the shop of the product now in the recipe until another is chosen), for the ingredient being swapped
  const [swapShopFor, setSwapShopFor] = useState<{ key: string; shop: string } | null>(null);
  const [added, setAdded] = useState<{ text: string; href: string } | null>(null);
  const [tab, setTab] = useState<RecipeTab>("ingredients");
  const [detail, setDetail] = useState(false);
  const haveList = useStore(cupboardStore);
  // "I have this" on any ingredient, for this recipe only (usability test 2026-11-19: Pat's own eggs and onion went on the list): cupboard things are kept for
  // every recipe (cupboardStore); anything else is ticked here, starting with what the person said they have, and leaves the list and the price to buy it all
  // (kept for this recipe while the app is open, so coming back finds them ticked and the shopping list doesn't suggest them: recipeTicks)
  const [haveHere, setHaveHere] = useState<ReadonlySet<string>>(() => new Set([...(recipeTicks.get(recipe.id) ?? []), ...(haveKeys ?? [])]));
  useEffect(() => { recipeTicks.set(recipe.id, new Set(haveHere)); }, [recipe.id, haveHere]);
  const flipHave = (key: string) => setHaveHere((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const have = useMemo(() => new Set([...haveList, ...[...haveHere].map(haveKey)]), [haveList, haveHere]);
  const meatFree = isMeatFree(recipe);
  // cooking for more or fewer people scales every amount with them (eggs, peppers and cloves stay whole), but a serving stays the same: its numbers
  // and price come from the recipe as written, with the substitutes and the fit to the meal chosen for it (recipeView, lib/mm/recipes.ts)
  const scaled = useMemo(() => scaleServings(recipe, servings), [recipe, servings]);
  // by default only the recipe's own shop's products can be picked; another shop's product is in only once the person has chosen it for an ingredient
  const viewProducts = useMemo(() => {
    if (files.length <= 1) return products;
    const base = products.filter((p) => p.shop === first.retailer);
    const keys = new Set(Object.values(chosen));
    const extra = keys.size ? products.filter((p) => p.shop !== first.retailer && keys.has(productKey(p))) : [];
    return extra.length ? [...base, ...extra] : base;
  }, [products, files.length, first.retailer, chosen]);
  const view = useMemo(() => recipeView(recipe, viewProducts, { servings, subs, chosen, target: fitTo }), [recipe, servings, subs, viewProducts, chosen, fitTo]);
  // a serving at the other size, only to know whether the switch changes anything (a recipe with nothing that can move, or a meal of about 600 kcal, doesn't)
  const otherServing = useMemo(() => (fitTo && target ? recipeView(recipe, viewProducts, { servings: 1, subs, chosen, target: usual ? target : USUAL_PORTION }).totals?.perServing ?? null : null), [recipe, viewProducts, subs, chosen, fitTo, target, usual]);
  // the basket leaves out the cupboard items the person has ticked; a serving's price and numbers never do
  const totals = useMemo(() => (view.totals ? recipeTotals(view.resolved, have) : null), [view, have]);
  const picks = view.resolved.picks;
  const hasIt = (spec: IngredientSpec) => (!!spec.cupboard && !!spec.pantry && have.has(spec.pantry)) || haveHere.has(spec.key);
  const swapIndex = view.recipe.ingredients.findIndex((i) => i.key === swapping);
  // what the row shows: the pick's own spec when the shop lacked the ingredient and a substitute stands in
  const swapSpec = swapIndex >= 0 ? (picks[swapIndex]?.spec ?? view.recipe.ingredients[swapIndex]!) : null;
  // a product whose pack size or price can't be worked out would be bought as one pack for any number of people and give no price a serving, so it isn't
  // offered (the one already in the recipe stays in the list)
  const current = picks[swapIndex]?.product;
  const currentKey = current ? productKey(current) : undefined;
  const swapShop = swapShopFor && swapShopFor.key === swapping ? swapShopFor.shop : (current ? fileOf(current).retailer : first.retailer);
  // the Swap sheet loads the other shops (the screen does it once, and only now)
  useEffect(() => { if (swapSpec) onNeedOtherShops?.(); }, [swapSpec, onNeedOtherShops]);
  const options = useMemo(() => (swapSpec ? candidates(products, swapSpec, meatFree).filter((c) => (files.length <= 1 || fileOf(c.product).retailer === swapShop) && (c.usedCost !== null || productKey(c.product) === currentKey)) : []), [swapSpec, products, meatFree, currentKey, files.length, fileOf, swapShop]);
  // candidates() puts a product a typical small shop stocks before a cheaper one (lib/mm/localRange.ts), so the line above the list says so when it applies
  const localFirst = options.some((o) => fileOf(o.product).retailer === LOCAL_RANGE_SHOP && LOCAL_SHOP_PRODUCTS.has(o.product.id));
  // what a serving costs with each option: the amount the recipe as written uses (the same for any number of people) over the servings it makes
  const basis = view.resolved.basis ?? view.resolved;
  // the ingredients whose pack has no weight on the shop's list (and no price per kg), so a serving can't be priced: the price line names them
  // only the first letter lower case (Isla, 21 November 2026: "greek-style", "italian"), as every other name in a sentence
  const unpriced = [...new Set(basis.picks.flatMap((p) => (p && p.usedCost === null ? [lowerFirst(t(p.spec.label))] : [])))];
  const basisSpec = swapIndex >= 0 ? basis.picks[swapIndex]?.spec : undefined;
  const servingCost = (o: IngredientPick): number | null => {
    const used = basisSpec ? pickFor(basisSpec, o.product).usedCost : o.usedCost;
    return used === null ? null : used / basis.recipe.servings;
  };
  // the other things the recipe can use instead (the ingredient as written first, when something else is in its place), only those this shop sells
  const insteadOptions = useMemo(() => {
    if (!swapSpec) return [];
    const written = scaled.ingredients.find((x) => x.key === swapSpec.key);
    const original = (scaled.scaledFrom ?? scaled).ingredients.find((x) => x.key === swapSpec.key);
    if (!written || !original) return [];
    const out: Array<{ subKey: string | null; spec: IngredientSpec }> = [];
    if (swapSpec.subFor) out.push({ subKey: null, spec: written });
    for (const sub of written.subs ?? []) {
      if (sub.key === swapSpec.pantry) continue;
      // chosen for the recipe as written, then scaled: the amount shown is the one the recipe will have if it is picked
      const s2 = subSpec(original, sub, scaled);
      if (s2) out.push({ subKey: sub.key, spec: scaled.scaledFrom ? scaleSpec(s2, scaled.servings, scaled.scaledFrom.servings) : s2 });
    }
    // each worked out as the page would have it once picked (Isla, 21 November 2026: with the recipe fitted to a meal, the amount shown was the one before the
    // fit): the same servings, swaps and fit, this substitute in, the product the page would then use (whose photo the row shows) and its amount. Left out when
    // the shop doesn't sell it (something else would stand in).
    return out.flatMap((o) => {
      const optSubs = { ...subs };
      if (o.subKey) optSubs[swapSpec.key] = o.subKey; else delete optSubs[swapSpec.key];
      const optChosen = { ...chosen };
      delete optChosen[swapSpec.key];
      const v = recipeView(recipe, viewProducts, { servings, subs: optSubs, chosen: optChosen, target: fitTo });
      const i = v.recipe.ingredients.findIndex((x) => x.key === swapSpec.key);
      const pick = i >= 0 ? v.resolved.picks[i] : undefined;
      if (!pick || (o.subKey ? pick.spec.pantry !== o.subKey : !!pick.spec.subFor)) return [];
      return [{ ...o, spec: pick.spec, pick }];
    });
  }, [swapSpec, scaled, recipe, viewProducts, servings, subs, chosen, fitTo]);
  const chooseInstead = (key: string, subKey: string | null) => {
    setSubs((c) => { const n = { ...c }; if (subKey) n[key] = subKey; else delete n[key]; return n; });
    setChosen((c) => { const n = { ...c }; delete n[key]; return n; });
    setSwapping(null);
    setAdded(null);
  };
  // "Add a serving to today" (audit, 20 November 2026: a serving couldn't be logged from its own page, and logging it from Home could store other numbers): this
  // page's own serving (as written or fitted, with its swaps and its shop), for the meal and servings chosen. Free in 1.1 (gate("log") decides).
  const { gate } = useGate();
  const [logOpen, setLogOpen] = useState(false);
  const [logMeal, setLogMeal] = useState<LogMeal>(() => recipe.meal ?? mealSlotFor(new Date()));
  const [logServings, setLogServings] = useState(1);
  const [logged, setLogged] = useState<{ id: string; text: string } | null>(null);

  // from a plan's 5¼ servings, − goes to 5 and + to 6
  const changeServings = (by: number) => {
    setServings((n) => Math.max(1, Math.min(MAX_SERVINGS, by > 0 ? Math.floor(n) + 1 : Math.ceil(n) - 1)));
    setAdded(null);
  };

  const prefs: DietPrefs = diet ?? settings.preferences;
  // "chosen for your diet" only when it is true (audit, 20 November 2026): the recipe suits the diet, none of its allergens is one the person avoids, and they
  // follow some diet at all (any of Settings' diets, the newer ones too)
  const words = dietWords(t, prefs as Preferences);
  const shownAllergens = recipeAllergens(view.recipe.ingredients.map((written, i) => { const spec = picks[i]?.spec ?? written; return { label: spec.label, pantry: spec.pantry }; })).allergens.contains;
  const avoidHit = (prefs.avoidAllergens ?? []).some((a) => shownAllergens.includes(a));
  const dietNote = dietClash.length === 0 && !avoidHit && words.length > 0;
  // what doesn't suit the diet, one sentence each (meat with dairy once, for kosher style)
  const clashLines = [...new Set(dietClash.map((c) => (c.reason === "meat with dairy"
    ? t("This recipe has meat and dairy together, which kosher style keeps apart.")
    : isAllergen(c.reason)
      ? t("This recipe has {name}, which contains {allergen}. You told us to avoid {allergen}.", { name: lowerFirst(t(c.label)), allergen: t(ALLERGEN_SHORT[c.reason]).toLowerCase() })
      : t("This recipe has {name}, which doesn't suit your diet: {diet}.", { name: lowerFirst(t(c.label)), diet: t(DIET_REASON[c.reason] ?? c.reason) }))))];
  // the shops the picks come from, in the order they're used (the first shop when nothing is found): the sentences name them
  const usedShops = new Set(picks.flatMap((p) => (p ? [fileOf(p.product).retailer] : [])));
  const usedFiles = files.filter((f) => usedShops.has(f.retailer));
  const shown = usedFiles.length ? usedFiles : [first];
  const many = shown.length > 1;
  // "Add all": what isn't ticked "I have this", each raised only to the packs this recipe needs on the list it goes on (the person's newest list for that product's
  // shop, else the main Shopping list: the rule the meal plan uses), so a second visit, a change of servings or the oil already on the list never adds another pack
  // (lib/mm/groceries.ts addAtLeast). The message says what really went on, and on which list.
  const ready = picks.filter((p): p is IngredientPick => !!p && !hasIt(p.spec));
  const addAll = () => {
    let list: ShoppingItem[] = [...shoppingStore.get()];
    let went = 0;
    let full = 0;
    const into = new Set<string>();
    for (const p of ready) {
      const f = fileOf(p.product);
      const listId = listForShop(settings, f.retailer) ?? "";
      // the price of what is bought: one pack, or for loose produce the amount used (its shelf price is per kg; Isla, 21 November 2026)
      const r = addAtLeast(list, { gtin: p.product.gtin, shopId: p.product.id, retailer: f.retailer, name: p.product.name, brand: "", size: "", price: p.basketCost / p.packs, checkedOn: f.checkedOn, ...withPhoto(shopPhotoSources(f, p.product)), ...(listId ? { list: listId } : {}) }, p.packs);
      list = r.list;
      if (r.outcome === "full") { full++; continue; }
      into.add(listId);
      if (r.outcome !== "had") went++;
    }
    shoppingStore.set(list);
    const only = into.size === 1 ? [...into][0]! : null;
    const listName = only ? (settings.shoppingLists?.find((l) => l.id === only)?.name ?? null) : null;
    const text = full > 0
      ? t("Added {added} of {total}: your lists are full ({max} items).", { added: went, total: ready.length, max: MAX_SHOPPING_ITEMS })
      : went === 0
        ? t("Everything for this recipe is already on your list.")
        : into.size > 1
          ? t("Added {n} products to your shopping lists.", { n: went })
          : listName
            ? (went === 1 ? t("Added 1 product to {list}.", { list: listName }) : t("Added {n} products to {list}.", { n: went, list: listName }))
            : (went === 1 ? t("Added 1 product to your shopping list.") : t("Added {n} products to your shopping list.", { n: went }));
    setAdded({ text, href: only ? `/app/groceries/list?l=${encodeURIComponent(only)}` : "/app/groceries/list" });
  };
  const notOnLabel = t(NOT_ON_LABEL);
  // The numbers are for everyone the recipe now serves: a serving's figures (always the recipe-as-written's serving, lib/mm/recipes.ts) times the servings
  const people = view.recipe.servings;
  const all = (v: number) => Math.round(v * people * 10) / 10;
  const kcalAll = (v: number) => formatInt(Math.round(v * people));
  const rows: Array<[string, string, boolean?]> = totals
    ? [
        [t("Energy"), `${kcalAll(totals.perServing.kcal)} kcal${totals.label.kj !== null ? ` · ${kcalAll(totals.label.kj)} kJ` : ""}`],
        [t("Fat"), `${all(totals.perServing.fat)} g`],
        [t("of which saturates"), totals.label.saturates !== null ? `${all(totals.label.saturates)} g` : notOnLabel, true],
        [t("Carbohydrate"), `${all(totals.perServing.carbs)} g`],
        [t("of which sugars"), totals.label.sugars !== null ? `${all(totals.label.sugars)} g` : notOnLabel, true],
        [t("Fibre"), totals.label.fibre !== null ? `${all(totals.label.fibre)} g` : notOnLabel],
        [t("Protein"), `${all(totals.perServing.protein)} g`],
        [t("Salt"), totals.label.salt !== null ? `${all(totals.label.salt)} g` : notOnLabel],
      ]
    : [];
  // a household plan's 5.25 as a cook says it, as "Serves 5¼" beside it does (Isla, 21 November 2026: "For 5.25 servings")
  const forPeople = people === 1 ? t("For 1 serving") : t("For {n} servings", { n: servingsWords(people) });
  // the substitutes standing in for an ingredient the recipe names (the method's words are the recipe's own)
  const subsIn = [...new Map(picks.flatMap((p) => (p?.spec.subFor ? [[p.spec.label, { sub: p.spec.label, name: p.spec.subFor }] as const] : []))).values()];
  // which step first uses each ingredient, so its amount (for this many people) is shown under that step
  const stepUses = firstMentions(recipe.method, view.recipe.ingredients);
  const specByKey = new Map(view.recipe.ingredients.map((spec, i) => [spec.key, picks[i]?.spec ?? spec]));
  const pickByKey = new Map(view.recipe.ingredients.map((spec, i) => [spec.key, picks[i]]));
  const mealLabel = recipe.meal ? MEAL_TYPES.find((m) => m.value === recipe.meal)?.label : undefined;
  const MealIcon = MEAL_LOOK[recipe.meal ?? "dinner"]?.Icon ?? MEAL_LOOK.dinner.Icon;

  const logIt = () => {
    if (!totals) return;
    gate("log", () => {
      const name = rt(recipe.name);
      // named as Choose a recipe names it (RecipePick: "½ serving", "1½ servings"), and counted like every other log (Femi, 21 November 2026: "(0.5 servings)", and
      // no mealLogged)
      const entry = addLogEntry({ chainId: "", chainName: t("Recipe"), name: logServings === 1 ? name : t(logServings < 1 ? NAME_WITH_SERVING : NAME_WITH_SERVINGS, { name, n: halves(logServings) }), source: "recipe", recipeId: recipe.id, meal: logMeal, nutrients: recipeNutrients(totals, logServings) });
      analytics.track({ name: "mealLogged" });
      countProAction();
      setLogged({ id: entry.id, text: t(ADDED_TO[logMeal], { name }) });
      setLogOpen(false);
    });
  };
  const logButton = totals ? (
    <button type="button" aria-haspopup="dialog" onClick={() => { setLogServings(1); setLogOpen(true); }} className={`${LOG_PILL} w-full`}>
      <PlusIcon aria-hidden className="h-[18px] w-[18px] shrink-0" />{t("Add a serving to today")}
    </button>
  ) : null;
  // What size a serving is cooked to, right under its calories (founder 2026-11-20), only as true as the fit came (audit, 20 November 2026: "fitted to about 350
  // kcal" was said of a 500 kcal serving; lib/mm/recipes.ts fitOutcome), and why, in a few words, when the size comes from the person's day
  const outcome = totals && fitTo ? fitOutcome(view.fitted, totals.perServing.kcal, fitTo) : null;
  const sizeKcal = fitTo ? formatInt(fitTo.kcal) : "";
  const reason = outcome && outcome !== "cannot" && !usual && target ? portionReason(settings, target, !!planTarget) : null;
  const reasonText = reason ? t(reason.text, { day: formatInt(reason.day ?? 0), meals: reason.meals ?? 0 }) : "";
  // Laid out from the founder's tacos screenshot (20 November 2026, "1,000 calories ... I don't know if that's realistic"): one short line under the calories,
  // the size in bold and, after a dot, why (or how big), so the answer sits right under the number without pushing "Serves" off the first screen. The kcal
  // figure above already gives the serving, so a size from the person's day says the day, not a second, nearly equal number.
  const fittedSize = outcome === "fitted" || outcome === "fits";
  const sizeHead = !outcome ? "" : fittedSize
    ? (usual ? t("Usual portion") : t("Sized to your meal"))
    : outcome === "closest"
      ? (usual ? t("As close to {kcal} kcal as this recipe goes", { kcal: sizeKcal }) : t("As close to your {kcal} kcal meal as this recipe goes", { kcal: sizeKcal }))
      : t("This recipe can't be resized.");
  const sizeWhy = fittedSize ? (reasonText || t("about {kcal} kcal", { kcal: sizeKcal })) : reasonText;
  // a short size and its "why" share one line with a dot between (up to 44 characters, which fit a 375 px phone: "Sized to your meal · 30% of your 3,560 kcal
  // day"); a longer pair, or a narrower phone, puts the why under the size, so a line never ends on a lone dot
  const oneLine = fittedSize && sizeHead.length + sizeWhy.length <= 44;
  const showSwitch = !!totals && !!otherServing && !samePortion(totals.perServing, otherServing);
  const PORTIONS = [{ value: "usual", label: t("Usual portion") }, { value: "mine", label: t("My meal size") }] as const;

  const stepper = (
    <div className="glass inline-flex max-w-full items-center rounded-full p-1">
      <button type="button" aria-label={t("Fewer servings")} disabled={servings <= 1} onClick={() => changeServings(-1)} className={ROUND_BUTTON}>
        <span className={ROUND_FACE}><MinusIcon className="h-[18px] w-[18px]" /></span>
      </button>
      <span aria-live="polite" className="app-numbers min-w-0 px-2.5 text-center text-[0.9375rem] font-bold [overflow-wrap:anywhere]">{t("Serves {n}", { n: servingsWords(view.recipe.servings) })}</span>
      <button type="button" aria-label={t("More servings")} disabled={servings >= MAX_SERVINGS} onClick={() => changeServings(1)} className={ROUND_BUTTON}>
        <span className={ROUND_FACE}><PlusIcon className="h-[18px] w-[18px]" /></span>
      </button>
    </div>
  );
  const timeChip = <span className={`${INFO_CHIP} app-numbers`}><TodayIcon aria-hidden className="h-[18px] w-[18px] text-ink" />{t("{n} min", { n: recipe.minutes })}</span>;
  const mealChip = mealLabel ? <span className={INFO_CHIP}><MealIcon aria-hidden className="h-[18px] w-[18px] text-ink" />{t(mealLabel)}</span> : null;
  const meatChip = meatFree ? <span className={INFO_CHIP}><LeafIcon aria-hidden className="h-[18px] w-[18px] text-ink" />{t("No meat or fish")}</span> : null;

  // Save, at the photo's top right: our own recipes always; one Pip wrote and the person keeps (opened from My recipes): Saved, a tap takes it out as the page's
  // Remove does (with Undo) and Save puts it back; one Pip has just written: Save, then (it can't be unsaved there: My recipes takes it out) a plain "Saved"
  // that says so, not a toggle that does nothing
  const saveControl = !recipe.ai ? <SaveRecipeButton id={recipe.id} /> : kept ? <SaveChip saved={kept.saved} onClick={kept.onToggle} /> : save ? (
    save.saved ? (
      <span role="status" className={SAVE_BUTTON}>
        <HeartIcon aria-hidden filled className="h-5 w-5 text-ink" /><span aria-hidden>{t("Saved")}</span><span className="sr-only">{t("Saved to My recipes")}</span>
      </span>
    ) : (
      <button type="button" aria-label={t("Save this recipe")} onClick={save.onSave} className={SAVE_BUTTON}>
        <HeartIcon aria-hidden className="h-5 w-5 text-ink" />{t("Save")}
      </button>
    )
  ) : null;

  return (
    <div>
      {/* the picture runs to the edges and under the status bar, like the reference. Over it only photo chips (colour meeting, 19 November 2026; approved by
          the founder that day): Back top left, Save top right (founder 2026-11-20: "Move the save into the top right instead of settings"; never the cog on a
          recipe's photo), the expand chip bottom right, and the light status band over its top 60 px (RecipeHeroArt draws it over a picture only). */}
      <div className="relative -mx-5" style={{ marginTop: "calc(-1 * max(1.25rem, env(safe-area-inset-top)))" }}>
        {/* first in the page, drawn over the picture: Back and Save come before "See the whole picture" for a keyboard or a screen reader (audit, 20 November) */}
        {/* only its buttons take a tap, so a drag of the person's photo can start anywhere else on it */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
          {/* Back on a recipe Pip has just written that isn't saved yet asks first (it stays on the page and opens the question) */}
          <PageHeader photo settings={false} action={saveControl} back={{ href: backHref, label: t("Back to recipes"), onClick: (e) => { if (save && !save.saved) { e.preventDefault(); setLeaving(true); } } }} />
        </div>
        {/* the person's own photo (`photo`, just taken, or the one kept with the recipe) can be moved: a tap on it, then drag (founder 2026-11-20) */}
        <RecipeHeroArt id={recipe.id} name={recipe.name} label={rt(recipe.name)} meal={recipe.meal} photo={photo} moving={moving} onMoving={setMoving} />
      </div>

      <div className="relative -mx-5 -mt-9 rounded-t-[2rem] bg-background px-5 pt-3 shadow-[var(--shadow-lift)]">
        <span aria-hidden className="mx-auto block h-1.5 w-12 rounded-full bg-edge" />
        {/* the person's own photo is labelled under it, never on it (colour meeting, 19 November 2026: no words on a food photo) */}
        {(photo || ownPhoto) && (moving ? (
          // moving the photo: what to do, and Done, right under it
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <p className="text-base font-bold leading-snug">{t("Drag to move it")}</p>
            <Button onClick={() => setMoving(false)} className="min-w-[6rem]">{t("Done")}</Button>
          </div>
        ) : <p className="mt-3 text-center text-[0.8125rem] font-medium leading-snug text-muted">{t("Your photo. The recipe is Pip's home version.")}</p>)}
        <div className="mt-4 text-center">
          {/* founder 2026-11-17: the recipe's shop in the header, its own logo with its name beside it (CLAUDE.md rule 2: the name is always plain text); where the
              screen lets the person change shop, it is a button with a small arrow that opens the choice */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
            <span className="kicker">{recipe.ai ? t("Made by Pip") : t("Recipe")}</span>
            <span aria-hidden className="kicker">·</span>
            {onChangeShops ? (
              <button type="button" onClick={onChangeShops} aria-haspopup="dialog" aria-label={`${t("Shopping at")}: ${first.name}`} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-full border-[1.5px] border-edge bg-card py-1 pe-3.5 ps-1 transition active:scale-95 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <ShopMark shopId={first.retailer} size="sm" />
                <span className="min-w-0 text-[0.9375rem] font-bold leading-tight [overflow-wrap:anywhere]">{first.name}</span>
                <span aria-hidden className="text-ink">▾</span>
              </button>
            ) : (
              <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-line bg-card py-1 pe-3.5 ps-1">
                <ShopMark shopId={first.retailer} size="sm" />
                <span className="min-w-0 text-[0.9375rem] font-bold leading-tight [overflow-wrap:anywhere]">{first.name}</span>
              </span>
            )}
          </div>
          <h1 className={`mt-1.5 ${titleSize(rt(recipe.name))} font-[800] leading-[1.08] tracking-[-0.02em] [overflow-wrap:anywhere]`}>{rt(recipe.name)}</h1>
          {recipe.blurb && <p className="mx-auto mt-2 max-w-[30rem] text-[0.9375rem] leading-snug text-muted">{rt(recipe.blurb)}</p>}
          {/* a serving's calories and protein on the first screen (usability test 2026-11-19: they were only further down, under the picture and the chips) */}
          {totals && <p className="app-numbers mt-2.5 text-[1.0625rem] font-bold leading-snug">{t("{kcal} kcal and {protein} g protein a serving", { kcal: formatInt(totals.perServing.kcal), protein: formatInt(totals.perServing.protein) })}</p>}
          {/* founder 2026-11-20: the size it's cooked to, why, and the switch to a usual portion, right under a serving's numbers */}
          {sizeHead && (
            <div className="@container mt-1">
              <p className={`app-numbers flex flex-col items-center justify-center text-[0.9375rem] leading-snug ${oneLine ? "@[20.5rem]:flex-row @[20.5rem]:flex-wrap @[20.5rem]:gap-x-1.5" : ""}`}>
                <span className="font-semibold">{sizeHead}</span>
                {sizeWhy && (
                  <>
                    {oneLine && <span aria-hidden className="hidden text-muted @[20.5rem]:inline">·</span>}
                    <span className="sr-only">, </span>
                    <span className="text-muted">{sizeWhy}</span>
                  </>
                )}
              </p>
              {showSwitch && (
                <div className="mx-auto mt-3 max-w-[24rem]">
                  <Segmented value={usual ? "usual" : "mine"} options={PORTIONS} onChange={(v) => { setUsual(v === "usual"); setAdded(null); }} label={t("Portion size")} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* "Serves · time · meal", like the reference's chip row. Laid out so no chip is left alone on a line: with three chips the stepper sits
            on its own above the other two; with four, two and two (at large text they wrap as they fit). Reading order is unchanged. */}
        {meatFree ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{stepper}{timeChip}{mealChip}{meatChip}</div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-2">
            {stepper}
            <div className="flex flex-wrap items-center justify-center gap-2">{timeChip}{mealChip}</div>
          </div>
        )}

        {totals ? (
          <div className="mt-5">
            {/* Home's pair: the calories big on the left, protein, carbs and fat as spaced-capital rows on the right */}
            <div role="group" aria-label={nutrientAriaLabel(`${rt(recipe.name)}, ${forPeople}`, { calories: Math.round(totals.perServing.kcal * people), protein: all(totals.perServing.protein), carbs: all(totals.perServing.carbs), fat: all(totals.perServing.fat) }, t)} className={`app-numbers ${PAIR}`}>
              <div className={`${CARD} flex min-w-0 flex-col gap-3 p-4`}>
                {/* The figure comes first in reading order ("688 kcal, per serving"; the e2e test reads the group's text from its first number);
                    the label is drawn above it, top left like Home's "CALORIES", and the figure sits centred in the rest of the card. */}
                <p className="flex flex-1 flex-col items-center justify-center text-center [overflow-wrap:anywhere]">
                  <span className="text-[2.75rem] font-medium leading-none tracking-[-0.03em] text-foreground">{kcalAll(totals.perServing.kcal)}</span>
                  <span className="mt-1.5 text-[1.0625rem] font-normal leading-tight">kcal</span>
                </p>
                <p className={`order-first ${LABEL}`}>{forPeople}</p>
              </div>
              <div className={`${CARD} flex min-w-0 flex-col justify-center gap-3.5 px-4 py-4`}>
                <MacroRow label={t("protein")} grams={all(totals.perServing.protein)} dot="bg-protein" />
                <MacroRow label={t("carbs")} grams={all(totals.perServing.carbs)} dot="bg-carbs" />
                <MacroRow label={t("fat")} grams={all(totals.perServing.fat)} dot="bg-fat" />
              </div>
            </div>
            {people > 1 && (
              <p className="app-numbers mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("Each serving: {kcal} kcal, {protein} g protein, {carbs} g carbs, {fat} g fat.", { kcal: formatInt(totals.perServing.kcal), protein: Math.round(totals.perServing.protein), carbs: Math.round(totals.perServing.carbs), fat: Math.round(totals.perServing.fat) })}</p>
            )}
            <div className="mt-3">{logButton}</div>
            {totals.notCounted.length > 0 && (
              <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{totals.notCounted.length === 1 ? t("Herbs, spices and salt don't have to carry a nutrition label, and we have none for {name}, so it isn't counted in these numbers.", { name: lowerFirst(t(totals.notCounted[0]!)) }) : t("Herbs, spices and salt don't have to carry a nutrition label, and we have none for {names}, so they aren't counted in these numbers.", { names: listNames(totals.notCounted.map((n) => lowerFirst(t(n)))) })}</p>
            )}
            {totals.plainSalt.length > 0 && (
              <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{t("Salt doesn't have to carry a nutrition label. Where the shop gives none, we count it as UK table salt labels print it: no calories, protein, carbs or fat, and 99.9 g of salt in every 100 g.")}</p>
            )}
            {totals.govFood.length > 0 && (
              <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{t("Loose fruit and vegetables have no nutrition label, so the numbers for {names} are the UK government's figures for those foods (McCance and Widdowson's Composition of Foods).", { names: listNames(totals.govFood.map((n) => lowerFirst(t(n)))) })}</p>
            )}
            {totals.community.length > 0 && (
              <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{totals.community.length === 1 ? t("The numbers for {name} come from Open Food Facts contributors (community data) for that product's barcode, not from the supermarket's own label. Check the pack.", { name: lowerFirst(t(totals.community[0]!)) }) : t("The numbers for {names} come from Open Food Facts contributors (community data) for those products' barcodes, not from the supermarket's own labels. Check the packs.", { names: listNames(totals.community.map((n) => lowerFirst(t(n)))) })}</p>
            )}
            {totals.sameAs.length > 0 && (
              <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{t("The numbers for {names} are the same product's label, read at another supermarket.", { names: listNames(totals.sameAs.map((n) => lowerFirst(t(n)))) })}</p>
            )}
            {totals.byWeight.length > 0 && (
              <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{t("The shop's labels for {names} are per 100 g, so they're counted by weight.", { names: listNames(totals.byWeight.map((n) => lowerFirst(t(n)))) })}</p>
            )}
            {roundedAmountsMatter(view.resolved, totals) && (
              <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{t("Eggs, wraps, bread slices and stock cubes are counted whole and other amounts are rounded, so a serving made from these amounts can differ from the numbers shown.")}</p>
            )}
            <div className="mt-3">
              <button type="button" aria-expanded={detail} aria-controls="recipe-label" onClick={() => setDetail((d) => !d)} className={`${CARD} flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start transition active:scale-[0.99] hover:bg-soft-strong`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-bold">{t("More detail")}</span>
                  <span className="block text-[0.8125rem] leading-snug text-muted">{t("Saturated fat, salt, sugar, fibre and allergens")}</span>
                </span>
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--fill)]"><ChevronRightIcon className={`h-[18px] w-[18px] transition-transform ${detail ? "-rotate-90" : "rotate-90"}`} /></span>
              </button>
              {/* always in the page (hidden while closed), so the button's aria-controls names something real */}
              <section id="recipe-label" aria-labelledby="label-heading" hidden={!detail} className={`${CARD} mt-2 p-4`}>
                  <h2 id="label-heading" className="text-[1.0625rem] font-bold tracking-[-0.01em]">{people === 1 ? t("Full nutrition per serving") : t("Full nutrition for {n} servings", { n: servingsWords(people) })}</h2>
                  <dl className="app-numbers mt-2 divide-y divide-line">
                    {rows.map(([label, value, sub]) => (
                      <div key={label} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
                        <dt className={`min-w-0 text-[0.9375rem] ${sub ? "ps-4 text-muted" : "font-semibold"}`}>{label}</dt>
                        <dd className={`ms-auto text-end ${value === notOnLabel ? "text-[0.8125rem] italic text-muted" : "text-[0.875rem]"}`}>{value === notOnLabel ? value : <Amount text={value} />}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2.5 text-[0.8125rem] leading-snug text-muted">{totals.community.length + totals.govFood.length + totals.sameAs.length + totals.plainSalt.length > 0
                    ? t("Added up from each product's numbers (its label, or the figures named above) for the amounts below, before cooking. \"Not on every label\" means one of the products doesn't give that figure, so we don't give a total for it.")
                    : t("Added up from each product's own label for the amounts below, before cooking. \"Not on every label\" means one of the products doesn't print that figure, so we don't give a total for it.")}</p>
                  {detail && <RecipeAllergenPart ingredients={view.recipe.ingredients.map((written, i) => { const spec = picks[i]?.spec ?? written; return { label: t(spec.label), pantry: spec.pantry }; })} />}
              </section>
            </div>
          </div>
        ) : (
          // never a dead end (audit, 20 November 2026): another shop may sell it all, and what was found can still go on the list
          <div className={`${CARD} mt-5 p-4 text-center`}>
            <p className="text-[0.9375rem] leading-snug">{t("We couldn't find every ingredient at {shop} yet, so there are no totals for this recipe.", { shop: first.name })}</p>
            <div className="mt-3 grid gap-2">
              {onChangeShops && <button type="button" aria-haspopup="dialog" onClick={onChangeShops} className={`${SOFT_PILL} w-full`}>{t("Choose another shop")}</button>}
              {ready.length > 0 && (added
                ? <LinkButton full href={added.href}><CheckIcon aria-hidden className="h-5 w-5 shrink-0" />{t("Added: see your list")}</LinkButton>
                : <Button full onClick={addAll}><PlusIcon aria-hidden className="h-5 w-5 shrink-0" />{ready.length === 1 ? t("Add the 1 we found") : t("Add the {n} we found", { n: ready.length })}</Button>)}
            </div>
            {added && <p role="status" className="mt-2 text-[0.875rem] font-semibold leading-snug">{added.text}</p>}
          </div>
        )}

        {totals && !target && recipe.meal === "snack" && mealTargetFor(settings) && (
          <p className={`${CARD} mt-3 p-4 text-[0.9375rem] font-semibold leading-snug`}>{t("Snacks are shown as written, not fitted to your meal size.")}</p>
        )}

        {/* the recipe's own amounts, once the fit has changed them (the size itself is said under the serving's numbers) */}
        {totals && target && (asWritten || view.fitted) && (
          <div className={`${CARD} mt-3 p-4`}>
            <p className="app-numbers text-[0.9375rem] leading-snug">{asWritten ? t("Showing the recipe as written.") : t("The amounts below are changed to fit.")}</p>
            <button type="button" onClick={() => { if (asWritten) setUsual(false); setAsWritten((v) => !v); setAdded(null); }} className={`mt-3 ${SOFT_PILL}`}>{asWritten ? t("Fit it to my meal") : t("Show it as written")}</button>
          </div>
        )}

        <div role="tablist" aria-label={t("Recipe")} className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 rounded-full border-[1.5px] border-edge bg-background p-1">
          {TABS.map((o, i) => {
            const on = o.value === tab;
            return (
              <button
                key={o.value}
                type="button"
                role="tab"
                id={`recipe-tab-${o.value}`}
                aria-selected={on}
                aria-controls={`recipe-panel-${o.value}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(o.value)}
                onKeyDown={(e) => radioKeyNav(e, i, TABS.length, (n) => setTab(TABS[n]!.value))}
                className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3 text-[0.9375rem] leading-tight hyphens-auto [overflow-wrap:anywhere] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)] font-bold" : "border-transparent font-semibold text-foreground hover:bg-card"}`}
              >
                {/* the open tab is lime with the dark green edge and a tick, like every chosen thing (colour meeting, 19 November 2026), never ink */}
                {on && <ChoiceMark on />}
                <span className="min-w-0">{t(o.label)}</span>
              </button>
            );
          })}
        </div>

        <section id="recipe-panel-ingredients" role="tabpanel" aria-labelledby="recipe-tab-ingredients" hidden={tab !== "ingredients"} className="mt-5">
          {/* the one amber note: what in this recipe doesn't suit the diet (a link or a plan can open such a recipe; it is never said to be chosen for the diet) */}
          {clashLines.length > 0 && (
            <Note heading={dietClash.some((c) => isAllergen(c.reason)) ? undefined : t("Not for your diet")} className="mb-5">
              {clashLines.map((line) => <p key={line} className="mt-1">{line}</p>)}
            </Note>
          )}
          {totals && (
            <div className="app-numbers">
              <div className={PAIR}>
                {/* founder 2026-11-20 ("every recipe has a price"): a serving can't be priced when the shop's list gives no weight for one of the packs (and no
                    price per kg); then the card for the whole shop stands alone (full width) and the line under it says which pack, never a blank card */}
                {totals.costPerServing !== null && (
                  <div className={`${CARD} p-4`}>
                    <p className={LABEL}>{t("a serving")}</p>
                    <p className="mt-2.5 text-[1.75rem] font-medium leading-none tracking-[-0.02em] text-foreground">{formatPrice(totals.costPerServing)}</p>
                  </div>
                )}
                <div className={`${CARD} p-4`}>
                  <p className={LABEL}>{t("to buy it all")}</p>
                  <p className="mt-2.5 text-[1.75rem] font-medium leading-none tracking-[-0.02em]">{formatPrice(totals.basket)}</p>
                </div>
              </div>
              {totals.costPerServing !== null ? (
                <p className="mt-2.5 px-1 text-[0.8125rem] leading-snug text-muted">{many ? t("\"A serving\" prices only what one serving uses. \"To buy it all\" is the whole packs below, at each shop's shelf prices; you'll have some left over.") : t("\"A serving\" prices only what one serving uses. \"To buy it all\" is the whole packs below, at {shop} shelf prices; you'll have some left over.", { shop: poss(shown[0]!.name) })}</p>
              ) : (
                <p className="mt-2.5 px-1 text-[0.8125rem] leading-snug text-muted">
                  {unpriced.length === 0 ? null : unpriced.length === 1 ? t("We can't price a serving: the shop's list doesn't say how much is in the pack of {name}.", { name: unpriced[0]! }) : t("We can't price a serving: the shop's list doesn't say how much is in the packs of {names}.", { names: listNames(unpriced) })}{" "}
                  {many ? t("\"To buy it all\" is the whole packs below, at each shop's shelf prices; you'll have some left over.") : t("\"To buy it all\" is the whole packs below, at {shop} shelf prices; you'll have some left over.", { shop: poss(shown[0]!.name) })}
                </p>
              )}
            </div>
          )}
          <h2 id="ingredients-heading" className={`mt-6 ${HEADING}`}>{t("What to buy")}</h2>
          {/* the small-shop judgement covers Sainsbury's products only (lib/mm/localRange.ts): said only when every product here is one */}
          {shown.every((f) => f.retailer === LOCAL_RANGE_SHOP) && <p className="mt-1.5 px-1 text-[0.8125rem] leading-snug text-muted">{t("Small local shops, such as a Sainsbury's Local or a Tesco Express, usually sell everything here. Where a small shop is likely to stock a different pack, we say what to look for; the numbers are for the product shown.")}</p>}
          <ul className={`${CARD} mt-3 divide-y divide-line px-4`}>
            {view.recipe.ingredients.map((written, i) => {
              const p = picks[i];
              const spec = p?.spec ?? written;
              const pf = p ? fileOf(p.product) : first;
              const productHref = p ? `/app/groceries/shop/item?r=${pf.retailer}&id=${encodeURIComponent(p.product.id)}` : "";
              return (
                <li key={spec.key} className="@container py-4">
                  <div className="flex flex-col gap-3 @[12rem]:flex-row @[12rem]:items-start">
                    {/* the photo opens the product too (founder 2026-11-20: "whenever I click the image, it doesn't go on the product ... when I click the product, in
                        general, it should go on to show me that product"); the name below is the one link a screen reader or keyboard meets, so this one is silent */}
                    {p ? (
                      <Link href={productHref} prefetch={false} aria-hidden tabIndex={-1} className="shrink-0 self-start rounded-[1rem] transition active:scale-95">
                        <PickPhoto file={pf} product={p.product} />
                      </Link>
                    ) : <PhotoTile sources={[]} />}
                    <div className="min-w-0 flex-1">
                      {(() => {
                        // the weight and its everyday size (founder 2026-11-21: "80 grams slash half a pepper ... salt and herbs ... teaspoons"): spoons first for
                        // small amounts of salt, spices, herbs and oils ("1 tsp / 6 g"), pieces after the weight ("80 g / ½ pepper"); the size can wrap under the weight
                        const size = kitchenSize(spec, countsSuit(spec.pantry, p?.product.name));
                        const weight = amountText(spec);
                        // "about 1 tomato" is dropped for 80 g of baby plum tomatoes (lib/mm/recipes.ts noteForPick); a count the size already says isn't said twice
                        const note = noteForPick(spec, p?.product.name);
                        const shownNote = note && !(size && /^about \d/.test(note)) ? note : null;
                        return (
                          <>
                            {/* the name wraps beside the amount, so the amount never drops onto a line of its own */}
                            <p className="flex items-start gap-3">
                              <span className="min-w-0 flex-1 text-base font-bold leading-snug [overflow-wrap:anywhere]">{t(spec.label)}</span>
                              <span className="app-numbers max-w-[55%] shrink-0 text-end text-[0.9375rem] font-semibold leading-snug">
                                {size?.spoon ? (
                                  <><span className="whitespace-nowrap">{size.text}</span> <span className="whitespace-nowrap font-normal text-muted">/ {weight}</span></>
                                ) : (
                                  <><span className="whitespace-nowrap">{weight}</span>{size && <> <span className="whitespace-nowrap">/ {size.text}</span></>}</>
                                )}
                              </span>
                            </p>
                            {shownNote ? <p className="text-[0.8125rem] text-muted">{noteText(t, shownNote)}</p> : null}
                          </>
                        );
                      })()}
                      {spec.subFor && (
                        <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{written.original || written.subFor ? t("Instead of {name}.", { name: lowerFirst(t(spec.subFor)) }) : t("We couldn't match {name} at {shop}, so this uses {sub} instead.", { shop: first.name, name: lowerFirst(t(spec.subFor)), sub: lowerFirst(t(spec.label)) })}</p>
                      )}
                      {p ? (
                        <>
                          {/* founder 2026-11-17: the logo of the supermarket each product is bought from, beside its name (the name is the link; the logo is silent) */}
                          {/* a link that looks like one, 44 px tall (audit, 20 November 2026: it read as plain grey text) */}
                          <Link href={productHref} prefetch={false} className="mt-0.5 flex min-h-11 items-center gap-2 rounded-lg text-[0.875rem] font-semibold leading-snug text-accent underline underline-offset-2 [overflow-wrap:anywhere]">
                            <ShopMark shopId={pf.retailer} size="xs" />
                            <span className="min-w-0">{several && <span className="sr-only">{pf.name}, </span>}{p.product.name}</span>
                          </Link>
                          {(() => {
                            // founder 2026-11-17: everything can be bought at a small local shop; where this product isn't one a small shop usually stocks, say what to look for there
                            // (the judgement covers Sainsbury's products only, so a product from another shop gets no tip)
                            const tip = pf.retailer === LOCAL_RANGE_SHOP ? localTipFor(spec.pantry, p.product.id) : null;
                            return tip ? <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{t("In a small local shop, look for {tip}.", { tip: t(tip) })}</p> : null;
                          })()}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {/* what one of what is bought costs: a pack's shelf price, or for loose produce (priced per kg) the amount used, never the price per kg as
                                if it were a pack's (Isla, 21 November 2026) */}
                            <span className="app-numbers text-[0.9375rem] font-semibold">{formatUsedPrice(p.basketCost / p.packs)}{p.packs > 1 ? ` · ${t("buy {n}", { n: p.packs })}` : ""}</span>
                            {/* founder 2026-11-17 ("the cost of each ingredient as relative to how much is used"): what the amount listed above costs at the shop's own price per kg or litre,
                                in the green of "a serving"; it follows Serves, and is left out where the shop prints no such price (then the price of a serving isn't shown either: the
                                whole shop's price stands alone above, with the reason) */}
                            {p.usedCost !== null && <span className="app-numbers text-[0.9375rem] font-semibold text-foreground">{t("{price} used", { price: formatUsedPrice(p.usedCost) })}</span>}
                          </div>
                          {/* the two pills together under the price line, at the end, so they never stagger at large text */}
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            {!(spec.cupboard && spec.pantry) && (
                              <button type="button" aria-pressed={hasIt(spec)} aria-label={t("I have this: {name}", { name: lowerFirst(t(spec.label)) })} onClick={() => { flipHave(spec.key); setAdded(null); }} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[0.9375rem] font-bold transition active:scale-95 ${hasIt(spec) ? HAVE_ON : "border-[color:var(--edge)] bg-soft hover:bg-[var(--fill)]"}`}>
                                <ChoiceMark on={hasIt(spec)} />{t("I have this")}
                              </button>
                            )}
                            <button type="button" onClick={() => setSwapping(spec.key)} aria-label={t("Swap {name}", { name: t(spec.label) })} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[color:var(--edge)] bg-soft px-4 text-[0.9375rem] font-semibold transition active:scale-95 hover:bg-[var(--fill)]">
                              <SwapIcon className="h-4 w-4" />{t("Swap")}
                            </button>
                          </div>
                          {/* said under any ticked ingredient, as on the cupboard ones (usability test 2026-11-19: Joan saw only a green tick on her eggs) */}
                          {hasIt(spec) && !(spec.cupboard && spec.pantry) && <p className="mt-1 text-[0.875rem] font-semibold leading-snug text-muted">{t("Left off your list and the price to buy it all.")}</p>}
                        </>
                      ) : (
                        <p className="mt-1 text-[0.8125rem] text-muted">{t("Not found at {shop} yet.", { shop: first.name })}</p>
                      )}
                    </div>
                  </div>
                  {p && spec.cupboard && spec.pantry && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-[1rem] bg-[var(--fill)] py-1.5 pe-1.5 ps-3.5">
                      <span className="min-w-0 flex-1 basis-32 text-[0.875rem] leading-snug text-muted">{hasIt(spec) ? t("Left off your list and the price to buy it all.") : t("You may have this already.")}</span>
                      <button type="button" aria-pressed={hasIt(spec)} aria-label={t("I have this: {name}", { name: lowerFirst(t(spec.label)) })} onClick={() => { toggleCupboard(spec.pantry!); setAdded(null); }} className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[0.9375rem] font-bold transition active:scale-95 ${hasIt(spec) ? HAVE_ON : "border-[color:var(--edge)] bg-card hover:bg-[var(--fill)]"}`}>
                        <ChoiceMark on={hasIt(spec)} />{t("I have this")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {(recipe.extras?.length ?? 0) > 0 && (
            <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted"><span className="font-semibold text-foreground">{t("Also handy (not counted):")}</span> {recipe.extras!.map(rt).join(", ")}.</p>
          )}
          {dietNote && (
            <p className={`${CARD} mt-4 flex gap-3 p-4 text-[0.9375rem] leading-snug`}><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>{prefs.halalOnly
              ? t("Recipes are chosen for your diet by their ingredients. We haven't read these products' halal labels, and we don't check each product's allergen label here, so check each pack before you buy.")
              : t("Recipes are chosen for your diet by their ingredients. We don't check each product's allergen label here, so check each pack before you buy.")}{prefs.kosherStyle ? ` ${t("We can't check kosher certification.")}` : ""}</span></p>
          )}
        </section>

        <section id="recipe-panel-method" role="tabpanel" aria-labelledby="recipe-tab-method" hidden={tab !== "method"} className="mt-5">
          <h2 id="method-heading" className={HEADING}>{t("How to make it")}</h2>
          {/* the steps are written for the recipe's own ingredients: where something else stands in, the method says so first (audit, 20 November 2026) */}
          {subsIn.length > 0 && (
            <div className="mt-3 space-y-1">
              {subsIn.map((x) => <Note key={x.sub} kind="info" heading={null}>{t("This version uses {sub} instead of {name}.", { sub: lowerFirst(t(x.sub)), name: lowerFirst(t(x.name)) })}</Note>)}
            </div>
          )}
          <ol className={`${CARD} mt-3 divide-y divide-line px-4`}>
            {recipe.method.map((step, i) => {
              // founder 2026-11-16: clear steps, each with a short bold title and its cooking time beside it (lib/mm/recipeSteps.ts)
              // oil the step measures goes in level spoons scaled exactly, water and stock as before (lib/mm/kitchenAmount.ts)
              const { title, text } = splitStep(scaleMethodStep(rt(step), view.recipe.servings, recipe.scaledFrom?.servings ?? recipe.servings));
              const time = stepTime(text);
              return (
                <li key={i} className="flex gap-3.5 py-4">
                  <span aria-hidden className="app-numbers grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill text-[0.875rem] font-bold">{i + 1}</span>
                  <div className="min-w-0 flex-1 pt-1">
                    {(title || time) && (
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        {title && <h3 className="text-base font-bold leading-snug">{title}</h3>}
                        {time && <span className="app-numbers ms-auto inline-flex shrink-0 items-center gap-1 text-[0.875rem] text-muted"><TodayIcon className="h-4 w-4 self-center" /><span className="sr-only">{t("Time")}: </span>{time}</span>}
                      </div>
                    )}
                    {(() => {
                      // founder 2026-11-17 ("the method doesn't specify how much to add ... be very specific"): each ingredient's amount sits in the step right
                      // after the words that first name it, from the same amounts as the list (so it follows Serves and the fit); spoons for small amounts
                      const items = (stepUses.get(i) ?? []).map((key) => {
                        const spec = specByKey.get(key)!;
                        const productName = pickByKey.get(key)?.product.name;
                        const note = noteForPick(spec, productName);
                        const count = note && /^about \d/.test(note) ? noteText(t, note) : null;
                        // no "about 1 tomato" for a punnet of baby plums either
                        const measured = countsSuit(spec.pantry, productName) ? spec : { ...spec, pantry: undefined };
                        return { key, pantry: spec.original?.pantry ?? spec.pantry, label: t(spec.label), amount: methodAmount(measured, count, amountText(spec)) };
                      });
                      const { pieces, unplaced } = placeAmounts(text, items);
                      const rest = items.filter((x) => unplaced.includes(x.key));
                      return (
                        <>
                          <p className="text-base leading-snug">
                            {pieces.map((p, k) => ("amount" in p ? <span key={k} className="app-numbers"> (<strong className="font-bold">{p.amount.replace(/([\d¼½¾]) (?=(?:g|ml|tsp|tbsp|eggs?|sprays)\b)/g, "$1\u00a0")}</strong>)</span> : <span key={k}>{p.text}</span>))}
                          </p>
                          {rest.length > 0 && (
                            <p className="app-numbers mt-2 rounded-[0.875rem] bg-[var(--fill)] px-3 py-2 text-[0.875rem] leading-snug">
                              <span className="font-semibold">{t("You'll need:")}</span>{" "}
                              {/* each with its product's photo, as on the Ingredients tab (inline, so the line reads as before) */}
                              {rest.map((x, k) => {
                                const pick = pickByKey.get(x.key);
                                // the photo never ends a line on its own: it stays with the first word of the name
                                const [word, ...more] = x.label.split(" ");
                                return (
                                  <span key={x.key}>
                                    {k > 0 && " · "}
                                    {pick ? <span className="whitespace-nowrap"><ProductMini sources={shopPhotoSources(fileOf(pick.product), pick.product)} />{"\u00a0"}{word}</span> : word}
                                    {more.length > 0 && ` ${more.join(" ")}`} {x.amount.full}
                                  </span>
                                );
                              })}
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </li>
              );
            })}
          </ol>
          {view.recipe.servings !== (recipe.scaledFrom?.servings ?? recipe.servings) && (
            <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{t("The cooking times are for {n} servings, as the recipe is written. For fewer, use a smaller pan and check it a little sooner; for more, use a bigger pan or cook in batches, and allow a little longer.", { n: recipe.scaledFrom?.servings ?? recipe.servings })}</p>
          )}
          {logButton && <div className="mt-4">{logButton}</div>}
        </section>

        {/* not "the products' labels": some figures are community numbers or the UK government's, and the page names them (the second sort of the 21 November
            meeting, Tara; a correction) */}
        {recipe.ai && (
          <p className={`${CARD} mt-4 flex gap-3 p-4 text-[0.875rem] leading-snug`}><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>{t("Pip wrote this recipe with AI from real products at {shop}; the numbers come from the products (each one says where). Read the steps before you cook, and cook meat and fish until piping hot.", { shop: listNames(shown.map((f) => f.name)) })}</span></p>
        )}

        {actions && <div className="mt-5 space-y-2">{actions}</div>}

        <p className="mt-8 border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-muted">
          {many
            ? t("Prices are each shop's shelf prices, checked {date}, and vary by store.", { date: formatDate(shown.map((f) => f.checkedOn).sort()[0]!, t) })
            : t("Prices are {shop} shelf prices, checked {date}, and vary by store.", { shop: poss(shown[0]!.name), date: formatDate(shown[0]!.checkedOn, t) })}{" "}
          {recipe.ai ? t("Recipe written by Pip with AI.") : t("Recipe by {app}.", { app: site.name })}{" "}
          {many ? t("Not affiliated with {shops}.", { shops: listNames(shown.map((f) => f.name)) }) : t("Not affiliated with {shop}.", { shop: shown[0]!.name })}
        </p>
        {view.resolved.complete && (
          // Kept in reach at the foot of the screen, just above the tab bar, on a flat strip of the page's grey that the page slides under
          // (like the reference's "Add to list" bar; no fade). Last in the page and pulled down over main's own bottom padding (pb-32), so at the
          // very end it sits under the footer.
          <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
            {/* once added, the button says so and opens the list it went on, so a second tap doesn't add anything twice (usability test 2026-11-19); with
                everything ticked "I have this" there is nothing to add, and it says so instead (audit, 20 November 2026) */}
            {added ? (
              <LinkButton full href={added.href} className="min-h-[3.25rem]">
                <CheckIcon aria-hidden className="h-5 w-5 shrink-0" />
                {t("Added: see your list")}
              </LinkButton>
            ) : (
              <Button full className="min-h-[3.25rem]" onClick={addAll} disabled={ready.length === 0} reason={ready.length === 0 ? t("You have everything for this recipe.") : undefined}>
                <PlusIcon aria-hidden className="h-5 w-5 shrink-0" />
                {t("Add all to my shopping list")}
              </Button>
            )}
            <p role="status" aria-live="polite" className="px-2 text-center text-[0.875rem] font-semibold text-foreground">
              {added && <span className="mt-2 block">{added.text}</span>}
            </p>
          </div>
        )}
      </div>

      {save && (
        <Sheet open={leaving} onClose={() => setLeaving(false)} title={t("Save your recipe first?")}>
          <p className="text-base leading-snug">{t("If you go back without saving, this recipe will be gone.")}</p>
          <div className="mt-5 grid gap-3">
            <Button size="lg" full onClick={() => { save.onSave(); setLeaving(false); goBack(); }}>{t("Save and go back")}</Button>
            <Button size="lg" full variant="secondary" onClick={() => { setLeaving(false); goBack(); }}>{t("Go back without saving")}</Button>
          </div>
        </Sheet>
      )}
      <Sheet open={logOpen && !!totals} onClose={() => setLogOpen(false)} title={t("Add a serving to today")}>
        {totals && (() => {
          const n = recipeNutrients(totals, logServings);
          return (
            <div className="space-y-5">
              <div role="group" aria-label={t("Meal")} className="flex flex-wrap gap-2">
                {MEAL_TYPES.map((m) => <Chip key={m.value} selected={logMeal === m.value} onClick={() => setLogMeal(m.value)}>{t(m.label)}</Chip>)}
              </div>
              <div role="group" aria-label={t("Servings")} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-base font-semibold">{t("Servings")}</span>
                <span className="glass inline-flex items-center rounded-full p-1">
                  <button type="button" aria-label={t("Fewer servings")} disabled={logServings <= MIN_LOG_SERVINGS} onClick={() => setLogServings((v) => stepServings(v, -1))} className={ROUND_BUTTON}><span className={ROUND_FACE}><MinusIcon className="h-[18px] w-[18px]" /></span></button>
                  <output aria-live="polite" className="app-numbers min-w-10 px-1 text-center text-lg font-bold">{servingsWords(logServings)}</output>
                  <button type="button" aria-label={t("More servings")} disabled={logServings >= MAX_LOG_SERVINGS} onClick={() => setLogServings((v) => stepServings(v, 1))} className={ROUND_BUTTON}><span className={ROUND_FACE}><PlusIcon className="h-[18px] w-[18px]" /></span></button>
                </span>
              </div>
              <p className="app-numbers text-[0.9375rem] font-semibold leading-snug">{t("{kcal} · {protein} protein", { kcal: formatCalories(n.calories), protein: formatGrams(n.protein ?? 0) })}</p>
              <Button size="lg" full onClick={logIt}>{t(ADD_TO[logMeal])}</Button>
            </div>
          );
        })()}
      </Sheet>
      {logged && (
        <Toast key={logged.id} onClose={() => setLogged(null)} onUndo={() => { deleteLogEntry(logged.id); setLogged(null); }}>{logged.text}</Toast>
      )}
      <Sheet open={!!swapSpec} onClose={() => setSwapping(null)} title={swapSpec ? t("Swap {name}", { name: lowerFirst(t(swapSpec.label)) }) : t("Swap")}>
        {swapSpec && (
          <>
            {insteadOptions.length > 0 && (
              <section aria-labelledby="instead-heading" className="mb-5">
                <h3 id="instead-heading" className="text-base font-bold">{t("Use something else instead")}</h3>
                <ul className="mt-2 space-y-2">
                  {insteadOptions.map((o) => (
                    <li key={o.subKey ?? "written"}>
                      {/* the photo of the product the recipe would use, like the product rows below (founder 2026-11-17: "Use images please when possible"); drawn first,
                          but after the words in the page, so the button's text starts with its name */}
                      <button type="button" onClick={() => chooseInstead(swapSpec.key, o.subKey)} className={`${CARD} flex w-full items-center gap-3 p-3 text-start transition active:scale-[0.99] hover:bg-soft-strong`}>
                        <span className="order-1 min-w-0 flex-1">
                          <span className="block text-[0.9375rem] font-semibold leading-snug [overflow-wrap:anywhere]">{t(o.spec.label)}</span>
                          <span className="app-numbers block text-[0.8125rem] text-muted">{o.subKey ? t("{amount} in the recipe", { amount: amountText(o.spec) }) : t("As the recipe has it, {amount}", { amount: amountText(o.spec) })}</span>
                        </span>
                        <span className="order-first shrink-0"><PickPhoto file={fileOf(o.pick.product)} product={o.pick.product} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <h3 className="text-base font-bold">{insteadOptions.length > 0 ? t("Or pick a different product") : t("Pick a different product")}</h3>
            {/* founder 2026-11-17: an ingredient can be bought at another shop: one chip per shop (this recipe's shop first); the list below is that shop's products */}
            {(files.length > 1 || othersLoading) && (
              <div role="group" aria-label={t("Shop")} className="mt-2.5 flex flex-wrap gap-2">
                {files.map((f) => (<Chip key={f.retailer} selected={f.retailer === swapShop} onClick={() => setSwapShopFor({ key: swapSpec.key, shop: f.retailer })}>{f.name}</Chip>))}
                {othersLoading && <span role="status" className="inline-flex min-h-11 items-center px-2 text-[0.9375rem] text-muted">{t("Loading other shops…")}</span>}
              </div>
            )}
            {/* no claim about the order (Isla, 21 November 2026: "cheapest to buy first" wasn't true: candidates() puts products whose serving can be priced, whose
                label we've read and that print the most figures first, lib/mm/recipes.ts), only the small-shop one, which is */}
            <p className="mb-3 mt-2.5 text-[0.8125rem] leading-snug text-muted">{localFirst
              ? t("Products at {shop} that fit this recipe: those a small local shop usually sells first. It uses {amount}.", { shop: (files.find((f) => f.retailer === swapShop) ?? first).name, amount: amountText(swapSpec) })
              : t("Products at {shop} that fit this recipe. It uses {amount}.", { shop: (files.find((f) => f.retailer === swapShop) ?? first).name, amount: amountText(swapSpec) })}</p>
            {/* never an empty sheet with no words (audit, 20 November 2026) */}
            {options.length === 0 && !othersLoading && (
              <p className="mb-3 text-[0.9375rem] leading-snug">{t("We couldn't find {name} at {shop} with its label and pack size. Try another shop.", { name: lowerFirst(t(swapSpec.label)), shop: (files.find((f) => f.retailer === swapShop) ?? first).name })}</p>
            )}
            <ul className="space-y-2">
              {options.map((o) => {
                const key = productKey(o.product);
                const selected = key === currentKey;
                const of = fileOf(o.product);
                return (
                  <li key={key}>
                    {/* the current pick is the one lime row with the 2 px dark green edge and a tick in a circle; the rest are white with the edge and an empty circle */}
                    <button type="button" aria-pressed={selected} onClick={() => { setChosen((c) => ({ ...c, [swapSpec.key]: key })); setSwapping(null); setAdded(null); }} className={`flex w-full flex-wrap items-center gap-3 rounded-[1.25rem] border-[1.5px] p-3 text-start transition active:scale-[0.99] ${selected ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card hover:bg-background"}`}>
                      <PickPhoto file={of} product={o.product} />
                      {/* at large text on a narrow phone the words go under the photo instead of a letter or two a line beside it */}
                      <span className="min-w-0 flex-1 basis-[9rem]">
                        {/* the logo of the shop it's bought from beside its name (the logo is silent; with several shops a screen reader hears the shop's name first) */}
                        <span className="flex items-start gap-2">
                          <ShopMark shopId={of.retailer} size="xs" />
                          <span className="min-w-0 self-center text-[0.9375rem] font-semibold leading-snug [overflow-wrap:anywhere]">{several && <span className="sr-only">{of.name}, </span>}{o.product.name}</span>
                        </span>
                        <span className={`app-numbers block text-[0.8125rem] ${selected ? "" : "text-muted"}`}>{formatPrice(o.basketCost)}{o.packs > 1 ? ` ${t("for {n}", { n: o.packs })}` : ""}{servingCost(o) !== null ? ` · ${t("{price} a serving", { price: formatPrice(servingCost(o)!) })}` : ""}</span>
                        {o.product.nutrition && (
                          // a liquid counted by weight (ShopNutrition.byWeight) shows its label as the shop prints it, per 100 g, never the per 100 ml it was turned into;
                          // the basis says a drained label (nutritionBasis: "per 100 g (drained)"), and where the figures aren't the shop's own label it says so, as the
                          // shop's lists do (the second sort of the 21 November meeting, Yusuf: community and government figures looked like shop labels here)
                          <>
                            <span className={`app-numbers block text-[0.8125rem] ${selected ? "" : "text-muted"}`}>{Math.round(o.product.nutrition.kcal / (o.product.nutrition.byWeight ?? 1))} kcal · {t("{n} g protein", { n: Math.round((o.product.nutrition.protein / (o.product.nutrition.byWeight ?? 1)) * 10) / 10 })} {nutritionBasis({ per: o.product.nutrition.byWeight ? "g" : o.product.nutrition.per, state: o.product.nutrition.state }, t)}</span>
                            {o.product.nutrition.community && <span className={`block text-[0.8125rem] leading-snug ${selected ? "" : "text-muted"}`}>{t("community numbers")}</span>}
                            {o.product.nutrition.govFood && <span className={`block text-[0.8125rem] leading-snug ${selected ? "" : "text-muted"}`}>{t("UK government figures")}</span>}
                          </>
                        )}
                      </span>
                      <ChoiceMark on={selected} kind="circle" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Sheet>
    </div>
  );
}

/** The recipe's allergens, inside More detail (founder 2026-11-20: "there'll also be a part where it has allergens ... it'll tell you if there's allergens in it"):
 *  the 14 allergens UK law names, as on every dish and product page, each one this recipe's ingredients contain marked with the ingredients that bring it, and
 *  any the person avoids marked "You avoid". From each ingredient kind's flags (lib/mm/recipeAllergens.ts), never "may contain", which a pack can add. */
function RecipeAllergenPart({ ingredients }: { ingredients: Array<{ label: string; pantry?: string }> }) {
  const t = useT();
  const { allergens, from } = recipeAllergens(ingredients);
  const list = (names: string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
  const fromText = Object.fromEntries(Object.entries(from).map(([k, names]) => [k, t("From: {names}", { names: list(names) })]));
  const n = allergens.contains.length;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-[1.0625rem] font-bold tracking-[-0.01em]">{t("Allergens")}</h3>
      <p className="mt-1.5 text-[0.9375rem] leading-snug">{n === 0 ? t("None of the 14 main allergens in these ingredients.") : n === 1 ? t("Contains 1 of the 14 main allergens.") : t("Contains {n} of the 14 main allergens.", { n })}</p>
      <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{t("From what each ingredient usually contains, checked against the supermarkets' own labels. A pack can differ, and we don't show \"may contain\" for recipes, so always check the label.")}</p>
      <AllergenTable allergens={allergens} caption={t("Allergens in this recipe")} columnLabel={t("This recipe")} pad="px-1" from={fromText} />
    </div>
  );
}

/** Save a recipe from our book to My recipes (on this device), or take it off: a heart on the picture, with its word so it's plain. One name for the place
 *  everywhere: "My recipes" (audit, 20 November 2026: it was "My meals" here and "My recipes" on the button that opens it). */
function SaveRecipeButton({ id }: { id: string }) {
  const saved = useStore(savedRecipesStore).some((r) => r.id === id);
  return <SaveChip saved={saved} onClick={() => toggleSavedRecipe(id)} />;
}

/** The heart chip at the photo's top right: outline with "Save", filled with "Saved"; heard as "Save to My recipes" / "Saved to My recipes", pressed when saved. */
function SaveChip({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" aria-pressed={saved} aria-label={saved ? t("Saved to My recipes") : t("Save to My recipes")} onClick={onClick} className={SAVE_BUTTON}>
      <HeartIcon aria-hidden filled={saved} className="h-5 w-5 text-ink" />{saved ? t("Saved") : t("Save")}
    </button>
  );
}
