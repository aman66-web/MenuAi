import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addWater, BOTTLE_FULL_ML, BOTTLE_ML, DEFAULT_WATER_GOAL_ML, DRAG_STEP_ML, GLASS_ML, KEEP_WATER_DAYS, lastWaterToday, levelToMl, MAX_WATER_ENTRIES, MAX_WATER_ENTRY_ML,
  mlToLevel, parseWaterAmount, removeWater, sanitizeWater, stepMl, waterEntriesToday, waterFraction, waterGoal, waterToday, type WaterEntry,
} from "../lib/mm/water";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../lib/mm/user-data";
import { SYNC_STORES } from "../lib/mm/syncMerge";
import { SYNCED_SETTING_KEYS } from "../lib/mm/syncStores";

// Water intake: a drink is an entry (when, how many ml); Home shows today's total against the person's own goal.

const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi);
const entry = (id: string, when: Date, ml = 250): WaterEntry => ({ id, loggedAt: when.toISOString(), ml });

describe("sanitizeWater", () => {
  it("keeps good entries, oldest first, with whole millilitres", () => {
    const list = sanitizeWater([entry("b", at(2026, 10, 15, 14)), { id: "a", loggedAt: at(2026, 10, 15, 9).toISOString(), ml: 249.6 }]);
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
    expect(list[0]!.ml).toBe(250);
  });
  it("drops what isn't an entry: wrong types, no id, a repeated id, a date that isn't one, no or silly amounts", () => {
    const good = entry("ok", at(2026, 10, 15));
    const list = sanitizeWater([
      good, good, null, "x", 5, [], { id: "", loggedAt: good.loggedAt, ml: 250 }, { id: "n", loggedAt: "yesterday", ml: 250 }, { id: "t", loggedAt: 123, ml: 250 },
      { id: "z", loggedAt: good.loggedAt, ml: 0 }, { id: "neg", loggedAt: good.loggedAt, ml: -250 }, { id: "big", loggedAt: good.loggedAt, ml: MAX_WATER_ENTRY_ML + 1 },
      { id: "nan", loggedAt: good.loggedAt, ml: NaN }, { id: "inf", loggedAt: good.loggedAt, ml: Infinity }, { id: "str", loggedAt: good.loggedAt, ml: "250" },
      { id: "x".repeat(81), loggedAt: good.loggedAt, ml: 250 },
    ]);
    expect(list.map((e) => e.id)).toEqual(["ok"]);
    expect(sanitizeWater("nope")).toEqual([]);
    expect(sanitizeWater(null)).toEqual([]);
  });
  it("keeps the newest MAX_WATER_ENTRIES", () => {
    const many = Array.from({ length: MAX_WATER_ENTRIES + 25 }, (_, i) => ({ id: `e${i}`, loggedAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(), ml: 100 }));
    const list = sanitizeWater(many);
    expect(list).toHaveLength(MAX_WATER_ENTRIES);
    expect(list[0]!.id).toBe("e25");
    expect(list.at(-1)!.id).toBe(`e${MAX_WATER_ENTRIES + 24}`);
  });
});

