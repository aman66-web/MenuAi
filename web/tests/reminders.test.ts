import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BODY_KEY, formatNextDay, formatTime, isDoneToday, isDueToday, isoToIosWeekday, isoWeekday, isValidDateString, localDateString, markDone, MAX_NOTE_LENGTH, MAX_ONE_SHOTS, MAX_REMINDERS,
  MAX_TITLE_LENGTH, MIN_ONE_SHOTS, nextOccurrence, occursOn, PLAN_CAP, planNotifications, repeatWords, sanitiseReminders, sortForHome, undoDone, validateDraft, weekdayName,
  type PlanItem, type Reminder, type ReminderDraft,
} from "../lib/mm/reminders";
import {
  clearReminders, deleteReminder, dropFutureTicks, remindersStore, restoreReminder, saveReminder, setReminderEnabled, toggleReminderDone,
} from "../lib/mm/stores";
import { createStore } from "../lib/mm/persist";
import { EMPTY_META, SyncEngine, sanitizeMeta, type SyncApi, type SyncMeta } from "../lib/mm/sync";
import { SYNC_STORES } from "../lib/mm/syncMerge";
import { createSyncAdapters, SYNCED_SETTING_KEYS } from "../lib/mm/syncStores";

// Reminders (Home's section; the phone rings at the times the person chose). Everything here runs in whatever time zone the computer is set to
// and uses local wall-clock Dates throughout, so the answers are the same anywhere. The clock-change tests that need a particular zone are in
// reminders.dst.test.ts.

const at = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms);

let counter = 0;
const rem = (over: Partial<Reminder> = {}): Reminder => ({
  id: `r${++counter}`,
  title: "Morning reminder",
  time: "08:00",
  repeat: { kind: "daily" },
  enabled: true,
  createdAt: "2026-10-01T09:00:00.000Z",
  ...over,
});
const weekly = (days: number[], over: Partial<Reminder> = {}) => rem({ repeat: { kind: "weekdays", days }, ...over });
const everyN = (every: number, startDate: string, over: Partial<Reminder> = {}) => rem({ repeat: { kind: "everyNDays", every, startDate }, ...over });

/** A small seeded random generator, so a failing fuzz case can be reproduced. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- what a good reminder / plan item looks like (the same checks the phone's side makes)

const CONTROL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069\u200B\uFEFF]/;

function expectValidReminder(r: Reminder) {
  expect(r.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  const title = Array.from(r.title);
  expect(title.length).toBeGreaterThanOrEqual(1);
  expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  expect(r.title).not.toMatch(CONTROL);
  expect(r.title).toBe(r.title.trim());
  if (r.note !== undefined) {
    expect(Array.from(r.note).length).toBeGreaterThanOrEqual(1);
    expect(Array.from(r.note).length).toBeLessThanOrEqual(MAX_NOTE_LENGTH);
    expect(r.note).not.toMatch(CONTROL);
  }
  expect(r.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  expect(typeof r.enabled).toBe("boolean");
  expect(Number.isFinite(Date.parse(r.createdAt))).toBe(true);
  expect(new Date(r.createdAt).toISOString()).toBe(r.createdAt);
  if (r.doneOn !== undefined) expect(isValidDateString(r.doneOn)).toBe(true);
  const rule = r.repeat;
  if (rule.kind === "weekdays") {
    expect(rule.days.length).toBeGreaterThan(0);
    expect(rule.days).toEqual([...new Set(rule.days)].sort((a, b) => a - b));
    for (const d of rule.days) expect(Number.isInteger(d) && d >= 1 && d <= 7).toBe(true);
  } else if (rule.kind === "everyNDays") {
    expect(Number.isInteger(rule.every) && rule.every >= 2 && rule.every <= 30).toBe(true);
    expect(isValidDateString(rule.startDate)).toBe(true);
  } else {
    expect(rule.kind).toBe("daily");
  }
  expect(Object.keys(r).every((k) => ["id", "title", "note", "time", "repeat", "enabled", "createdAt", "doneOn"].includes(k))).toBe(true);
}

function expectValidPlanItem(p: PlanItem) {
  expect(p.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  expect(Array.from(p.title).length).toBeGreaterThanOrEqual(1);
  expect(Array.from(p.title).length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  expect(Array.from(p.body).length).toBeGreaterThanOrEqual(1);
  expect(Array.from(p.body).length).toBeLessThanOrEqual(MAX_NOTE_LENGTH);
  expect(Number.isInteger(p.hour) && p.hour >= 0 && p.hour <= 23).toBe(true);
  expect(Number.isInteger(p.minute) && p.minute >= 0 && p.minute <= 59).toBe(true);
  if (p.weekdays) {
    expect(p.weekdays.length).toBeGreaterThan(0);
    expect(p.weekdays.length).toBeLessThanOrEqual(6);
    expect(p.weekdays).toEqual([...new Set(p.weekdays)].sort((a, b) => a - b));
    for (const d of p.weekdays) expect(Number.isInteger(d) && d >= 1 && d <= 7).toBe(true);
    expect(p.fireAt).toBeUndefined();
  }
  if (p.fireAt) {
    expect(p.fireAt.length).toBeGreaterThan(0);
    expect(p.fireAt.length).toBeLessThanOrEqual(MAX_ONE_SHOTS);
    for (const s of p.fireAt) expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect([...p.fireAt].sort()).toEqual(p.fireAt);
    expect(new Set(p.fireAt).size).toBe(p.fireAt.length);
    expect(p.weekdays).toBeUndefined();
  }
}

const planCost = (items: readonly PlanItem[]) => items.reduce((n, p) => n + (p.fireAt ? p.fireAt.length : p.weekdays ? p.weekdays.length : 1), 0);

/** A "YYYY-MM-DDTHH:MM" that is a real local time: building the Date and reading it back gives the same numbers. */
function isRealLocalTime(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d && date.getHours() === h && date.getMinutes() === mi;
}

// ---- reading back from storage

