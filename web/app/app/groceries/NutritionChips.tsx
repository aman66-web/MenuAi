"use client";

import { useT } from "../_lib/i18n";

const grams = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}g`;

/** The two numbers people scan a list for, as two small grey badges like the recipe cards (calories, then protein), with what they're per. Carbs and fat are on the
 *  product's own page. Screen readers get one plain sentence. */
export function NutritionChips({ kcal, protein, basis }: { kcal: number; protein: number; basis: string }) {
  const t = useT();
  return (
    <span className="app-numbers mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] leading-5">
      <span className="rounded-lg bg-[var(--fill)] px-1.5 py-0.5"><span className="font-bold">{Math.round(kcal)}</span> <span className="text-muted">kcal</span></span>
      <span className="rounded-lg bg-[var(--fill)] px-1.5 py-0.5"><span className="font-bold">{grams(protein)}</span> <span className="text-muted">{t("protein")}</span></span>
      <span className="text-muted">{basis}</span>
    </span>
  );
}
