"use client";

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { MORE_DIET_KEYS, MORE_DIET_LABEL, moreDietsOn, type MoreDietKey } from "@/lib/mm/foodDiet";
import { filterCaution, toggleAllergen, toggleDiet, type DietKey } from "@/lib/mm/menu-view";
import { HALAL_CAUTION } from "@/lib/mm/halal";
import { tk, type T } from "@/lib/mm/i18n";
import type { AllergenKey, Preferences } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";
import { CheckIcon, ChevronRightIcon } from "./icons";

// Diet and allergy choices as big, plain buttons (onboarding, Settings and the restaurant page all use this one picker).
// More diets (founder 2026-11-20: "cater to every single diet"; the lead's call overnight, under the founder's delegation): Jain, No onion or garlic, Kosher
// style, No red meat, No alcohol and No halal or kosher meat sit behind one "More diets" button under the first six, so the everyday picker stays short. Someone
// with any of them on always sees them open. Recipes and the meal plan follow them (lib/mm/pantry.ts kindExcluded); restaurant menus and products can't be
// checked for them, and the line under the picker says so (lib/mm/menu-view.ts filterCaution, restaurantDietNote).
// The welcome screens' look (founder, 20 November 2026: "people understand images better than writing"): `pictures` makes each diet a big picture tile with
// one of our own recipes that fits it (app/app/welcome/dietPictures.ts; an illustration of our own recipe, CLAUDE.md rule 2, no visible caption), and `chips`
// makes the allergies big chips. Settings and the other screens keep the plain tiles.

export const DIETS: ReadonlyArray<{ key: DietKey; label: string }> = [
  { key: "vegetarianOnly", label: tk("Vegetarian") },
  { key: "veganOnly", label: tk("Vegan") },
  { key: "pescatarianOnly", label: tk("Pescatarian") },
  { key: "halalOnly", label: tk("Halal") },
  { key: "noPork", label: tk("No pork") },
  { key: "noBeef", label: tk("No beef") },
];

/** The six behind "More diets", in the picker's order. */
export const MORE_DIETS: ReadonlyArray<{ key: MoreDietKey; label: string }> = MORE_DIET_KEYS.map((key) => ({ key, label: MORE_DIET_LABEL[key] }));

/** The person's diet in a few words ("Vegetarian", "No milk"), from Settings. */
export function dietWords(t: T, p: Preferences): string[] {
  return [p.vegetarianOnly && t("Vegetarian"), p.veganOnly && t("Vegan"), p.pescatarianOnly && t("Pescatarian"), p.halalOnly && t("Halal"), p.noPork && t("No pork"), p.noBeef && t("No beef"), ...moreDietsOn(p).map((k) => t(MORE_DIET_LABEL[k])), ...(p.avoidAllergens ?? []).map((a) => t("No {allergen}", { allergen: t(ALLERGEN_SHORT[a]).toLowerCase() }))].filter((x): x is string => Boolean(x));
}

export const ALLERGEN_SHORT: Record<AllergenKey, string> = {
  gluten: tk("Gluten"), milk: tk("Milk"), eggs: tk("Eggs"), peanuts: tk("Peanuts"), nuts: tk("Tree nuts"), soya: tk("Soya"), fish: tk("Fish"),
  crustaceans: tk("Crustaceans"), molluscs: tk("Molluscs"), sesame: tk("Sesame"), mustard: tk("Mustard"), celery: tk("Celery"), lupin: tk("Lupin"), sulphites: tk("Sulphites"),
};
/**
 * A short second line on the choices whose names are hard (the onboarding meeting, 19 November: Lupin, Molluscs and Pescatarian were guessed at; the FSA's own
 * descriptions), shown inside the tile in DietPicker. Lower case: they continue the name.
 */
