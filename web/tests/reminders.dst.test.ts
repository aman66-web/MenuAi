import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  formatTime, isDoneToday, isoToIosWeekday, isoWeekday, localDateString, markDone, nextOccurrence, occursOn, planNotifications, type Reminder,
} from "../lib/mm/reminders";

// Clock changes and time zones (lib/mm/reminders.ts, the note at the top). A reminder is a wall-clock time on the phone's own calendar, so these
// tests set the computer's time zone to zones that move their clocks and check what happens on the nights they do. Changing the zone only works in
// a test process of its own (vitest's default threads share one), so when this file is run in one that can't, it runs itself again in a child
// process with --pool=forks and reports what that said.

const CHILD_FLAG = "MM_REMINDERS_DST_CHILD";

function canSwitchZone(): boolean {
  const before = process.env.TZ;
  try {
    process.env.TZ = "Europe/London";
    return new Date(2026, 2, 29, 1, 30).getHours() === 2; // 01:30 on the night the UK clocks go forward does not exist: it comes out as 02:30
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------

interface Zone {
  name: string;
  /** The date clocks go forward, a wall-clock time inside the skipped stretch, and where JavaScript (and so the plan) puts it. */
  spring: [number, number, number];
  inGap: string;
  movedTo: string;
  /** The date clocks go back, and a wall-clock time inside the stretch that happens twice. */
  fall: [number, number, number];
  repeated: string;
}

const ZONES: Zone[] = [
  { name: "Europe/London", spring: [2026, 3, 29], inGap: "01:30", movedTo: "02:30", fall: [2026, 10, 25], repeated: "01:30" },
  { name: "America/New_York", spring: [2026, 3, 8], inGap: "02:30", movedTo: "03:30", fall: [2026, 11, 1], repeated: "01:30" },
  { name: "Australia/Lord_Howe", spring: [2026, 10, 4], inGap: "02:15", movedTo: "02:45", fall: [2026, 4, 5], repeated: "01:45" }, // a half-hour change
  { name: "Pacific/Auckland", spring: [2026, 9, 27], inGap: "02:30", movedTo: "03:30", fall: [2026, 4, 5], repeated: "02:30" },
];
/** Zones whose clocks change at midnight (Cairo: the last Friday of April, 00:00 to 01:00; Santiago: the first Sunday in September, and back in April). */
const MIDNIGHT_ZONES: Array<{ name: string; spring: [number, number, number]; fall: [number, number, number] }> = [
  { name: "Africa/Cairo", spring: [2026, 4, 24], fall: [2026, 10, 29] },
  { name: "America/Santiago", spring: [2026, 9, 6], fall: [2026, 4, 4] },
];
/** No clock changes, but odd offsets from UTC: +5:30, +14, -10, +5:45 (as getTimezoneOffset gives them: minutes, west of UTC positive). */
const STEADY_ZONES: Array<[string, number]> = [["UTC", 0], ["Asia/Kolkata", -330], ["Pacific/Kiritimati", -840], ["Pacific/Honolulu", 600], ["Asia/Kathmandu", -345]];

const at = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms);
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (t: [number, number, number]) => `${t[0]}-${pad(t[1])}-${pad(t[2])}`;
const local = (d: Date) => `${localDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const addDays = (t: [number, number, number], n: number): [number, number, number] => {
  const d = new Date(t[0], t[1] - 1, t[2] + n, 12);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
};

let counter = 0;
const rem = (over: Partial<Reminder> = {}): Reminder => ({
  id: `z${++counter}`, title: "Morning reminder", time: "08:00", repeat: { kind: "daily" }, enabled: true, createdAt: "2026-01-01T09:00:00.000Z", ...over,
});
const weekly = (days: number[], over: Partial<Reminder> = {}) => rem({ repeat: { kind: "weekdays", days }, ...over });
const everyN = (every: number, startDate: string, over: Partial<Reminder> = {}) => rem({ repeat: { kind: "everyNDays", every, startDate }, ...over });

/** Every instant (as milliseconds) at which the phone's clock reads this wall-clock time on this date: none in a skipped stretch, two in a repeated one. */
function instantsAt(date: [number, number, number], time: string): number[] {
  const [y, m, d] = date;
  const hh = Number(time.slice(0, 2));
  const mm = Number(time.slice(3));
  const base = Date.UTC(y, m - 1, d, hh, mm);
  const out: number[] = [];
  for (let minutes = -16 * 60; minutes <= 16 * 60; minutes++) {
    const t = new Date(base + minutes * 60_000);
    if (t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d && t.getHours() === hh && t.getMinutes() === mm) out.push(t.getTime());
  }
  return out;
}

/** Does the reminder's schedule include this day? Worked out by stepping through the calendar, not with the library's day numbers. */
function oracleOccurs(r: Reminder, day: Date): boolean {
  const key = localDateString(day);
  if (r.repeat.kind === "daily") return true;
  if (r.repeat.kind === "weekdays") return r.repeat.days.includes(day.getDay() === 0 ? 7 : day.getDay());
  const [sy, sm, sd] = r.repeat.startDate.split("-").map(Number) as [number, number, number];
  for (let i = 0; i < 3000; i++) {
    const k = localDateString(new Date(sy, sm - 1, sd + i * r.repeat.every, 12));
    if (k === key) return true;
    if (k > key) return false;
  }
  return false;
}

function oracleNext(r: Reminder, from: Date): Date | null {
  if (!r.enabled) return null;
  const hh = Number(r.time.slice(0, 2));
  const mm = Number(r.time.slice(3));
  for (let k = 0; k < 400; k++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + k, 12);
    if (!oracleOccurs(r, day)) continue;
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, 0, 0);
    if (at.getTime() > from.getTime()) return at;
  }
  return null;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inZone(zone: string) {
  const before = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
  });
  afterAll(() => {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  });
}

function defineTests() {
  for (const z of ZONES) {
    describe(`clocks that change: ${z.name}`, () => {
      inZone(z.name);
      const nextDay = addDays(z.spring, 1);
      const dayBefore = addDays(z.spring, -1);

      it("the zone is what these tests assume (so a failure here is the computer's time zone data, not the reminders)", () => {
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone.replace("Calcutta", "Kolkata")).toBe(z.name);
        expect(instantsAt(z.spring, z.inGap), `${z.inGap} on ${ymd(z.spring)} should not exist`).toEqual([]);
        expect(local(new Date(z.spring[0], z.spring[1] - 1, z.spring[2], Number(z.inGap.slice(0, 2)), Number(z.inGap.slice(3))))).toBe(`${ymd(z.spring)}T${z.movedTo}`);
        expect(instantsAt(z.fall, z.repeated), `${z.repeated} on ${ymd(z.fall)} should happen twice`).toHaveLength(2);
        expect(instantsAt(addDays(z.fall, 1), z.repeated)).toHaveLength(1);
        expect(new Date(z.spring[0], z.spring[1] - 1, z.spring[2]).getDay()).toBe(0); // all four changes are on Sundays
        expect(new Date(z.fall[0], z.fall[1] - 1, z.fall[2]).getDay()).toBe(0);
      });

      it("the night clocks go forward: a reminder inside the skipped stretch is moved to a time that exists, on the same day, and never lost", () => {
        const r = rem({ time: z.inGap });
        const from = at(dayBefore[0], dayBefore[1], dayBefore[2], 23, 0);
        const next = nextOccurrence(r, from)!;
        expect(local(next)).toBe(`${ymd(z.spring)}T${z.movedTo}`);
        expect(instantsAt(z.spring, z.movedTo)).toHaveLength(1);
        // the day after is normal again
        const after = nextOccurrence(r, next)!;
        expect(local(after)).toBe(`${ymd(nextDay)}T${z.inGap}`);
        expect(occursOn(r, next)).toBe(true);
      });

      it("the plan for 'every few days' puts that day's time where it exists, and keeps the person's own hour and minute", () => {
        const start = addDays(z.spring, -4);
        const r = everyN(2, ymd(start), { time: z.inGap, id: "gap" });
        const item = planNotifications([r], at(dayBefore[0], dayBefore[1], dayBefore[2], 12, 0)).items[0]!;
        expect(item.hour).toBe(Number(z.inGap.slice(0, 2)));
        expect(item.minute).toBe(Number(z.inGap.slice(3)));
        // start -4, every 2 days: -4, -2, 0 (the spring date), +2, ...
        expect(item.fireAt!.slice(0, 3)).toEqual([`${ymd(z.spring)}T${z.movedTo}`, `${ymd(addDays(z.spring, 2))}T${z.inGap}`, `${ymd(addDays(z.spring, 4))}T${z.inGap}`]);
        for (const s of item.fireAt!) {
          const [date, time] = s.split("T") as [string, string];
          const [y, m, d] = date.split("-").map(Number) as [number, number, number];
          expect(instantsAt([y, m, d], time).length, `${s} is a time the clock shows`).toBeGreaterThanOrEqual(1);
        }
      });

      it("the night clocks go back: the repeated time is the first one, once, and the next ring is the next day", () => {
        const r = rem({ time: z.repeated });
        const [first, second] = instantsAt(z.fall, z.repeated) as [number, number];
        expect(second).toBeGreaterThan(first);
        const dayBeforeFall = addDays(z.fall, -1);
        expect(nextOccurrence(r, at(dayBeforeFall[0], dayBeforeFall[1], dayBeforeFall[2], 23, 0))!.getTime()).toBe(first);
        expect(nextOccurrence(r, new Date(first - 1))!.getTime()).toBe(first);
        // just after the first one, and even between the two: the next ring is the day after, not the second 01:30
        const tomorrow = instantsAt(addDays(z.fall, 1), z.repeated);
        expect(tomorrow).toHaveLength(1);
        expect(nextOccurrence(r, new Date(first + 60_000))!.getTime()).toBe(tomorrow[0]);
        expect(nextOccurrence(r, new Date(second - 60_000))!.getTime()).toBe(tomorrow[0]);
        expect(nextOccurrence(r, new Date(second + 60_000))!.getTime()).toBe(tomorrow[0]);
        // and the plan lists the date once
        const start = addDays(z.fall, -2);
        const item = planNotifications([everyN(2, ymd(start), { time: z.repeated })], at(dayBeforeFall[0], dayBeforeFall[1], dayBeforeFall[2], 12, 0)).items[0]!;
        expect(item.fireAt!.filter((s) => s === `${ymd(z.fall)}T${z.repeated}`)).toHaveLength(1);
      });

      it("'every few days' counts calendar days, not blocks of 24 hours, across both changes", () => {
        for (const date of [z.spring, z.fall]) {
          const start = addDays(date, -1); // the day before the change; every 2 days lands the day after it
          const r = everyN(2, ymd(start), { time: "08:00" });
          const next = nextOccurrence(r, at(start[0], start[1], start[2], 9, 0))!;
          const target = addDays(date, 1);
          expect(local(next), `across ${ymd(date)}`).toBe(`${ymd(target)}T08:00`);
          // it is not 48 hours later, because the change made a day 23 (or 25) hours long
          const from = at(start[0], start[1], start[2], 8, 0);
          expect(next.getTime() - from.getTime()).not.toBe(48 * 3600_000);
          expect(occursOn(r, at(target[0], target[1], target[2], 0, 0))).toBe(true);
          expect(occursOn(r, at(target[0], target[1], target[2], 23, 59, 59, 999))).toBe(true);
          expect(occursOn(r, at(date[0], date[1], date[2], 12, 0))).toBe(false);
        }
        // every 3 days from the Friday before the UK/US spring change: the Monday after is 71 hours later, not 72
        const start = addDays(z.spring, -2);
        const r = everyN(3, ymd(start), { time: "08:00" });
        const first = nextOccurrence(r, at(start[0], start[1], start[2], 7, 0))!;
        const second = nextOccurrence(r, first)!;
        expect(local(first)).toBe(`${ymd(start)}T08:00`);
        expect(local(second)).toBe(`${ymd(addDays(start, 3))}T08:00`);
        expect(second.getTime() - first.getTime()).not.toBe(72 * 3600_000);
      });

      it("a weekly reminder still lands on its weekday and its wall-clock time on the change days (both are Sundays)", () => {
        const r = weekly([7], { time: "08:00" });
        for (const date of [z.spring, z.fall]) {
          const saturday = addDays(date, -1);
          const next = nextOccurrence(r, at(saturday[0], saturday[1], saturday[2], 20, 0))!;
          expect(local(next)).toBe(`${ymd(date)}T08:00`);
          expect(nextOccurrence(r, next)!.getTime()).toBe(at(...addDays(date, 7), 8, 0).getTime());
          expect(isoWeekday(next)).toBe(7);
          expect(isoToIosWeekday(isoWeekday(next))).toBe(next.getDay() + 1);
        }
        const plan = planNotifications([weekly([6, 7], { id: "weekend" })], at(2026, 1, 2, 9, 0));
        expect(plan.items[0]!.weekdays).toEqual([1, 7]);
      });

      it("a reminder's times of day are shown the same on the change days (the display ignores the zone)", () => {
        expect(formatTime(z.inGap, "en-GB")).toBe(z.inGap);
        expect(formatTime(z.repeated, "en-GB")).toBe(z.repeated);
        expect(formatTime("00:00", "en-GB")).toBe("00:00");
      });

      it("the next time agrees with looking at the calendar day by day, for starts either side of both changes (fuzz)", () => {
        const rnd = mulberry32(z.name.length * 1009);
        const int = (n: number) => Math.floor(rnd() * n);
        for (let i = 0; i < 250; i++) {
          const around = rnd() < 0.5 ? z.spring : z.fall;
          const time = rnd() < 0.5 ? (rnd() < 0.5 ? z.inGap : z.repeated) : `${pad(int(24))}:${pad(int(60))}`;
          const k = int(3);
          const startOfSchedule = addDays(around, -int(40));
          const r =
            k === 0 ? rem({ time }) : k === 1 ? weekly([...new Set(Array.from({ length: 1 + int(3) }, () => 1 + int(7)))].sort((a, b) => a - b), { time }) : everyN(2 + int(14), ymd(startOfSchedule), { time });
          const from = new Date(at(around[0], around[1], around[2], 12).getTime() + (int(5 * 24 * 60) - 2 * 24 * 60) * 60_000); // 2 days either side of the change, to the minute
          expect(local(nextOccurrence(r, from)!), `${JSON.stringify(r.repeat)} ${time} after ${from.toISOString()}`).toBe(local(oracleNext(r, from)!));
        }
      });

      it("every time in a plan is one the clock shows, later than now, and on a day the reminder is for (fuzz across both changes)", () => {
        const rnd = mulberry32(z.name.length * 7919);
        const int = (n: number) => Math.floor(rnd() * n);
        for (let i = 0; i < 80; i++) {
          const around = rnd() < 0.5 ? z.spring : z.fall;
          const time = rnd() < 0.4 ? z.inGap : rnd() < 0.5 ? z.repeated : `${pad(int(24))}:${pad(int(60))}`;
          const r = everyN(2 + int(20), ymd(addDays(around, -int(60))), { time, id: `p${i}` });
          const from = new Date(at(around[0], around[1], around[2], 12).getTime() + (int(10 * 24) - 5 * 24) * 3600_000);
          const shots = planNotifications([r], from).items[0]!.fireAt!;
          let previous = -Infinity;
          for (const s of shots) {
            const [date, hm] = s.split("T") as [string, string];
            const [y, m, d] = date.split("-").map(Number) as [number, number, number];
            const instants = instantsAt([y, m, d], hm);
            expect(instants.length, `${s} exists on the clock`).toBeGreaterThanOrEqual(1);
            expect(instants[0]!, s).toBeGreaterThan(from.getTime());
            expect(instants[0]!, s).toBeGreaterThan(previous);
            previous = instants[0]!;
            expect(oracleOccurs(r, new Date(y, m - 1, d, 12)), `${s} is one of ${JSON.stringify(r.repeat)}`).toBe(true);
          }
        }
      });
    });
  }

  // Zones whose clocks change AT MIDNIGHT (so the skipped or repeated stretch touches the edge of a calendar day): a time in the gap must stay on its own
  // date, never slide to the day before or after. Not in ZONES above because those tests assume a change on a Sunday inside the day.
  for (const z of MIDNIGHT_ZONES) {
    describe(`clocks that change at midnight: ${z.name}`, () => {
      inZone(z.name);

      it("the zone is what these tests assume", () => {
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(z.name);
        expect(instantsAt(z.spring, "00:30"), `00:30 on ${ymd(z.spring)} should not exist`).toEqual([]);
        expect(instantsAt(z.fall, "23:30"), `23:30 on ${ymd(z.fall)} should happen twice`).toHaveLength(2);
        expect(instantsAt(addDays(z.spring, 1), "00:30")).toHaveLength(1);
      });

      it("a time in the skipped first hour of the day stays on that date (moved forward), and the day after is normal", () => {
        const r = rem({ time: "00:30" });
        const dayBefore = addDays(z.spring, -1);
        const next = nextOccurrence(r, at(dayBefore[0], dayBefore[1], dayBefore[2], 12, 0))!;
        expect(local(next)).toBe(`${ymd(z.spring)}T01:30`);
        expect(localDateString(next)).toBe(ymd(z.spring)); // not the day before, not the day after
        expect(occursOn(r, next)).toBe(true);
        expect(local(nextOccurrence(r, next)!)).toBe(`${ymd(addDays(z.spring, 1))}T00:30`);
        // the day before is untouched
        expect(local(nextOccurrence(r, at(dayBefore[0], dayBefore[1], dayBefore[2], 0, 10))!)).toBe(`${ymd(dayBefore)}T00:30`);
      });

      it("the plan for 'every few days' keeps the moved time on its own date and lists no date twice", () => {
        const start = addDays(z.spring, -4);
        const item = planNotifications([everyN(2, ymd(start), { time: "00:30", id: "mid" })], at(...addDays(z.spring, -2), 12, 0)).items[0]!;
        expect(item.hour).toBe(0);
        expect(item.minute).toBe(30);
        expect(item.fireAt!.slice(0, 3)).toEqual([`${ymd(z.spring)}T01:30`, `${ymd(addDays(z.spring, 2))}T00:30`, `${ymd(addDays(z.spring, 4))}T00:30`]);
        const dates = item.fireAt!.map((f) => f.slice(0, 10));
        expect(new Set(dates).size).toBe(dates.length);
        expect(dates).toContain(ymd(z.spring));
        expect(item.fireAt).toContain(`${ymd(z.spring)}T01:30`);
        for (const f of item.fireAt!) {
          const [d, hm] = f.split("T") as [string, string];
          const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
          expect(instantsAt([y, m, dd], hm).length, `${f} is a time the clock shows`).toBeGreaterThanOrEqual(1);
        }
      });

      it("a time that happens twice at the end of the day is rung once, on that date, and the next ring is the next day", () => {
        const r = rem({ time: "23:30" });
        const [first, second] = instantsAt(z.fall, "23:30") as [number, number];
        const before = addDays(z.fall, -1);
        expect(nextOccurrence(r, at(before[0], before[1], before[2], 23, 45))!.getTime()).toBe(first);
        expect(local(nextOccurrence(r, new Date(first + 60_000))!)).toBe(`${ymd(addDays(z.fall, 1))}T23:30`);
        expect(local(nextOccurrence(r, new Date(second + 60_000))!)).toBe(`${ymd(addDays(z.fall, 1))}T23:30`);
        const item = planNotifications([everyN(2, ymd(addDays(z.fall, -2)), { time: "23:30" })], at(...before, 12, 0)).items[0]!;
        expect(item.fireAt!.filter((f) => f === `${ymd(z.fall)}T23:30`)).toHaveLength(1);
      });

      it("the next time agrees with the calendar around both changes (fuzz)", () => {
        const rnd = mulberry32(z.name.length * 4241);
        const int = (n: number) => Math.floor(rnd() * n);
        for (let i = 0; i < 150; i++) {
          const around = rnd() < 0.5 ? z.spring : z.fall;
          const time = rnd() < 0.5 ? (rnd() < 0.5 ? "00:30" : "23:30") : `${pad(int(24))}:${pad(int(60))}`;
          const k = int(3);
          const r =
            k === 0 ? rem({ time }) : k === 1 ? weekly([...new Set(Array.from({ length: 1 + int(3) }, () => 1 + int(7)))].sort((a, b) => a - b), { time }) : everyN(2 + int(14), ymd(addDays(around, -int(40))), { time });
          const from = new Date(at(around[0], around[1], around[2], 12).getTime() + (int(5 * 24 * 60) - 2 * 24 * 60) * 60_000);
          expect(local(nextOccurrence(r, from)!), `${JSON.stringify(r.repeat)} ${time} after ${from.toISOString()}`).toBe(local(oracleNext(r, from)!));
        }
      });
    });
  }

  for (const [zone, offset] of STEADY_ZONES) {
    describe(`other zones: ${zone}`, () => {
      inZone(zone);
      it("the phone's date and the tick use the zone's own calendar day, even when it is another day in UTC", () => {
        expect(at(2026, 10, 16, 12).getTimezoneOffset()).toBe(offset);
        const r = rem();
        // a few minutes after local midnight and a few before it, wherever the zone is
        const justAfter = at(2026, 10, 16, 0, 5);
        const justBefore = at(2026, 10, 15, 23, 55);
        const done = markDone(r, justAfter);
        expect(done.doneOn).toBe("2026-10-16");
        expect(isDoneToday(done, at(2026, 10, 16, 23, 59))).toBe(true);
        expect(isDoneToday(done, justBefore)).toBe(false);
        expect(isDoneToday(markDone(r, justBefore), at(2026, 10, 15, 0, 1))).toBe(true);
        expect(isDoneToday(markDone(r, justBefore), justAfter)).toBe(false);
      });

      it("a weekly reminder lands on the right local weekday and time", () => {
        const r = weekly([1, 3, 5], { time: "21:30" });
        let from = at(2026, 10, 12, 20, 0);
        const seen: string[] = [];
        for (let i = 0; i < 6; i++) {
          const next = nextOccurrence(r, from)!;
          seen.push(`${next.getDay() + 1}@${pad(next.getHours())}:${pad(next.getMinutes())}`);
          from = next;
        }
        expect(seen).toEqual(["2@21:30", "4@21:30", "6@21:30", "2@21:30", "4@21:30", "6@21:30"]);
      });

      it("the next time agrees with the calendar for random reminders (fuzz)", () => {
        const rnd = mulberry32(zone.length * 31);
        const int = (n: number) => Math.floor(rnd() * n);
        for (let i = 0; i < 120; i++) {
          const time = `${pad(int(24))}:${pad(int(60))}`;
          const k = int(3);
          const r =
            k === 0 ? rem({ time }) : k === 1 ? weekly([...new Set(Array.from({ length: 1 + int(3) }, () => 1 + int(7)))].sort((a, b) => a - b), { time }) : everyN(2 + int(29), ymd([2026, 1 + int(12), 1 + int(28)]), { time });
          const from = new Date(at(2026, 6, 15, 12).getTime() + (int(400 * 24 * 60) - 200 * 24 * 60) * 60_000);
          expect(local(nextOccurrence(r, from)!)).toBe(local(oracleNext(r, from)!));
        }
      });
    });
  }
}

if (!canSwitchZone()) {
  describe("clock changes (run in a process that can change time zone)", () => {
    it("passes when run with --pool=forks", () => {
      expect(process.env[CHILD_FLAG], "the child process still could not change time zone").toBeUndefined();
      const entry = join(dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs");
      expect(existsSync(entry)).toBe(true);
      try {
        execFileSync(process.execPath, [entry, "run", "tests/reminders.dst.test.ts", "--pool=forks", "--reporter=dot"], {
          cwd: new URL("..", import.meta.url).pathname,
          env: { ...process.env, [CHILD_FLAG]: "1" },
          stdio: "pipe",
          timeout: 180_000,
        });
      } catch (e) {
        const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
        throw new Error(`The clock-change tests failed in their own process:\n${err.stdout?.toString() ?? ""}\n${err.stderr?.toString() ?? ""}\n${err.message ?? ""}`);
      }
    }, 200_000);
  });
} else {
  defineTests();
}
