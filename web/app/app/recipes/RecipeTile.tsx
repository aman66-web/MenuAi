"use client";

import Link from "next/link";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { assetUrl } from "@/lib/mm/config";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/mm/groceries";
import { formatInt } from "@/lib/mm/format";
import type { MealType } from "@/lib/mm/recipes";
import { savedRecipesStore, toggleSavedRecipe } from "@/lib/mm/stores";
import { AppleIcon, CheckIcon, EggGlyph, FishGlyph, HeartIcon, MoonIcon, NoodleGlyph, OatsGlyph, PastaGlyph, PotIcon, RiceBowlGlyph, SaladGlyph, SandwichIcon, SunriseIcon, TacoGlyph, TrashIcon, TrayGlyph } from "../_components/icons";
import { useStore } from "../_lib/hooks";
import { keepRecipePhotoPosition, useRecipePhoto, useRecipePhotoPosition } from "../_lib/recipePhotos";
import { PHOTO_CENTRE, dragPosition, objectPosition, photoRoom, type PhotoPosition } from "@/lib/mm/recipePhotos";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import type { RecipeCard } from "../_lib/recipes";
import { FullPictureButton } from "../_components/PhotoViewer";

// One recipe in a list (Recipes, My meals). Founder 2026-10-14, from two reference pictures: a picture on top with a heart to save it, then the
// name and, under it, calories and protein as two small chips; then the price of a serving at the shop and how long it takes (founder 2026-11-20, "every
// recipe has a price": where a serving can't be priced, because the shop's list gives no weight for one of its packs, the whole shop "£x to buy" instead). The picture is
// the recipe's AI illustration once there is one (no visible caption since 2026-11-17; screen readers hear "An illustration of …", CLAUDE.md rule 2); until then a plate with a drawing of the kind of dish (below).
// Restyled 2026-10-15 to Home's language: a white card with 20 px corners, the name in the same weight as Home's meal rows, grey figure chips with a bold
// number and a grey unit. Since 2026-11-17 the chips are one grey strip of three cells (protein, carbs, fat) and the name shows up to three lines. Since the
// colour meeting (19 November 2026): the card's 1px line goes round the picture too, the calories are a photo tag and the heart a photo chip in ink.