describe("sanitiseReminders", () => {
  it("keeps good reminders in stored order, tidied", () => {
    const list = sanitiseReminders([
      { id: "b", title: "  Evening   reminder ", time: "20:30", repeat: { kind: "weekdays", days: [5, 1, 1, 3] }, enabled: false, createdAt: "2026-10-01T09:00:00Z", note: "  A short\nnote ", doneOn: "2026-10-15" },
      { id: "a", title: "Morning reminder", time: "08:00", repeat: { kind: "daily" }, enabled: true, createdAt: "2026-10-02T09:00:00.000Z" },
      { id: "c", title: "Every few", time: "00:00", repeat: { kind: "everyNDays", every: 14, startDate: "2026-10-16" }, enabled: true, createdAt: "2026-10-03T09:00:00.000Z" },
    ]);
    expect(list.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(list[0]).toEqual({
      id: "b", title: "Evening reminder", note: "A short note", time: "20:30", repeat: { kind: "weekdays", days: [1, 3, 5] }, enabled: false,
      createdAt: "2026-10-01T09:00:00.000Z", doneOn: "2026-10-15",
    });
    expect(list[1]).toEqual({ id: "a", title: "Morning reminder", time: "08:00", repeat: { kind: "daily" }, enabled: true, createdAt: "2026-10-02T09:00:00.000Z" });
    for (const r of list) expectValidReminder(r);
  });

  it("drops what isn't a reminder: wrong types, bad or repeated ids, empty names, bad times", () => {
    const good = { id: "ok", title: "Morning reminder", time: "08:00", repeat: { kind: "daily" } };
    const list = sanitiseReminders([
      good, good, null, undefined, "x", 5, [], true,
      { ...good, id: "" }, { ...good, id: "has space" }, { ...good, id: "a".repeat(65) }, { ...good, id: 7 }, { ...good, id: "slash/slash" }, { ...good, id: "dot.dot" },
      { ...good, id: "t1", title: "" }, { ...good, id: "t2", title: "   " }, { ...good, id: "t3", title: "\u0000\u0001\n\t" }, { ...good, id: "t4", title: 5 }, { ...good, id: "t5", title: "\u200B\u202E" },
      { ...good, id: "m1", time: "8:00" }, { ...good, id: "m2", time: "24:00" }, { ...good, id: "m3", time: "12:60" }, { ...good, id: "m4", time: "12:00:00" },
      { ...good, id: "m5", time: 800 }, { ...good, id: "m6", time: " 08:00" }, { ...good, id: "m7", time: "08:00\n" }, { ...good, id: "m8", time: null },
      { id: "n1", title: "No time", repeat: { kind: "daily" } }, { id: "n2", title: "No repeat", time: "08:00" },
    ]);
    expect(list.map((r) => r.id)).toEqual(["ok"]);
    expect(sanitiseReminders("nope")).toEqual([]);
    expect(sanitiseReminders(null)).toEqual([]);
    expect(sanitiseReminders({ length: 3 })).toEqual([]);
    expect(sanitiseReminders(undefined)).toEqual([]);
  });

  it("drops a reminder whose repeat can't be used", () => {
    const base = { title: "Morning reminder", time: "08:00" };
    const bad: unknown[] = [
      undefined, null, "daily", 1, [], {}, { kind: "monthly" }, { kind: "Daily" }, { kind: "weekdays" }, { kind: "weekdays", days: [] }, { kind: "weekdays", days: [0, 8, -1, 1.5, "1", null, NaN] },
      { kind: "weekdays", days: "1" }, { kind: "weekdays", days: { length: 2, 0: 1, 1: 2 } },
      { kind: "everyNDays", every: 1, startDate: "2026-10-16" }, { kind: "everyNDays", every: 31, startDate: "2026-10-16" }, { kind: "everyNDays", every: 2.5, startDate: "2026-10-16" },
      { kind: "everyNDays", every: "3", startDate: "2026-10-16" }, { kind: "everyNDays", every: NaN, startDate: "2026-10-16" }, { kind: "everyNDays", startDate: "2026-10-16" },
      { kind: "everyNDays", every: 3 }, { kind: "everyNDays", every: 3, startDate: "2026-02-30" }, { kind: "everyNDays", every: 3, startDate: "2026-2-3" },
      { kind: "everyNDays", every: 3, startDate: "1999-12-31" }, { kind: "everyNDays", every: 3, startDate: "2101-01-01" }, { kind: "everyNDays", every: 3, startDate: "2026-10-16T00:00" },
      { kind: "everyNDays", every: 3, startDate: 20261016 }, { kind: "everyNDays", every: 3, startDate: "2027-02-29" },
    ];
    const list = sanitiseReminders(bad.map((repeat, i) => ({ ...base, id: `x${i}`, repeat })));
    expect(list).toEqual([]);
  });

  it("is lenient about the parts that aren't needed to ring: weekdays with some junk, a bad date made, a bad done tick, a missing enabled", () => {
    const [r] = sanitiseReminders([{ id: "a", title: "T", time: "08:00", repeat: { kind: "weekdays", days: [3, "x", 9, 1, 3, null, 1.5] }, createdAt: "last week", doneOn: "2026-02-30", enabled: "no" }]);
    expect(r).toEqual({ id: "a", title: "T", time: "08:00", repeat: { kind: "weekdays", days: [1, 3] }, enabled: true, createdAt: new Date(0).toISOString() });
    // only an exact false pauses
    for (const enabled of [undefined, null, 0, "", "false", [], {}, 1]) expect(sanitiseReminders([{ id: "a", title: "T", time: "08:00", repeat: { kind: "daily" }, enabled }])[0]!.enabled).toBe(true);
    expect(sanitiseReminders([{ id: "a", title: "T", time: "08:00", repeat: { kind: "daily" }, enabled: false }])[0]!.enabled).toBe(false);
  });

  it("cleans and cuts the words to whole characters", () => {
    const [r] = sanitiseReminders([{ id: "a", title: "Morn\u200Bing\u202E \u0007reminder\u2028\u2029x", note: "  one\r\ntwo\tthree\u0000  ", time: "08:00", repeat: { kind: "daily" } }]);
    expect(r!.title).toBe("Morning reminder x");
    expect(r!.note).toBe("one two three");
    const [long] = sanitiseReminders([{ id: "a", title: "😀".repeat(50), note: "é".repeat(500), time: "08:00", repeat: { kind: "daily" } }]);
    expect(Array.from(long!.title)).toHaveLength(MAX_TITLE_LENGTH);
    expect(long!.title).toBe("😀".repeat(MAX_TITLE_LENGTH)); // no emoji cut in half
    expect(Array.from(long!.note!)).toHaveLength(MAX_NOTE_LENGTH);
    const [wide] = sanitiseReminders([{ id: "a", title: `${"x".repeat(39)}😀😀`, time: "08:00", repeat: { kind: "daily" } }]);
    expect(wide!.title).toBe(`${"x".repeat(39)}😀`);
    // a note that is nothing after tidying is left out; a half surrogate is dropped, not shown as a mark
    expect(sanitiseReminders([{ id: "a", title: "T", note: " \n\u200B ", time: "08:00", repeat: { kind: "daily" } }])[0]).not.toHaveProperty("note");
    expect(sanitiseReminders([{ id: "a", title: "ab\uD83Dcd", time: "08:00", repeat: { kind: "daily" } }])[0]!.title).toBe("abcd");
    // right-to-left and joined scripts survive (the joiners and the direction marks are kept)
    const [rtl] = sanitiseReminders([{ id: "a", title: "تذكير الصباح\u200F", time: "08:00", repeat: { kind: "daily" } }]);
    expect(rtl!.title).toBe("تذكير الصباح\u200F");
    expect(sanitiseReminders([{ id: "a", title: "می\u200Cخواهم", time: "08:00", repeat: { kind: "daily" } }])[0]!.title).toBe("می\u200Cخواهم");
  });

  it("keeps at most MAX_REMINDERS, the first ones", () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ id: `r${i}`, title: `Reminder ${i}`, time: "08:00", repeat: { kind: "daily" } }));
    const start = Date.now();
    const list = sanitiseReminders(many);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(list).toHaveLength(MAX_REMINDERS);
    expect(list.map((r) => r.id)).toEqual(many.slice(0, MAX_REMINDERS).map((r) => r.id));
  });

  it("is not fooled by the prototype chain or by objects that throw", () => {
    const inherited = Object.create({ id: "x", title: "T", time: "08:00", repeat: { kind: "daily" } });
    expect(sanitiseReminders([inherited])).toEqual([]);
    const polluted = JSON.parse('[{"__proto__":{"enabled":false,"title":"hacked"},"id":"a","title":"Real","time":"08:00","repeat":{"kind":"daily","__proto__":{"kind":"weekdays"}}}]');
    const [p] = sanitiseReminders(polluted);
    expect(p).toEqual({ id: "a", title: "Real", time: "08:00", repeat: { kind: "daily" }, enabled: true, createdAt: new Date(0).toISOString() });
    expect(({} as Record<string, unknown>).title).toBeUndefined(); // nothing leaked onto Object.prototype
    const thrower = { get id() { throw new Error("boom"); }, title: "T", time: "08:00", repeat: { kind: "daily" } };
    const proxy = new Proxy({}, { get() { throw new Error("proxy boom"); }, has() { throw new Error("proxy boom"); }, getOwnPropertyDescriptor() { throw new Error("proxy boom"); } });
    expect(sanitiseReminders([thrower, proxy, { id: "ok", title: "T", time: "08:00", repeat: { kind: "daily" } }]).map((r) => r.id)).toEqual(["ok"]);
  });

  it("copes with enormous inputs without doing enormous work", () => {
    const start = Date.now();
    const hugeTitle = "a".repeat(5_000_000);
    const [r] = sanitiseReminders([{ id: "a", title: hugeTitle, note: hugeTitle, time: "08:00", repeat: { kind: "daily" } }]);
    expect(Array.from(r!.title)).toHaveLength(MAX_TITLE_LENGTH);
    expect(Array.from(r!.note!)).toHaveLength(MAX_NOTE_LENGTH);
    const manyDays = Array.from({ length: 1_000_000 }, (_, i) => (i % 7) + 1);
    const [w] = sanitiseReminders([{ id: "w", title: "T", time: "08:00", repeat: { kind: "weekdays", days: manyDays } }]);
    expect(w!.repeat).toEqual({ kind: "weekdays", days: [1, 2, 3, 4, 5, 6, 7] });
    expect(sanitiseReminders(new Array(1_000_000_000))).toEqual([]); // a sparse array with a billion holes
    expect(sanitiseReminders(new Array(1_000_000).fill(null))).toEqual([]);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("fuzz: hostile input never throws, never gives back anything invalid, and tidying twice changes nothing", () => {
    const rnd = mulberry32(20261016);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const NASTY = [
      "", " ", "\u0000", "__proto__", "constructor", "prototype", "toString", "08:00", "24:00", "2026-02-30", "2026-10-16", "daily", "weekdays", "everyNDays", "😀", "\uD83D", "\uDE00",
      "\u202E", "\u200B", "a".repeat(10_000), "x\ny", "<script>alert(1)</script>", "${7*7}", "\u0000\u0001", "ـ".repeat(100), "\u0301".repeat(50), "ab\u2028cd", "𝒜".repeat(200),
    ];
    const NUMBERS = [NaN, Infinity, -Infinity, 0, -0, 1, 2, 7, 8, 30, 31, 1.5, 2 ** 53, 1e308, -1, 255];
    const junk = (depth = 0): unknown => {
      const k = Math.floor(rnd() * 11);
      if (k === 0) return null;
      if (k === 1) return undefined;
      if (k === 2) return rnd() < 0.5;
      if (k === 3) return pick(NUMBERS);
      if (k === 4 || k === 5) return pick(NASTY);
      if (k === 6 && depth < 3) return Array.from({ length: Math.floor(rnd() * 8) }, () => junk(depth + 1));
      if (k === 7 && depth < 3) {
        const o: Record<string, unknown> = {};
        for (let i = 0; i < Math.floor(rnd() * 6); i++) Object.defineProperty(o, pick(["id", "title", "kind", "days", "__proto__", "constructor", "every", ...NASTY.slice(0, 6)]), { value: junk(depth + 1), enumerable: true, configurable: true, writable: true });
        return o;
      }
      return pick(NUMBERS);
    };
    const semiValid = (i: number): Record<string, unknown> => {
      const o: Record<string, unknown> = {
        id: `id${i}`,
        title: pick(["Morning reminder", "Weekly reminder", "x"]),
        note: pick(["", "A note", undefined]),
        time: pick(["08:00", "23:59", "00:00"]),
        repeat: pick<unknown>([{ kind: "daily" }, { kind: "weekdays", days: [1, 3, 5] }, { kind: "everyNDays", every: 3, startDate: "2026-10-16" }]),
        enabled: pick([true, false]),
        createdAt: "2026-10-16T08:00:00.000Z",
        doneOn: pick(["2026-10-16", undefined]),
      };
      const keys = Object.keys(o);
      for (let n = Math.floor(rnd() * 3); n > 0; n--) o[pick(keys)] = junk();
      if (rnd() < 0.2) delete o[pick(keys)];
      if (rnd() < 0.1) Object.defineProperty(o, "__proto__", { value: junk(), enumerable: true, configurable: true, writable: true });
      return o;
    };
    let kept = 0;
    for (let round = 0; round < 1500; round++) {
      const input: unknown = rnd() < 0.15 ? junk() : Array.from({ length: Math.floor(rnd() * 20) }, (_, i) => (rnd() < 0.8 ? semiValid(round * 100 + i) : junk()));
      let out: Reminder[] = [];
      expect(() => { out = sanitiseReminders(input); }, `round ${round}`).not.toThrow();
      expect(out.length).toBeLessThanOrEqual(MAX_REMINDERS);
      expect(new Set(out.map((r) => r.id)).size).toBe(out.length);
      for (const r of out) expectValidReminder(r);
      expect(sanitiseReminders(out)).toEqual(out);
      expect(sanitiseReminders(JSON.parse(JSON.stringify(out)))).toEqual(out);
      kept += out.length;
      // and what comes out can be planned and sorted without trouble, and the plan is something the phone will accept
      const now = at(2026, 10, 16, 9);
      const plan = planNotifications(out, now);
      expect(planCost(plan.items)).toBeLessThanOrEqual(PLAN_CAP);
      for (const p of plan.items) expectValidPlanItem(p);
      expect(sortForHome(out, now)).toHaveLength(out.length);
    }
    expect(kept).toBeGreaterThan(500); // the generator does make valid reminders, so the checks above looked at something
  });
});

// ---- checking what the sheet hands over

