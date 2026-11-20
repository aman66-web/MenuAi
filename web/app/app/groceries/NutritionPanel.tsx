"use client";

import { useT } from "../_lib/i18n";

// A product's nutrition, set like Home's calories and macro rows (founder 2026-10-15, "the rest of the app should match that elegance"):
// the calories as one big figure with "kcal" beside it as a smaller unit (Home's "1,030 / 2,800 kcal") and what it is per in a quiet line under it, then
// protein, carbs and fat as the label's own table rows: the name, the grams in DM Mono in the body's ink, a line between rows (the published grams, nothing
// added or estimated: CLAUDE.md rule 1). The three small "share of the macros" bars are gone (colour meeting, 19 November 2026, approved by the founder that
// day): they looked like Home's progress bars, so people read them as progress towards a target. A screen reader gets the one plain sentence the screen passes
// in as `groupLabel`. Any further figures the label prints (energy in kJ, saturates, sugars, fibre, salt) follow as the same kind of row.

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1">
      <dt className="text-[0.9375rem] font-semibold leading-snug">{label}</dt>
      <dd className="whitespace-nowrap font-mono text-[0.9375rem] font-normal text-foreground">{value}</dd>
    </div>
  );
}

/** `showBasis={false}` when a heading right above already says what the figures are per (the screen reader still hears it in `groupLabel`). */
export function NutritionPanel({ kcal, protein, carbs, fat, basis, showBasis = true, groupLabel, rows }: { kcal: number; protein: number; carbs: number; fat: number; basis: string; showBasis?: boolean; groupLabel: string; rows: ReadonlyArray<readonly [string, string]> }) {
  const t = useT();
  return (
    <>
      <div role="group" aria-label={groupLabel} className="app-numbers">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[2.75rem] font-[800] leading-none tracking-[-0.03em] text-foreground">{Math.round(kcal)}</span>
          <span className="text-[1.0625rem] font-normal leading-none">kcal</span>
          {/* what the figures are per, in its own case: it carries units ("per 100 ml") that capitals would misprint */}
          {showBasis && <>{" "}<span className="mt-2 basis-full text-[0.8125rem] text-muted">{basis}</span></>}
        </p>
        <dl className="mt-5 divide-y divide-line border-y border-line">
          <Row label={t("Protein")} value={`${protein}g`} />
          <Row label={t("Carbs")} value={`${carbs}g`} />
          <Row label={t("Fat")} value={`${fat}g`} />
        </dl>
      </div>
      {rows.length > 0 && (
        <dl className="app-numbers divide-y divide-line border-b border-line">
          {rows.map(([label, value]) => <Row key={label} label={label} value={value} />)}
        </dl>
      )}
    </>
  );
}
