"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { filterCaution, toggleAllergen, toggleDiet, type DietKey } from "@/lib/mm/menu-view";
import { HALAL_CAUTION } from "@/lib/mm/halal";
import { tk, type T } from "@/lib/mm/i18n";
import type { AllergenKey, Preferences } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";
import { CheckIcon } from "./icons";

// Diet and allergy choices as big, plain buttons (onboarding, Settings and the restaurant page all use this one picker).

export const DIETS: ReadonlyArray<{ key: DietKey; label: string }> = [
  { key: "vegetarianOnly", label: tk("Vegetarian") },
  { key: "veganOnly", label: tk("Vegan") },
  { key: "pescatarianOnly", label: tk("Pescatarian") },
  { key: "halalOnly", label: tk("Halal") },
  { key: "noPork", label: tk("No pork") },
  { key: "noBeef", label: tk("No beef") },
];

/** The person's diet in a few words ("Vegetarian", "No milk"), from Settings. */
export function dietWords(t: T, p: Preferences): string[] {
  return [p.vegetarianOnly && t("Vegetarian"), p.veganOnly && t("Vegan"), p.pescatarianOnly && t("Pescatarian"), p.halalOnly && t("Halal"), p.noPork && t("No pork"), p.noBeef && t("No beef"), ...(p.avoidAllergens ?? []).map((a) => t("No {allergen}", { allergen: t(ALLERGEN_SHORT[a]).toLowerCase() }))].filter((x): x is string => Boolean(x));
}

export const ALLERGEN_SHORT: Record<AllergenKey, string> = {
  gluten: tk("Gluten"), milk: tk("Milk"), eggs: tk("Eggs"), peanuts: tk("Peanuts"), nuts: tk("Tree nuts"), soya: tk("Soya"), fish: tk("Fish"),
  crustaceans: tk("Crustaceans"), molluscs: tk("Molluscs"), sesame: tk("Sesame"), mustard: tk("Mustard"), celery: tk("Celery"), lupin: tk("Lupin"), sulphites: tk("Sulphites"),
};
/**
 * A short second line on the choices whose names are hard (the onboarding meeting, 19 November: Lupin, Molluscs and Pescatarian were guessed at; the FSA's own
 * descriptions), shown inside the tile in DietPicker. Lower case: they continue the name.
 */
export const DIET_HINT: Partial<Record<DietKey, string>> = { pescatarianOnly: tk("fish, no meat") };
export const ALLERGEN_HINT: Partial<Record<AllergenKey, string>> = {
  crustaceans: tk("prawns, crab, lobster"),
  molluscs: tk("mussels, squid, oysters"),
  lupin: tk("a flour in some breads and pastries"),
  sulphites: tk("in wine and dried fruit"),
  celery: tk("and celeriac"),
};
export const ALLERGEN_ORDER: readonly AllergenKey[] = ["gluten", "milk", "eggs", "peanuts", "nuts", "soya", "fish", "crustaceans", "molluscs", "sesame", "mustard", "celery", "lupin", "sulphites"];

/**
 * The round mark at the end of a choice: an outlined circle, or the lime circle with a tick once it is chosen (the same mark as
 * Settings' option lists and the shopping list, so "chosen" looks the same everywhere). `small` is the tiles' size, which leaves the
 * words a little more room.
 */
