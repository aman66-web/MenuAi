import { format, tk } from "./i18n";

// Reminders (founder 2026-10-16, on Home: "a section here for reminders, some people are GLP-1 and some people need to know when to have their
// medication, the app will send reminders to them when to have"). A reminder is THE PERSON'S OWN: they type its name and note, choose when, and
// the iPhone app rings at those times. Numbite never suggests a medicine, a dose, a day or a time, has no drug names in it, never says a reminder
// was "missed" or "late", and keeps no streaks, scores or history (CLAUDE.md rule 3). The reminders stay on the device: not synced, never sent
// anywhere (rule 4). Pure: no browser, no React, no Next.js. Everything here works on the phone's LOCAL calendar and clock.
//
// ---- How times are counted (read this before changing anything)
//   * A reminder's time is a WALL-CLOCK time ("08:00" means 08:00 on the phone's clock that day), never a number of hours since the last one.
//   * "Every few days" counts WHOLE CALENDAR DAYS from the start date (day numbers taken from the local year/month/day, so a 23-hour or 25-hour
//     day changes nothing), never blocks of 24 hours.
//   * Weekdays are ISO in our data (1 = Monday ... 7 = Sunday). iOS numbers them 1 = Sunday ... 7 = Saturday: isoToIosWeekday() converts, and the plan
//     (planNotifications) carries the iOS numbers.
//   * Daylight-saving changes. On the one night a year clocks go FORWARD, a local time inside the skipped hour (01:30 in the UK) does not exist that day.
//     JavaScript, and so nextOccurrence() and every "fireAt" in the plan, moves such a time forward by the length of the gap (01:30 -> 02:30), so the
//     plan NEVER contains a local time that does not exist and a one-off reminder is never lost. The repeating notifications (every day, certain days)
//     are scheduled by iOS from the hour and minute alone; on that one night iOS decides (it moves a missing time to the next real one or skips it),
//     and the next day is normal. On the night clocks go BACK a time in the repeated hour happens twice: nextOccurrence() and "fireAt" use the first
//     one; iOS rings once for a one-off, and for a repeating notification once. Neither changes which DAY a reminder is for.
//   * Travel: the plan is made for the phone's time zone at the time. The repeating notifications are scheduled by iOS on its wall clock, so they follow
//     the phone to a new zone; the dates of an "every few days" reminder are worked out again each time the app opens or comes to the front.
//   * A start date in the future: the first occurrence is the start date itself.
//   * "Done" ticks (doneOn) hold the local date of the day they were made, so yesterday's tick simply stops matching at midnight: it resets itself.

// ---- types

export type RepeatRule =
  | { kind: "daily" }
  /** ISO weekdays, 1 = Monday ... 7 = Sunday, sorted, unique. */
  | { kind: "weekdays"; days: number[] }
  /** Every `every` days (2 to 30), counted in whole calendar days from `startDate` (YYYY-MM-DD, the phone's local date). */
  | { kind: "everyNDays"; every: number; startDate: string };

export interface Reminder {
  id: string;
  /** What the person calls it (1 to MAX_TITLE_LENGTH characters). Shows on the lock screen. */
  title: string;
  /** An optional line of their own (up to MAX_NOTE_LENGTH characters). Shown in the notification instead of the neutral line. */
  note?: string;
  /** "HH:MM", 24-hour, the phone's local clock. */
  time: string;
  repeat: RepeatRule;
  /** false = paused: kept in the list, not in the plan sent to the phone. */
  enabled: boolean;
  /** When it was made (ISO 8601). */
  createdAt: string;
  /** The local date (YYYY-MM-DD) the person last ticked it done. Only today's counts. */
  doneOn?: string;
}

/** What the add / edit sheet hands over. `id` is set when editing an existing reminder. */
export interface ReminderDraft {
  id?: string;
  title: string;
  note?: string;
  time: string;
  repeat: RepeatRule;
  /** Default true. */
  enabled?: boolean;
  createdAt?: string;
  doneOn?: string;
}

