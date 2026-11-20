"use client";

import { useMemo } from "react";
import { dayParam } from "@/lib/mm/day";
import { formatGrams } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { dayValue, MACRO_KEYS, macroStats, type MacroKey } from "@/lib/mm/stats";
import type { LogEntry } from "@/lib/mm/user-data";
import { Card } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { DayBars, Keys, NothingKey, TargetKey } from "./DayBars";
import { MacroRing } from "./MacroRing";
import { Figure, StatCard } from "./StatCard";

// The Macros tab (founder 2026-11-20, laid out like the founder's example screen): this week's split of protein, carbs and fat as a ring with each one's share
// of the calories and its grams beside it (protein and carbs 4 kcal a gram, fat 9: the meal plan's High protein measures the same way), then one card each, with the grams a day over the days logged before today beside a bar a day
// against its target. Protein, carbs and fat keep their green, blue and purple dots and bars (labels only, never good or bad), always in that order.

const NAME: Record<MacroKey, string> = { protein: tk("Protein"), carbs: tk("Carbs"), fat: tk("Fat") };
const DOT: Record<MacroKey, string> = { protein: "bg-protein", carbs: "bg-carbs", fat: "bg-fat" };

export function MacrosPanel({ log, now, targets, htmlLang }: { log: readonly LogEntry[]; now: Date; targets: Record<MacroKey, number>; htmlLang: string }) {
  const t = useT();
  const today = dayParam(now);
  const stats = useMemo(() => macroStats(log, now, targets), [log, today, targets.protein, targets.carbs, targets.fat]); // eslint-disable-line react-hooks/exhaustive-deps -- `now` matters only by its day
  const split = stats.split;
  const nothingDays = stats.days.some((d) => d.state !== "future" && d.entries === 0);

  return (
    <div className="space-y-4">
      <Card className="px-4 pb-4 pt-4">
        <section aria-label={t("This week")}>
          <h2 className="text-[1.375rem] font-bold leading-tight">{t("This week")}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-4">
            <MacroRing shares={split?.shares ?? null} size={7}>
              {split ? (
                <>
                  <span className="app-numbers text-[1.5rem] font-[800] leading-none tracking-[-0.02em]">{split.shares.protein}%</span>
                  <span className="mt-1 text-[0.8125rem] font-semibold leading-none text-muted">{t("protein")}</span>
                </>
              ) : (
                <span className="text-[1.5rem] font-[800] leading-none text-muted">–</span>
              )}
            </MacroRing>
            {split ? (
              <dl className="min-w-[min(100%,9.5rem)] flex-1 space-y-2.5">
                {MACRO_KEYS.map((k) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="flex items-center gap-2 text-base font-semibold"><span aria-hidden className={`dot ${DOT[k]}`} />{t(NAME[k])}</dt>
                    <dd className="app-numbers text-base">
                      <span className="font-bold">{split.shares[k]}%</span>
                      <span className="ms-2 inline-block min-w-[3.75rem] text-end text-muted">{formatGrams(split.grams[k])}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="min-w-[min(100%,9.5rem)] flex-1 text-[1.0625rem] font-semibold leading-snug">{t("Nothing logged yet this week.")}</p>
            )}
          </div>
          {split && <p className="mt-3.5 text-[0.875rem] leading-snug text-muted">{t("Share of calories.")}</p>}
        </section>
      </Card>

      {MACRO_KEYS.map((k) => {
        const m = stats.macros[k];
        const name = t(NAME[k]);
        return (
          <StatCard
            key={k}
            title={name}
            dot={DOT[k]}
            figure={
              <Figure
                value={m.average !== null ? formatGrams(m.average) : <><span aria-hidden>–</span><span className="sr-only">{t("none yet")}</span></>}
                caption={<span className="app-numbers">/ {formatGrams(targets[k])} {t("a day")}</span>}
              />
            }
            chart={
              <DayBars
                bars={stats.days.map((d) => ({ key: d.key, date: d.date, state: d.state, value: dayValue(d, k), nothing: d.state !== "future" && d.entries === 0 }))}
                top={m.scaleTop}
                target={targets[k]}
                color={DOT[k]}
                htmlLang={htmlLang}
                listLabel={t("{name} each day", { name })}
                spoken={(b, day) => {
                  const d = stats.days.find((x) => x.key === b.key);
                  if (!d || d.entries === 0) return t("{day}: nothing logged", { day });
                  const figure = b.value === null ? t("not published") : formatGrams(b.value);
                  return b.state === "today" ? t("{day} (today, so far): {figure}", { day, figure }) : t("{day}: {figure}", { day, figure });
                }}
              />
            }
          />
        );
      })}

      <div className="space-y-1 px-1 text-[0.875rem] leading-snug text-muted">
        <Keys>
          <TargetKey>{t("Your target")}</TargetKey>
          {nothingDays && <NothingKey />}
        </Keys>
        <p>{t("Averages are over the days you logged, not counting today.")}</p>
        {stats.gap && <p>{t("Some foods don't give protein, carbs or fat, so these count only the foods that do.")}</p>}
        {stats.estimates && <p>{t("Includes estimates from your photos.")}</p>}
      </div>
    </div>
  );
}