describe("validateDraft", () => {
  const draft = (over: Partial<ReminderDraft> = {}): ReminderDraft => ({ title: "Morning reminder", time: "08:00", repeat: { kind: "daily" }, ...over });
  const now = at(2026, 10, 16, 9);

  it("accepts a good draft and completes it: tidy words, an id, the date made, switched on", () => {
    const res = validateDraft(draft({ title: "  Morning   reminder ", note: " Have it with water\n " }), { now, newId: () => "new-1" });
    expect(res).toEqual({
      ok: true,
      reminder: { id: "new-1", title: "Morning reminder", note: "Have it with water", time: "08:00", repeat: { kind: "daily" }, enabled: true, createdAt: now.toISOString() },
    });
    if (res.ok) expectValidReminder(res.reminder);
  });

  it("makes its own id when none is given, and a different one each time", () => {
    const a = validateDraft(draft(), { now });
    const b = validateDraft(draft(), { now });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expectValidReminder(a.reminder);
      expect(a.reminder.id).not.toBe(b.reminder.id);
    }
    // an id that isn't safe for the phone is not kept
    const odd = validateDraft(draft({ id: "bad id/..", }), { now });
    expect(odd.ok && /^[A-Za-z0-9_-]{1,64}$/.test(odd.reminder.id)).toBe(true);
  });

  it("refuses an empty, blank or too long name", () => {
    for (const title of ["", "   ", "\n\t", "\u0000", "\u200B\u202E", "a".repeat(MAX_TITLE_LENGTH + 1), "😀".repeat(MAX_TITLE_LENGTH + 1)]) expect(validateDraft(draft({ title }), { now }), JSON.stringify(title)).toEqual({ ok: false, error: "name" });
    expect(validateDraft(draft({ title: 5 as unknown as string }), { now })).toEqual({ ok: false, error: "name" });
    expect(validateDraft(draft({ title: "a".repeat(MAX_TITLE_LENGTH) }), { now }).ok).toBe(true);
    expect(validateDraft(draft({ title: "😀".repeat(MAX_TITLE_LENGTH) }), { now }).ok).toBe(true);
  });

  it("cuts a long note rather than refusing, and leaves an empty one out", () => {
    const res = validateDraft(draft({ note: "n".repeat(500) }), { now });
    expect(res.ok && Array.from(res.reminder.note!).length).toBe(MAX_NOTE_LENGTH);
    const empty = validateDraft(draft({ note: " \n " }), { now });
    expect(empty.ok && "note" in empty.reminder).toBe(false);
  });

  it("a half emoji beside spaces leaves no stray space, so what the sheet saves is already what the store reads back", () => {
    // a paste cut through an emoji at the box's limit leaves a lone surrogate: it goes BEFORE the spaces are tidied
    const cases: Array<[string, string]> = [["Morning \uD83D", "Morning"], ["\uDE00 Morning", "Morning"], ["a \uDE00 b", "a b"], ["a\uD83D b", "a b"], ["x \uD83D \uDE00 y", "x y"]];
    for (const [typed, want] of cases) {
      const res = validateDraft(draft({ title: typed, note: typed }), { now });
      expect(res.ok, JSON.stringify(typed)).toBe(true);
      if (!res.ok) continue;
      expect(res.reminder.title, JSON.stringify(typed)).toBe(want);
      expect(res.reminder.note, JSON.stringify(typed)).toBe(want);
      expect(res.reminder.title).toBe(res.reminder.title.trim());
      expectValidReminder(res.reminder);
      // a fixed point: reading the saved reminder back changes nothing
      expect(sanitiseReminders([res.reminder])).toEqual([res.reminder]);
    }
    // a name that is only a half emoji is empty, and a note that is only one is left out
    expect(validateDraft(draft({ title: " \uD83D " }), { now })).toEqual({ ok: false, error: "name" });
    const bare = validateDraft(draft({ note: " \uDE00 " }), { now });
    expect(bare.ok && "note" in bare.reminder).toBe(false);
  });

  it("refuses a time that isn't HH:MM on a 24-hour clock", () => {
    for (const time of ["", "8:00", "24:00", "00:60", "12:00:00", "ab:cd", "1200", "08:00 ", "8", "25:61"]) expect(validateDraft(draft({ time }), { now }), time).toEqual({ ok: false, error: "time" });
    expect(validateDraft(draft({ time: 800 as unknown as string }), { now })).toEqual({ ok: false, error: "time" });
    for (const time of ["00:00", "23:59", "12:30", "01:05"]) expect(validateDraft(draft({ time }), { now }).ok, time).toBe(true);
  });

  it("refuses a weekday choice with no day, or with anything that isn't a day", () => {
    for (const days of [[], [0], [8], [1.5], [1, 9], [-1], ["1"], [NaN], [1, null]] as unknown as number[][]) {
      expect(validateDraft(draft({ repeat: { kind: "weekdays", days } }), { now }), JSON.stringify(days)).toEqual({ ok: false, error: "days" });
    }
    expect(validateDraft(draft({ repeat: { kind: "weekdays", days: undefined as unknown as number[] } }), { now })).toEqual({ ok: false, error: "days" });
    expect(validateDraft(draft({ repeat: { kind: "monthly" } as never }), { now })).toEqual({ ok: false, error: "days" });
    expect(validateDraft(draft({ repeat: undefined as never }), { now })).toEqual({ ok: false, error: "days" });
    const ok = validateDraft(draft({ repeat: { kind: "weekdays", days: [7, 1, 7, 3] } }), { now });
    expect(ok.ok && ok.reminder.repeat).toEqual({ kind: "weekdays", days: [1, 3, 7] });
  });

  it("refuses 'every few days' that isn't 2 to 30 whole days, or that starts on something that isn't a date", () => {
    const start = "2026-10-16";
    for (const every of [1, 0, 31, 100, 2.5, NaN, -3, "3" as unknown as number]) expect(validateDraft(draft({ repeat: { kind: "everyNDays", every, startDate: start } }), { now }), String(every)).toEqual({ ok: false, error: "every" });
    for (const startDate of ["", "2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-10-00", "26-10-16", "2026/10/16", "2026-10-16T00:00", "yesterday", "1999-12-31", "2101-01-01"]) {
      expect(validateDraft(draft({ repeat: { kind: "everyNDays", every: 3, startDate } }), { now }), startDate).toEqual({ ok: false, error: "start" });
    }
    for (const every of [2, 3, 14, 30]) expect(validateDraft(draft({ repeat: { kind: "everyNDays", every, startDate: start } }), { now }).ok).toBe(true);
    for (const startDate of ["2028-02-29", "2000-01-01", "2100-12-31", "2026-10-16", "2026-12-31"]) expect(validateDraft(draft({ repeat: { kind: "everyNDays", every: 3, startDate } }), { now }).ok, startDate).toBe(true);
  });

  it("checks the name first, then the time, then the repeat, then the limit", () => {
    const full = Array.from({ length: MAX_REMINDERS }, () => rem());
    expect(validateDraft(draft({ title: "", time: "x", repeat: { kind: "weekdays", days: [] } }), { now, existing: full })).toEqual({ ok: false, error: "name" });
    expect(validateDraft(draft({ time: "x", repeat: { kind: "weekdays", days: [] } }), { now, existing: full })).toEqual({ ok: false, error: "time" });
    expect(validateDraft(draft({ repeat: { kind: "weekdays", days: [] } }), { now, existing: full })).toEqual({ ok: false, error: "days" });
    expect(validateDraft(draft(), { now, existing: full })).toEqual({ ok: false, error: "limit" });
  });

  it("allows MAX_REMINDERS in all: the 12th is fine, the 13th is not, and changing one of 12 is fine", () => {
    const eleven = Array.from({ length: MAX_REMINDERS - 1 }, () => rem());
    expect(validateDraft(draft(), { now, existing: eleven }).ok).toBe(true);
    const twelve = [...eleven, rem()];
    expect(validateDraft(draft(), { now, existing: twelve })).toEqual({ ok: false, error: "limit" });
    const edit = validateDraft(draft({ id: twelve[3]!.id, title: "Renamed" }), { now, existing: twelve });
    expect(edit.ok && edit.reminder.id).toBe(twelve[3]!.id);
    // an id that isn't one of ours is a new reminder, so the limit applies
    expect(validateDraft(draft({ id: "someone-else" }), { now, existing: twelve })).toEqual({ ok: false, error: "limit" });
  });

  it("an edit keeps the id and the date made, and keeps today's tick unless the time or the repeat changed", () => {
    const before = rem({ id: "keep", createdAt: "2026-09-01T07:00:00.000Z", doneOn: "2026-10-16", time: "08:00", repeat: { kind: "weekdays", days: [1, 5] }, note: "old" });
    const edited = (over: Partial<ReminderDraft>) => validateDraft({ id: "keep", title: "Renamed", time: "08:00", repeat: { kind: "weekdays", days: [1, 5] }, createdAt: "2030-01-01T00:00:00Z", ...over }, { now, existing: [before] });
    const renamed = edited({});
    expect(renamed.ok && renamed.reminder).toEqual({ id: "keep", title: "Renamed", time: "08:00", repeat: { kind: "weekdays", days: [1, 5] }, enabled: true, createdAt: "2026-09-01T07:00:00.000Z", doneOn: "2026-10-16" });
    const later = edited({ time: "20:00" });
    expect(later.ok && later.reminder.doneOn).toBeUndefined();
    const otherDays = edited({ repeat: { kind: "weekdays", days: [1, 5, 6] } });
    expect(otherDays.ok && otherDays.reminder.doneOn).toBeUndefined();
    const otherKind = edited({ repeat: { kind: "daily" } });
    expect(otherKind.ok && otherKind.reminder.doneOn).toBeUndefined();
    const sameDaysUnsorted = edited({ repeat: { kind: "weekdays", days: [5, 1] } });
    expect(sameDaysUnsorted.ok && sameDaysUnsorted.reminder.doneOn).toBe("2026-10-16");
  });

  it("keeps the choice to pause, and an edit that doesn't say keeps a paused reminder paused", () => {
    const res = validateDraft(draft({ enabled: false }), { now });
    expect(res.ok && res.reminder.enabled).toBe(false);
    const paused = rem({ id: "p", enabled: false });
    const kept = validateDraft(draft({ id: "p", title: "Renamed" }), { now, existing: [paused] });
    expect(kept.ok && kept.reminder.enabled).toBe(false);
    const turnedOn = validateDraft(draft({ id: "p", enabled: true }), { now, existing: [paused] });
    expect(turnedOn.ok && turnedOn.reminder.enabled).toBe(true);
    const fresh = validateDraft(draft(), { now, existing: [paused] });
    expect(fresh.ok && fresh.reminder.enabled).toBe(true);
  });
});

// ---- which days

describe("weekday numbers", () => {
  it("ISO: Monday 1 to Sunday 7, for 12 to 18 October 2026", () => {
    expect([12, 13, 14, 15, 16, 17, 18].map((d) => isoWeekday(at(2026, 10, d)))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(isoWeekday(at(2024, 2, 29))).toBe(4); // a Thursday
    expect(isoWeekday(at(2000, 1, 1))).toBe(6); // a Saturday
  });
  it("iPhone: Sunday 1 to Saturday 7", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(isoToIosWeekday)).toEqual([2, 3, 4, 5, 6, 7, 1]);
    // Monday is the iPhone's 2, and Sunday its 1: the two numberings disagree for every day, so the conversion matters
    for (let iso = 1; iso <= 7; iso++) expect(isoToIosWeekday(iso)).not.toBe(iso);
    // the iPhone's own numbering of a date (JavaScript's getDay() + 1) agrees with ours
    for (let d = 1; d <= 60; d++) {
      const day = at(2026, 10, d);
      expect(isoToIosWeekday(isoWeekday(day))).toBe(day.getDay() + 1);
    }
  });
  it("names the days in the language", () => {
    expect(weekdayName(1, "en-GB")).toBe("Monday");
    expect(weekdayName(7, "en-GB")).toBe("Sunday");
    expect(weekdayName(3, "en-GB", "short")).toBe("Wed");
    expect(weekdayName(1, "es")).toMatch(/lunes/i);
    expect(weekdayName(1, "not a locale at all !!")).toMatch(/^(Monday|Mon)$/i);
  });
});

describe("localDateString and isValidDateString", () => {
  it("is the phone's own date, padded", () => {
    expect(localDateString(at(2026, 1, 5, 0, 0))).toBe("2026-01-05");
    expect(localDateString(at(2026, 12, 31, 23, 59, 59, 999))).toBe("2026-12-31");
    expect(localDateString(new Date(NaN))).toBe("");
  });
  it("accepts real dates only, 2000 to 2100", () => {
    for (const ok of ["2026-10-16", "2028-02-29", "2000-01-01", "2100-12-31"]) expect(isValidDateString(ok), ok).toBe(true);
    for (const bad of ["2027-02-29", "2026-04-31", "2026-13-01", "1999-12-31", "2101-01-01", "2026-1-1", "", "2026-10-16 ", 20261016, null, undefined]) expect(isValidDateString(bad), String(bad)).toBe(false);
  });
});