/** Why a draft was refused: "name" (empty, or longer than MAX_TITLE_LENGTH), "time", "days" (a weekday choice with no day, or a repeat that isn't one), "every" (not 2 to 30), "start" (not a real date), "limit" (already MAX_REMINDERS). */
export type ReminderError = "name" | "time" | "days" | "every" | "start" | "limit";
export type DraftResult = { ok: true; reminder: Reminder } | { ok: false; error: ReminderError };

/**
 * One thing to tell the phone. The phone schedules exactly what it is given (the iPhone's side only checks and schedules) and removes everything
 * Numbite scheduled before. `id` is the reminder's id (the phone builds its notification identifiers from it, all starting "mm.reminder.").
 *   * every day:        hour, minute only (one repeating notification)
 *   * certain days:     hour, minute, weekdays in iOS numbers (1 = Sunday ... 7 = Saturday), sorted: one repeating notification per weekday
 *   * every few days:   hour, minute, fireAt = the next dates and times, local, "YYYY-MM-DDTHH:MM", oldest first: one one-off notification per date
 *                       (the phone rings at fireAt and ignores hour and minute for these). Every fireAt is a time that exists on the phone's clock that
 *                       day (the clock-change note at the top), so the phone can schedule its year, month, day, hour and minute as they are.
 */
export interface PlanItem {
  id: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  weekdays?: number[];
  fireAt?: string[];
}

export interface Plan {
  items: PlanItem[];
  /** Reminders that got fewer notifications than they should (a shorter run of dates, or none at all) because of the global cap, in list order. */
  trimmedIds: string[];
  /** The part of trimmedIds that got NO notification at all (they won't ring). */
  droppedIds: string[];
}

// ---- limits

export const MAX_REMINDERS = 12;
export const MAX_TITLE_LENGTH = 40;
export const MAX_NOTE_LENGTH = 120;
export const MIN_EVERY_DAYS = 2;
export const MAX_EVERY_DAYS = 30;
/** iOS keeps at most 64 pending local notifications per app; the plan uses at most 60 of them so nothing else can be crowded out. */
export const PLAN_CAP = 60;
/** The most one-off dates sent for one "every few days" reminder. */
export const MAX_ONE_SHOTS = 20;
/** When the cap forces dates to be cut, an "every few days" reminder keeps at least this many before whole reminders are left out. */
export const MIN_ONE_SHOTS = 2;

/** The neutral notification line when a reminder has no note: the screen translates it with t(DEFAULT_BODY_KEY, { app }) and passes it to planNotifications. */
export const DEFAULT_BODY_KEY = tk("Tap to open {app}");
const FALLBACK_APP_NAME = "Numbite";

const KEY_DAILY = tk("Every day");
const KEY_ONE_DAY = tk("Every {day}");
const KEY_SOME_DAYS = tk("On {days}");
const KEY_EVERY_N = tk("Every {n} days");

