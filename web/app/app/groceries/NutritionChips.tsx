"use client";

import { useT } from "../_lib/i18n";

const grams = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}g`;

/** The two numbers people scan a list for, as two small pills (calories, then protein in the accent colour), with what they're per. Carbs and fat are on the
 *  product's own page. Screen readers get one plain sentence. */
export function NutritionChips({ kcal, protein, basis }: { kcal: number; protein: number; basis: string }) {
  const t = useT();
  return (
    <span className="app-numbers mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      <span className="rounded-full bg-soft px-2.5 py-0.5 font-bold">{Math.round(kcal)} kcal</span>
      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-bold text-accent">{grams(protein)} {t("protein")}</span>
      <span className="text-muted">{basis}</span>
    </span>
  );
}
