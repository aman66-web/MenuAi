"use client";

import { useMemo } from "react";
import { dayParam } from "@/lib/mm/day";
import { formatGrams, formatInt } from "@/lib/mm/format";
import { lastWeekAverage, weekSummary, type WeekEntry } from "@/lib/mm/week";
import { useT } from "../_lib/i18n";
import { DARK_CARD } from "./HomeToday";

// Home's second page, "Calories and protein this week" (founder 2026-11-19: "3 dots here showing that they can also swipe right to see different things like
// stats"; the 20-person meeting's conclusion). A bar for each day under the same Monday-to-Sunday as Home's day circles (the chart runs across the card's full
// width on the circles' own grid, so Tuesday's bar sits under Tuesday's circle), the target as a dashed line, and the calories and protein a day over the days
// logged before today. Only what was logged (CLAUDE.md rule 1): a day with nothing logged has a short dash, never a bar of 0; no red, no "over", no score (rule 3).
// The chart can't be tapped: the circles above open each day.

export function HomeWeek({ log, now, target, logPaid, htmlLang }: { log: readonly WeekEntry[]; now: Date; target: number; logPaid: boolean; htmlLang: string }) {
  const t = useT();
  const today = dayParam(now);
  // the log is kept for ever and Home redraws every minute: work the week out only when the log or the day changes
  const week = useMemo(() => weekSummary(log, now, target), [log, today, target]); // eslint-disable-line react-hooks/exhaustive-deps -- `now` matters only by its day
  const lastWeek = useMemo(() => lastWeekAverage(log, now), [log, today]); // eslint-disable-line react-hooks/exhaustive-deps -- as above
  const narrow = new Intl.DateTimeFormat(htmlLang, { weekday: "narrow" });
  const longDay = new Intl.DateTimeFormat(htmlLang, { weekday: "long", day: "numeric", month: "long" });
  const anyLogged = week.days.some((d) => d.entries > 0);
  // Where logging is paid (needsPaywall("log"), worked out on Home): someone who can't log and has nothing logged sees the empty frame and one plain sentence
  // (never sample bars); anything really logged shows. Where logging is free, an empty week is the ordinary chart with its dashes.
  const empty = logPaid && !anyLogged;
  const monday = week.days[0]!.state === "today";
  const pct = (n: number) => `${Math.min(100, (n / week.scaleTop) * 100)}%`;

  return (
    <div className={`${DARK_CARD} flex h-full min-w-0 flex-col px-4 pb-3 pt-4`}>
      <h2 className="text-[0.875rem] font-bold leading-snug">{t("Calories and protein this week")}</h2>

      {empty ? (
        <p className="mt-2 text-[0.9375rem] leading-snug text-white/80">{t("Each day's calories show here once you log your meals.")}</p>
      ) : week.caloriesAverage !== null ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <p className="leading-tight">
              <span className="app-numbers block text-[1.25rem] text-[var(--sun)]">{formatInt(week.caloriesAverage)}</span>
              <span className="mt-0.5 block text-[0.8125rem] text-white/80">{t("kcal a day")}</span>
            </p>
            <p className="leading-tight">
              {week.proteinAverage !== null ? (
                <span className="app-numbers block text-[1.25rem] text-[var(--sun)]">{formatGrams(week.proteinAverage)}</span>
              ) : (
                <span className="app-numbers block text-[1.25rem] text-[var(--sun)]"><span aria-hidden>–</span><span className="sr-only">{t("none yet")}</span></span>
              )}
              <span className="mt-0.5 block text-[0.8125rem] text-white/80">{t("protein a day")}</span>
            </p>
          </div>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-white/70">
            {week.countedDays === 1 ? t("From the 1 day you logged, not counting today.") : t("From the {n} days you logged, not counting today.", { n: week.countedDays })}
          </p>
        </>
      ) : monday ? (
        <div className="mt-2 leading-snug">
          <p className="text-[0.9375rem] text-white/85">{t("A new week starts today.")}</p>
          {lastWeek !== null && <p className="app-numbers mt-0.5 text-[0.8125rem] text-white/70">{t("Last week's average: {n} kcal a day", { n: formatInt(lastWeek) })}</p>}
        </div>
      ) : (
        <p className="mt-2 text-[0.9375rem] leading-snug text-white/85">{t("No average yet: no meals from earlier this week on this device.")}</p>
      )}

      {!empty && (
        <p className="app-numbers mt-2 flex items-center justify-end gap-1.5 font-mono text-[0.75rem] text-white/75">
          <span aria-hidden className="inline-block w-4 border-t border-dashed border-white/60" />
          {t("Your target: {n} kcal", { n: formatInt(target) })}
        </p>
      )}

      {/* the chart: drawn only (a screen reader gets the list below); the full card width, on the day circles' grid */}
      <div aria-hidden className="-mx-4 mt-1.5 flex min-h-16 flex-1 flex-col">
        <div className="relative grid flex-1 grid-cols-7 gap-2">
          {!empty && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/40" style={{ bottom: pct(target) }} />}
          {week.days.map((d) => (
            <div key={d.key} className="relative">
              {d.entries > 0 ? (
                <>
                  <div className="absolute bottom-0 left-1/2 w-[55%] -translate-x-1/2 rounded-t-[5px] bg-[var(--sun)]" style={{ height: `max(3px, ${pct(d.calories)})` }} />
                  <span className="app-numbers absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] leading-none text-white/75 @max-[22rem]:text-[10px]" style={{ bottom: `calc(max(3px, ${pct(d.calories)}) + 3px)` }}>{formatInt(d.calories)}</span>
                </>
              ) : d.state !== "future" ? (
                <div className="absolute bottom-0 left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-white/25" />
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-2 border-t border-white/10 pt-1.5 text-center text-[11px] font-semibold uppercase leading-none">
          {week.days.map((d) => (
            <span key={d.key} className="flex justify-center">
              <span className={d.state === "today" ? "rounded-full bg-[var(--sun)] px-1.5 py-0.5 text-[#052e16]" : d.state === "future" ? "py-0.5 text-white/30" : "py-0.5 text-white/60"}>{narrow.format(d.date)}</span>
            </span>
          ))}
        </div>
      </div>
      <ol className="sr-only" aria-label={t("Calories each day")}>
        {week.days.filter((d) => d.state !== "future").map((d) => {
          const day = longDay.format(d.date);
          return (
            <li key={d.key}>
              {d.entries === 0 ? t("{day}: nothing logged", { day }) : d.state === "today" ? t("{day} (today, so far): {n} kcal", { day, n: formatInt(d.calories) }) : t("{day}: {n} kcal", { day, n: formatInt(d.calories) })}
            </li>
          );
        })}
      </ol>

      {!empty && (week.proteinGap || week.estimates) && (
        <div className="mt-2 space-y-0.5 text-[0.8125rem] leading-snug text-white/70">
          {week.proteinGap && <p>{t("Some meals this week have no protein entered, so protein counts only the rest.")}</p>}
          {week.estimates && <p>{t("Includes estimates from your photos.")}</p>}
        </div>
      )}
    </div>
  );
}