// ---- small helpers

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A property read that can't be fooled by the prototype chain (a stored object comes from a phone's storage, or from anyone who could write there). */
const own = (o: Record<string, unknown>, key: string): unknown => (Object.prototype.hasOwnProperty.call(o, key) ? o[key] : undefined);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Characters taken out of what the person types (it ends up on a lock screen): invisible ones (zero-width space, soft hyphen, the bidi
// embeddings/overrides/isolates that can make text read in a different order, interlinear marks, tag characters) are removed; every control
// character and every kind of space becomes one ordinary space. Joiners (U+200C, U+200D) and the left/right marks are kept: Persian, Urdu,
// Indic scripts and emoji need them.
const HIDDEN = /[\u00AD\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069\uFFF9-\uFFFC\u{E0000}-\u{E007F}]/gu;
const SPACES = /[\u0000-\u001F\u007F-\u009F\s]+/g;

/** The tidy form of typed text: no hidden or control characters, single spaces, trimmed, whole characters only. Not shortened. Never reads more than `look` characters. */
function tidy(raw: unknown, look: number): string {
  if (typeof raw !== "string") return "";
  const head = raw.length > look ? raw.slice(0, look) : raw;
  // a surrogate cut in half (by the slice above, or sent that way) is dropped, not shown as a replacement mark. This comes BEFORE the spaces are
  // tidied: dropping it afterwards could leave a stray space at an end or a double space in the middle ("Morning " + a half emoji).
  const whole = Array.from(head.replace(HIDDEN, "")).filter((c) => !(c.length === 1 && c >= "\uD800" && c <= "\uDFFF")).join("");
  return whole.replace(SPACES, " ").trim();
}

const length = (s: string): number => Array.from(s).length;

/** tidy(), then cut to `max` whole characters (and trimmed again). */
function clampText(raw: unknown, max: number): string {
  const s = tidy(raw, max * 8 + 64);
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("").trim() : s;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

interface Civil {
  y: number;
  m: number;
  d: number;
}

const DAY_MS = 86_400_000;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const civilOf = (d: Date): Civil => ({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
/** A whole number for a calendar day (days since 1970-01-01), taken from the year, month and day only: DST can't shift it. */
const dayNumber = (c: Civil): number => Math.round(Date.UTC(c.y, c.m - 1, c.d) / DAY_MS);
const civilFromDayNumber = (n: number): Civil => {
  const t = new Date(n * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const civilToString = (c: Civil): string => `${String(c.y).padStart(4, "0")}-${pad2(c.m)}-${pad2(c.d)}`;

/** Monday = 1 ... Sunday = 7 for a day number. */
const isoWeekdayOfDayNumber = (n: number): number => {
  const dow = new Date(n * DAY_MS).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
};

/** The phone's local date as "YYYY-MM-DD" (what `doneOn` and `startDate` hold). "" for an invalid Date. */
export function localDateString(d: Date): string {
  return Number.isNaN(d.getTime()) ? "" : civilToString(civilOf(d));
}

/** A strict "YYYY-MM-DD" (a real date in 2000 to 2100: no 2026-02-30), or null. */
function parseDateString(s: unknown): Civil | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const c: Civil = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (c.y < MIN_YEAR || c.y > MAX_YEAR) return null;
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d));
  return t.getUTCFullYear() === c.y && t.getUTCMonth() + 1 === c.m && t.getUTCDate() === c.d ? c : null;
}

/** Is this a real date, "YYYY-MM-DD", in 2000 to 2100? (For the "Starting on" date box.) */
export const isValidDateString = (s: unknown): s is string => parseDateString(s) !== null;

function parseTime(s: unknown): { hour: number; minute: number } | null {
  if (typeof s !== "string") return null;
  const m = TIME_PATTERN.exec(s);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/** The instant of a local wall-clock time on a calendar day. A time inside the hour clocks skip is moved forward by the gap (see the note at the top). */
const atTime = (c: Civil, hour: number, minute: number): Date => new Date(c.y, c.m - 1, c.d, hour, minute, 0, 0);

/** "YYYY-MM-DDTHH:MM" in the phone's local time, for the plan's fireAt. */
const localDateTimeString = (d: Date): string => `${civilToString(civilOf(d))}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** Monday = 1 ... Sunday = 7 for a Date's local calendar day. */
export function isoWeekday(day: Date): number {
  return isoWeekdayOfDayNumber(dayNumber(civilOf(day)));
}

/** ISO weekday (1 = Monday ... 7 = Sunday) to the iPhone's numbering (1 = Sunday ... 7 = Saturday). */
export const isoToIosWeekday = (iso: number): number => (iso === 7 ? 1 : iso + 1);

// ---- the repeat rule

function isIntegerInRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

/** ISO weekdays from whatever was stored or typed: sorted, unique. `strict` refuses the whole list if anything in it isn't a weekday. Null when no weekday is left. */
function parseDays(raw: unknown, strict: boolean): number[] | null {
  if (!Array.isArray(raw)) return null;
  const found = new Set<number>();
  const look = Math.min(raw.length, 64);
  for (let i = 0; i < look; i++) {
    const v: unknown = raw[i];
    if (isIntegerInRange(v, 1, 7)) found.add(v);
    else if (strict) return null;
  }
  if (strict && raw.length > look) return null;
  return found.size === 0 ? null : [...found].sort((a, b) => a - b);
}

type RepeatCheck = { ok: true; repeat: RepeatRule } | { ok: false; error: "days" | "every" | "start" };

function checkRepeat(raw: unknown, strict: boolean): RepeatCheck {
  if (!isRecord(raw)) return { ok: false, error: "days" };
  const kind = own(raw, "kind");
  if (kind === "daily") return { ok: true, repeat: { kind: "daily" } };
  if (kind === "weekdays") {
    const days = parseDays(own(raw, "days"), strict);
    return days ? { ok: true, repeat: { kind: "weekdays", days } } : { ok: false, error: "days" };
  }
  if (kind === "everyNDays") {
    const every = own(raw, "every");
    if (!isIntegerInRange(every, MIN_EVERY_DAYS, MAX_EVERY_DAYS)) return { ok: false, error: "every" };
    const startDate = own(raw, "startDate");
    if (!parseDateString(startDate)) return { ok: false, error: "start" };
    return { ok: true, repeat: { kind: "everyNDays", every, startDate: startDate as string } };
  }
  return { ok: false, error: "days" };
}

const sameRepeat = (a: RepeatRule, b: RepeatRule): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === "weekdays" && b.kind === "weekdays") return a.days.length === b.days.length && a.days.every((d, i) => d === b.days[i]);
  if (a.kind === "everyNDays" && b.kind === "everyNDays") return a.every === b.every && a.startDate === b.startDate;
  return true;
};

// ---- reading back from storage

const ISO_ZERO = new Date(0).toISOString();

/**
 * Defensive parse of whatever is in storage: a reminder that isn't one (no valid id, name, time or repeat) is dropped, the rest kept in stored order
 * (the order they were made), at most MAX_REMINDERS. Text is cleaned and cut to length; a bad createdAt becomes the epoch, a bad doneOn is left out,
 * and `enabled` is true unless it is exactly false (a reminder that rings by mistake is better than one that silently doesn't).
 */
export function sanitiseReminders(raw: unknown): Reminder[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Reminder[] = [];
  const look = Math.min(raw.length, 500);
  for (let i = 0; i < look && out.length < MAX_REMINDERS; i++) {
    let reminder: Reminder | null = null;
    try {
      reminder = sanitiseOne(raw[i]);
    } catch {
      reminder = null; // an object that throws when it is read (a getter, a proxy) is not a reminder
    }
    if (!reminder || seen.has(reminder.id)) continue;
    seen.add(reminder.id);
    out.push(reminder);
  }
  return out;
}

function sanitiseOne(e: unknown): Reminder | null {
  if (!isRecord(e)) return null;
  const id = own(e, "id");
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return null;
  const title = clampText(own(e, "title"), MAX_TITLE_LENGTH);
  if (!title) return null;
  const time = own(e, "time");
  if (typeof time !== "string" || !parseTime(time)) return null;
  const repeat = checkRepeat(own(e, "repeat"), false);
  if (!repeat.ok) return null;
  const note = clampText(own(e, "note"), MAX_NOTE_LENGTH);
  const createdAt = own(e, "createdAt");
  const created = typeof createdAt === "string" && createdAt.length <= 64 ? Date.parse(createdAt) : NaN;
  const doneOn = own(e, "doneOn");
  const reminder: Reminder = {
    id,
    title,
    time,
    repeat: repeat.repeat,
    enabled: own(e, "enabled") !== false,
    createdAt: Number.isFinite(created) ? new Date(created).toISOString() : ISO_ZERO,
  };
  if (note) reminder.note = note;
  if (typeof doneOn === "string" && parseDateString(doneOn)) reminder.doneOn = doneOn;
  return reminder;
}

// ---- checking what the sheet hands over

let idCounter = 0;
const fallbackId = (now: Date): string => `r${now.getTime().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Check a draft from the add / edit sheet. On success the reminder is complete (tidy text, an id, a date made, enabled unless the draft says otherwise).
 * `enabled` is true unless the draft says false (an edit that doesn't say keeps what the reminder was).
 * `existing` (the reminders now) is used for the limit (a NEW reminder is refused with "limit" when MAX_REMINDERS exist) and, when the draft has the id
 * of one of them (an edit), to keep its date made and its "done" tick, which is dropped when the time or the repeat changed (it's a different reminder
 * now). `newId` makes the id of a new reminder (default: a random one).
 */
export function validateDraft(draft: ReminderDraft, opts: { existing?: readonly Reminder[]; now?: Date; newId?: () => string } = {}): DraftResult {
  const now = opts.now ?? new Date();
  const title = tidy(draft.title, MAX_TITLE_LENGTH * 8 + 64);
  if (!title || length(title) > MAX_TITLE_LENGTH) return { ok: false, error: "name" };
  const time = parseTime(draft.time) ? draft.time : null;
  if (!time) return { ok: false, error: "time" };
  const repeat = checkRepeat(draft.repeat, true);
  if (!repeat.ok) return { ok: false, error: repeat.error };

  const existing = opts.existing ?? [];
  const before = typeof draft.id === "string" ? existing.find((r) => r.id === draft.id) : undefined;
  if (!before && existing.length >= MAX_REMINDERS) return { ok: false, error: "limit" };

  const id = before ? before.id : typeof draft.id === "string" && ID_PATTERN.test(draft.id) ? draft.id : (opts.newId ?? (() => fallbackId(now)))();
  const note = clampText(draft.note, MAX_NOTE_LENGTH);
  const reminder: Reminder = {
    id,
    title,
    time,
    repeat: repeat.repeat,
    enabled: draft.enabled !== undefined ? draft.enabled !== false : before ? before.enabled : true, // an edit that doesn't say keeps a paused one paused
    createdAt: before ? before.createdAt : Number.isFinite(Date.parse(String(draft.createdAt))) ? new Date(draft.createdAt as string).toISOString() : now.toISOString(),
  };
  if (note) reminder.note = note;
  // "done today" belongs to the reminder as it was: kept through an edit of the words, dropped when it is now at another time or on other days
  const doneOn = before ? (before.time === time && sameRepeat(before.repeat, repeat.repeat) ? before.doneOn : undefined) : draft.doneOn;
  if (parseDateString(doneOn)) reminder.doneOn = doneOn;
  return { ok: true, reminder };
}

// ---- which days

/**
 * Does the reminder's schedule include this local calendar day? Only the schedule: paused or not and done or not are other questions
 * (isDueToday, isDoneToday). Every few days counts whole calendar days from the start date (a start date in the future: nothing before it).
 */
export function occursOn(r: Reminder, day: Date): boolean {
  if (Number.isNaN(day.getTime())) return false;
  const c = civilOf(day);
  switch (r.repeat.kind) {
    case "daily":
      return true;
    case "weekdays":
      return r.repeat.days.includes(isoWeekdayOfDayNumber(dayNumber(c)));
    case "everyNDays": {
      const start = parseDateString(r.repeat.startDate);
      if (!start) return false;
      const n = dayNumber(c) - dayNumber(start);
      return n >= 0 && n % r.repeat.every === 0;
    }
    default:
      return false;
  }
}

/** The smallest day number on or after `fromN` on which the schedule occurs, or null (a schedule with no valid day). */
function nextDayNumber(r: Reminder, fromN: number): number | null {
  switch (r.repeat.kind) {
    case "daily":
      return fromN;
    case "weekdays": {
      for (let k = 0; k < 7; k++) if (r.repeat.days.includes(isoWeekdayOfDayNumber(fromN + k))) return fromN + k;
      return null;
    }
    case "everyNDays": {
      const start = parseDateString(r.repeat.startDate);
      if (!start) return null;
      const s = dayNumber(start);
      if (fromN <= s) return s;
      const into = (fromN - s) % r.repeat.every;
      return into === 0 ? fromN : fromN + (r.repeat.every - into);
    }
    default:
      return null;
  }
}

/** Is it a day the (running, not paused) reminder is for? */
export const isDueToday = (r: Reminder, now: Date): boolean => r.enabled && occursOn(r, now);

/** Has the person ticked it done on this local day? (A tick from an earlier day doesn't count: it resets itself at midnight.) */
export const isDoneToday = (r: Reminder, now: Date): boolean => r.doneOn !== undefined && r.doneOn === localDateString(now);

/** The reminder ticked done for today. */
export const markDone = (r: Reminder, now: Date): Reminder => ({ ...r, doneOn: localDateString(now) });

/** The tick taken back. */
export function undoDone(r: Reminder): Reminder {
  const copy: Reminder = { ...r };
  delete copy.doneOn;
  return copy;
}

/**
 * The next time the reminder goes off, strictly after `from` (the phone's local wall-clock time on the first day it is for: see the note at the top about
 * clock changes), or null when it won't (paused, or a schedule with no valid day or time). The exact minute it goes off is already past.
 */
export function nextOccurrence(r: Reminder, from: Date): Date | null {
  if (!r.enabled || Number.isNaN(from.getTime())) return null;
  const t = parseTime(r.time);
  if (!t) return null;
  let n = nextDayNumber(r, dayNumber(civilOf(from)));
  for (let tries = 0; n !== null && tries < 4; tries++) {
    const at = atTime(civilFromDayNumber(n), t.hour, t.minute);
    if (at.getTime() > from.getTime()) return at;
    n = nextDayNumber(r, n + 1);
  }
  return null;
}

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The order on Home: the reminders for today first, by time (then name); then the others by when they next go off; paused ones last, in the order
 * they were made. A done reminder keeps its place (nothing jumps about when it is ticked).
 */
export function sortForHome(list: readonly Reminder[], now: Date): Reminder[] {
  const rows = list.map((r, index) => {
    const due = isDueToday(r, now);
    const next = due ? null : nextOccurrence(r, now);
    const group = due ? 0 : next ? 1 : 2;
    return { r, index, group, next: next ? next.getTime() : 0 };
  });
  rows.sort(
    (a, b) =>
      a.group - b.group ||
      (a.group === 0 ? byCodeUnits(a.r.time, b.r.time) || byCodeUnits(a.r.title, b.r.title) : 0) ||
      (a.group === 1 ? a.next - b.next || byCodeUnits(a.r.title, b.r.title) : 0) ||
      a.index - b.index,
  );
  return rows.map((x) => x.r);
}

// ---- words and times

const ENGLISH_DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ENGLISH_DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A weekday's name in the language (ISO number 1 = Monday ... 7 = Sunday). */
export function weekdayName(iso: number, locale?: string, style: "long" | "short" = "long"): string {
  const i = Math.min(7, Math.max(1, Math.round(iso)));
  try {
    // 2024-01-01 was a Monday, so day i of January 2024 is ISO weekday i; UTC so the zone can't change the day
    return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, i)));
  } catch {
    return (style === "long" ? ENGLISH_DAYS_LONG : ENGLISH_DAYS_SHORT)[i - 1]!;
  }
}

function joinNames(names: string[], locale?: string): string {
  try {
    return new Intl.ListFormat(locale, { style: "short", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/**
 * How a repeat is put in words, as an English t() key with its values: "Every day", "Every {day}" (one weekday, e.g. Monday), "On {days}" (e.g. Mon, Wed
 * and Fri), "Every {n} days". Day names come from Intl in `locale` (pass the app's language); all seven days is "Every day". The caller translates the key.
 */
export function repeatWords(r: Reminder, locale?: string): { key: string; values: Record<string, string | number> } {
  const rule = r.repeat;
  if (rule.kind === "weekdays") {
    if (rule.days.length >= 7) return { key: KEY_DAILY, values: {} };
    if (rule.days.length === 1) return { key: KEY_ONE_DAY, values: { day: weekdayName(rule.days[0]!, locale, "long") } };
    return { key: KEY_SOME_DAYS, values: { days: joinNames(rule.days.map((d) => weekdayName(d, locale, "short")), locale) } };
  }
  if (rule.kind === "everyNDays") return { key: KEY_EVERY_N, values: { n: rule.every } };
  return { key: KEY_DAILY, values: {} };
}

/** "08:00" in the phone's own style (the language's 12- or 24-hour clock, e.g. "8:00 am" or "08:00"). Anything that isn't HH:MM comes back as it was. */
export function formatTime(time: string, locale?: string): string {
  const t = parseTime(time);
  if (!t) return time;
  try {
    // a fixed UTC date with the zone UTC: no clock change anywhere can move the hour
    const when = new Date(Date.UTC(2000, 0, 1, t.hour, t.minute));
    const plain = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    // a 24-hour clock is written with two digits (08:00), as on the phone's lock screen; a 12-hour one without a leading zero (8:00 am)
    const hc = plain.resolvedOptions().hourCycle;
    return hc === "h23" || hc === "h24" ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(when) : plain.format(when);
  } catch {
    return time;
  }
}

/** A calendar day in the language's own short style ("Fri 23 Oct"), for "Next: …" under a reminder that isn't for today. Never throws. */
export function formatNextDay(day: Date, locale?: string): string {
  if (Number.isNaN(day.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(day);
  } catch {
    return localDateString(day);
  }
}

// ---- the plan for the phone

interface Entry {
  index: number;
  item: PlanItem;
  /** The dates of an "every few days" reminder that are in the plan now (null for the others, and for one left out). */
  shots: string[] | null;
  /** All the dates worked out for it, before any cut (null for the others). */
  allShots: readonly string[] | null;
  fixedCost: number;
}

const cost = (e: Entry): number => (e.shots ? e.shots.length : e.fixedCost);

/**
 * What to tell the phone to schedule: every ENABLED reminder, from `now`, replacing everything scheduled before (see PlanItem). `defaultBody` is the
 * translated neutral line for a reminder with no note (t(DEFAULT_BODY_KEY, { app })). A doneOn tick doesn't change the plan: an early tick doesn't cancel
 * today's ring.
 *
 * The cap (default PLAN_CAP = 60 notifications in all; the phone allows 64): every day costs 1, certain days 1 per weekday (all seven days = every day = 1),
 * every few days 1 per date (up to MAX_ONE_SHOTS). Over the cap it trims in this order, always the same for the same list:
 *   1. the dates of "every few days" reminders are cut, one at a time from whichever has the most (a tie: the one later in the list), down to
 *      MIN_ONE_SHOTS each. They are sent again every time the app opens, so a shorter run only matters to someone who doesn't open the app for days;
 *   2. only if that is still over the cap, whole reminders are left out: the ones needing the MOST notifications first (a tie: the later in the list),
 *      so as many reminders as possible keep ringing;
 *   3. only if step 2 ran: the room it freed is given back to the runs of dates cut in step 1, one date at a time, to the shortest run first (a tie: the
 *      one earlier in the list), so no room is left unused while a run is shorter than it could be.
 * trimmedIds lists every reminder that got less than all it should (cut or left out), droppedIds the ones left out entirely, both in list order.
 */
export function planNotifications(list: readonly Reminder[], now: Date, cap: number = PLAN_CAP, defaultBody: string = format(DEFAULT_BODY_KEY, { app: FALLBACK_APP_NAME })): Plan {
  const limit = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : PLAN_CAP;
  const body0 = clampText(defaultBody, MAX_NOTE_LENGTH) || format(DEFAULT_BODY_KEY, { app: FALLBACK_APP_NAME });
  const seen = new Set<string>();
  const entries: Entry[] = [];

  list.forEach((r, index) => {
    if (!r.enabled || typeof r.id !== "string" || !ID_PATTERN.test(r.id) || seen.has(r.id)) return;
    const t = parseTime(r.time);
    const title = clampText(r.title, MAX_TITLE_LENGTH);
    if (!t || !title) return;
    seen.add(r.id);
    const item: PlanItem = { id: r.id, title, body: clampText(r.note, MAX_NOTE_LENGTH) || body0, hour: t.hour, minute: t.minute };
    const rule = r.repeat;
    if (rule.kind === "daily") {
      entries.push({ index, item, shots: null, allShots: null, fixedCost: 1 });
    } else if (rule.kind === "weekdays") {
      const days = parseDays(rule.days, false);
      if (!days) return;
      if (days.length >= 7) {
        entries.push({ index, item, shots: null, allShots: null, fixedCost: 1 });
      } else {
        item.weekdays = days.map(isoToIosWeekday).sort((a, b) => a - b);
        entries.push({ index, item, shots: null, allShots: null, fixedCost: days.length });
      }
    } else if (rule.kind === "everyNDays") {
      const shots: string[] = [];
      let from = now;
      for (let i = 0; i < MAX_ONE_SHOTS; i++) {
        const next = nextOccurrence(r, from);
        if (!next) break;
        shots.push(localDateTimeString(next));
        from = next;
      }
      if (shots.length === 0) return;
      entries.push({ index, item, shots, allShots: [...shots], fixedCost: 0 });
    }
  });

  const fullCost = new Map(entries.map((e) => [e.item.id, cost(e)]));
  const total = () => entries.reduce((sum, e) => sum + cost(e), 0);
  const dropped = new Set<string>();

  // 1. shorten the runs of dates, longest first
  while (total() > limit) {
    let longest: Entry | undefined;
    for (const e of entries) if (e.shots && e.shots.length > MIN_ONE_SHOTS && (!longest || e.shots.length >= longest.shots!.length)) longest = e;
    if (!longest) break;
    longest.shots!.pop();
  }

  // 2. leave whole reminders out, the most expensive first
  if (total() > limit) {
    const costliest = [...entries].sort((a, b) => cost(b) - cost(a) || b.index - a.index);
    for (const e of costliest) {
      if (total() <= limit) break;
      dropped.add(e.item.id);
      e.shots = null;
      e.fixedCost = 0;
    }

    // 3. whatever room that freed is given back to the cut runs of dates, one date at a time to the shortest run (a tie: the one earlier in the list)
    for (;;) {
      if (total() >= limit) break;
      let shortest: Entry | undefined;
      for (const e of entries) {
        if (dropped.has(e.item.id) || !e.shots || !e.allShots || e.shots.length >= e.allShots.length) continue;
        if (!shortest || e.shots.length < shortest.shots!.length) shortest = e;
      }
      if (!shortest) break;
      shortest.shots!.push(shortest.allShots![shortest.shots!.length]!);
    }
  }

  const items: PlanItem[] = [];
  const trimmedIds: string[] = [];
  const droppedIds: string[] = [];
  for (const e of entries) {
    const id = e.item.id;
    if (dropped.has(id)) {
      trimmedIds.push(id);
      droppedIds.push(id);
      continue;
    }
    if (e.shots) {
      e.item.fireAt = [...e.shots];
      if (e.shots.length < (fullCost.get(id) ?? 0)) trimmedIds.push(id);
    }
    items.push(e.item);
  }
  return { items, trimmedIds, droppedIds };
}