describe("occursOn", () => {
  it("every day: every day, whatever the time of day", () => {
    const r = rem();
    for (let d = 1; d <= 31; d++) expect(occursOn(r, at(2026, 10, d))).toBe(true);
    expect(occursOn(r, new Date(NaN))).toBe(false);
  });

  it("certain days: only those ISO weekdays, all seven weeks of a year", () => {
    const monWedSun = weekly([1, 3, 7]);
    const hits: number[] = [];
    for (let d = 12; d <= 18; d++) if (occursOn(monWedSun, at(2026, 10, d))) hits.push(d);
    expect(hits).toEqual([12, 14, 18]); // Mon 12, Wed 14, Sun 18
    // 2026 has 52 Mondays, Wednesdays and Sundays (its extra day is a Thursday, at both ends): never confused by month or year ends
    let n = 0;
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) if (occursOn(monWedSun, d)) n++;
    expect(n).toBe(52 * 3);
  });

  it("the time of day doesn't change the answer", () => {
    const r = weekly([5]);
    expect(occursOn(r, at(2026, 10, 16, 0, 0, 0, 0))).toBe(true);
    expect(occursOn(r, at(2026, 10, 16, 23, 59, 59, 999))).toBe(true);
    expect(occursOn(r, at(2026, 10, 17, 0, 0, 0, 0))).toBe(false);
    expect(occursOn(r, at(2026, 10, 15, 23, 59, 59, 999))).toBe(false);
  });

  it("every few days: whole calendar days from the start date, never before it", () => {
    const r = everyN(3, "2026-10-01");
    const days = Array.from({ length: 31 }, (_, i) => i + 1).filter((d) => occursOn(r, at(2026, 10, d)));
    expect(days).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31]);
    expect(occursOn(r, at(2026, 9, 28))).toBe(false); // 3 days before the start would be a multiple of 3, but it is before the start
    expect(occursOn(r, at(2026, 9, 30))).toBe(false);
    expect(occursOn(r, at(2026, 11, 3))).toBe(true); // 33 days after
    expect(occursOn(r, at(2026, 11, 2))).toBe(false);
  });

  it("every few days across the end of a month, a leap day and the end of a year", () => {
    expect([27, 28, 29, 30, 31].map((d) => occursOn(everyN(3, "2026-01-30"), at(2026, 1, d)))).toEqual([false, false, false, true, false]);
    expect(occursOn(everyN(3, "2026-01-30"), at(2026, 2, 2))).toBe(true); // 30 Jan + 3 days = 2 Feb
    // a leap year: 27 Feb, 29 Feb, 2 Mar. A common year: 27 Feb, 1 Mar, 3 Mar.
    const leap = everyN(2, "2028-02-27");
    expect([at(2028, 2, 27), at(2028, 2, 28), at(2028, 2, 29), at(2028, 3, 1), at(2028, 3, 2)].map((d) => occursOn(leap, d))).toEqual([true, false, true, false, true]);
    const common = everyN(2, "2027-02-27");
    expect([at(2027, 2, 27), at(2027, 2, 28), at(2027, 3, 1), at(2027, 3, 2), at(2027, 3, 3)].map((d) => occursOn(common, d))).toEqual([true, false, true, false, true]);
    const newYear = everyN(4, "2026-12-30");
    expect([at(2026, 12, 30), at(2027, 1, 3), at(2027, 1, 7)].map((d) => occursOn(newYear, d))).toEqual([true, true, true]);
    expect([at(2026, 12, 31), at(2027, 1, 1), at(2027, 1, 4)].map((d) => occursOn(newYear, d))).toEqual([false, false, false]);
    // 29 February as the start date; and its anniversaries a year later (not a day that exists in 2027)
    const leapStart = everyN(7, "2028-02-29");
    expect(occursOn(leapStart, at(2028, 3, 7))).toBe(true);
    expect(occursOn(leapStart, at(2029, 2, 28))).toBe(false);
  });

  it("every few days agrees with stepping through the calendar one start-to-start jump at a time (30, 14 and 2 days, over years)", () => {
    for (const [every, start] of [[30, "2026-01-31"], [14, "2027-12-25"], [2, "2028-02-28"], [7, "2000-01-01"], [29, "2099-06-15"]] as const) {
      const [sy, sm, sd] = start.split("-").map(Number) as [number, number, number];
      const r = everyN(every, start);
      const expected = new Set<string>();
      for (let i = 0; i < 400; i++) expected.add(localDateString(new Date(sy, sm - 1, sd + i * every, 12)));
      const stop = new Date(sy, sm - 1, sd + 400 * every, 12);
      let checked = 0;
      for (let d = new Date(sy, sm - 1, sd - 40, 12); d < stop; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) {
        expect(occursOn(r, d), `${every}/${start} on ${localDateString(d)}`).toBe(expected.has(localDateString(d)));
        checked++;
      }
      expect(checked).toBeGreaterThan(400);
    }
    // every 7 days from a Saturday is every Saturday
    const sat = everyN(7, "2000-01-01");
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) expect(occursOn(sat, d)).toBe(isoWeekday(d) === 6);
  });

  it("a start date in the future: nothing before it, and the start date itself is the first day", () => {
    const r = everyN(5, "2026-12-01");
    expect(occursOn(r, at(2026, 10, 16))).toBe(false);
    expect(occursOn(r, at(2026, 11, 26))).toBe(false); // 5 days before: a multiple of 5, but before the start
    expect(occursOn(r, at(2026, 12, 1))).toBe(true);
    expect(occursOn(r, at(2026, 12, 6))).toBe(true);
  });

  it("a schedule that can't be read is never due", () => {
    expect(occursOn({ ...rem(), repeat: { kind: "everyNDays", every: 3, startDate: "nonsense" } }, at(2026, 10, 16))).toBe(false);
    expect(occursOn({ ...rem(), repeat: { kind: "weird" } as never }, at(2026, 10, 16))).toBe(false);
  });
});

describe("due, done and the tick", () => {
  const now = at(2026, 10, 16, 9);
  it("a paused reminder is never due today, a running one is when its schedule says", () => {
    expect(isDueToday(rem(), now)).toBe(true);
    expect(isDueToday(rem({ enabled: false }), now)).toBe(false);
    expect(isDueToday(weekly([5]), now)).toBe(true); // 16 October 2026 is a Friday
    expect(isDueToday(weekly([4, 6]), now)).toBe(false);
    expect(isDueToday(everyN(3, "2026-10-01"), now)).toBe(true); // 15 days after the start
    expect(isDueToday(everyN(4, "2026-10-01"), now)).toBe(false);
  });

  it("ticking sets today's date, taking the tick back leaves no trace, and a tick from another day doesn't count", () => {
    const r = rem();
    expect(isDoneToday(r, now)).toBe(false);
    const done = markDone(r, now);
    expect(done.doneOn).toBe("2026-10-16");
    expect(isDoneToday(done, now)).toBe(true);
    expect(isDoneToday(done, at(2026, 10, 16, 0, 0))).toBe(true);
    expect(isDoneToday(done, at(2026, 10, 16, 23, 59, 59, 999))).toBe(true);
    const undone = undoDone(done);
    expect(isDoneToday(undone, now)).toBe(false);
    expect("doneOn" in undone).toBe(false);
    expect(undone).toEqual(r);
    expect(r.doneOn).toBeUndefined(); // the original isn't changed
    expect(done).not.toBe(r);
  });

  it("resets by itself at midnight, and a tick from yesterday or tomorrow never counts today", () => {
    const done = markDone(rem(), at(2026, 10, 15, 23, 59, 30));
    expect(isDoneToday(done, at(2026, 10, 15, 23, 59, 59))).toBe(true);
    expect(isDoneToday(done, at(2026, 10, 16, 0, 0, 0))).toBe(false);
    expect(isDoneToday(done, at(2026, 10, 16, 9))).toBe(false);
    expect(isDoneToday({ ...rem(), doneOn: "2026-10-17" }, at(2026, 10, 16, 9))).toBe(false);
    expect(isDoneToday({ ...rem(), doneOn: "garbage" }, now)).toBe(false);
    // ticking again the next day works the same
    expect(isDoneToday(markDone(done, at(2026, 10, 16, 8)), at(2026, 10, 16, 9))).toBe(true);
  });

  it("a tick doesn't depend on the reminder being due that day", () => {
    const monday = weekly([1]);
    expect(isDoneToday(markDone(monday, now), now)).toBe(true); // Friday: nothing to tick, but the function doesn't pretend otherwise
  });
});

// ---- the next time

