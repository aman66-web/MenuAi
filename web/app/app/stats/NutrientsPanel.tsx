"use client";

import { useMemo } from "react";
import { dayParam } from "@/lib/mm/day";
import { formatOptionalGrams, formatSalt } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { dayValue, NUTRIENT_KEYS, nutrientStats, type NutrientKey } from "@/lib/mm/stats";
import type { LogEntry } from "@/lib/mm/user-data";
import { useT } from "../_lib/i18n";
import { DayBars, NothingKey } from "./DayBars";
import { StatCard } from "./StatCard";

// The Nutrients tab (founder 2026-11-20, laid out like the founder's example screen): one card each for sugar, saturates, salt and fibre, with today
// (lib/mm/labelTotals.ts, as Home's labels page) and a day this week over the days logged before today on the left, a bar a day on the right. Only figures a
// label or menu printed (CLAUDE.md rule 1): where not every food gave one, it says how many did ("3 of 5 foods"); none at all reads "not published". No
// targets, reference intakes, colours or high/low words (rule 3). Sodium is never turned into salt.

const NAME: Record<NutrientKey, string> = { sugar: tk("Sugar"), saturatedFat: tk("Saturates"), salt: tk("Salt"), fiber: tk("Fibre") };

export function NutrientsPanel({ log, now, htmlLang }: { log: readonly LogEntry[]; now: Date; htmlLang: string }) {
  const t = useT();
  const today = dayParam(now);
  const stats = useMemo(() => nutrientStats(log, now), [log, today]); // eslint-disable-line react-hooks/exhaustive-deps -- `now` matters only by its day
  const show = (key: NutrientKey, n: number | undefined) => (key === "salt" ? formatSalt(n, t) : formatOptionalGrams(n, t));

  /** A figure; "–" when there were no foods at all; "not published" (smaller) when there were foods but none gave it. */
  const figure = (key: NutrientKey, n: number | undefined, foods: number, size: string) =>
    foods === 0 ? (
      <span className={`${size} font-[800] leading-none`}><span aria-hidden>–</span><span className="sr-only">{t("nothing logged yet")}</span></span>
    ) : n === undefined ? (
      <span className="text-[0.9375rem] italic leading-snug text-muted">{t("not published")}</span>
    ) : (
      <span className={`${size} font-[800] leading-none tracking-[-0.02em]`}>{show(key, n)}</span>
    );

  return (
    <div className="space-y-4">
      {NUTRIENT_KEYS.map((key) => {
        const s = stats.nutrients[key];
        const name = t(NAME[key]);
        return (
          <StatCard
            key={key}
            title={name}
            figure={
              <dl className="app-numbers space-y-3">
                <div className="flex flex-col-reverse justify-end gap-1">
                  <dt className="text-[0.9375rem] leading-snug text-muted">
                    {t("Today")}
                    {s.today.count > 0 && s.today.count < stats.todayEntries && <span className="block text-[0.8125rem]">{t("{k} of {n} foods", { k: s.today.count, n: stats.todayEntries })}</span>}
                  </dt>
                  <dd>{figure(key, s.today.total, stats.todayEntries, "text-[1.75rem]")}</dd>
                </div>
                <div className="flex flex-col-reverse justify-end gap-1">
                  <dt className="text-[0.9375rem] leading-snug text-muted">
                    {t("a day this week")}
                    {s.weekCount > 0 && s.weekCount < s.weekEntries && <span className="block text-[0.8125rem]">{t("{k} of {n} foods", { k: s.weekCount, n: s.weekEntries })}</span>}
                  </dt>
                  <dd>{figure(key, s.average ?? undefined, s.weekEntries, "text-[1.25rem]")}</dd>
                </div>
              </dl>
            }
            chart={
              <DayBars
                bars={stats.days.map((d) => ({ key: d.key, date: d.date, state: d.state, value: dayValue(d, key), nothing: d.state !== "future" && d.entries === 0 }))}
                top={s.scaleTop}
                color="bg-ink"
                htmlLang={htmlLang}
                listLabel={t("{name} each day", { name })}
                spoken={(b, day) => {
                  const d = stats.days.find((x) => x.key === b.key);
                  if (!d || d.entries === 0) return t("{day}: nothing logged", { day });
                  const value = b.value === null ? t("not published") : show(key, b.value);
                  return b.state === "today" ? t("{day} (today, so far): {figure}", { day, figure: value }) : t("{day}: {figure}", { day, figure: value });
                }}
              />
            }
          />
        );
      })}

      <div className="space-y-1 px-1 text-[0.875rem] leading-snug text-muted">
        {stats.days.some((d) => d.state !== "future" && d.entries === 0) && <NothingKey />}
        <p>{t("Averages are over the days you logged, not counting today.")}</p>
        <p>{t("Only foods whose label or menu gives these figures are counted.")}</p>
      </div>
    </div>
  );
}