describe("today's water", () => {
  const now = at(2026, 10, 15, 15);
  const list = [entry("y", at(2026, 10, 14, 23, 59), 500), entry("a", at(2026, 10, 15, 0, 0), 250), entry("b", at(2026, 10, 15, 9), 500), entry("c", at(2026, 10, 15, 14), 250), entry("tomorrow", at(2026, 10, 16, 0, 1), 250)];
  it("adds up the local calendar day of now, nothing from yesterday or tomorrow", () => {
    expect(waterToday(list, now)).toBe(1000);
    expect(waterEntriesToday(list, now).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(waterToday([], now)).toBe(0);
    expect(waterToday(list, at(2026, 10, 14, 8))).toBe(500);
  });
  it("starts again at midnight", () => {
    expect(waterToday(list, at(2026, 10, 15, 23, 59))).toBe(1000);
    expect(waterToday(list, at(2026, 10, 16, 0, 0))).toBe(250);
  });
  it("the last drink today is what Undo takes back", () => {
    expect(lastWaterToday(list, now)?.id).toBe("c");
    expect(lastWaterToday(list, at(2026, 10, 13))).toBeUndefined();
    expect(removeWater(list, "c").map((e) => e.id)).toEqual(["y", "a", "b", "tomorrow"]);
    expect(removeWater(list, "nothing")).toHaveLength(list.length);
  });
  it("two drinks in the same millisecond: the later one in the list is the last", () => {
    const t = at(2026, 10, 15, 10);
    expect(lastWaterToday([entry("one", t), entry("two", t)], now)?.id).toBe("two");
  });
});

describe("addWater", () => {
  const now = at(2026, 10, 15, 12);
  it("adds a drink at the time of the tap", () => {
    const list = addWater([], GLASS_ML, now, "id1");
    expect(list).toEqual([{ id: "id1", loggedAt: now.toISOString(), ml: 250 }]);
    expect(addWater(list, BOTTLE_ML, at(2026, 10, 15, 13), "id2").map((e) => e.ml)).toEqual([250, 500]);
  });
  it("refuses amounts that aren't a sensible drink, and doesn't change the list", () => {
    const list = [entry("a", now)];
    for (const bad of [0, -1, NaN, Infinity, MAX_WATER_ENTRY_ML + 1]) expect(addWater(list, bad, now, "x")).toEqual(list);
  });
  it("drops entries older than two weeks as it goes", () => {
    const old = entry("old", new Date(now.getTime() - (KEEP_WATER_DAYS * 24 * 60 * 60 * 1000 + 1000)));
    const edge = entry("edge", new Date(now.getTime() - KEEP_WATER_DAYS * 24 * 60 * 60 * 1000));
    expect(addWater([old, edge], 250, now, "new").map((e) => e.id)).toEqual(["edge", "new"]);
  });
  it("never grows past MAX_WATER_ENTRIES", () => {
    const full = Array.from({ length: MAX_WATER_ENTRIES }, (_, i) => entry(`e${i}`, new Date(now.getTime() - 1000 * (MAX_WATER_ENTRIES - i))));
    const next = addWater(full, 250, now, "new");
    expect(next).toHaveLength(MAX_WATER_ENTRIES);
    expect(next.at(-1)!.id).toBe("new");
    expect(next[0]!.id).toBe("e1");
  });
});

describe("the goal", () => {
  it("is the person's own number when it is sensible, else the starting goal", () => {
    expect(waterGoal({})).toBe(DEFAULT_WATER_GOAL_ML);
    expect(waterGoal({ dailyWater: 1500 })).toBe(1500);
    expect(waterGoal({ dailyWater: 249 })).toBe(DEFAULT_WATER_GOAL_ML);
    expect(waterGoal({ dailyWater: 6001 })).toBe(DEFAULT_WATER_GOAL_ML);
    expect(waterGoal({ dailyWater: NaN })).toBe(DEFAULT_WATER_GOAL_ML);
    expect(waterGoal({ dailyWater: 250 })).toBe(250);
    expect(waterGoal({ dailyWater: 6000 })).toBe(6000);
  });
  it("is a starting number of 2 litres, eight glasses", () => {
    expect(DEFAULT_WATER_GOAL_ML).toBe(2000);
    expect(DEFAULT_WATER_GOAL_ML / GLASS_ML).toBe(8);
    expect(BOTTLE_ML).toBe(2 * GLASS_ML);
  });
  it("fills the bar from 0 to full and no further", () => {
    expect(waterFraction(0, 2000)).toBe(0);
    expect(waterFraction(500, 2000)).toBe(0.25);
    expect(waterFraction(2000, 2000)).toBe(1);
    expect(waterFraction(3500, 2000)).toBe(1);
    expect(waterFraction(-5, 2000)).toBe(0);
    expect(waterFraction(500, 0)).toBe(0);
  });
});

describe("the water goal in the settings", () => {
  it("is kept when it is a whole sensible number, rounded, and left out otherwise", () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, dailyWater: 1750 }).dailyWater).toBe(1750);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, dailyWater: 1750.4 }).dailyWater).toBe(1750);
    for (const bad of [0, 100, 6001, -5, "2000", NaN, null]) expect(sanitizeSettings({ ...DEFAULT_SETTINGS, dailyWater: bad }).dailyWater).toBeUndefined();
    expect("dailyWater" in sanitizeSettings(DEFAULT_SETTINGS)).toBe(false);
  });
  it("follows the person to their other devices with the other settings", () => {
    expect(SYNCED_SETTING_KEYS).toContain("dailyWater");
  });
});