describe("nextOccurrence", () => {
  it("every day: later today if the time hasn't come, otherwise tomorrow; the exact minute is already past", () => {
    const r = rem({ time: "08:00" });
    expect(nextOccurrence(r, at(2026, 10, 16, 7, 59, 59, 999))).toEqual(at(2026, 10, 16, 8, 0));
    expect(nextOccurrence(r, at(2026, 10, 16, 8, 0, 0, 0))).toEqual(at(2026, 10, 17, 8, 0));
    expect(nextOccurrence(r, at(2026, 10, 16, 8, 0, 0, 1))).toEqual(at(2026, 10, 17, 8, 0));
    expect(nextOccurrence(r, at(2026, 10, 16, 23, 59, 59))).toEqual(at(2026, 10, 17, 8, 0));
    expect(nextOccurrence(rem({ time: "00:00" }), at(2026, 10, 16, 0, 0, 0))).toEqual(at(2026, 10, 17, 0, 0));
    expect(nextOccurrence(rem({ time: "23:59" }), at(2026, 10, 31, 23, 58))).toEqual(at(2026, 10, 31, 23, 59));
    expect(nextOccurrence(rem({ time: "08:00" }), at(2026, 12, 31, 9))).toEqual(at(2027, 1, 1, 8, 0)); // over a year end
    expect(nextOccurrence(rem({ time: "08:00" }), at(2028, 2, 28, 9))).toEqual(at(2028, 2, 29, 8, 0)); // over a leap day
    expect(nextOccurrence(rem({ time: "08:00" }), at(2028, 2, 29, 9))).toEqual(at(2028, 3, 1, 8, 0));
    expect(nextOccurrence(rem({ time: "08:00" }), at(2027, 2, 28, 9))).toEqual(at(2027, 3, 1, 8, 0));
  });

  it("certain days: the next of the chosen weekdays, and from each day of the week", () => {
    const r = weekly([1, 3], { time: "08:00" }); // Monday and Wednesday
    expect(nextOccurrence(r, at(2026, 10, 12, 7))).toEqual(at(2026, 10, 12, 8)); // Monday before 8
    expect(nextOccurrence(r, at(2026, 10, 12, 9))).toEqual(at(2026, 10, 14, 8)); // Monday after 8 -> Wednesday
    expect(nextOccurrence(r, at(2026, 10, 13, 12))).toEqual(at(2026, 10, 14, 8)); // Tuesday
    expect(nextOccurrence(r, at(2026, 10, 14, 7, 59))).toEqual(at(2026, 10, 14, 8));
    expect(nextOccurrence(r, at(2026, 10, 14, 8, 1))).toEqual(at(2026, 10, 19, 8)); // Wednesday after -> next Monday
    expect(nextOccurrence(r, at(2026, 10, 16, 9))).toEqual(at(2026, 10, 19, 8)); // Friday
    expect(nextOccurrence(r, at(2026, 10, 18, 23, 59))).toEqual(at(2026, 10, 19, 8)); // Sunday night
    // a single weekday is "once a week": exactly 7 days between
    const sunday = weekly([7], { time: "21:15" });
    const first = nextOccurrence(sunday, at(2026, 10, 16, 9))!;
    expect(first).toEqual(at(2026, 10, 18, 21, 15));
    expect(nextOccurrence(sunday, first)).toEqual(at(2026, 10, 25, 21, 15));
    // every weekday on its own, from the day before
    for (let iso = 1; iso <= 7; iso++) {
      const day = at(2026, 10, 11 + iso, 8, 0); // Monday 12 ... Sunday 18, at 08:00
      const before = at(2026, 10, 10 + iso, 20, 0);
      expect(nextOccurrence(weekly([iso], { time: "08:00" }), before), `weekday ${iso}`).toEqual(day);
    }
    // a month and a year end
    expect(nextOccurrence(weekly([4], { time: "08:00" }), at(2026, 12, 31, 9))).toEqual(at(2027, 1, 7, 8, 0));
  });

  it("every few days: from a start date in the past, today, the future and far past", () => {
    const r = everyN(5, "2026-10-01", { time: "08:00" }); // 1, 6, 11, 16, 21, 26, 31 Oct, 5 Nov, ...
    expect(nextOccurrence(r, at(2026, 10, 16, 7))).toEqual(at(2026, 10, 16, 8)); // today, still to come
    expect(nextOccurrence(r, at(2026, 10, 16, 9))).toEqual(at(2026, 10, 21, 8)); // today has passed
    expect(nextOccurrence(r, at(2026, 10, 17, 0, 0))).toEqual(at(2026, 10, 21, 8));
    expect(nextOccurrence(r, at(2026, 10, 21, 8, 0))).toEqual(at(2026, 10, 26, 8));
    expect(nextOccurrence(r, at(2026, 10, 31, 9))).toEqual(at(2026, 11, 5, 8)); // over a month end
    expect(nextOccurrence(r, at(2026, 11, 30, 7))).toEqual(at(2026, 11, 30, 8)); // 60 days after the start
    expect(nextOccurrence(r, at(2026, 11, 30, 9))).toEqual(at(2026, 12, 5, 8));
    // a start date in the future: that day is the first, whatever today is
    const future = everyN(5, "2026-11-01", { time: "08:00" });
    expect(nextOccurrence(future, at(2026, 10, 16, 9))).toEqual(at(2026, 11, 1, 8));
    expect(nextOccurrence(future, at(2026, 10, 31, 23, 59))).toEqual(at(2026, 11, 1, 8));
    expect(nextOccurrence(future, at(2026, 11, 1, 7, 59))).toEqual(at(2026, 11, 1, 8));
    expect(nextOccurrence(future, at(2026, 11, 1, 8, 0))).toEqual(at(2026, 11, 6, 8));
    // a start date many years ahead: the start date itself is the first day (the shortcut that skips the arithmetic), and the days after it follow
    const far = everyN(10, "2053-06-21", { time: "09:00" });
    expect(nextOccurrence(far, at(2027, 1, 5, 12))).toEqual(at(2053, 6, 21, 9));
    expect(nextOccurrence(far, at(2053, 6, 21, 8, 59))).toEqual(at(2053, 6, 21, 9));
    expect(nextOccurrence(far, at(2053, 6, 21, 9))).toEqual(at(2053, 7, 1, 9));
    expect(occursOn(far, at(2053, 6, 20, 12))).toBe(false);
    expect(occursOn(far, at(2053, 6, 21, 12))).toBe(true);
    expect(occursOn(far, at(2053, 6, 30, 12))).toBe(false);
    expect(occursOn(far, at(2053, 7, 1, 12))).toBe(true);
    // a start date today
    const today = everyN(2, "2026-10-16", { time: "21:00" });
    expect(nextOccurrence(today, at(2026, 10, 16, 9))).toEqual(at(2026, 10, 16, 21, 0));
    expect(nextOccurrence(today, at(2026, 10, 16, 22))).toEqual(at(2026, 10, 18, 21, 0));
    // a long way back and every 30 days, over a leap year
    const old = everyN(30, "2000-01-01", { time: "06:30" });
    const n = nextOccurrence(old, at(2028, 2, 29, 12))!;
    expect(occursOn(old, n)).toBe(true);
    expect(n.getTime()).toBeGreaterThan(at(2028, 2, 29, 12).getTime());
    expect(n.getTime() - at(2028, 2, 29, 12).getTime()).toBeLessThan(31 * 25 * 3600_000);
    // 29 February: every 2 days from 28 Feb in a leap year goes 1 March, 3 March
    const leap = everyN(2, "2028-02-28", { time: "08:00" });
    expect(nextOccurrence(leap, at(2028, 2, 28, 9))).toEqual(at(2028, 3, 1, 8));
    const leapFromStart = everyN(2, "2028-02-27", { time: "08:00" });
    expect(nextOccurrence(leapFromStart, at(2028, 2, 27, 9))).toEqual(at(2028, 2, 29, 8));
  });

  it("is null for a reminder that won't ring: paused, no usable time, no usable schedule, not a date", () => {
    expect(nextOccurrence(rem({ enabled: false }), at(2026, 10, 16))).toBeNull();
    expect(nextOccurrence({ ...rem(), time: "25:00" }, at(2026, 10, 16))).toBeNull();
    expect(nextOccurrence({ ...rem(), repeat: { kind: "everyNDays", every: 3, startDate: "x" } }, at(2026, 10, 16))).toBeNull();
    expect(nextOccurrence({ ...rem(), repeat: { kind: "weekdays", days: [] } }, at(2026, 10, 16))).toBeNull();
    expect(nextOccurrence(rem(), new Date(NaN))).toBeNull();
  });

  it("always agrees with looking at the calendar a day at a time (fuzz)", () => {
    const rnd = mulberry32(7);
    const int = (n: number) => Math.floor(rnd() * n);
    for (let i = 0; i < 600; i++) {
      const time = `${String(int(24)).padStart(2, "0")}:${String(int(60)).padStart(2, "0")}`;
      const k = int(3);
      const r =
        k === 0 ? rem({ time }) : k === 1 ? weekly([...new Set(Array.from({ length: 1 + int(4) }, () => 1 + int(7)))].sort((a, b) => a - b), { time }) : everyN(2 + int(29), localDateString(at(2026, 1 + int(12), 1 + int(28))), { time });
      const from = at(2026 + int(3), 1 + int(12), 1 + int(28), int(24), int(60), int(60), int(1000));
      const got = nextOccurrence(r, from);
      let want: Date | null = null;
      for (let d = 0; d < 800 && !want; d++) {
        const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d, 12);
        if (!occursOn(r, day)) continue;
        const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(time.slice(0, 2)), Number(time.slice(3)));
        if (candidate.getTime() > from.getTime()) want = candidate;
      }
      expect(got, `${JSON.stringify(r.repeat)} ${time} from ${from.toString()}`).toEqual(want);
    }
  });
});

describe("sortForHome", () => {
  const now = at(2026, 10, 16, 12); // a Friday
  it("puts today's reminders first by time, then the others by when they next go off, then paused ones in the order they were made", () => {
    const evening = rem({ id: "evening", time: "20:00" });
    const morning = rem({ id: "morning", time: "07:30" });
    const noon = weekly([5], { id: "noon", time: "12:00" });
    const sat = weekly([6], { id: "sat", time: "09:00" });
    const mon = weekly([1], { id: "mon", time: "08:00" });
    const everyOther = everyN(2, "2026-10-17", { id: "every2", time: "06:00" }); // starts tomorrow
    const paused1 = rem({ id: "paused1", enabled: false, time: "01:00" });
    const paused2 = weekly([5], { id: "paused2", enabled: false, time: "02:00" });
    const sorted = sortForHome([paused1, mon, evening, everyOther, sat, paused2, morning, noon], now);
    expect(sorted.map((r) => r.id)).toEqual(["morning", "noon", "evening", "every2", "sat", "mon", "paused1", "paused2"]);
  });
  it("keeps a ticked reminder where it was, and breaks ties by name then by the order given", () => {
    const a = rem({ id: "a", title: "Bee", time: "08:00" });
    const b = rem({ id: "b", title: "Ant", time: "08:00" });
    const c = rem({ id: "c", title: "Ant", time: "08:00" });
    const sorted = sortForHome([a, markDone(b, now), c], now);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sorted[0]!.doneOn).toBe("2026-10-16");
  });
  it("two that are not for today and go off at the same time are told apart by name, then by the order given", () => {
    const bee = weekly([6], { id: "bee", title: "Bee", time: "09:00" });
    const ant = weekly([6], { id: "ant", title: "Ant", time: "09:00" });
    const ant2 = weekly([6], { id: "ant2", title: "Ant", time: "09:00" });
    expect(sortForHome([bee, ant, ant2], now).map((r) => r.id)).toEqual(["ant", "ant2", "bee"]);
    expect(sortForHome([ant2, bee, ant], now).map((r) => r.id)).toEqual(["ant2", "ant", "bee"]); // the same name: the order given
    // the same exact next minute from two different rules still ties
    const every = everyN(7, "2026-10-17", { id: "every", title: "Zed", time: "09:00" });
    expect(sortForHome([every, ant], now).map((r) => r.id)).toEqual(["ant", "every"]);
  });

  it("a running reminder that never goes off sorts with the paused ones, after every reminder that will, in the order given", () => {
    const never = rem({ id: "never", repeat: { kind: "weekdays", days: [] } });
    const soon = weekly([6], { id: "soon", time: "09:00" });
    const paused = rem({ id: "paused", enabled: false });
    expect(sortForHome([never, soon, paused], now).map((r) => r.id)).toEqual(["soon", "never", "paused"]);
    expect(sortForHome([paused, never, soon], now).map((r) => r.id)).toEqual(["soon", "paused", "never"]);
  });

  it("doesn't change the list it is given, and copes with none", () => {
    const list = [rem({ time: "20:00" }), rem({ time: "07:00" })];
    const copy = [...list];
    const sorted = sortForHome(list, now);
    expect(list).toEqual(copy);
    expect(sorted).not.toBe(list);
    expect(sortForHome([], now)).toEqual([]);
  });
  it("a reminder whose time has passed today is still today's, not 'next week'", () => {
    const early = rem({ id: "early", time: "06:00" });
    const later = weekly([6], { id: "later", time: "06:00" });
    expect(sortForHome([later, early], now).map((r) => r.id)).toEqual(["early", "later"]);
  });
});

// ---- words and times

describe("repeatWords", () => {
  it("puts each kind of repeat in words, as an English key with values", () => {
    expect(repeatWords(rem(), "en-GB")).toEqual({ key: "Every day", values: {} });
    expect(repeatWords(weekly([1, 2, 3, 4, 5, 6, 7]), "en-GB")).toEqual({ key: "Every day", values: {} }); // all seven days is every day
    expect(repeatWords(weekly([1]), "en-GB")).toEqual({ key: "Every {day}", values: { day: "Monday" } });
    expect(repeatWords(weekly([7]), "en-GB")).toEqual({ key: "Every {day}", values: { day: "Sunday" } });
    const some = repeatWords(weekly([1, 3, 5]), "en-GB");
    expect(some.key).toBe("On {days}");
    expect(some.values.days).toMatch(/^Mon,? Wed,? (and )?Fri$/);
    expect(repeatWords(weekly([6, 7]), "en-GB").values.days).toMatch(/^Sat,? (and )?Sun$/);
    expect(repeatWords(everyN(3, "2026-10-16"), "en-GB")).toEqual({ key: "Every {n} days", values: { n: 3 } });
    expect(repeatWords(everyN(30, "2026-10-16"), "en-GB").values).toEqual({ n: 30 });
  });
  it("names the days in the person's language", () => {
    expect(repeatWords(weekly([1]), "es").values.day).toMatch(/lunes/i);
    expect(String(repeatWords(weekly([1, 3]), "ar").values.days).length).toBeGreaterThan(0);
  });
  it("uses keys the translator can find", () => {
    const source = readFileSync(new URL("../lib/mm/reminders.ts", import.meta.url), "utf8");
    for (const key of ["Every day", "Every {day}", "On {days}", "Every {n} days", DEFAULT_BODY_KEY]) expect(source).toContain(`tk("${key}")`);
  });
});

