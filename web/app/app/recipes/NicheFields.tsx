"use client";

import type { CuisineId, OccasionId } from "@/lib/mm/recipeBook/niches";
import { parseCuisine, parseOccasion, type CuisineOption, type NicheCounts, type OccasionOption } from "@/lib/mm/recipeNiche";
import { useT } from "../_lib/i18n";
import { SelectField } from "../groceries/PageBits";

// "Cuisine" and "Occasion" on the Recipes screen (founder 2026-10-16: "a way to customise by niche, for example for Christmas, or like Chinese cuisine or
// Indian"): two full-width fields under the meal tiles, each the phone's own list. Every choice says how many recipes it would show with everything else
// that is on (meal, search, diet, allergies and the other field), and one that would show none is greyed out, so there is no dead end; the chosen one can
// always be undone. The chosen value is on the field's face, which gets a dark outline like a pressed tile, so it shows with More closed. The count is
// built in code ("Chinese · 7"), never a translated sentence.

const CHOSEN = "shadow-[inset_0_0_0_2px_var(--foreground)]";

export function NicheFields({
  cuisines, occasions, counts, cuisine, occasion, onCuisine, onOccasion,
}: {
  cuisines: readonly CuisineOption[];
  occasions: readonly OccasionOption[];
  /** Null until the recipes are loaded: the choices then show their names only and none is greyed out. */
  counts: NicheCounts | null;
  cuisine: CuisineId | null;
  occasion: OccasionId | null;
  onCuisine: (id: CuisineId | null) => void;
  onOccasion: (id: OccasionId | null) => void;
}) {
  const t = useT();
  if (cuisines.length === 0 && occasions.length === 0) return null;
  const text = (label: string, n: number | null) => (n === null ? t(label) : `${t(label)} · ${n}`);
  return (
    <div className="mt-3 grid gap-2.5">
      {cuisines.length > 0 && (
        <SelectField label={t("Cuisine")} value={cuisine ?? ""} className={cuisine ? CHOSEN : ""} onChange={(e) => onCuisine(parseCuisine(e.target.value, cuisines))}>
          <option value="">{t("Any cuisine")}</option>
          {cuisines.map((c) => {
            const n = counts ? (counts.cuisine.get(c.id) ?? 0) : null;
            return <option key={c.id} value={c.id} disabled={n === 0 && c.id !== cuisine}>{text(c.label, n)}</option>;
          })}
        </SelectField>
      )}
      {occasions.length > 0 && (
        <SelectField label={t("Occasion")} value={occasion ?? ""} className={occasion ? CHOSEN : ""} onChange={(e) => onOccasion(parseOccasion(e.target.value, occasions))}>
          <option value="">{t("Any occasion")}</option>
          {occasions.map((o) => {
            const n = counts ? (counts.occasion.get(o.id) ?? 0) : null;
            return <option key={o.id} value={o.id} disabled={n === 0 && o.id !== occasion}>{text(o.label, n)}</option>;
          })}
        </SelectField>
      )}
    </div>
  );
}
