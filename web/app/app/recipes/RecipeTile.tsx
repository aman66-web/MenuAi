"use client";

import Link from "next/link";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { formatPrice } from "@/lib/mm/groceries";
import { formatInt } from "@/lib/mm/format";
import type { MealType } from "@/lib/mm/recipes";
import { savedRecipesStore, toggleSavedRecipe } from "@/lib/mm/stores";
import { AppleIcon, EggGlyph, FishGlyph, HeartIcon, MoonIcon, NoodleGlyph, OatsGlyph, PastaGlyph, PotIcon, RiceBowlGlyph, SaladGlyph, SandwichIcon, SunriseIcon, TacoGlyph, TrayGlyph } from "../_components/icons";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import type { RecipeCard } from "../_lib/recipes";

// One recipe in a list (Recipes, My meals). Founder 2026-10-14, from two reference pictures: a picture on top with a heart to save it, then the
// name and, under it, calories and protein as two small chips; then the price of a serving at the shop and how long it takes. The picture is
// the recipe's AI illustration once there is one (captioned, CLAUDE.md rule 2); until then a plate with a drawing of the kind of dish (below).
// Restyled 2026-10-15 to Home's language: a white card with 20 px corners and no outline, the name in the same weight as Home's meal rows,
// grey figure chips with a bold number and a grey unit, and a quiet white heart opposite the meal's label.