describe("formatNextDay", () => {
  it("is the weekday, day and month in the language's own short style, and never throws", () => {
    expect(formatNextDay(at(2026, 10, 23, 9), "en-GB")).toMatch(/^Fri,? 23 Oct$/); // newer ICU adds a comma after the weekday
    expect(formatNextDay(at(2026, 10, 23, 9), "en-US")).toMatch(/Fri.*Oct.*23|Fri.*23.*Oct/);
    expect(formatNextDay(at(2026, 10, 23, 9), "pl")).toMatch(/23/);
    expect(formatNextDay(new Date(NaN), "en-GB")).toBe("");
    expect(typeof formatNextDay(at(2026, 10, 23, 9), "not a locale!!")).toBe("string");
  });
});

describe("formatTime", () => {
  it("shows the time in the language's own style", () => {
    expect(formatTime("08:00", "en-GB")).toBe("08:00");
    expect(formatTime("20:05", "en-GB")).toBe("20:05");
    expect(formatTime("00:00", "en-GB")).toBe("00:00");
    expect(formatTime("08:00", "en-US")).toMatch(/^8:00\s?AM$/i);
    expect(formatTime("20:05", "en-US")).toMatch(/^8:05\s?PM$/i);
    expect(formatTime("00:30", "en-US")).toMatch(/^12:30\s?AM$/i);
    expect(formatTime("12:00", "en-US")).toMatch(/^12:00\s?PM$/i);
    expect(formatTime("23:59", "en-GB")).toBe("23:59");
    expect(formatTime("08:00", "ar").length).toBeGreaterThan(0);
  });
  it("gives back anything that isn't HH:MM as it was, and never throws", () => {
    for (const t of ["", "8:00", "25:00", "noon", "08:00:00"]) expect(formatTime(t, "en-GB")).toBe(t);
    expect(() => formatTime("08:00", "not a locale !!")).not.toThrow();
    expect(formatTime("08:00")).toMatch(/8/);
  });
});

// ---- the plan for the phone

describe("planNotifications", () => {
  const now = at(2026, 10, 16, 9); // Friday 9:00
  const BODY = "Tap to open Numbite";

  it("every day: hour and minute, and nothing else to say", () => {
    const r = rem({ id: "daily1", title: "Morning reminder", time: "07:05" });
    const plan = planNotifications([r], now);
    expect(plan).toStrictEqual({ items: [{ id: "daily1", title: "Morning reminder", body: BODY, hour: 7, minute: 5 }], trimmedIds: [], droppedIds: [] });
  });

  it("certain days: iPhone weekday numbers (1 = Sunday), sorted, from the ISO ones", () => {
    const plan = planNotifications([weekly([1, 3, 5], { id: "mwf", time: "20:30" })], now);
    expect(plan.items).toStrictEqual([{ id: "mwf", title: "Morning reminder", body: BODY, hour: 20, minute: 30, weekdays: [2, 4, 6] }]);
    // Saturday and Sunday are ISO 6 and 7, the iPhone's 7 and 1
    expect(planNotifications([weekly([6, 7], { id: "w" })], now).items[0]!.weekdays).toEqual([1, 7]);
    expect(planNotifications([weekly([7], { id: "s" })], now).items[0]!.weekdays).toEqual([1]);
    expect(planNotifications([weekly([1], { id: "m" })], now).items[0]!.weekdays).toEqual([2]);
    expect(planNotifications([weekly([5, 4, 3, 2, 1, 6], { id: "six" })], now).items[0]!.weekdays).toEqual([2, 3, 4, 5, 6, 7]);
    for (let iso = 1; iso <= 7; iso++) expect(planNotifications([weekly([iso], { id: `d${iso}` })], now).items[0]!.weekdays).toEqual([isoToIosWeekday(iso)]);
  });

  it("all seven days is one every-day notification", () => {
    const plan = planNotifications([weekly([1, 2, 3, 4, 5, 6, 7], { id: "all" })], now);
    expect(plan.items).toStrictEqual([{ id: "all", title: "Morning reminder", body: BODY, hour: 8, minute: 0 }]);
  });

  it("every few days: the next 20 dates and times, local, oldest first, from the start date, counting calendar days", () => {
    const r = everyN(3, "2026-10-01", { id: "e3", time: "08:00" });
    const plan = planNotifications([r], now);
    const item = plan.items[0]!;
    expect(item).toMatchObject({ id: "e3", hour: 8, minute: 0 });
    expect(item.weekdays).toBeUndefined();
    expect(item.fireAt).toHaveLength(MAX_ONE_SHOTS);
    expect(item.fireAt!.slice(0, 6)).toEqual(["2026-10-19T08:00", "2026-10-22T08:00", "2026-10-25T08:00", "2026-10-28T08:00", "2026-10-31T08:00", "2026-11-03T08:00"]);
    expect(item.fireAt!.at(-1)).toBe("2026-12-15T08:00"); // 19 Oct + 19 x 3 days
    // today's own is still to come when the time is later today
    const later = planNotifications([everyN(3, "2026-10-01", { id: "e3b", time: "21:00" })], now).items[0]!;
    expect(later.fireAt![0]).toBe("2026-10-16T21:00");
    // and is not repeated once passed (the same minute is already past)
    const same = planNotifications([everyN(3, "2026-10-01", { id: "e3c", time: "09:00" })], now).items[0]!;
    expect(same.fireAt![0]).toBe("2026-10-19T09:00");
    // a start date in the future: it begins on that date
    const future = planNotifications([everyN(7, "2026-12-25", { id: "xmas", time: "10:00" })], now).items[0]!;
    expect(future.fireAt!.slice(0, 3)).toEqual(["2026-12-25T10:00", "2027-01-01T10:00", "2027-01-08T10:00"]);
    // month ends and a leap day
    const leap = planNotifications([everyN(2, "2028-02-26", { id: "lp", time: "08:00" })], at(2028, 2, 26, 9)).items[0]!;
    expect(leap.fireAt!.slice(0, 4)).toEqual(["2028-02-28T08:00", "2028-03-01T08:00", "2028-03-03T08:00", "2028-03-05T08:00"]);
    expect(leap.fireAt!.every(isRealLocalTime)).toBe(true);
  });

  it("every fireAt is a time that exists on the phone's clock, and later than now", () => {
    const rnd = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const r = everyN(2 + Math.floor(rnd() * 29), localDateString(at(2026, 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28))), {
        id: `f${i}`, time: `${String(Math.floor(rnd() * 24)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`,
      });
      const from = at(2026, 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), Math.floor(rnd() * 60));
      const shots = planNotifications([r], from).items[0]!.fireAt!;
      for (const s of shots) {
        expect(isRealLocalTime(s), s).toBe(true);
        expect(new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), Number(s.slice(11, 13)), Number(s.slice(14))).getTime()).toBeGreaterThan(from.getTime());
        expect(occursOn(r, new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 12))).toBe(true);
      }
    }
  });

  it("the words: the note when there is one, else the neutral line the screen gives (or Tap to open Numbite)", () => {
    const withNote = rem({ id: "n1", note: "With a glass of water" });
    const without = rem({ id: "n2" });
    expect(planNotifications([withNote, without], now).items.map((p) => p.body)).toEqual(["With a glass of water", BODY]);
    expect(planNotifications([without], now, PLAN_CAP, "Toca para abrir Numbite").items[0]!.body).toBe("Toca para abrir Numbite");
    expect(planNotifications([withNote], now, PLAN_CAP, "Toca para abrir Numbite").items[0]!.body).toBe("With a glass of water");
    // a body that is nothing falls back to a real line, never an empty notification
    expect(planNotifications([without], now, PLAN_CAP, "  \n ").items[0]!.body).toBe(BODY);
    expect(DEFAULT_BODY_KEY).toBe("Tap to open {app}");
  });

  it("leaves out paused reminders, repeated ids and ones that can't be rung; keeps the list's order; changes nothing it is given", () => {
    const a = rem({ id: "a", time: "09:00" });
    const b = rem({ id: "b", enabled: false });
    const c = weekly([2], { id: "c" });
    const dupe = rem({ id: "a", title: "Same id" });
    const badTime = { ...rem({ id: "t" }), time: "9am" };
    const badId = rem({ id: "no good" });
    const badTitle = rem({ id: "empty", title: " " });
    const list = [c, a, b, dupe, badTime, badId, badTitle];
    const copy = JSON.stringify(list);
    const plan = planNotifications(list, now);
    expect(plan.items.map((p) => p.id)).toEqual(["c", "a"]);
    expect(JSON.stringify(list)).toBe(copy);
    expect(planNotifications([], now)).toStrictEqual({ items: [], trimmedIds: [], droppedIds: [] });
    expect(planNotifications([b], now).items).toEqual([]);
  });

  it("a done tick doesn't change the plan (an early tick doesn't cancel today's ring)", () => {
    const r = rem({ id: "x", time: "21:00" });
    expect(planNotifications([markDone(r, now)], now)).toEqual(planNotifications([r], now));
    const e = everyN(2, "2026-10-16", { id: "y", time: "21:00" });
    expect(planNotifications([markDone(e, now)], now)).toEqual(planNotifications([e], now));
  });

  it("is the same every time for the same input", () => {
    const list = [rem({ id: "a" }), weekly([1, 5], { id: "b" }), everyN(3, "2026-10-01", { id: "c" }), everyN(4, "2026-10-02", { id: "d" })];
    expect(JSON.stringify(planNotifications(list, now))).toBe(JSON.stringify(planNotifications(list, now)));
  });

  describe("the cap on notifications (iOS keeps 64; we use at most 60)", () => {
    const manyEveryN = (n: number) => Array.from({ length: n }, (_, i) => everyN(3, "2026-10-01", { id: `e${i}`, time: "08:00" }));

    it("nothing is cut while it fits: 3 every-few-days reminders use 60 and are all kept whole", () => {
      const plan = planNotifications(manyEveryN(3), now);
      expect(planCost(plan.items)).toBe(60);
      expect(plan.trimmedIds).toEqual([]);
      expect(plan.droppedIds).toEqual([]);
      expect(plan.items.every((p) => p.fireAt!.length === MAX_ONE_SHOTS)).toBe(true);
    });

    it("over the cap, the runs of dates are shortened first, longest first, and the reminders that got fewer are named", () => {
      const list = [rem({ id: "daily" }), weekly([1, 3, 5], { id: "mwf" }), weekly([2, 4], { id: "td" }), ...manyEveryN(3)];
      // 1 + 3 + 2 + 3 x 20 = 66: six dates to cut, taken from whichever run is longest (a tie: the later reminder)
      const plan = planNotifications(list, now);
      expect(planCost(plan.items)).toBe(60);
      const runs = plan.items.filter((p) => p.fireAt).map((p) => p.fireAt!.length);
      expect(runs).toEqual([18, 18, 18]);
      expect(plan.trimmedIds).toEqual(["e0", "e1", "e2"]);
      expect(plan.droppedIds).toEqual([]);
      expect(plan.items.map((p) => p.id)).toEqual(["daily", "mwf", "td", "e0", "e1", "e2"]); // the list's order
      // the repeating ones are untouched
      expect(plan.items[0]).toStrictEqual({ id: "daily", title: "Morning reminder", body: BODY, hour: 8, minute: 0 });
      expect(plan.items[1]!.weekdays).toEqual([2, 4, 6]);
      // and what's kept is the soonest dates
      const full = planNotifications([manyEveryN(1)[0]!], now).items[0]!.fireAt!;
      expect(plan.items[3]!.fireAt).toEqual(full.slice(0, 18));
    });

    it("an uneven cut: the longest run loses first and a tie goes to the one later in the list", () => {
      const list = [rem({ id: "daily" }), weekly([1, 3, 5], { id: "mwf" }), weekly([2, 4], { id: "td" }), weekly([1], { id: "mo" }), ...manyEveryN(3)];
      // 1 + 3 + 2 + 1 + 60 = 67: seven to cut from three runs of 20 -> 18, 18, 17
      const plan = planNotifications(list, now);
      expect(planCost(plan.items)).toBe(60);
      expect(plan.items.filter((p) => p.fireAt).map((p) => p.fireAt!.length)).toEqual([18, 18, 17]);
    });

    it("twelve every-few-days reminders share the cap evenly: five dates each", () => {
      const plan = planNotifications(manyEveryN(12), now);
      expect(planCost(plan.items)).toBe(60);
      expect(plan.items.map((p) => p.fireAt!.length)).toEqual(Array(12).fill(5));
      expect(plan.trimmedIds).toEqual(manyEveryN(12).map((r) => r.id));
      expect(plan.droppedIds).toEqual([]);
    });

    it("runs are never cut below MIN_ONE_SHOTS before a whole reminder is left out", () => {
      // 12 weekly reminders on 5 days = 60, plus one every-few-days = 80 -> its run is cut to 2 and the total is still 62 > 60: a weekly reminder goes
      const list = [...Array.from({ length: 11 }, (_, i) => weekly([1, 2, 3, 4, 5], { id: `w${i}` })), everyN(3, "2026-10-01", { id: "e" })];
      const plan = planNotifications(list, now);
      expect(planCost(plan.items)).toBeLessThanOrEqual(60);
      // 55 + 20 = 75 > 60: the run is cut down to 5 (55 + 5 = 60) and nothing is left out
      expect(plan.items.find((p) => p.id === "e")!.fireAt).toHaveLength(5);
      expect(plan.droppedIds).toEqual([]);
      const tight = [...Array.from({ length: 11 }, (_, i) => weekly([1, 2, 3, 4, 5, 6], { id: `w${i}` })), everyN(3, "2026-10-01", { id: "e" })];
      const p2 = planNotifications(tight, now);
      // 66 + 20: the run goes to MIN_ONE_SHOTS (68) and still doesn't fit, so whole reminders go, the costliest first (ties: the later in the list)
      expect(planCost(p2.items)).toBeLessThanOrEqual(60);
      expect(p2.droppedIds.length).toBeGreaterThan(0);
      expect(p2.droppedIds).toContain("w10");
      // (the room the two dropped reminders free is then given back to its run: 9 x 6 + 6 = 60; see the test below)
      expect(p2.items.find((p) => p.id === "e")?.fireAt?.length ?? MIN_ONE_SHOTS).toBeGreaterThanOrEqual(MIN_ONE_SHOTS);
    });

    it("room freed by leaving a whole reminder out is given back to the cut runs of dates, shortest first, earlier first on a tie", () => {
      // 11 reminders on six days (66) + one every-few-days run: its run is cut to 2 (68) and two whole reminders go (w10, w9), leaving 9 x 6 + 2 = 56
      const tight = [...Array.from({ length: 11 }, (_, i) => weekly([1, 2, 3, 4, 5, 6], { id: `w${i}` })), everyN(3, "2026-10-01", { id: "e" })];
      const plan = planNotifications(tight, now);
      expect(plan.droppedIds).toEqual(["w9", "w10"]);
      expect(plan.items.find((p) => p.id === "e")!.fireAt).toHaveLength(6); // 56 + 4 = 60: no room left unused
      expect(planCost(plan.items)).toBe(60);
      // the dates given back are the next ones in order, not others
      const full = planNotifications([everyN(3, "2026-10-01", { id: "e" })], now).items[0]!.fireAt!;
      expect(plan.items.find((p) => p.id === "e")!.fireAt).toEqual(full.slice(0, 6));
      expect(plan.trimmedIds).toEqual(["w9", "w10", "e"]); // still cut: 6 of 20
      // two cut runs share the room: the shorter one first, a tie to the earlier one
      const two = [...Array.from({ length: 11 }, (_, i) => weekly([1, 2, 3, 4, 5, 6], { id: `w${i}` })), everyN(3, "2026-10-01", { id: "e1" }), everyN(3, "2026-10-01", { id: "e2" })];
      const p2 = planNotifications(two, now);
      expect(planCost(p2.items)).toBe(60);
      const lens = ["e1", "e2"].map((id) => p2.items.find((p) => p.id === id)?.fireAt?.length ?? 0);
      expect(Math.abs(lens[0]! - lens[1]!)).toBeLessThanOrEqual(1);
      expect(lens[0]!).toBeGreaterThanOrEqual(lens[1]!); // a tie goes to the earlier one
      // nothing is given back when nothing was left out: the cut runs stay exactly as cut
      expect(planNotifications(manyEveryN(12), now).items.map((p) => p.fireAt!.length)).toEqual(Array(12).fill(5));
    });

    it("when whole reminders must go, the ones needing the most notifications go first, a tie goes to the later one, and they are named", () => {
      // 12 reminders on six days each = 72 > 60: two must go, the last two in the list
      const list = Array.from({ length: 12 }, (_, i) => weekly([1, 2, 3, 4, 5, 6], { id: `w${i}` }));
      const plan = planNotifications(list, now);
      expect(planCost(plan.items)).toBe(60);
      expect(plan.items.map((p) => p.id)).toEqual(list.slice(0, 10).map((r) => r.id));
      expect(plan.droppedIds).toEqual(["w10", "w11"]);
      expect(plan.trimmedIds).toEqual(["w10", "w11"]);
      // a costlier one goes before a cheaper one even when it is earlier in the list
      const mixed = [weekly([1, 2, 3, 4, 5, 6], { id: "big" }), ...Array.from({ length: 11 }, (_, i) => weekly([1, 2, 3, 4, 5], { id: `five${i}` }))]; // 6 + 55 = 61
      const p = planNotifications(mixed, now);
      expect(p.droppedIds).toEqual(["big"]);
      expect(planCost(p.items)).toBe(55);
    });

    it("the cap can be given: a small one, none at all, and values that make no sense", () => {
      const list = [rem({ id: "a" }), weekly([1, 3], { id: "b" }), everyN(2, "2026-10-01", { id: "c" })];
      expect(planCost(planNotifications(list, now, 6).items)).toBeLessThanOrEqual(6);
      expect(planNotifications(list, now, 0)).toEqual({ items: [], trimmedIds: ["a", "b", "c"], droppedIds: ["a", "b", "c"] });
      expect(planNotifications(list, now, -5).items).toEqual([]);
      expect(planNotifications(list, now, 2.9).items.length).toBeGreaterThan(0);
      expect(planCost(planNotifications(list, now, 2.9).items)).toBeLessThanOrEqual(2);
      expect(planNotifications(list, now, NaN).items).toHaveLength(3);
      expect(planNotifications(list, now, Infinity).items).toHaveLength(3);
      expect(planCost(planNotifications(manyEveryN(12), now, Infinity).items)).toBe(60);
    });

    it("every plan the planner makes is one the phone accepts: valid items, at most 60 in all, whatever the mix (fuzz)", () => {
      const rnd = mulberry32(99);
      const int = (n: number) => Math.floor(rnd() * n);
      for (let i = 0; i < 400; i++) {
        const list = Array.from({ length: 1 + int(MAX_REMINDERS) }, (_, k): Reminder => {
          const time = `${String(int(24)).padStart(2, "0")}:${String(int(60)).padStart(2, "0")}`;
          const id = `m${i}-${k}`;
          const kind = int(3);
          if (kind === 0) return rem({ id, time, enabled: int(6) > 0 });
          if (kind === 1) return weekly([...new Set(Array.from({ length: 1 + int(7) }, () => 1 + int(7)))].sort((a, b) => a - b), { id, time, enabled: int(6) > 0 });
          return everyN(2 + int(29), localDateString(at(2026, 1 + int(12), 1 + int(28))), { id, time, enabled: int(6) > 0 });
        });
        const plan = planNotifications(list, at(2026, 1 + int(12), 1 + int(28), int(24), int(60)));
        expect(planCost(plan.items)).toBeLessThanOrEqual(PLAN_CAP);
        for (const p of plan.items) expectValidPlanItem(p);
        expect(new Set(plan.items.map((p) => p.id)).size).toBe(plan.items.length);
        const enabled = list.filter((r) => r.enabled).map((r) => r.id);
        expect(plan.items.every((p) => enabled.includes(p.id))).toBe(true);
        expect(plan.droppedIds.every((id) => plan.trimmedIds.includes(id))).toBe(true);
        expect(plan.items.length + plan.droppedIds.length).toBe(enabled.length);
        expect(plan.items.some((p) => plan.droppedIds.includes(p.id))).toBe(false);
      }
    });
  });
});