describe("water entries stay on the device", () => {
  it("is not one of the synced stores: the table behind sync only accepts the stores its constraint lists", () => {
    expect(SYNC_STORES as readonly string[]).not.toContain("water");
    // every synced store is on the database's list, so a store can't be added to the app before the migration that widens it exists
    const migrations = ["20261013120000_user_data.sql"].map((f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8")).join("\n");
    for (const name of SYNC_STORES) expect(migrations).toContain(`'${name}'`);
  });
});

describe("the bottle in the Add water sheet", () => {
  it("is full at a litre and empty at nothing; an amount over a litre is a full bottle", () => {
    expect(mlToLevel(0)).toBe(0);
    expect(mlToLevel(250)).toBe(0.25);
    expect(mlToLevel(BOTTLE_FULL_ML)).toBe(1);
    expect(mlToLevel(5000)).toBe(1);
    expect(mlToLevel(-10)).toBe(0);
    expect(mlToLevel(NaN)).toBe(0);
  });
  it("turns where a finger is into millilitres, in steps of 50, never outside the bottle", () => {
    expect(levelToMl(0)).toBe(0);
    expect(levelToMl(1)).toBe(BOTTLE_FULL_ML);
    expect(levelToMl(0.5)).toBe(500);
    expect(levelToMl(0.26)).toBe(250);
    expect(levelToMl(0.28)).toBe(300);
    expect(levelToMl(1.7)).toBe(BOTTLE_FULL_ML);
    expect(levelToMl(-0.4)).toBe(0);
    expect(levelToMl(NaN)).toBe(0);
    for (let i = 0; i <= 100; i++) expect(levelToMl(i / 100) % DRAG_STEP_ML).toBe(0);
  });
  it("moves a step at a time from the amount now, and a typed amount over a litre starts from the top", () => {
    expect(stepMl(250, DRAG_STEP_ML)).toBe(300);
    expect(stepMl(250, -DRAG_STEP_ML)).toBe(200);
    expect(stepMl(0, -DRAG_STEP_ML)).toBe(0);
    expect(stepMl(BOTTLE_FULL_ML, DRAG_STEP_ML)).toBe(BOTTLE_FULL_ML);
    expect(stepMl(1230, -DRAG_STEP_ML)).toBe(950);
    expect(stepMl(260, 0)).toBe(250);
    expect(stepMl(NaN, 100)).toBe(100);
  });
  it("reads the typed amount: whole millilitres from 1 to the most one drink can be, else nothing", () => {
    expect(parseWaterAmount("250")).toBe(250);
    expect(parseWaterAmount(" 330 ")).toBe(330);
    expect(parseWaterAmount("1,250")).toBe(1250);
    expect(parseWaterAmount("249.6")).toBe(250);
    expect(parseWaterAmount("5000")).toBe(MAX_WATER_ENTRY_ML);
    for (const bad of ["", "0", "-5", "0.4", "5001", "abc", "12abc"]) expect(parseWaterAmount(bad), bad).toBeNull();
  });
  it("reads numerals typed in another numeral system, as everywhere in the app", () => {
    expect(parseWaterAmount("٣٠٠")).toBe(300);
  });
  it("adds on top of what is already drunk", () => {
    const now = at(2026, 10, 16, 15);
    const once = addWater([], 250, now, "a");
    const twice = addWater(once, parseWaterAmount("400")!, now, "b");
    expect(waterToday(twice, now)).toBe(650);
  });
});
