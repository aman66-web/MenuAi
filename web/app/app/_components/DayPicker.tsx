"use client";

import { useState } from "react";
import { addMonths, calendarBounds, calendarYears, dayParam, isFutureDay, loggedDayKeys, monthGrid, monthInBounds, sameMonth, type YearMonth } from "@/lib/mm/day";
import { localeInfo } from "@/lib/mm/i18n";
import type { LogEntry } from "@/lib/mm/user-data";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { Sheet } from "./ui";
import { useLanguage, useT } from "../_lib/i18n";

// The calendar behind the button next to Home's date (founder 2026-10-16: "when the person clicks on that they can find any day and click on it and see their
// macros and what they ate on that day"). A month at a time, Monday first like the week strip on Home; back twelve months, forward only to this month. A small
// dot marks each day that has something logged, today is the lime circle, the days ahead are greyed and can't be tapped. Picking a day hands it to `onPick`,
// which opens that day's page. The month shown starts afresh (this month) each time the sheet opens.
// The days look as they do on Home's week strip (colour meeting, 19 November 2026, approved by the founder that day: the same thing looks the same on every
// screen): today lime with the 2 px dark-green edge, a dark-green figure and its dot; every day gone by white with the 1.5 px control edge, with a small ink dot
// when food was logged; the days ahead plain in the secondary grey. The month arrows are white with the edge; at the first or last month they can't be pressed
// and take the line fill (never faded). Weekday letters in sentence case, at least 13 px.
// The month's name is itself a button (founder 2026-11-20: "There should also be a way to choose the year too"): it opens the year, with arrows, and its
// twelve months; a month outside the calendar can't be pressed. The calendar reaches back twelve months, or to the oldest food logged when that is older.

const ARROW =
  "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition active:scale-95 disabled:pointer-events-none disabled:text-muted";
const ARROW_FILL = "inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-edge bg-card transition-colors group-hover:bg-background group-disabled:border-transparent group-disabled:bg-soft-strong";