// ---- the stored list and its helpers

describe("the reminders store", () => {
  beforeEach(() => remindersStore.reset());
  const draft = (over: Partial<ReminderDraft> = {}): ReminderDraft => ({ title: "Morning reminder", time: "08:00", repeat: { kind: "daily" }, ...over });

  it("saves a new reminder and says whether it is the first one that will ring", () => {
    const first = saveReminder(draft());
    expect(first.ok && first.created && first.firstEnabled).toBe(true);
    const second = saveReminder(draft({ title: "Evening reminder", time: "20:00" }));
    expect(second.ok && second.created).toBe(true);
    expect(second.ok && second.firstEnabled).toBe(false);
    expect(remindersStore.get().map((r) => r.title)).toEqual(["Morning reminder", "Evening reminder"]);
    // a paused one doesn't count as one that rings: the next running one is the first
    remindersStore.reset();
    const paused = saveReminder(draft({ enabled: false }));
    expect(paused.ok && paused.firstEnabled).toBe(false);
    const running = saveReminder(draft({ title: "Running" }));
    expect(running.ok && running.firstEnabled).toBe(true);
  });

  it("changes a reminder in place: same id, same date made, same place in the list", () => {
    const a = saveReminder(draft({ title: "A" }));
    const b = saveReminder(draft({ title: "B" }));
    if (!a.ok || !b.ok) throw new Error("save failed");
    const edited = saveReminder({ ...draft({ title: "A renamed", time: "09:15" }), id: a.reminder.id });
    expect(edited.ok && !edited.created).toBe(true);
    expect(edited.ok && edited.firstEnabled).toBe(false); // it was already ringing
    const list = remindersStore.get();
    expect(list.map((r) => r.title)).toEqual(["A renamed", "B"]);
    expect(list[0]).toMatchObject({ id: a.reminder.id, time: "09:15", createdAt: a.reminder.createdAt });
    expect(list).toHaveLength(2);
  });

  it("an edit of the only reminder is not 'the first one' again", () => {
    const a = saveReminder(draft());
    if (!a.ok) throw new Error("save failed");
    const again = saveReminder({ ...draft({ title: "Same one" }), id: a.reminder.id });
    expect(again.ok && again.firstEnabled).toBe(false);
    // but turning on the only paused one is
    remindersStore.reset();
    const p = saveReminder(draft({ enabled: false }));
    if (!p.ok) throw new Error("save failed");
    const on = saveReminder({ ...draft(), id: p.reminder.id, enabled: true });
    expect(on.ok && on.firstEnabled).toBe(true);
  });

  it("refuses what validateDraft refuses, and the 13th", () => {
    expect(saveReminder(draft({ title: "" }))).toEqual({ ok: false, error: "name" });
    expect(remindersStore.get()).toEqual([]);
    for (let i = 0; i < MAX_REMINDERS; i++) expect(saveReminder(draft({ title: `R${i}` })).ok).toBe(true);
    expect(saveReminder(draft({ title: "One more" }))).toEqual({ ok: false, error: "limit" });
    expect(remindersStore.get()).toHaveLength(MAX_REMINDERS);
    // changing one of twelve is fine
    const id = remindersStore.get()[4]!.id;
    expect(saveReminder({ ...draft({ title: "Changed" }), id }).ok).toBe(true);
    expect(remindersStore.get()[4]!.title).toBe("Changed");
  });

  it("deletes, gives the reminder back for Undo, and puts it back where it was", () => {
    const ids = [1, 2, 3].map((n) => {
      const r = saveReminder(draft({ title: `R${n}`, createdAt: `2026-10-0${n}T09:00:00.000Z` }));
      if (!r.ok) throw new Error("save failed");
      return r.reminder.id;
    });
    const gone = deleteReminder(ids[1]!);
    expect(gone?.title).toBe("R2");
    expect(remindersStore.get().map((r) => r.title)).toEqual(["R1", "R3"]);
    expect(deleteReminder("nothing")).toBeNull();
    expect(restoreReminder(gone!)).toBe(true);
    expect(remindersStore.get().map((r) => r.title)).toEqual(["R1", "R2", "R3"]);
    expect(remindersStore.get()[1]).toEqual(gone);
    // restoring twice adds nothing; restoring the last one puts it last
    expect(restoreReminder(gone!)).toBe(false);
    const last = deleteReminder(ids[2]!)!;
    expect(restoreReminder(last)).toBe(true);
    expect(remindersStore.get().map((r) => r.title)).toEqual(["R1", "R2", "R3"]);
    const first = deleteReminder(ids[0]!)!;
    expect(restoreReminder(first)).toBe(true);
    expect(remindersStore.get().map((r) => r.title)).toEqual(["R1", "R2", "R3"]);
  });

  it("Undo can't push the list past the limit, and refuses something that isn't a reminder", () => {
    const first = saveReminder(draft({ title: "First" }));
    if (!first.ok) throw new Error("save failed");
    const gone = deleteReminder(first.reminder.id)!;
    expect(restoreReminder({ ...gone, id: "x y z" })).toBe(false);
    expect(restoreReminder({ ...gone, time: "nope" })).toBe(false);
    expect(remindersStore.get()).toEqual([]);
    for (let i = 0; i < MAX_REMINDERS; i++) saveReminder(draft({ title: `R${i}` }));
    expect(restoreReminder(gone)).toBe(false);
    expect(remindersStore.get()).toHaveLength(MAX_REMINDERS);
  });

  it("pauses and turns back on, without touching anything else", () => {
    const r = saveReminder(draft({ note: "keep me" }));
    if (!r.ok) throw new Error("save failed");
    setReminderEnabled(r.reminder.id, false);
    expect(remindersStore.get()[0]).toEqual({ ...r.reminder, enabled: false });
    setReminderEnabled(r.reminder.id, true);
    expect(remindersStore.get()[0]).toEqual(r.reminder);
    setReminderEnabled("nothing", false);
    expect(remindersStore.get()).toHaveLength(1);
  });

  it("the tick toggles done for today and goes back, and yesterday's tick doesn't count today", () => {
    const r = saveReminder(draft());
    if (!r.ok) throw new Error("save failed");
    const now = at(2026, 10, 16, 9);
    toggleReminderDone(r.reminder.id, now);
    expect(isDoneToday(remindersStore.get()[0]!, now)).toBe(true);
    expect(remindersStore.get()[0]!.doneOn).toBe("2026-10-16");
    expect(isDoneToday(remindersStore.get()[0]!, at(2026, 10, 17, 9))).toBe(false); // resets by itself
    toggleReminderDone(r.reminder.id, now);
    expect(isDoneToday(remindersStore.get()[0]!, now)).toBe(false);
    expect("doneOn" in remindersStore.get()[0]!).toBe(false);
    // tick on the 16th, then on the 17th it is a fresh tick, not an undo of yesterday's
    toggleReminderDone(r.reminder.id, now);
    toggleReminderDone(r.reminder.id, at(2026, 10, 17, 9));
    expect(remindersStore.get()[0]!.doneOn).toBe("2026-10-17");
    toggleReminderDone("nothing", now);
    expect(remindersStore.get()).toHaveLength(1);
  });

  it("a tick dated after today (the phone's date went back) is taken away, so that day doesn't arrive already done; today's and older ticks stay", () => {
    const a = saveReminder(draft({ title: "A" }));
    const b = saveReminder(draft({ title: "B" }));
    const c = saveReminder(draft({ title: "C" }));
    const d = saveReminder(draft({ title: "D" }));
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error("save failed");
    const now = at(2026, 10, 16, 9);
    toggleReminderDone(a.reminder.id, at(2026, 10, 17, 20)); // ticked "tomorrow", then the date went back
    toggleReminderDone(b.reminder.id, now); // today
    toggleReminderDone(c.reminder.id, at(2026, 10, 15, 9)); // yesterday
    expect(isDoneToday(remindersStore.get()[0]!, at(2026, 10, 17, 9))).toBe(true); // the false "done" the fix prevents
    dropFutureTicks(now);
    const [ra, rb, rc, rd] = remindersStore.get();
    expect("doneOn" in ra!).toBe(false);
    expect(rb!.doneOn).toBe("2026-10-16");
    expect(rc!.doneOn).toBe("2026-10-15");
    expect("doneOn" in rd!).toBe(false);
    expect(isDoneToday(ra!, at(2026, 10, 17, 9))).toBe(false);
    // nothing to take away: the list is not written again, and nobody is told
    let calls = 0;
    const off = remindersStore.subscribe(() => calls++);
    dropFutureTicks(now);
    dropFutureTicks(at(2026, 12, 1));
    expect(calls).toBe(0);
    off();
    // and a plan made from the store is the same before and after (a tick never changes what rings)
    expect(planNotifications(remindersStore.get(), now)).toEqual(planNotifications(remindersStore.get().map(undoDone), now));
    dropFutureTicks(new Date(NaN)); // never throws
  });

  it("clearing empties it and tells whoever is listening (which sends the phone an empty plan), even when it was already empty", () => {
    saveReminder(draft());
    let calls = 0;
    const off = remindersStore.subscribe(() => calls++);
    clearReminders();
    expect(remindersStore.get()).toEqual([]);
    expect(calls).toBeGreaterThan(0);
    const before = calls;
    clearReminders();
    expect(calls).toBeGreaterThan(before);
    off();
    expect(planNotifications(remindersStore.get(), at(2026, 10, 16, 9))).toStrictEqual({ items: [], trimmedIds: [], droppedIds: [] });
  });

  it("reads back through the sanitiser: a store holding junk gives only the good reminders", () => {
    const storage = new Map<string, string>();
    const kv = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) };
    storage.set("mm.v1.reminders", JSON.stringify({ v: 1, data: [{ id: "ok", title: "Fine", time: "08:00", repeat: { kind: "daily" } }, { id: "bad", title: "", time: "08:00", repeat: { kind: "daily" } }, 7, null] }));
    const store = createStore<Reminder[]>("mm.v1.reminders", [], { sanitize: sanitiseReminders, storage: kv });
    expect(store.get().map((r) => r.id)).toEqual(["ok"]);
    storage.set("mm.v1.reminders", "not json at all {");
    expect(createStore<Reminder[]>("mm.v1.reminders", [], { sanitize: sanitiseReminders, storage: kv }).get()).toEqual([]);
    storage.set("mm.v1.reminders", JSON.stringify({ v: 2, data: [{ id: "ok", title: "Fine", time: "08:00", repeat: { kind: "daily" } }] }));
    expect(createStore<Reminder[]>("mm.v1.reminders", [], { sanitize: sanitiseReminders, storage: kv }).get()).toEqual([]);
  });
});

