"use client";

import { useT } from "../_lib/i18n";
import { LABEL } from "./PageBits";

// A product's nutrition, set like Home's calories and macro rows (founder 2026-10-15, "the rest of the app should match that elegance"):
// the calories as one big figure in a regular weight with "kcal" beside it as a smaller unit (Home's "1,030 / 2,800 kcal") and what it is
// per in a quiet line under it, then protein, carbs and fat as rows with the label in small capitals, the grams in DM Mono and a thin
// bar. Each bar is that macro's share of the three by weight (the published grams, nothing added or estimated: CLAUDE.md rule 1); the
// figures are always written beside it, and a screen reader gets the one plain sentence the screen passes in as `groupLabel`. Any further
// figures the label prints (energy in kJ, saturates, sugars, fibre, salt) follow as the same kind of row without a bar.

function MacroRow({ label, value, fraction }: { label: string; value: number; fraction: number }) {
  return (
    <div>
      <p className="flex items-baseline justify-between gap-x-3 text-muted">
        <span className={LABEL}>{label}</span>
        <span className="app-numbers whitespace-nowrap font-mono text-[0.8125rem] font-normal">{value}g</span>
      </p>
      <div aria-hidden className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--ring-track)]">
        <div className="h-full rounded-full bg-[var(--bar)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
    </div>
  );
}

/** `showBasis={false}` when a heading right above already says what the figures are per (the screen reader still hears it in `groupLabel`). */
export function NutritionPanel({ kcal, protein, carbs, fat, basis, showBasis = true, groupLabel, rows }: { kcal: number; protein: number; carbs: number; fat: number; basis: string; showBasis?: boolean; groupLabel: string; rows: ReadonlyArray<readonly [string, string]> }) {
  const t = useT();
  const total = Math.max(protein + carbs + fat, 0.0001);
  return (
    <>
      <div role="group" aria-label={groupLabel} className="app-numbers">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[2.75rem] font-medium leading-none tracking-[-0.03em] text-accent">{Math.round(kcal)}</span>
          <span className="text-[1.0625rem] font-normal leading-none">kcal</span>
          {/* what the figures are per, in its own case: it carries units ("per 100 ml") that capitals would misprint */}
          {showBasis && <>{" "}<span className="mt-2 basis-full text-[0.8125rem] text-muted">{basis}</span></>}
        </p>
        <div className="mt-6 space-y-[1.15rem]">
          <MacroRow label={t("Protein")} value={protein} fraction={protein / total} />
          <MacroRow label={t("Carbs")} value={carbs} fraction={carbs / total} />
          <MacroRow label={t("Fat")} value={fat} fraction={fat / total} />
        </div>
      </div>
      {rows.length > 0 && (
        <dl className="app-numbers mt-6 divide-y divide-line border-t border-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex min-h-11 items-center justify-between gap-3 py-1">
              <dt className={LABEL}>{label}</dt>
              <dd className="whitespace-nowrap font-mono text-[0.8125rem] font-normal text-muted">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