export function PickMark({ on, small }: { on: boolean; small?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full ${small ? "h-[1.375rem] w-[1.375rem]" : "h-6 w-6"} ${on ? "bg-sun text-on-accent" : "border-[1.5px] border-[color-mix(in_srgb,var(--foreground)_20%,transparent)]"}`}>
      {on && <CheckIcon className={small ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={3} />}
    </span>
  );
}

/**
 * One choice as a soft tile (20 px corners, like Home's cards) with its words at the start and the mark at the end; chosen, it turns
 * dark like a selected chip, with the lime tick. White on the grey page; inside a white card or a sheet it takes the light grey fill
 * with no shadow (globals.css and the Sheet do the fill), so it is always seen against what it sits on. Pass `role`,
 * `aria-pressed` / `aria-checked` and the key handling for the group it sits in. Sizes are in rem so the words grow with the text size.
 */
export function PickTile({ on, tall, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; tall?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`flex min-w-0 items-center justify-between rounded-[1.25rem] text-start transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${tall ? "min-h-[4.5rem] gap-2.5 py-3 pe-3.5 ps-4" : "min-h-[3.25rem] gap-1.5 py-2.5 pe-3 ps-3.5"} ${on ? "bg-foreground text-background" : "glass hover:bg-soft-strong [.sheet-panel_&]:shadow-none"} ${className ?? ""}`}
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
      <span id={`${id}-hint`} className={`mt-0.5 block text-sm font-normal leading-snug ${on ? "text-background/80" : "text-muted"}`}>{hint}</span>
    </>
  );
}

/**
 * The 14 allergens as tiles, each on or off ("Allergies to avoid"). The caller owns what "on" means: Settings' choice, or a screen's own
 * filter. Pass the label the group is known by; the tiles are plain grey inside a white card, like every other choice. `hints`: the hard names get their
 * second line (DietPicker; the quick filters elsewhere stay one line).
 */
export function AllergenTiles({ chosen, onToggle, label, hints, className = "" }: { chosen: readonly AllergenKey[]; onToggle: (k: AllergenKey) => void; label: string; hints?: boolean; className?: string }) {
  const t = useT();
  const id = useId();
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
export function DietPicker({ value, onChange, halal = true, allergies = true, allergyCautionFirst = false }: { value: Preferences; onChange: (p: Preferences) => void; halal?: boolean; allergies?: boolean; allergyCautionFirst?: boolean }) {
  const t = useT();
  const id = useId();
  const avoid = value.avoidAllergens ?? [];
  const cautionUp = allergies && allergyCautionFirst;
  // with the allergy line already under its heading, only the diet part is said under the card
  const caution = filterCaution(cautionUp ? { ...value, avoidAllergens: [] } : value, t);
  return (
    <div>
      {/* One white card on the page (Settings, onboarding) holding both groups, with quiet grey tiles inside; in a sheet the card
          melts away (the sheet is the card) and the tiles sit straight on it. */}
      <div className="glass rounded-[1.25rem] p-3 [.sheet-panel_&]:bg-transparent [.sheet-panel_&]:p-0 [.sheet-panel_&]:shadow-none">
        <div role="group" aria-label={t("Your diet")} className={GRID}>
          {DIETS.filter((d) => halal || d.key !== "halalOnly").map((d) => {
            const on = Boolean(value[d.key]);
            const hint = DIET_HINT[d.key];
            return (
              <PickTile key={d.key} on={on} aria-pressed={on} onClick={() => onChange(toggleDiet(value, d.key))} className={LABEL}>
                <TileWords id={`${id}-${d.key}`} on={on} label={t(d.label)} hint={hint && t(hint)} />
              </PickTile>
            );
          })}
        </div>
        {allergies && (
          <>
            <div aria-hidden className="mx-1 mb-4 mt-5 h-px bg-line" />
            <p className="mb-3 px-1 text-[0.6875rem] font-semibold uppercase leading-snug tracking-[0.12em] text-muted">{t("Allergies to avoid")}</p>
            {cautionUp && <p className="-mt-1 mb-3 px-1 text-[0.9375rem] leading-snug text-foreground">{t("Allergy filters use each restaurant's own allergen guide and hide dishes it doesn't cover. If you have an allergy, always check with the restaurant.")}</p>}
            <AllergenTiles chosen={avoid} label={t("Allergies to avoid")} hints onToggle={(k) => onChange(toggleAllergen(value, k))} />
          </>
        )}
      </div>
      {(caution || value.halalOnly) && (
        <p className="mt-3.5 px-1 text-[0.9375rem] leading-snug text-muted">{[caution, value.halalOnly ? t(HALAL_CAUTION) : null].filter(Boolean).join(" ")}</p>
      )}
    </div>
  );
}