export const DIET_HINT: Partial<Record<DietKey, string>> = { pescatarianOnly: tk("fish, no meat"), kosherStyle: tk("We can't check kosher certification.") };
export const ALLERGEN_HINT: Partial<Record<AllergenKey, string>> = {
  crustaceans: tk("prawns, crab, lobster"),
  molluscs: tk("mussels, squid, oysters"),
  lupin: tk("a flour in some breads and pastries"),
  sulphites: tk("in wine and dried fruit"),
  celery: tk("and celeriac"),
};
export const ALLERGEN_ORDER: readonly AllergenKey[] = ["gluten", "milk", "eggs", "peanuts", "nuts", "soya", "fish", "crustaceans", "molluscs", "sesame", "mustard", "celery", "lupin", "sulphites"];

/**
 * The round mark at the end of a choice (colour meeting, 19 November 2026, approved by the founder that day): an empty ring in the grey of every control's edge,
 * or, chosen, a dark green ring with a dark green tick on the lime tile (the same mark as the shopping list and the plan's rows, so "chosen" looks the same
 * everywhere). `small` is the tiles' size, which leaves the words a little more room.
 */
export function PickMark({ on, small }: { on: boolean; small?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full ${small ? "h-[1.375rem] w-[1.375rem]" : "h-6 w-6"} ${on ? "border-2 border-on-sun bg-sun text-on-sun" : "border-[1.5px] border-edge bg-card"}`}>
      {on && <CheckIcon className={small ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={3} />}
    </span>
  );
}

/**
 * One choice as a tile (20 px corners, like Home's cards) with its words at the start and the mark at the end, in the one choice look: white with the 1.5 px
 * edge of every control you can tap (on the page, in a card or in a sheet alike); chosen, lime with the 2 px dark green edge, bold dark green words and the
 * tick (never dark: dark means "do this"). Pass `role`,
 * `aria-pressed` / `aria-checked` and the key handling for the group it sits in. Sizes are in rem so the words grow with the text size.
 */
export function PickTile({ on, tall, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; tall?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`flex min-w-0 items-center justify-between rounded-[1.25rem] text-start transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${tall ? "min-h-[4.5rem] gap-2.5 py-3 pe-3.5 ps-4" : "min-h-[3.25rem] gap-1.5 py-2.5 pe-3 ps-3.5"} border-[1.5px] ${on ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card text-foreground hover:bg-background"} ${className ?? ""}`}
      {...rest}
    >
      <span className="min-w-0 flex-1 hyphens-auto [overflow-wrap:break-word]">{children}</span>
      <PickMark on={on} small />
    </button>
  );
}

// Two tiles a row; one a row once the text is large enough that two would squeeze a word in half (the minimum is in rem, so it
// grows with the text size). The card's padding, the gaps and the tile's own padding are kept just tight enough that the longest
// single word of any language ("Wegetariańskie", about 103 px) still fits on one line in a tile on a 390 px phone.
const GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2";
const LABEL = "text-[0.9375rem] font-semibold leading-snug";

/**
 * A tile's words: the name, and under it its hint (if any) in the activity tiles' style. The tile's accessible name is its whole visible text, the name then the hint
 * (WCAG 2.5.3, label in name: a voice-control user says what they see), so a screen reader hears "Lupin, a flour in some breads and pastries".
 */
function TileWords({ id, on, label, hint }: { id: string; on: boolean; label: string; hint?: string }) {
  if (!hint) return <>{label}</>;
  return (
    <>
      <span id={`${id}-name`} className="block">{label}</span>
      <span id={`${id}-hint`} className={`mt-0.5 block text-sm font-normal leading-snug ${on ? "text-on-sun" : "text-muted"}`}>{hint}</span>
    </>
  );
}

/**
 * The 14 allergens as tiles, each on or off ("Allergies to avoid"). The caller owns what "on" means: Settings' choice, or a screen's own
 * filter. Pass the label the group is known by; the tiles are plain grey inside a white card, like every other choice. `hints`: the hard names get their
 * second line (DietPicker; the quick filters elsewhere stay one line).
 */
export function AllergenTiles({ chosen, onToggle, label, hints, chips, first, className = "" }: { chosen: readonly AllergenKey[]; onToggle: (k: AllergenKey) => void; label: string; hints?: boolean; chips?: boolean; first?: number; className?: string }) {
  const t = useT();
  const id = useId();
  // `first` (chips only): just the first few, the common ones, then "More" for the rest. A chosen one among the rest keeps them all shown (never hidden).
  const [all, setAll] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const showAll = !first || all || ALLERGEN_ORDER.slice(first).some((k) => chosen.includes(k));
  // after "More" the focus goes to the first chip it brought (the "More" chip is gone), so a screen reader or keyboard carries on from there
  useEffect(() => {
    if (!all || !opened.current || !first) return;
    opened.current = false;
    group.current?.querySelectorAll<HTMLButtonElement>("button")[first]?.focus();
  }, [all, first]);
  if (chips) {
    // big chips that wrap (the welcome screens): the name, and for a hard one its hint after it in a lighter line; the tick inside once chosen
    const chip = "inline-flex min-h-12 max-w-full items-center gap-2 rounded-[1.5rem] border-[1.5px] px-4 py-2 text-start text-[1.0625rem] leading-tight transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
    return (
      <div ref={group} role="group" aria-label={label} className={`flex flex-wrap gap-2.5 ${className}`}>
        {(showAll ? ALLERGEN_ORDER : ALLERGEN_ORDER.slice(0, first)).map((k) => {
          const on = chosen.includes(k);
          const hint = hints ? ALLERGEN_HINT[k] : undefined;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(k)}
              className={`${chip} ${on ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card font-semibold text-foreground hover:bg-background"}`}
            >
              {on && <CheckIcon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={3} />}
              <span className="min-w-0 [overflow-wrap:break-word]">
                {t(ALLERGEN_SHORT[k])}
                {hint && <span className={`block text-sm font-normal leading-snug ${on ? "text-on-sun" : "text-muted"}`}>{t(hint)}</span>}
              </span>
            </button>
          );
        })}
        {/* "More": a chip like the others, in the control's white, with the same chevron as "More diets"; the rest take its place */}
        {!showAll && (
          <button type="button" onClick={() => { opened.current = true; setAll(true); }} className={`${chip} border-edge bg-card font-semibold text-foreground hover:bg-background`}>
            {t("More")}
            <ChevronRightIcon aria-hidden className="-me-1 h-5 w-5 shrink-0 text-ink" />
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="group" aria-label={label} className={`${GRID} ${className}`}>
      {ALLERGEN_ORDER.map((k) => {
        const on = chosen.includes(k);
        const hint = hints ? ALLERGEN_HINT[k] : undefined;
        return (
          <PickTile key={k} on={on} aria-pressed={on} onClick={() => onToggle(k)} className={LABEL}>
            <TileWords id={`${id}-${k}`} on={on} label={t(ALLERGEN_SHORT[k])} hint={hint && t(hint)} />
          </PickTile>
        );
      })}
    </div>
  );
}

/**
 * `allergyCautionFirst` (onboarding): the allergy caution sits under "Allergies to avoid" from the start, read before anything is ticked and never under the
 * bottom button (the onboarding meeting, 19 November); the diet and halal cautions stay under the card. Elsewhere all of them show under the card once they apply.
 */
/** The welcome screen's allergy chips before "More": the first seven of ALLERGEN_ORDER (gluten, milk, eggs, peanuts, tree nuts, soya, fish), the common ones. */
export const COMMON_ALLERGENS = 7;
/** The picture tiles: two a row (one at the largest text sizes, as the minimum is in rem). */
const PICTURE_GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3";

/**
 * The short grey line under each picture tile's name (the founder's example of diet tiles, 20 November 2026: a bold name and a few grey words under it). Each
 * says only what the diet itself leaves out or keeps, true for our recipes' rules (lib/mm/pantry.ts kindExcluded); kosher style keeps its caution.
 */
export const PICTURE_LINE: Partial<Record<DietKey, string>> = {
  vegetarianOnly: tk("No meat or fish"),
  veganOnly: tk("No animal foods"),
  pescatarianOnly: tk("Fish, no meat"),
  halalOnly: tk("Halal meat, no alcohol"),
  noPork: tk("Other meat is fine"),
  noBeef: tk("Other meat is fine"),
  jain: tk("Vegetarian, no eggs or root veg"),
  noOnionGarlic: tk("In sauces too"),
  kosherStyle: DIET_HINT.kosherStyle,
  noRedMeat: tk("No beef, lamb or pork"),
  noAlcohol: tk("Not even in cooking"),
  noHalalKosherMeat: tk("Other meat is fine"),
};

/**
 * A diet as a big picture tile (the welcome screens), like the founder's example: one of our own recipes that fits it filling the top of the tile, the round
 * mark on the picture's corner, then the name in bold and its short grey line; chosen, the lime tile with the dark green edge, like every choice. The picture is
 * decorative, so a screen reader hears the diet and its line (all the words on the tile). A picture that can't load (offline in the iPhone app before it was
 * ever seen), or a diet with none, leaves the page fill in its place.
 */
function PictureTile({ on, src, label, hint, onClick }: { on: boolean; src: string | undefined; label: string; hint?: string; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-[1.25rem] text-start transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-2 border-on-sun bg-sun text-on-sun" : "border-[1.5px] border-edge bg-card text-foreground hover:bg-background"}`}
    >
      <span aria-hidden className="block aspect-[4/3] w-full bg-fill">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own recipe's illustration, a static file named by its hash */}
        {src && !failed && <img src={src} alt="" loading="lazy" decoding="async" width={400} height={300} onError={() => setFailed(true)} className="h-full w-full object-cover" />}
      </span>
      <span className="absolute end-2.5 top-2.5"><PickMark on={on} /></span>
      <span className="block w-full px-3.5 pb-3.5 pt-3">
        <span className="block hyphens-auto text-[1.125rem] font-bold leading-tight [overflow-wrap:break-word]">{label}</span>
        {hint && <span className={`mt-1 block text-[0.9375rem] leading-snug ${on ? "text-on-sun" : "text-muted"}`}>{hint}</span>}
      </span>
    </button>
  );
}

/**
 * `pictures` (the welcome screens): each diet's picture (its path, ready to load), which makes the diets big picture tiles straight on the page, under the
 * allergies, which then come first; `chips`: the allergies as big chips (with `pictures`, the common ones and "More"); `allergyCaution`: the words of the
 * allergy caution when it is shown first.
 */
export function DietPicker({ value, onChange, halal = true, allergies = true, allergyCautionFirst = false, pictures, chips = false, allergyCaution }: { value: Preferences; onChange: (p: Preferences) => void; halal?: boolean; allergies?: boolean; allergyCautionFirst?: boolean; pictures?: Partial<Record<DietKey, string>>; chips?: boolean; allergyCaution?: string }) {
  const t = useT();
  const id = useId();
  const avoid = value.avoidAllergens ?? [];
  const cautionUp = allergies && allergyCautionFirst;
  // with the allergy line already under its heading, only the diet part is said under the card
  const caution = filterCaution(cautionUp ? { ...value, avoidAllergens: [] } : value, t);
  // "More diets": open from the start (and never closable) while any of the six is on, so a chosen setting is never hidden
  const anyMore = moreDietsOn(value).length > 0;
  const [moreOpen, setMoreOpen] = useState(anyMore);
  const showMore = moreOpen || anyMore;
  const dietTile = (d: { key: DietKey; label: string }) => {
    const on = Boolean(value[d.key]);
    const hint = DIET_HINT[d.key];
    if (pictures) {
      const line = PICTURE_LINE[d.key];
      return <PictureTile key={d.key} on={on} src={pictures[d.key]} label={t(d.label)} hint={line && t(line)} onClick={() => onChange(toggleDiet(value, d.key))} />;
    }
    return (
      <PickTile key={d.key} on={on} aria-pressed={on} onClick={() => onChange(toggleDiet(value, d.key))} className={LABEL}>
        <TileWords id={`${id}-${d.key}`} on={on} label={t(d.label)} hint={hint && t(hint)} />
      </PickTile>
    );
  };
  const allergyChoices = (
    <AllergenTiles chosen={avoid} label={t("Allergies to avoid")} hints chips={chips} first={pictures && chips ? COMMON_ALLERGENS : undefined} onToggle={(k) => onChange(toggleAllergen(value, k))} />
  );
  // true for every restaurant (where one publishes no allergen guide, the dishes aren't all hidden: its page says they aren't checked; lib/mm/menu-view.ts)
  const allergyLine = (className: string) => cautionUp && <p className={`${className} text-[0.9375rem] leading-snug text-foreground`}>{allergyCaution ?? t("Allergy filters use each restaurant's own allergen guide. If you have an allergy, always check with the restaurant.")}</p>;
  const diets = (
    <>
      <div role="group" aria-label={t("Your diet")} className={pictures ? PICTURE_GRID : GRID}>
        {DIETS.filter((d) => halal || d.key !== "halalOnly").map(dietTile)}
      </div>
      {/* one plain button opens the other six (white with the control edge, an ink chevron that turns); with one of them on, their label instead */}
      {anyMore ? (
        <p className="mb-2 mt-4 px-1 text-[0.8125rem] font-semibold leading-snug text-muted">{t("More diets")}</p>
      ) : (
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls={`${id}-more`}
          onClick={() => setMoreOpen((v) => !v)}
          className={`${pictures ? "mt-3 min-h-12 text-[1.0625rem]" : "mt-2 min-h-11 text-[0.9375rem]"} flex w-full items-center justify-between gap-2 rounded-[1.25rem] border-[1.5px] border-edge bg-card py-2.5 pe-3 ps-3.5 text-start font-semibold leading-snug text-foreground transition hover:bg-background active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
        >
          {t("More diets")}
          <ChevronRightIcon aria-hidden className={`h-5 w-5 shrink-0 text-ink transition-transform ${showMore ? "rotate-90 rtl:-rotate-90" : ""}`} />
        </button>
      )}
      {showMore && (
        <div id={`${id}-more`} role="group" aria-label={t("More diets")} className={`${pictures ? PICTURE_GRID : GRID} ${anyMore ? "" : pictures ? "mt-3" : "mt-2"}`}>
          {MORE_DIETS.map(dietTile)}
        </div>
      )}
    </>
  );
  if (pictures) {
    // The welcome screen (the review of 20 November evening, a safety finding): the allergies come first, straight under the screen's heading, so they are in
    // the first view before "Nothing to avoid" can be tapped: the common ones as big chips, "More" for the rest of the 14, the caution under them; then the
    // diets' picture tiles.
    return (
      <div>
        {allergies && (
          <>
            <h2 className="mb-2.5 text-[1.125rem] font-bold leading-snug tracking-[-0.01em]">{t("Allergies")}</h2>
            {allergyChoices}
            {allergyLine("mt-3")}
          </>
        )}
        <h2 className={`${allergies ? "mt-7" : ""} mb-2.5 text-[1.125rem] font-bold leading-snug tracking-[-0.01em]`}>{t("Diet")}</h2>
        {diets}
        {(caution || value.halalOnly) && (
          <p className="mt-3.5 px-1 text-[0.9375rem] leading-snug text-foreground">{[caution, value.halalOnly ? t(HALAL_CAUTION) : null].filter(Boolean).join(" ")}</p>
        )}
      </div>
    );
  }
  return (
    <div>
      {/* One white card on the page (Settings, onboarding) holding both groups, with quiet grey tiles inside; in a sheet the card
          melts away (the sheet is the card) and the tiles sit straight on it. */}
      <div className="glass rounded-[1.25rem] p-3 [.sheet-panel_&]:bg-transparent [.sheet-panel_&]:p-0 [.sheet-panel_&]:shadow-none">
        {diets}
        {allergies && (
          <>
            <div aria-hidden className="mx-1 mb-4 mt-5 h-px bg-line" />
            <p className="mb-3 px-1 text-[0.8125rem] font-semibold leading-snug text-muted">{t("Allergies to avoid")}</p>
            {allergyLine("-mt-1 mb-3 px-1")}
            {allergyChoices}
          </>
        )}
      </div>
      {(caution || value.halalOnly) && (
        <p className="mt-3.5 px-1 text-[0.9375rem] leading-snug text-foreground">{[caution, value.halalOnly ? t(HALAL_CAUTION) : null].filter(Boolean).join(" ")}</p>
      )}
    </div>
  );
}
