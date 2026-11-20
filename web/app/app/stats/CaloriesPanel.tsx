"use client";

import { useMemo } from "react";
import { dayParam } from "@/lib/mm/day";
import { formatInt } from "@/lib/mm/format";
import { calorieStats, dayValue, weeklyCalories } from "@/lib/mm/stats";
import type { LogEntry } from "@/lib/mm/user-data";
import { lastWeekAverage } from "@/lib/mm/week";
import { useT } from "../_lib/i18n";
import { DayBars, TargetKey } from "./DayBars";
import { Figure, StatCard } from "./StatCard";

// The Calories tab (founder 2026-11-20, laid out like the founder's example screen): two cards, This week (the calories a day over the days logged before
// today, beside a bar a day against the dashed target line) and Last 4 weeks (the same over the four weeks, with a bar a week). The same figures and words as
// Home's week card (lib/mm/week.ts; tests/stats.test.ts checks they agree).

export function CaloriesPanel({ log, now, target, htmlLang }: { log: readonly LogEntry[]; now: Date; target: number; htmlLang: string }) {
  const t = useT();
  const today = dayParam(now);
  const week = useMemo(() => calorieStats(log, now, "week", target), [log, today, target]); // eslint-disable-line react-hooks/exhaustive-deps -- `now` matters only by its day
  const month = useMemo(() => calorieStats(log, now, "4weeks", target), [log, today, target]); // eslint-disable-line react-hooks/exhaustive-deps -- as above
  const lastWeek = useMemo(() => lastWeekAverage(log, now), [log, today]); // eslint-disable-line react-hooks/exhaustive-deps -- as above
  const weeks = useMemo(() => weeklyCalories(month.days), [month]);
  const monday = week.days[0]!.state === "today";
  const from = (n: number) => (n === 1 ? t("From the 1 day you logged, not counting today.") : t("From the {n} days you logged, not counting today.", { n }));
  const weeksTop = Math.max(target, ...weeks.map((w) => w.average ?? 0)) * 1.15;
  const nothing = <p className="text-[1.0625rem] font-semibold leading-snug">{t("Nothing logged before today.")}</p>;

  return (
    <div className="space-y-4">
      <StatCard
        title={t("This week")}
        figure={
          week.average !== null ? (
            <Figure value={formatInt(week.average)} caption={t("kcal a day")} />
          ) : monday ? (
            <div className="leading-snug">
              <p className="text-[1.0625rem] font-semibold">{t("A new week starts today.")}</p>
              {lastWeek !== null && <p className="app-numbers mt-1 text-[0.9375rem] text-muted">{t("Last week's average: {n} kcal a day", { n: formatInt(lastWeek) })}</p>}
            </div>
          ) : (
            nothing
          )
        }
        chart={
          <DayBars
            bars={week.days.map((d) => ({ key: d.key, date: d.date, state: d.state, value: d.entries > 0 ? dayValue(d, "calories") : null }))}
            top={week.scaleTop}
            target={target}
            color="bg-ink"
            htmlLang={htmlLang}
            listLabel={t("Calories each day")}
            spoken={(b, day) => (b.value === null ? t("{day}: nothing logged", { day }) : b.state === "today" ? t("{day} (today, so far): {n} kcal", { day, n: formatInt(b.value) }) : t("{day}: {n} kcal", { day, n: formatInt(b.value) }))}
          />
        }
        foot={
          <>
            <TargetKey>{t("Your target: {n} kcal", { n: formatInt(target) })}</TargetKey>
            {week.average !== null && <p>{from(week.countedDays)}</p>}
          </>
        }
      />

      <StatCard
        title={t("Last 4 weeks")}
        wide
        figure={month.average !== null ? <Figure value={formatInt(month.average)} caption={t("kcal a day")} /> : nothing}
        chart={
          <DayBars
            weeks
            bars={weeks.map((w) => ({ key: w.key, date: w.start, state: w.current ? "today" : "past", value: w.average }))}
            top={weeksTop}
            target={target}
            color="bg-ink"
            htmlLang={htmlLang}
            listLabel={t("Calories a day, each week")}
            spoken={(b, date) => (b.value === null ? t("Week of {date}: nothing logged", { date }) : t("Week of {date}: {n} kcal a day", { date, n: formatInt(b.value) }))}
          />
        }
        foot={month.average !== null ? <p>{from(month.countedDays)}</p> : undefined}
      />

      {month.estimates && <p className="px-1 text-[0.875rem] leading-snug text-muted">{t("Includes estimates from your photos.")}</p>}
    </div>
  );
}