function Month({ log, now, onPick }: { log: readonly LogEntry[]; now: Date; onPick: (day: Date) => void }) {
  const t = useT();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const [ym, setYm] = useState<YearMonth>({ year: now.getFullYear(), month: now.getMonth() });
  const [choosing, setChoosing] = useState(false);
  const oldest = log.reduce<Date | null>((o, e) => { const d = new Date(e.loggedAt); return Number.isNaN(d.getTime()) || (o && o <= d) ? o : d; }, null);
  const bounds = calendarBounds(now, oldest);
  const { earliest, latest } = bounds;
  const years = calendarYears(bounds);
  const monthName = new Intl.DateTimeFormat(htmlLang, { month: "short" });
  // a year change keeps the month inside the calendar (the oldest month logged, this month)
  const keepIn = (v: YearMonth): YearMonth => (monthInBounds(v, bounds) ? v : v.year * 12 + v.month < earliest.year * 12 + earliest.month ? earliest : latest);
  const logged = loggedDayKeys(log);
  const title = new Intl.DateTimeFormat(htmlLang, { month: "long", year: "numeric" }).format(new Date(ym.year, ym.month, 1));
  const narrow = new Intl.DateTimeFormat(htmlLang, { weekday: "narrow" });
  const longDay = new Intl.DateTimeFormat(htmlLang, { weekday: "long", day: "numeric", month: "long" });
  const monday = new Date(2024, 0, 1); // a Monday: the seven column headings, in the language's own letters
  const heads = Array.from({ length: 7 }, (_, i) => narrow.format(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  const cells = monthGrid(ym.year, ym.month).flat();

  return (
    <div className="pb-2 pt-1">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={ARROW} disabled={sameMonth(ym, earliest)} aria-label={t("Previous month")} onClick={() => setYm((v) => addMonths(v, -1))}>
          <span className={ARROW_FILL}><ChevronLeftIcon className="h-5 w-5" /></span>
        </button>
        <button type="button" aria-expanded={choosing} aria-live="polite" onClick={() => setChoosing((c) => !c)} className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full text-center text-lg font-[800] leading-snug tracking-[-0.01em] transition active:scale-[0.98]">
          <span className="sr-only">{t("Choose the month and year")}: </span><span>{title}</span>
          <ChevronRightIcon aria-hidden strokeWidth={2.4} className={`h-5 w-5 shrink-0 text-ink transition-transform ${choosing ? "-rotate-90" : "rotate-90"}`} />
        </button>
        <button type="button" className={ARROW} disabled={sameMonth(ym, latest)} aria-label={t("Next month")} onClick={() => setYm((v) => addMonths(v, 1))}>
          <span className={ARROW_FILL}><ChevronRightIcon className="h-5 w-5" /></span>
        </button>
      </div>

      {choosing && (
        <div className="mt-3">
          {/* the year, with arrows, then its twelve months */}
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={ARROW} disabled={ym.year <= years[0]!} aria-label={t("Previous year")} onClick={() => setYm((v) => keepIn({ year: v.year - 1, month: v.month }))}>
              <span className={ARROW_FILL}><ChevronLeftIcon className="h-5 w-5" /></span>
            </button>
            <p className="app-numbers text-lg font-[800]">{ym.year}</p>
            <button type="button" className={ARROW} disabled={ym.year >= latest.year} aria-label={t("Next year")} onClick={() => setYm((v) => keepIn({ year: v.year + 1, month: v.month }))}>
              <span className={ARROW_FILL}><ChevronRightIcon className="h-5 w-5" /></span>
            </button>
          </div>
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, m) => {
              const here = { year: ym.year, month: m };
              const on = sameMonth(here, ym);
              const allowed = monthInBounds(here, bounds);
              return (
                <li key={m}>
                  <button
                    type="button"
                    disabled={!allowed}
                    aria-pressed={on}
                    onClick={() => { setYm(here); setChoosing(false); }}
                    className={`min-h-11 w-full rounded-full text-[0.9375rem] font-semibold transition active:scale-95 disabled:pointer-events-none disabled:text-muted ${on ? "border-2 border-on-sun bg-sun font-bold text-on-sun" : allowed ? "border-[1.5px] border-edge bg-card hover:bg-background" : "bg-soft-strong"}`}
                  >
                    {monthName.format(new Date(ym.year, m, 1))}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!choosing && <>
      <ul aria-hidden className="mt-3 grid grid-cols-7 text-center text-[0.8125rem] font-semibold text-muted">
        {heads.map((h, i) => <li key={i}>{h}</li>)}
      </ul>

      <ul className="mt-1.5 grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <li key={`blank-${i}`} aria-hidden />;
          const name = longDay.format(d);
          const today = dayParam(d) === dayParam(now);
          const future = isFutureDay(d, now);
          const has = logged.has(dayParam(d));
          const label = future ? name : today ? t("{day} (today)", { day: name }) : has ? t("{day}: food logged", { day: name }) : t("{day}: nothing logged", { day: name });
          const look = today ? "border-2 border-on-sun bg-sun font-bold text-on-sun" : future ? "font-semibold text-muted" : "border-[1.5px] border-edge bg-card font-semibold text-foreground group-hover:bg-background";
          return (
            <li key={dayParam(d)} className="flex justify-center">
              <button
                type="button"
                disabled={future}
                aria-label={label}
                aria-current={today ? "date" : undefined}
                onClick={() => onPick(d)}
                className="group app-numbers inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 disabled:pointer-events-none"
              >
                {/* a 38 px circle inside the 44 px target, so neighbouring days keep a gap between their edges */}
                <span aria-hidden className={`relative inline-flex h-[2.375rem] w-[2.375rem] items-center justify-center rounded-full text-[0.9375rem] transition-colors ${look}`}>
                  {d.getDate()}
                  {(today || (has && !future)) && <span className={`absolute bottom-[3px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full ${today ? "bg-on-sun" : "bg-ink"}`} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      </>}
    </div>
  );
}

/** `onPick` gets the chosen day (local midnight); the caller closes the sheet and opens the day. */
export function DayPicker({ open, onClose, log, now, onPick }: { open: boolean; onClose: () => void; log: readonly LogEntry[]; now: Date; onPick: (day: Date) => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Choose a day")}>
      <Month log={log} now={now} onPick={onPick} />
    </Sheet>
  );
}
