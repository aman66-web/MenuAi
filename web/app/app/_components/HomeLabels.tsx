"use client";

import { useMemo } from "react";
import { dayParam } from "@/lib/mm/day";
import { formatOptionalGrams, formatSalt } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { LABEL_KEYS, todayLabelTotals, type LabelKey } from "@/lib/mm/labelTotals";
import type { LogEntry } from "@/lib/mm/user-data";
import { useT } from "../_lib/i18n";
import { DARK_CARD } from "./HomeToday";

// Home's third page, "Today: sugar, salt and fibre" (the 20-person meeting, 2026-11-19): figures the app already keeps on each logged food but never added up.
// Only what a label or menu printed (CLAUDE.md rule 1): a food without the figure is left out, and the row says how many gave it; none at all reads "not
// published". No targets, reference intakes, bars, colours or high/low words (rule 3). The same formatting as the item pages, so Home and they agree.

const NAME: Record<LabelKey, string> = { sugar: tk("Sugar"), salt: tk("Salt"), fiber: tk("Fibre") };

export function HomeLabels({ log, now, pro }: { log: readonly LogEntry[]; now: Date; pro: boolean }) {
  const t = useT();
  const today = dayParam(now);
  const totals = useMemo(() => todayLabelTotals(log, now), [log, today]); // eslint-disable-line react-hooks/exhaustive-deps -- `now` matters only by its day
  const nothing = totals.entries === 0;
  return (
    <div className={`${DARK_CARD} flex h-full min-w-0 flex-col px-4 pb-3.5 pt-4`}>
      <h2 className="text-[0.875rem] font-bold leading-snug">{t("Today: sugar, salt and fibre")}</h2>
      <dl className="mt-1 flex flex-1 flex-col justify-evenly">
        {LABEL_KEYS.map((key, i) => {
          const row = totals[key];
          const figure = row.count === 0 ? undefined : row.total;
          return (
            <div key={key} className={`flex flex-wrap items-baseline justify-between gap-x-3 py-2 ${i > 0 ? "border-t border-white/10" : ""}`}>
              <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-white/75">{t(NAME[key])}</dt>
              <dd className="text-end">
                {nothing ? (
                  <span className="app-numbers font-mono text-[0.9375rem]"><span aria-hidden>–</span><span className="sr-only">{t("nothing logged yet")}</span></span>
                ) : (
                  <span className="app-numbers font-mono text-[0.9375rem]">{key === "salt" ? formatSalt(figure, t) : formatOptionalGrams(figure, t)}</span>
                )}
                {!nothing && row.count > 0 && row.count < totals.entries && (
                  <span className="block text-[0.8125rem] leading-snug text-white/60">{t("from {k} of your {n} foods", { k: row.count, n: totals.entries })}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {nothing && <p className="text-[0.9375rem] leading-snug text-white/85">{pro ? t("Nothing logged yet today.") : t("Your sugar, salt and fibre show here once you log your meals.")}</p>}
      <p className="mt-1 text-[0.8125rem] leading-snug text-white/70">{t("Only foods whose label or menu gives these figures are counted.")}</p>
    </div>
  );
}