export const MEAL_LOOK: Record<MealType, { Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = {
  breakfast: { Icon: SunriseIcon },
  lunch: { Icon: SandwichIcon },
  dinner: { Icon: MoonIcon },
  snack: { Icon: AppleIcon },
};

type Glyph = (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;
// Until a recipe has its picture, its card shows a plate with a simple drawing of the kind of dish (from the words in its English name; the meal's
// own icon when none fits) on one of six flat pastel colours chosen by the recipe's id, so a list of a hundred doesn't look like one card
// repeated (flat, no gradients: founder 2026-10-15).
const DISH: ReadonlyArray<[RegExp, Glyph]> = [
  [/noodle|chow mein|pad thai|stir-fry/i, NoodleGlyph],
  [/kebab|skewer/i, TrayGlyph], // before "yogurt" and "salad": a kebab with a yogurt dressing is not a bowl of oats
  [/chicken and rice bowl/i, RiceBowlGlyph], // likewise ("with yogurt")
  [/pasta|spaghetti|linguine|macaroni|gnocchi|bolognese|carbonara|meatball/i, PastaGlyph],
  [/wrap|burrito|fajita|quesadilla|roll-up/i, TacoGlyph],
  [/egg|omelette|shakshuka|huevos|scramble/i, EggGlyph],
  [/salad|bites|dip\b/i, SaladGlyph],
  [/porridge|oats|muesli|granola|yogurt|pancake|bark/i, OatsGlyph],
  [/curry|chilli|dhal|keema|jalfrezi|stew|soup|minestrone|hash/i, PotIcon],
  [/bake|traybake|pie|lasagne|steak/i, TrayGlyph],
  [/salmon|cod|tuna|mackerel|prawn|kedgeree/i, FishGlyph],
  [/rice|bowl/i, RiceBowlGlyph],
];
const ART = [
  "bg-[#fcecc8]", // cream
  "bg-[#fadcd8]", // blush
  "bg-[#e8f1d4]", // pale lime
  "bg-[#d9efe3]", // pale mint
  "bg-[#dbeaf3]", // pale sky
  "bg-[#fbe1c8]", // soft peach
];
const artOf = (id: string) => ART[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % ART.length]!;

// The calories sit in the picture's top-left corner (founder 2026-10-16: "Instead have calories where the red is here", where the meal's label used to
// be): a white pill, centred on the heart's circle opposite it. The caption of an AI illustration (CLAUDE.md rule 2) is a small label at the picture's
// bottom-left, spaced capitals like the small labels in Home's cards, never below 11 px.
const KCAL_PILL = "absolute start-3 top-[11px] inline-flex items-baseline gap-[0.25em] whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-[0.9375rem] font-bold leading-[1.3] text-[#0b1a12]";
const PICTURE_LABEL = "absolute start-3 bottom-3 max-w-[calc(100%-1.5rem)] rounded-xl px-2.5 py-1 text-[0.6875rem] font-semibold uppercase leading-[1.1] tracking-[0.08em]";

/** The picture area: the recipe's AI illustration, or a plate with a drawing of the kind of dish (the calories pill is drawn over it by RecipeTile). */
function RecipeArt({ id, name, meal, wide }: { id: string; name: string; meal: MealType | undefined; wide: boolean }) {
  const t = useT();
  const image = RECIPE_IMAGES[id];
  const look = MEAL_LOOK[meal ?? "dinner"] ?? MEAL_LOOK.dinner;
  const Dish = DISH.find(([re]) => re.test(name))?.[1] ?? look.Icon;
  return (
    <span className={`relative block overflow-hidden ${wide ? "aspect-[16/10]" : "aspect-[4/3] @[14rem]:aspect-[2/1]"}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; the service worker caches it
        <img src={image} alt="" loading="lazy" decoding="async" width={800} height={600} className="h-full w-full object-cover" />
      ) : (
        // the calories pill sits in the top row, so the plate is centred in the space under it and the two never meet
        <span aria-hidden className={`flex h-full w-full items-center justify-center pt-7 ${artOf(id)}`}>
          <span className={`grid place-items-center rounded-full bg-white/85 text-[#0b1a12] shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35),inset_0_0_0_5px_rgba(255,255,255,0.65)] ${wide ? "h-24 w-24" : "h-14 w-14"}`}>
            <Dish className={wide ? "h-12 w-12" : "h-8 w-8"} strokeWidth={1.6} />
          </span>
        </span>
      )}
      {image && <span className={`${PICTURE_LABEL} bg-black/60 text-white`}>{t("AI illustration")}</span>}
    </span>
  );
}

/**
 * The top of a recipe's own page (founder 2026-10-14, from a reference picture: the food big at the top, the page's sheet over its foot):
 * the recipe's AI illustration with its caption, or the same plate and drawing as its card, larger. Never a photo of a product.
 */
export function RecipeHeroArt({ id, name, label, meal }: { id: string; name: string; label: string; meal: MealType | undefined }) {
  const t = useT();
  const image = RECIPE_IMAGES[id];
  const look = MEAL_LOOK[meal ?? "dinner"] ?? MEAL_LOOK.dinner;
  const Dish = DISH.find(([re]) => re.test(name))?.[1] ?? look.Icon;
  return (
    <div className={`relative h-[clamp(15rem,36dvh,22rem)] overflow-hidden ${image ? "bg-soft-strong" : artOf(id)}`}>
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; the service worker caches it */}
          <img src={image} alt={t("An illustration of {name}", { name: label.toLowerCase() })} width={800} height={600} decoding="async" className="h-full w-full object-cover" />
          <p className="absolute bottom-12 start-4 me-4 rounded-[1rem] bg-black/65 px-3 py-1.5 text-[0.8125rem] font-semibold leading-snug text-white">{t("Illustration made with AI, not a photo of the products below.")}</p>
        </>
      ) : (
        <span aria-hidden className="absolute inset-0">
          {/* sized by the picture's height, not the text size, so large text never pushes the plate into the buttons */}
          <span className="absolute left-1/2 top-[53%] grid aspect-square h-[50%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0b1a12] shadow-[0_24px_44px_-26px_rgba(0,0,0,0.45),inset_0_0_0_10px_rgba(255,255,255,0.7)]">
            <Dish className="h-[55%] w-[55%]" strokeWidth={1.4} />
          </span>
        </span>
      )}
    </div>
  );
}

