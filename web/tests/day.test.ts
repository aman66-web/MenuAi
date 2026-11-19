import { describe, expect, it } from "vitest";
import { addMonths, calendarBounds, dayHref, dayParam, isFutureDay, loggedDayKeys, monthGrid, parseDayParam, sameMonth, shortDate, startOfDay, stepDay, weekOf } from "../lib/mm/day";

// Home's date, the calendar and the day page: pure helpers.

const FRI_16_OCT = new Date(2026, 9, 16, 14, 30); // a Friday, mid-afternoon

describe("dayParam and parseDayParam", () => {
  it("writes the local date, month 1 to 12, and reads it back to local midnight", () => {
    expect(dayParam(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dayParam(FRI_16_OCT)).toBe("2026-10-16");
    const back = parseDayParam("2026-10-14", FRI_16_OCT);
    expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours()]).toEqual([2026, 9, 14, 0]);
  });
  it("falls back to today for a missing, malformed, impossible or future date", () => {
    const today = startOfDay(FRI_16_OCT).getTime();
    for (const bad of [undefined, null, "", "abc", "2026-10-1", "2026-13-01", "2026-02-30", "2026-00-10", "2026-10-00", "20261014", "2026-10-14x", "2026-10-17", "2027-01-01"]) {
      expect(parseDayParam(bad, FRI_16_OCT).getTime(), String(bad)).toBe(today);
    }
  });
  it("accepts today and any earlier real date, however old", () => {
    expect(dayParam(parseDayParam("2026-10-16", FRI_16_OCT))).toBe("2026-10-16");
    expect(dayParam(parseDayParam("2024-02-29", FRI_16_OCT))).toBe("2024-02-29"); // a leap day
    expect(dayParam(parseDayParam("2019-01-01", FRI_16_OCT))).toBe("2019-01-01");
  });
});

describe("dayHref, isFutureDay and stepDay", () => {
  it("opens today as the plain page and every other day with its date", () => {
    expect(dayHref(FRI_16_OCT, FRI_16_OCT)).toBe("/app/today");
    expect(dayHref(new Date(2026, 9, 16, 1, 0), FRI_16_OCT)).toBe("/app/today");
    expect(dayHref(new Date(2026, 9, 14), FRI_16_OCT)).toBe("/app/today?d=2026-10-14");
  });
  it("knows the days ahead", () => {
    expect(isFutureDay(new Date(2026, 9, 17), FRI_16_OCT)).toBe(true);
    expect(isFutureDay(new Date(2026, 9, 16, 23, 59), FRI_16_OCT)).toBe(false);
    expect(isFutureDay(new Date(2026, 9, 15), FRI_16_OCT)).toBe(false);
  });
  it("steps a day at a time, across month and year ends, and never past today", () => {
    expect(dayParam(stepDay(new Date(2026, 9, 14), -1, FRI_16_OCT))).toBe("2026-10-13");
    expect(dayParam(stepDay(new Date(2026, 9, 1), -1, FRI_16_OCT))).toBe("2026-09-30");
    expect(dayParam(stepDay(new Date(2026, 0, 1), -1, new Date(2026, 5, 1)))).toBe("2025-12-31");
    expect(dayParam(stepDay(new Date(2026, 9, 15), 1, FRI_16_OCT))).toBe("2026-10-16");
    expect(dayParam(stepDay(new Date(2026, 9, 16), 1, FRI_16_OCT))).toBe("2026-10-16");
  });
});

describe("shortDate", () => {
  it("is month first in English: Oct 16, Nov 15, Sep 5", () => {
    expect(shortDate(FRI_16_OCT, "en-GB")).toBe("Oct 16");
    expect(shortDate(FRI_16_OCT, "en")).toBe("Oct 16");
    expect(shortDate(new Date(2026, 10, 15), "en-GB")).toBe("Nov 15");
    expect(shortDate(new Date(2026, 8, 5), "en-GB")).toBe("Sep 5");
  });
  it("uses each other language's own short form (day and a short month)", () => {
    const pl = shortDate(FRI_16_OCT, "pl");
    expect(pl).toContain("16");
    expect(pl).not.toContain("Oct");
    expect(shortDate(FRI_16_OCT, "it")).toContain("16");
    expect(shortDate(FRI_16_OCT, "not a locale!!")).toBe("Oct 16"); // a language the browser doesn't know falls back to English
  });
});

