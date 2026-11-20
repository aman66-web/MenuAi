"use client";

import { macroShares } from "@/lib/mm/addFood";
import { nutrientsSpoken } from "@/lib/mm/format";
import type { Nutrients } from "@/lib/mm/types";
import { useT } from "../../_lib/i18n";

// What an amount of a product comes to, as a picture (founder 2026-11-20, scanning a barcode into the food diary: "people understand images better than writing"): a
// ring of its protein, carbs and fat in their own colours (green, blue, purple: labels only, never good or bad), the calories in the middle and each figure beside it
// with its dot. The ring is drawn from the grams themselves (nothing is worked out); with no protein, carbs or fat it is the plain track.

/** Grams as the screens show them: whole from 10 g, one decimal below, with a space ("1.4 g", "23 g"). */
export const grams = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} g`;

const R = 40;
const STROKE = 13;
const C = 2 * Math.PI * R;
/** The gap between two parts of the ring, so each colour reads as its own piece. */
const GAP = 1.6;

export function MacroRing({ nutrients }: { nutrients: Nutrients }) {
  const t = useT();
  const share = macroShares(nutrients);
  const parts = (["protein", "carbs", "fat"] as const).map((k) => ({ k, f: share[k] })).filter((p) => p.f > 0);
  const gap = parts.length > 1 ? GAP : 0;
  // where each part starts round the ring: after the ones before it
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((sum, p) => sum + p.f * C, 0));
  const rows: Array<{ k: "protein" | "carbs" | "fat"; label: string; value: number | undefined }> = [
    { k: "protein", label: t("Protein"), value: nutrients.protein },
    { k: "carbs", label: t("Carbs"), value: nutrients.carbs },
    { k: "fat", label: t("Fat"), value: nutrients.fat },
  ];
  return (
    <div className="app-numbers flex flex-wrap items-center gap-x-6 gap-y-4">
      {/* a screen reader hears the figures as one line, and again when the amount changes */}
      <p role="status" className="sr-only">{nutrientsSpoken(nutrients, t)}</p>
      <div aria-hidden className="relative h-[8.5rem] w-[8.5rem] shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" focusable="false">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth={STROKE} />
          {parts.map(({ k, f }, i) => {
            const len = Math.max(0.01, f * C - gap);
            return (
              <circle
                key={k}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={`var(--${k})`}
                strokeWidth={STROKE}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-starts[i]!}
                className="motion-safe:transition-[stroke-dasharray,stroke-dashoffset] motion-safe:duration-300"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <span>
            <span className="block text-[1.875rem] font-[800] leading-none tracking-[-0.03em]">{Math.round(nutrients.calories).toLocaleString("en-GB")}</span>
            <span className="mt-1 block text-[0.875rem] font-semibold text-muted">kcal</span>
          </span>
        </div>
      </div>
      <dl aria-hidden className="min-w-[8.5rem] flex-1 space-y-2.5">
        {rows.map(({ k, label, value }) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-2 text-base font-semibold"><span className={`dot bg-${k} h-3! w-3!`} />{label}</dt>
            <dd className="text-lg font-bold">{value === undefined ? "–" : grams(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