export const MEAL_LOOK: Record<MealType, { Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = {
  breakfast: { Icon: SunriseIcon },
  lunch: { Icon: SandwichIcon },
  dinner: { Icon: MoonIcon },
  snack: { Icon: AppleIcon },
};

type Glyph = (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;
// Until a recipe has its picture, its card shows a plate with a simple drawing of the kind of dish (from the words in its English name; the meal's
// own icon when none fits) in ink on the page fill (colour meeting, 19 November 2026; approved by the founder that day: the six pastels are retired).
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
/** The drawn plate: a white circle with the card line and an ink glyph, on the page fill. */
const PLATE = "grid place-items-center rounded-full border border-line bg-card text-ink";

// The calories sit in the picture's top-left corner (founder 2026-10-16: "Instead have calories where the red is here", where the meal's label used to
// be), as a photo tag (colour meeting, 19 November 2026: near-white with the 1px card line and ink words), centred on the heart's chip opposite it. A person's
// own photo is labelled with a photo tag at the picture's bottom-left, in sentence case.
const KCAL_PILL = "photo-tag absolute start-3 top-[11px] inline-flex items-baseline gap-[0.25em] whitespace-nowrap rounded-full px-3 py-1 text-[0.9375rem] font-bold leading-[1.3]";
const PICTURE_LABEL = "photo-tag absolute start-3 bottom-3 inline-flex max-w-[calc(100%-1.5rem)] items-center rounded-full px-2.5 py-1 text-[0.8125rem] font-bold leading-[1.1]";

/** A picture and what to do when it can't load (offline, in the iPhone app, before a photo has been seen once): then the drawn plate shows instead. */
function useUsableImage(src: string | undefined): { src: string; fail: () => void } | null {
  const [bad, setBad] = useState<string | null>(null);
  return src && bad !== src ? { src, fail: () => setBad(src) } : null;
}

/** The picture area: the recipe's AI illustration, or a plate with a drawing of the kind of dish (the calories pill is drawn over it by RecipeTile). */
function RecipeArt({ id, name, meal, wide }: { id: string; name: string; meal: MealType | undefined; wide: boolean }) {
  const t = useT();
  // a recipe made from the person's own photo (Make it at home) shows that photo (founder 2026-11-16: "that's the thumbnail of the recipe")
  const own = useRecipePhoto(id);
  // the part of their photo the person chose to show (they moved it on the recipe's page)
  const place = useRecipePhotoPosition(id);
  const image = useUsableImage(own ?? (RECIPE_IMAGES[id] ? assetUrl(RECIPE_IMAGES[id]) : undefined));
  const look = MEAL_LOOK[meal ?? "dinner"] ?? MEAL_LOOK.dinner;
  const Dish = DISH.find(([re]) => re.test(name))?.[1] ?? look.Icon;
  return (
    <span className={`relative block overflow-hidden ${wide ? "aspect-[16/10]" : "aspect-[4/3] @[14rem]:aspect-[2/1]"}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; the service worker caches it
        <img src={image.src} alt="" loading="lazy" decoding="async" width={800} height={600} onError={image.fail} style={own && image.src === own ? { objectPosition: objectPosition(place) } : undefined} className="h-full w-full bg-fill object-cover" />
      ) : (
        // the calories pill sits in the top row, so the plate is centred in the space under it and the two never meet
        <span aria-hidden className="flex h-full w-full items-center justify-center bg-fill pt-7">
          <span className={`${PLATE} ${wide ? "h-24 w-24" : "h-14 w-14"}`}>
            <Dish className={wide ? "h-12 w-12" : "h-8 w-8"} strokeWidth={1.6} />
          </span>
        </span>
      )}
      {/* founder 2026-11-17 ("Remove AI illustration please from on all the photos"): only a person's own photo is labelled */}
      {own && <span className={PICTURE_LABEL}>{t("Your photo")}</span>}
    </span>
  );
}

/** Four arrows: "move the picture" (the chip that starts moving the person's own photo). */
function MoveGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable={false} {...p}>
      <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </svg>
  );
}

/** The fewest pixels a photo must run past the picture's edge to be worth moving. */
const MIN_ROOM = 8;
/** One arrow-key press moves the photo this far (per cent of the way it can go). */
const KEY_STEP = 5;

/**
 * The top of a recipe's own page (founder 2026-10-14, from a reference picture: the food big at the top, the page's sheet over its foot):
 * the recipe's AI illustration (described to screen readers as an illustration), or the same plate and drawing as its card, larger. Never a photo of a product.
 * The person's own photo (`photo`, the one just taken; else the one kept with the recipe) can be moved (founder 2026-11-20): a tap on it, or the four-arrow chip,
 * starts moving (`onMoving(true)`; the page says "Drag to move it" with Done under it, never on the photo); a drag, or the arrow keys, choose which part shows
 * (CSS object-position, kept with the recipe on this phone and used on its card too). The photo itself is never changed. Offered only when the photo runs past
 * the picture's edge, so there is something to move.
 */
export function RecipeHeroArt({ id, name, label, meal, photo, moving = false, onMoving }: { id: string; name: string; label: string; meal: MealType | undefined; photo?: string; moving?: boolean; onMoving?: (on: boolean) => void }) {
  const t = useT();
  const own = useRecipePhoto(id);
  const mine = photo ?? own;
  const image = useUsableImage(mine ?? (RECIPE_IMAGES[id] ? assetUrl(RECIPE_IMAGES[id]) : undefined));
  const isMine = !!mine && image?.src === mine;
  const look = MEAL_LOOK[meal ?? "dinner"] ?? MEAL_LOOK.dinner;
  const Dish = DISH.find(([re]) => re.test(name))?.[1] ?? look.Icon;
  const kept = useRecipePhotoPosition(id);
  // while a finger is down, the place it has dragged to (kept when it lifts)
  const [dragging, setDragging] = useState<PhotoPosition | null>(null);
  // the four arrows in the middle show until the photo has first been moved
  const [moved, setMoved] = useState(false);
  const startMoving = () => { setMoved(false); onMoving?.(true); };
  const shown = dragging ?? kept ?? PHOTO_CENTRE;
  const box = useRef<HTMLDivElement>(null);
  const pic = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number; from: PhotoPosition; id: number; to: PhotoPosition | null } | null>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  const sizes = () => {
    const b = box.current, i = pic.current;
    return b && i && i.naturalWidth ? { box: { w: b.clientWidth, h: b.clientHeight }, natural: { w: i.naturalWidth, h: i.naturalHeight } } : null;
  };
  const measure = useCallback(() => {
    const b = box.current, i = pic.current;
    setRoom(b && i && i.naturalWidth ? photoRoom({ w: b.clientWidth, h: b.clientHeight }, { w: i.naturalWidth, h: i.naturalHeight }) : { w: 0, h: 0 });
  }, []);
  useEffect(() => {
    if (!isMine) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isMine, measure, image?.src]);
  const canMove = isMine && !!onMoving && (room.w >= MIN_ROOM || room.h >= MIN_ROOM);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => { if (moving && canMove) surface.current?.focus({ preventScroll: true }); }, [moving, canMove]);
  const keep = (p: PhotoPosition) => keepRecipePhotoPosition(id, p);
  const alt = isMine ? t("Your photo") : t("An illustration of {name}", { name: label.toLowerCase() });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, from: shown, id: e.pointerId, to: null };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    const z = sizes();
    if (!s || s.id !== e.pointerId || !z) return;
    s.to = dragPosition(s.from, e.clientX - s.x, e.clientY - s.y, z.box, z.natural);
    setDragging(s.to);
    setMoved(true);
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    if (s.to) keep(s.to);
    setDragging(null);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); onMoving?.(false); return; }
    // an arrow moves the photo the way the arrow points, as a drag that way would
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    const z = sizes();
    if (!d || !z) return;
    e.preventDefault();
    const step = (r: number) => (r >= 1 ? (KEY_STEP / 100) * r : 0);
    keep(dragPosition(shown, d[0] * step(room.w), d[1] * step(room.h), z.box, z.natural));
    setMoved(true);
  };

  return (
    <div ref={box} className="relative h-[clamp(15rem,36dvh,22rem)] overflow-hidden bg-fill">
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- static file named by its hash, or the person's own photo (a local address on this phone) */}
          <img ref={pic} src={image.src} onError={image.fail} onLoad={isMine ? measure : undefined} alt={alt} width={800} height={600} decoding="async" draggable={false} style={isMine ? { objectPosition: objectPosition(shown) } : undefined} className="h-full w-full select-none object-cover" />
          {/* the light band that keeps the iPhone's status bar readable over a picture (the only overlay a food picture may carry); the person's own photo
              is labelled under it, in the recipe's sheet */}
          <div aria-hidden className="status-band" />
          {canMove && moving ? (
            // moving: the photo follows a finger (or the arrow keys); four arrows in the middle say so without words until it has moved
            <div ref={surface} role="group" tabIndex={0} aria-label={t("Drag to move it")} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onKeyDown}
              className="absolute inset-0 cursor-grab touch-none select-none focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-accent active:cursor-grabbing">
              <span aria-hidden className={`photo-chip pointer-events-none absolute left-1/2 top-[45%] grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-ink transition-opacity ${moved ? "opacity-0" : "opacity-100"}`}>
                <MoveGlyph className="h-7 w-7" />
              </span>
            </div>
          ) : (
            <>
              {/* a tap anywhere on the person's photo starts moving it too (the chip below is the one a screen reader or keyboard meets) */}
              {canMove && <button type="button" aria-hidden tabIndex={-1} onClick={startMoving} className="absolute inset-0 cursor-pointer" />}
              {canMove && (
                <button type="button" onClick={startMoving} aria-label={t("Move the photo")}
                  className="photo-chip absolute bottom-12 start-4 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <MoveGlyph className="h-5 w-5" />
                </button>
              )}
              {/* the whole picture, full screen (founder 2026-11-18), above the sheet that covers the photo's foot */}
              <FullPictureButton src={image.src} alt={alt} className="bottom-12 end-4" />
            </>
          )}
        </>
      ) : (
        <span aria-hidden className="absolute inset-0">
          {/* sized by the picture's height, not the text size, so large text never pushes the plate into the buttons */}
          <span className={`absolute left-1/2 top-[53%] aspect-square h-[50%] -translate-x-1/2 -translate-y-1/2 ${PLATE}`}>
            <Dish className="h-[55%] w-[55%]" strokeWidth={1.4} />
          </span>
        </span>
      )}
    </div>
  );
}

/** A tile in choose mode (onboarding's "Recipes from {shop}"): a radio in a group, the whole card the one control, no link and no heart. Chosen: lime with the dark
 *  green edge and a tick, and `tag` at the foot of its picture; not chosen: the empty tick ring in the same place, so nothing moves. */
export interface TileChoice {
  on: boolean;
  onChoose: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  tabIndex?: number;
  /** Shown on the picture when chosen ("Your first recipe"). */
  tag?: string;
  /** Read after the card's own words ("Double-tap to choose it as your first recipe."). */
  hint?: string;
}

/** `onUnsave` is told when the heart takes the recipe out of My recipes (My recipes offers an Undo for it). `onRemoveMine`, for a recipe Pip made (always kept):
 *  a remove button in the heart's place takes it out of My recipes (founder 2026-11-18: "They can remove it from the recipes in my meals later"). `choose`: see
 *  TileChoice. */
export function RecipeTile({ card, href, badge, wide = false, saveable = true, onOpen, onUnsave, onRemoveMine, choose }: { card: RecipeCard; href: string; badge?: string; wide?: boolean; saveable?: boolean; onOpen?: React.MouseEventHandler<HTMLAnchorElement>; onUnsave?: (id: string) => void; onRemoveMine?: (id: string) => void; choose?: TileChoice }) {
  const t = useT();
  const savedList = useStore(savedRecipesStore);
  const { recipe, totals } = card;
  // our recipe book is translated; what Pip wrote with AI is shown as it wrote it
  const rt = (s: string) => (recipe.ai ? s : t(s));
  const saved = recipe.ai ? true : savedList.some((s) => s.id === recipe.id);
  const canSave = !choose && saveable && (!recipe.ai || !!onRemoveMine); // Pip's recipes are kept as they're made: only My recipes offers taking one out
  const price = totals.costPerServing !== null ? formatPrice(totals.costPerServing) : null;
  const on = !!choose?.on;
  const bold = (text: string) => <span className={`font-semibold ${on ? "" : "text-foreground"}`}>{text}</span>;
  // protein, carbs and fat under the name (founder 2026-10-16: "Add the fats and carbs to each of the recipes also", then "calories where the red is ...
  // below the title the protein, fats and carbs"); the calories are the pill in the picture's corner. One grey strip of three cells, each a figure over
  // its word (at least 13 px since the audit of 20 November 2026), so every card in a two-column grid keeps one row of three; on a card narrower than about
  // 156 px (a 320 px phone) the three go one under the other, "52 g protein", rather than squeeze the words.
  const figure = wide ? "text-[0.9375rem] font-semibold leading-tight" : "text-[0.875rem] font-semibold leading-tight";
  const word = `text-[0.8125rem] leading-tight ${on ? "" : "text-muted"}`;
  const cell = "flex min-w-0 items-baseline justify-center gap-1 px-0.5 @[9.75rem]:flex-col @[9.75rem]:items-center @[9.75rem]:gap-0";
  const content = (
    <>
      <RecipeArt id={recipe.id} name={recipe.name} meal={recipe.meal} wide={wide} />
      <span className={`flex flex-1 flex-col ${wide ? "px-4 pb-4 pt-3.5" : "px-3 pb-3.5 pt-3"}`}>
        {badge && <span className="mb-1.5 inline-block self-start rounded-[0.375rem] bg-fill px-2 py-1 text-[0.8125rem] font-semibold leading-none text-muted">{badge}</span>}
        <span className={`line-clamp-3 leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] ${wide ? "text-lg font-extrabold" : "text-[0.9375rem] font-extrabold"}`}>{rt(recipe.name)}</span>
        {/* after the name in the markup, so a screen reader hears "name, calories, protein ...", but drawn over the picture's top-left corner (the card is the positioned parent) */}
        <span className={`app-numbers ${KCAL_PILL}`}>{formatInt(totals.perServing.kcal)}<span className="text-[0.75rem] font-semibold">kcal</span></span>
        {/* the literal space keeps each cell's text "52g protein" for screen readers and the browser tests; a flex column doesn't draw it */}
        <span className="app-numbers mt-2.5 grid grid-cols-1 divide-y divide-line rounded-xl bg-[var(--fill)] py-1.5 text-center text-foreground @[9.75rem]:grid-cols-3 @[9.75rem]:divide-x @[9.75rem]:divide-y-0">
          <span className={cell}><span className={figure}>{Math.round(totals.perServing.protein)}g</span>{" "}<span className={word}>{t("protein")}</span></span>
          <span className={cell}><span className={figure}>{Math.round(totals.perServing.carbs)}g</span>{" "}<span className={word}>{t("carbs")}</span></span>
          <span className={cell}><span className={figure}>{Math.round(totals.perServing.fat)}g</span>{" "}<span className={word}>{t("fat")}</span></span>
        </span>
        <span className={`app-numbers mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-2.5 text-[0.8125rem] ${on ? "" : "text-muted"}`}>
          <span>{price ? <>{bold(price)} {t("a serving")}</> : <Rich text={t("{price} to buy")} values={{ price: bold(formatPrice(totals.basket)) }} />}</span>
          <span aria-hidden>·</span>
          <span>{t("{n} min", { n: recipe.minutes })}</span>
        </span>
      </span>
    </>
  );
  return (
    // a container, so a card shown one to a row (large text) gets a lower picture instead of a tall block of colour
    <div className={`lift @container relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] ${on ? "border border-on-sun bg-sun text-on-sun shadow-[0_0_0_1px_var(--on-sun)]" : "glass"}`}>
      {choose ? (
        <button type="button" role="radio" aria-checked={on} tabIndex={choose.tabIndex} onClick={choose.onChoose} onKeyDown={choose.onKeyDown} className="flex flex-1 flex-col rounded-[1.25rem] text-start focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent">
          {content}
          {choose.hint && <span className="sr-only">{choose.hint}</span>}
        </button>
      ) : (
        <Link href={href} prefetch={false} onClick={onOpen} className="flex flex-1 flex-col rounded-[1.25rem] focus-visible:outline-offset-[-3px]">
          {content}
        </Link>
      )}
      {choose && (
        // the tick in the heart's corner: an empty ring until chosen
        <span aria-hidden className="pointer-events-none absolute end-1 top-1 grid h-11 w-11 place-items-center">
          <span className={`grid h-7 w-7 place-items-center rounded-full ${on ? "border-2 border-on-sun bg-sun text-on-sun" : "photo-chip"}`}>{on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}</span>
        </span>
      )}
      {choose && on && choose.tag && (
        <span aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 flex items-end p-2 ${wide ? "aspect-[16/10]" : "aspect-[4/3] @[14rem]:aspect-[2/1]"}`}>
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border-2 border-on-sun bg-sun px-2.5 py-1 text-[0.8125rem] font-bold leading-tight text-on-sun">
            <CheckIcon aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
            <span className="min-w-0">{choose.tag}</span>
          </span>
        </span>
      )}
      {canSave && (recipe.ai ? (
        // a recipe Pip made is kept as it's made: here it can only be taken out (My recipes offers Undo), so it's a remove button, never a heart that deletes
        <button type="button" aria-label={t("Remove from My recipes")} onClick={() => onRemoveMine?.(recipe.id)} className="group absolute end-1 top-1 grid h-11 w-11 place-items-center rounded-full text-ink transition active:scale-90">
          <span className="photo-chip grid h-9 w-9 place-items-center rounded-full transition-colors"><TrashIcon aria-hidden className="h-[18px] w-[18px]" /></span>
        </button>
      ) : (
        // a 36 px white circle in the picture's corner, inside a full 44 px tap area, clear of the plate in the middle
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? t("Saved to My recipes") : t("Save to My recipes")}
          onClick={() => {
            const was = saved;
            toggleSavedRecipe(recipe.id);
            if (was) onUnsave?.(recipe.id);
          }}
          className="group absolute end-1 top-1 grid h-11 w-11 place-items-center rounded-full text-ink transition active:scale-90"
        >
          {/* a photo chip with the edge; an ink heart, outline or filled. Its state is in the spoken name only ("Saved to My recipes"): no word on the picture */}
          <span className="photo-chip grid h-9 w-9 place-items-center rounded-full transition-colors"><HeartIcon aria-hidden filled={saved} className="h-[18px] w-[18px]" /></span>
        </button>
      ))}
    </div>
  );
}