describe("monthGrid", () => {
  it("lays October 2026 out in Monday-first weeks with blanks around it", () => {
    const weeks = monthGrid(2026, 9); // 1 Oct 2026 is a Thursday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.length).toBe(5);
    expect(weeks[0]!.map((d) => d?.getDate() ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks[4]!.map((d) => d?.getDate() ?? null)).toEqual([26, 27, 28, 29, 30, 31, null]);
    expect(weeks.flat().filter(Boolean).length).toBe(31);
  });
  it("starts a Monday-1st month with no blanks, and a Sunday-1st month with six", () => {
    expect(monthGrid(2026, 5)[0]![0]?.getDate()).toBe(1); // 1 June 2026 is a Monday
    const feb = monthGrid(2026, 1); // 1 Feb 2026 is a Sunday
    expect(feb[0]!.filter((d) => d === null).length).toBe(6);
    expect(feb.flat().filter(Boolean).length).toBe(28);
  });
  it("counts a leap February and gives every cell the right month", () => {
    const feb = monthGrid(2028, 1).flat().filter((d): d is Date => d !== null);
    expect(feb.length).toBe(29);
    expect(feb.every((d) => d.getMonth() === 1 && d.getFullYear() === 2028)).toBe(true);
  });
});

describe("addMonths and the calendar's reach", () => {
  it("moves across year ends in both directions", () => {
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 9 }, -12)).toEqual({ year: 2025, month: 9 });
    expect(addMonths({ year: 2026, month: 9 }, 0)).toEqual({ year: 2026, month: 9 });
  });
  it("goes back twelve months and forward to the current month only", () => {
    const { earliest, latest } = calendarBounds(FRI_16_OCT);
    expect(latest).toEqual({ year: 2026, month: 9 });
    expect(earliest).toEqual({ year: 2025, month: 9 });
    expect(sameMonth(latest, { year: 2026, month: 9 })).toBe(true);
    expect(sameMonth(latest, earliest)).toBe(false);
  });
});

describe("loggedDayKeys", () => {
  it("lists each local day with something logged once, and ignores a bad date", () => {
    const keys = loggedDayKeys([
      { loggedAt: new Date(2026, 9, 14, 8).toISOString() },
      { loggedAt: new Date(2026, 9, 14, 19).toISOString() },
      { loggedAt: new Date(2026, 9, 16, 12).toISOString() },
      { loggedAt: "not a date" },
    ]);
    expect([...keys].sort()).toEqual(["2026-10-14", "2026-10-16"]);
  });
});

describe("weekOf (Home's day circles and its week page)", () => {
  it("runs Monday to Sunday at local midnight, and a Sunday belongs to the week that began the Monday before", () => {
    const wed = weekOf(new Date(2026, 10, 18, 15, 30));
    expect(wed.map(dayParam)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(wed.every((d) => d.getHours() === 0 && d.getMinutes() === 0)).toBe(true);
    expect(weekOf(new Date(2026, 10, 22, 23, 59)).map(dayParam)[0]).toBe("2026-11-16");
    expect(weekOf(new Date(2026, 10, 16, 0, 1)).map(dayParam)[6]).toBe("2026-11-22");
  });
  it("keeps seven different calendar days across a clock change and a month end", () => {
    const march = weekOf(new Date(2027, 2, 29, 12)).map(dayParam); // the UK clocks go forward on Sunday 28 March 2027
    expect(march).toEqual(["2027-03-29", "2027-03-30", "2027-03-31", "2027-04-01", "2027-04-02", "2027-04-03", "2027-04-04"]);
    expect(new Set(weekOf(new Date(2027, 2, 28, 12)).map(dayParam)).size).toBe(7);
    expect(new Set(weekOf(new Date(2026, 9, 25, 12)).map(dayParam)).size).toBe(7); // and back on 25 October 2026
  });
});
