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
// The chart can't be tapped: the circles above open each day. Colours (colour meeting, 19 November 2026): ink, lime for the figures and bars, white for what must be
// read and the light grey (on-ink-2) for captions; the empty marks and lines are the mid grey of the dial's track; day letters in sentence case, at least 13 px.
// The 30-person audit (20 November 2026): the bars have at least 72 px to grow in (they barely differed at 34 px), with 16 px above them so the highest figure
// never reaches the "Your target" caption; the chart sits 4 px in from the card's edges (Monday's letter touched it at 320); a day's figure is left off when it
// would sit on the target line (the screen-reader list still says it); the figures are in rem, so they follow the text size, and in the app's sans like the
// dial (the mono face's slashed zero read as Ø).

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
        <p className="mt-2 text-[0.9375rem] leading-snug text-on-ink">{t("Each day's calories show here once you log your meals.")}</p>
      ) : week.caloriesAverage !== null ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <p className="leading-tight">
              <span className="app-numbers block text-[1.25rem] text-sun">{formatInt(week.caloriesAverage)}</span>
              <span className="mt-0.5 block text-[0.8125rem] text-on-ink-2">{t("kcal a day")}</span>
            </p>
            <p className="leading-tight">
              {week.proteinAverage !== null ? (
                <span className="app-numbers block text-[1.25rem] text-sun">{formatGrams(week.proteinAverage)}</span>
              ) : (
                <span className="app-numbers block text-[1.25rem] text-sun"><span aria-hidden>–</span><span className="sr-only">{t("none yet")}</span></span>
              )}
              <span className="mt-0.5 block text-[0.8125rem] text-on-ink-2">{t("protein a day")}</span>
            </p>
          </div>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-on-ink-2">
            {week.countedDays === 1 ? t("From the 1 day you logged, not counting today.") : t("From the {n} days you logged, not counting today.", { n: week.countedDays })}
          </p>
        </>
      ) : monday ? (
        <div className="mt-2 leading-snug">
          <p className="text-[0.9375rem] text-on-ink">{t("A new week starts today.")}</p>
          {lastWeek !== null && <p className="app-numbers mt-0.5 text-[0.8125rem] text-on-ink-2">{t("Last week's average: {n} kcal a day", { n: formatInt(lastWeek) })}</p>}
        </div>
      ) : (
        <p className="mt-2 text-[0.9375rem] leading-snug text-on-ink">{t("No average yet: no meals from earlier this week on this device.")}</p>
      )}

      {!empty && (
        <p className="app-numbers mt-2 flex items-center justify-end gap-1.5 text-[0.8125rem] text-on-ink-2">
          <span aria-hidden className="inline-block w-4 border-t border-dashed border-on-ink-2" />
          {t("Your target: {n} kcal", { n: formatInt(target) })}
        </p>
      )}

      {/* the chart: drawn only (a screen reader gets the list below); nearly the card's full width, on the day circles' grid, 4 px in from its edges */}
      <div aria-hidden className="-mx-3 mt-1.5 flex flex-1 flex-col">
        {/* at least 72 px for the bars, and 16 px over them for the highest figure */}
        <div className="flex min-h-[5.5rem] flex-1 flex-col pt-4">
          <div className="relative grid flex-1 grid-cols-7 gap-2">
            {!empty && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-on-ink-2" style={{ bottom: pct(target) }} />}
            {week.days.map((d) => (
              <div key={d.key} className="relative">
                {d.entries > 0 ? (
                  <>
                    <div className="absolute bottom-0 left-1/2 w-[55%] -translate-x-1/2 rounded-t-[5px] bg-sun" style={{ height: `max(3px, ${pct(d.calories)})` }} />
                    {/* the figure over its bar, unless it would sit on the target line */}
                    {Math.abs(d.calories - target) >= week.scaleTop * 0.08 && (
                      <span className="app-numbers absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.6875rem] font-semibold leading-none text-on-ink-2 @max-[22rem]:text-[0.625rem]" style={{ bottom: `calc(max(3px, ${pct(d.calories)}) + 3px)` }}>{formatInt(d.calories)}</span>
                    )}
                  </>
                ) : d.state !== "future" ? (
                  <div className="absolute bottom-0 left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-ring-track" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-2 border-t border-ring-track pt-1.5 text-center text-[0.8125rem] font-semibold leading-none">
          {week.days.map((d) => (
            <span key={d.key} className="flex justify-center">
              <span className={d.state === "today" ? "rounded-full bg-sun px-1.5 py-0.5 font-bold text-on-sun" : d.state === "future" ? "py-0.5 text-on-ink-2" : "py-0.5 text-on-ink"}>{narrow.format(d.date)}</span>
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
        <div className="mt-2 space-y-0.5 text-[0.8125rem] leading-snug text-on-ink-2">
          {week.proteinGap && <p>{t("Some meals this week have no protein entered, so protein counts only the rest.")}</p>}
          {week.estimates && <p>{t("Includes estimates from your photos.")}</p>}
        </div>
      )}
    </div>
  );
}
