"use client";

import { useState } from "react";
import { addMonths, calendarBounds, dayParam, isFutureDay, loggedDayKeys, monthGrid, sameMonth, type YearMonth } from "@/lib/mm/day";
import { localeInfo } from "@/lib/mm/i18n";
import type { LogEntry } from "@/lib/mm/user-data";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { Sheet } from "./ui";
import { useLanguage, useT } from "../_lib/i18n";

// The calendar behind the button next to Home's date (founder 2026-10-16: "when the person clicks on that they can find any day and click on it and see their
// macros and what they ate on that day"). A month at a time, Monday first like the week strip on Home; back twelve months, forward only to this month. A small
// dot marks each day that has something logged, today is the lime circle, the days ahead are greyed and can't be tapped. Picking a day hands it to `onPick`,
// which opens that day's page. The month shown starts afresh (this month) each time the sheet opens.

const ARROW =
  "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:pointer-events-none disabled:text-muted";
const ARROW_FILL = "inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] group-disabled:bg-transparent";

function Month({ log, now, onPick }: { log: readonly LogEntry[]; now: Date; onPick: (day: Date) => void }) {
  const t = useT();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const [ym, setYm] = useState<YearMonth>({ year: now.getFullYear(), month: now.getMonth() });
  const { earliest, latest } = calendarBounds(now);
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
        <p aria-live="polite" className="min-w-0 flex-1 text-center text-lg font-[800] leading-snug tracking-[-0.01em]">{title}</p>
        <button type="button" className={ARROW} disabled={sameMonth(ym, latest)} aria-label={t("Next month")} onClick={() => setYm((v) => addMonths(v, 1))}>
          <span className={ARROW_FILL}><ChevronRightIcon className="h-5 w-5" /></span>
        </button>
      </div>

      <ul aria-hidden className="mt-3 grid grid-cols-7 text-center text-[0.6875rem] font-semibold uppercase text-muted">
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
          const look = today ? "bg-sun text-[var(--on-accent)]" : future ? "text-muted" : "text-foreground hover:bg-soft-strong";
          return (
            <li key={dayParam(d)} className="flex justify-center">
              <button
                type="button"
                disabled={future}
                aria-label={label}
                aria-current={today ? "date" : undefined}
                onClick={() => onPick(d)}
                className={`app-numbers relative inline-flex h-11 w-11 items-center justify-center rounded-full text-[0.9375rem] font-semibold transition active:scale-95 disabled:pointer-events-none ${look}`}
              >
                <span aria-hidden>{d.getDate()}</span>
                {has && !future && <span aria-hidden className={`absolute bottom-1.5 h-1 w-1 rounded-full ${today ? "bg-current" : "bg-[var(--bar)]"}`} />}
              </button>
            </li>
          );
        })}
      </ul>
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
