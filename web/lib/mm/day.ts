// Days, for Home's date, the calendar and the day page (founder 2026-10-16: "Instead of Home have the date for example Nov 15, the month in short form ...
// they can find any day and click on it and see their macros and what they ate on that day"). Pure: no browser, no React. A day is a local calendar day;
// it travels in an address as YYYY-MM-DD (`/app/today?d=2026-10-14`).

const pad = (n: number) => String(n).padStart(2, "0");

/** Local midnight of `d`'s day. */
export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** A day as it is written in an address: 2026-10-14 (the local date, month 1 to 12). */
export const dayParam = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isFutureDay = (d: Date, now: Date): boolean => startOfDay(d).getTime() > startOfDay(now).getTime();

/** Where a day is shown: today is the plain page, any other day carries its date. */
export const dayHref = (d: Date, now: Date): string => (startOfDay(d).getTime() === startOfDay(now).getTime() ? "/app/today" : `/app/today?d=${dayParam(d)}`);

/** The day an address asks for: a real date that is not in the future, else today (a bad or edited address never breaks the page). Returns local midnight. */
export function parseDayParam(raw: string | null | undefined, now: Date): Date {
  const today = startOfDay(now);
  const m = typeof raw === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null;
  if (!m) return today;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(y, mo - 1, d);
  // new Date rolls 2026-02-30 over to March: only a date that comes back the same is a date
  if (day.getFullYear() !== y || day.getMonth() !== mo - 1 || day.getDate() !== d) return today;
  return day.getTime() > today.getTime() ? today : day;
}

/** The day one step before or after `d`, never after today. */
export function stepDay(d: Date, delta: number, now: Date): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
  const today = startOfDay(now);
  return next.getTime() > today.getTime() ? today : next;
}

/**
 * The short date on Home's title: "Oct 16" in English (month first, as the founder asked: "Nov 15"), and each other language's own short form
 * ("16 paź", "٢٠ أكتوبر"...) through the browser's own date formatting.
 */
export function shortDate(d: Date, htmlLang: string): string {
  const lang = /^en(-|$)/i.test(htmlLang) ? "en-US" : htmlLang;
  try {
    return new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  }
}

/** A month as weeks of seven cells, Monday first, `null` for the blanks before the 1st and after the last day. Month is 0 to 11. */
export function monthGrid(year: number, month: number): Array<Array<Date | null>> {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1))];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface YearMonth {
  year: number;
  /** 0 to 11 */
  month: number;
}

/** `ym` moved by whole months (negative = back). */
export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + ym.month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** How far the calendar goes: back this many months from the current one (the days ahead have nothing in them). */
export const CALENDAR_MONTHS_BACK = 12;

export function calendarBounds(now: Date): { earliest: YearMonth; latest: YearMonth } {
  const latest = { year: now.getFullYear(), month: now.getMonth() };
  return { earliest: addMonths(latest, -CALENDAR_MONTHS_BACK), latest };
}

export const sameMonth = (a: YearMonth, b: YearMonth): boolean => a.year === b.year && a.month === b.month;

/** The days that have something logged, as `dayParam` strings. */
export function loggedDayKeys(log: ReadonlyArray<{ loggedAt: string }>): Set<string> {
  const keys = new Set<string>();
  for (const e of log) {
    const t = Date.parse(e.loggedAt);
    if (Number.isFinite(t)) keys.add(dayParam(new Date(t)));
  }
  return keys;
}