export function RecipeTile({ card, href, badge, wide = false, saveable = true, onOpen }: { card: RecipeCard; href: string; badge?: string; wide?: boolean; saveable?: boolean; onOpen?: React.MouseEventHandler<HTMLAnchorElement> }) {
  const t = useT();
  const savedList = useStore(savedRecipesStore);
  const { recipe, totals } = card;
  // our recipe book is translated; what Pip wrote with AI is shown as it wrote it
  const rt = (s: string) => (recipe.ai ? s : t(s));
  const saved = savedList.some((s) => s.id === recipe.id);
  const canSave = saveable && !recipe.ai; // Pip's recipes are already kept on this phone
  const price = totals.costPerServing !== null ? formatPrice(totals.costPerServing) : null;
  // a grey chip with a medium figure and a grey unit, like the reference's "407 CAL · 32g PROTEIN": protein, carbs and fat under the name (founder
  // 2026-10-16: "Add the fats and carbs to each of the recipes also", then "calories where the red is ... below the title the protein, fats and carbs");
  // the calories are the pill in the picture's corner. They wrap onto a second line in a two-column grid on a phone.
  const chip = "inline-flex items-baseline gap-[0.25em] whitespace-nowrap rounded-md bg-[var(--fill)] px-1.5 py-[0.1875rem]";
  return (
    // a container, so a card shown one to a row (large text) gets a lower picture instead of a tall block of colour
    <div className="glass lift @container relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] border-0">
      <Link href={href} prefetch={false} onClick={onOpen} className="flex flex-1 flex-col rounded-[1.25rem] focus-visible:outline-offset-[-3px]">
        <RecipeArt id={recipe.id} name={recipe.name} meal={recipe.meal} wide={wide} />
        <span className={`flex flex-1 flex-col ${wide ? "px-4 pb-4 pt-3.5" : "px-3 pb-3.5 pt-3"}`}>
          {badge && <span className="mb-1.5 inline-block self-start rounded-full bg-[var(--fill)] px-2.5 py-1 text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.08em] text-muted">{badge}</span>}
          <span className={`line-clamp-2 leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] ${wide ? "text-lg font-extrabold" : "text-[0.9375rem] font-extrabold"}`}>{rt(recipe.name)}</span>
          {/* after the name in the markup, so a screen reader hears "name, calories, protein ...", but drawn over the picture's top-left corner (the card is the positioned parent) */}
          <span className={`app-numbers ${KCAL_PILL}`}>{formatInt(totals.perServing.kcal)}<span className="text-[0.75rem] font-semibold opacity-70">kcal</span></span>
          <span className={`app-numbers mt-2 flex flex-wrap gap-1 ${wide ? "text-[0.8125rem]" : "text-xs"}`}>
            <span className={chip}><span className="font-semibold">{Math.round(totals.perServing.protein)}g</span><span className="text-muted">{t("protein")}</span></span>
            <span className={chip}><span className="font-semibold">{Math.round(totals.perServing.carbs)}g</span><span className="text-muted">{t("carbs")}</span></span>
            <span className={chip}><span className="font-semibold">{Math.round(totals.perServing.fat)}g</span><span className="text-muted">{t("fat")}</span></span>
          </span>
          <span className="app-numbers mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-2.5 text-[0.8125rem] text-muted">
            {price && <><span><span className="font-semibold text-foreground">{price}</span> {t("a serving")}</span><span aria-hidden>·</span></>}
            <span>{t("{n} min", { n: recipe.minutes })}</span>
          </span>
        </span>
      </Link>
      {canSave && (
        // a 36 px white circle in the picture's corner, inside a full 44 px tap area, clear of the plate in the middle
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? t("Saved to My meals") : t("Save to My meals")}
          onClick={() => toggleSavedRecipe(recipe.id)}
          className={`group absolute end-1 top-1 grid h-11 w-11 place-items-center rounded-full transition active:scale-90 ${saved ? "text-[#e11d48]" : "text-[#0b1a12]"}`}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-[0_2px_8px_-4px_rgba(17,24,20,0.3)] transition-colors group-hover:bg-[#f4f5f6]"><HeartIcon filled={saved} className="h-[18px] w-[18px]" /></span>
        </button>
      )}
    </div>
  );
}
