"use client";

import type { CuisineOption, OccasionOption } from "@/lib/mm/recipeNiche";
import { useT } from "../_lib/i18n";
import { CHIP, CHIP_ON, LABEL } from "../groceries/PageBits";

// "Cuisine" and "Occasion" on the Recipes screen (founder 2026-10-16: "a way to customise by niche, for example for Christmas, or like Chinese cuisine or
// Indian"). Founder 2026-11-18: side by side to save room ("could it be worth putting them side by side"), and any number of choices in each ("they can select
// more filters multiple as many as they want"), so each field is a button that opens the Filters sheet at its own choices, with what is chosen on its face
// ("Chinese, Indian": commas, not "and", because a recipe of either cuisine is shown). Two columns while two fit; one under the other with large text (the
// minimum width is in rem). A field with something chosen gets a dark outline like a pressed tile.

const CHOSEN = "shadow-[inset_0_0_0_2px_var(--foreground)]";

function Field({ label, value, chosen, onClick }: { label: string; value: string; chosen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={`glass relative block min-h-[3.75rem] w-full min-w-0 rounded-[1.25rem] pb-2 pe-9 ps-4 pt-[1.6rem] text-start transition-colors hover:bg-[color-mix(in_srgb,white_70%,var(--soft-strong))] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${chosen ? CHOSEN : ""}`}
    >
      <span className={`pointer-events-none absolute start-4 top-2.5 max-w-[calc(100%-3rem)] truncate ${LABEL}`}>{label}</span>
      <span className="block truncate text-base font-semibold leading-snug">{value}</span>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </button>
  );
}

export function NicheFields({
  cuisines, occasions, chosenCuisines, chosenOccasions, onOpen,
}: {
  cuisines: readonly CuisineOption[];
  occasions: readonly OccasionOption[];
  chosenCuisines: readonly string[];
  chosenOccasions: readonly string[];
  /** Opens the Filters sheet at that field's choices. */
  onOpen: (field: "cuisine" | "occasion") => void;
}) {
  const t = useT();
  if (cuisines.length === 0 && occasions.length === 0) return null;
  const names = (options: ReadonlyArray<{ id: string; label: string }>, chosen: readonly string[]) => options.filter((o) => chosen.includes(o.id)).map((o) => t(o.label)).join(", ");
  return (
    <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2.5">
      {cuisines.length > 0 && <Field label={t("Cuisine")} value={names(cuisines, chosenCuisines) || t("Any cuisine")} chosen={chosenCuisines.length > 0} onClick={() => onOpen("cuisine")} />}
      {occasions.length > 0 && <Field label={t("Occasion")} value={names(occasions, chosenOccasions) || t("Any occasion")} chosen={chosenOccasions.length > 0} onClick={() => onOpen("occasion")} />}
    </div>
  );
}

/** One choice in the Filters sheet: a pill that is dark when chosen. A count, when given, is built in code ("Chinese · 7"), never a translated sentence; a
 *  choice that would add nothing (0) is greyed out unless it is chosen, so it can always be undone. */
export function FilterChip({ label, count, pressed, onClick }: { label: string; count?: number | null; pressed: boolean; onClick: () => void }) {
  const off = count === 0 && !pressed;
  return (
    <button type="button" aria-pressed={pressed} disabled={off} onClick={onClick} className={`${pressed ? CHIP_ON : CHIP} px-4 disabled:cursor-not-allowed disabled:opacity-40`}>
      <span className="app-numbers">{count === undefined || count === null ? label : `${label} · ${count}`}</span>
    </button>
  );
}