// ---- reminders stay on the phone

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("reminders never leave the device", () => {
  it("are not one of the synced stores, and the settings that sync say nothing of them", () => {
    expect((SYNC_STORES as readonly string[]).filter((s) => /remind/i.test(s))).toEqual([]);
    expect([...SYNCED_SETTING_KEYS].filter((k) => /remind/i.test(k))).toEqual([]);
    const names = createSyncAdapters({ settings: remindersStore, favorites: remindersStore, saved: remindersStore, log: remindersStore, shopping: remindersStore, savedRecipes: remindersStore, myRecipes: remindersStore, cupboard: remindersStore, compare: remindersStore } as never).map((a) => a.name);
    expect(names.filter((n) => /remind/i.test(n))).toEqual([]);
  });

  it("are not in the database's list of stores, the sync code, the share link, the outbox or the analytics", () => {
    for (const file of ["lib/mm/syncStores.ts", "lib/mm/syncMerge.ts", "lib/mm/sync.ts", "lib/mm/shareList.ts", "lib/mm/outbox.ts", "lib/mm/analytics.ts", "lib/mm/user-data.ts", "lib/mm/account.ts"]) {
      expect(read(file), file).not.toMatch(/remind/i);
    }
    for (const f of readdirSync(new URL("../../supabase/migrations/", import.meta.url))) expect(read(`../supabase/migrations/${f}`), f).not.toMatch(/remind/i);
  });

  it("are not mentioned by anything the server runs: no API route, no handler, no sync or auth code", () => {
    const files = [...sourceFiles(new URL("../app/api/", import.meta.url).pathname), ...sourceFiles(new URL("../lib/sync/", import.meta.url).pathname), ...sourceFiles(new URL("../lib/auth/", import.meta.url).pathname)];
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/remind/i);
  });

  it("a different person signing in on the same phone starts with no reminders, and signing in never uploads them", async () => {
    const reminders = createStore<Reminder[]>("r", [], { sanitize: sanitiseReminders, storage: null });
    const meta = createStore<SyncMeta>("meta", EMPTY_META, { sanitize: sanitizeMeta, storage: null });
    const api = { syncGetAll: async () => ({}), syncPut: async () => { throw new Error("nothing should be uploaded"); } } as unknown as SyncApi;
    const engine = new SyncEngine({ adapters: [], meta, api, now: () => 0, localStores: [reminders] });
    reminders.set([{ id: "mine", title: "Morning reminder", time: "08:00", repeat: { kind: "daily" }, enabled: true, createdAt: "2026-10-01T09:00:00.000Z" }]);
    engine.prepareFor("person-1"); // the first account on this phone: what is here is theirs
    expect(reminders.get()).toHaveLength(1);
    engine.prepareFor("person-1");
    expect(reminders.get()).toHaveLength(1);
    engine.prepareFor("person-2"); // somebody else: not their reminders
    expect(reminders.get()).toEqual([]);
  });

  it("Settings' Clear data empties them, and so does a different person signing in (the real wiring)", () => {
    const settings = read("app/app/settings/page.tsx");
    expect(settings).toContain("clearReminders()");
    expect(settings.match(/reminders you set/g)?.length).toBe(2); // the sentence, in both its versions, says so
    expect(read("app/app/_lib/account.ts")).toMatch(/localStores: \[[^\]]*remindersStore[^\]]*\]/);
  });
});
