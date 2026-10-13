import { describe, expect, it } from "vitest";
import {
  GONE_TTL_MS,
  MAX_CLOCK_AHEAD_MS,
  MAX_SYNC_ITEMS,
  SYNC_STORES,
  canonical,
  emptyState,
  fingerprint,
  mergeStates,
  statesEqual,
  validateState,
  type SyncSet,
  type SyncState,
  type SyncValue,
} from "../lib/mm/syncMerge";

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const set = (items: Record<string, [number, unknown]>, gone: Record<string, number> = {}): SyncSet => ({
  kind: "set",
  items: Object.fromEntries(Object.entries(items).map(([id, [t, v]]) => [id, { t, v }])),
  gone,
});
const value = (t: number, v: unknown): SyncValue => ({ kind: "value", t, v });
const merge = (a: SyncState, b: SyncState, store: (typeof SYNC_STORES)[number] = "saved") => mergeStates(store, a, b, NOW);

describe("value stores (settings): the newest write wins", () => {
  it("takes the later change, in either order", () => {
    const a = value(NOW - 1000, { goal: "lose" });
    const b = value(NOW - 500, { goal: "maintain" });
    expect(merge(a, b, "settings")).toEqual(b);
    expect(merge(b, a, "settings")).toEqual(b);
  });

  it("breaks an exact tie the same way whichever copy comes first", () => {
    const a = value(NOW - 1000, { goal: "lose" });
    const b = value(NOW - 1000, { goal: "maintain" });
    expect(merge(a, b, "settings")).toEqual(merge(b, a, "settings"));
  });

  it("is safe to repeat", () => {
    const a = value(NOW - 1000, { goal: "lose" });
    expect(merge(a, a, "settings")).toEqual(a);
  });
});

describe("set stores: items merge by id and deletions stay deleted", () => {
  it("keeps everything both phones added", () => {
    const a = set({ x: [NOW - 3000, "from A"] });
    const b = set({ y: [NOW - 2000, "from B"] });
    const m = merge(a, b) as SyncSet;
    expect(Object.keys(m.items).sort()).toEqual(["x", "y"]);
    expect(m.gone).toEqual({});
  });

  it("takes the later edit of the same item", () => {
    const m = merge(set({ x: [NOW - 3000, "old"] }), set({ x: [NOW - 1000, "new"] })) as SyncSet;
    expect(m.items.x.v).toBe("new");
  });

  it("a deletion made after the last edit removes the item, even if the other phone still has it", () => {
    const a = set({ x: [NOW - 3000, "kept"] });
    const b = set({}, { x: NOW - 1000 });
    const m = merge(a, b) as SyncSet;
    expect(m.items).toEqual({});
    expect(m.gone).toEqual({ x: NOW - 1000 });
    expect(merge(b, a)).toEqual(m);
  });

  it("an edit made after the deletion brings the item back (re-added on purpose)", () => {
    const m = merge(set({ x: [NOW - 500, "again"] }), set({}, { x: NOW - 1000 })) as SyncSet;
    expect(m.items.x.v).toBe("again");
    expect(m.gone).toEqual({});
  });

  it("a deletion and an edit at the same moment: the deletion wins (never keeps something someone removed)", () => {
    const m = merge(set({ x: [NOW - 1000, "v"] }), set({}, { x: NOW - 1000 })) as SyncSet;
    expect(m.items).toEqual({});
    expect(m.gone.x).toBe(NOW - 1000);
  });

  it("forgets deletions older than 90 days", () => {
    const old = NOW - GONE_TTL_MS - 1000;
    const m = merge(set({}, { x: old, y: NOW - 1000 }), set({})) as SyncSet;
    expect(m.gone).toEqual({ y: NOW - 1000 });
  });

  it("is the same whichever copy comes first, safe to repeat, and the order of three copies doesn't matter", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const random = (): SyncSet => {
      const items: Record<string, [number, unknown]> = {};
      const gone: Record<string, number> = {};
      for (const id of ["a", "b", "c", "d", "e"]) {
        const r = rand();
        const t = NOW - Math.floor(rand() * 20) * 1000;
        if (r < 0.4) items[id] = [t, Math.floor(rand() * 3)];
        else if (r < 0.7) gone[id] = t;
      }
      return set(items, gone);
    };
    for (let i = 0; i < 300; i++) {
      const [a, b, c] = [random(), random(), random()];
      expect(statesEqual(merge(a, b), merge(b, a))).toBe(true);
      expect(statesEqual(merge(a, a), a)).toBe(true);
      expect(statesEqual(merge(merge(a, b), c), merge(a, merge(b, c)))).toBe(true);
    }
  });
});

describe("clocks", () => {
  it("a time far in the future is pulled back, so a wrong clock can't win forever", () => {
    const wrongClock = set({ x: [NOW + 400 * 24 * 60 * 60 * 1000, "from the future"] });
    const m = merge(wrongClock, set({})) as SyncSet;
    expect(m.items.x.t).toBe(NOW + MAX_CLOCK_AHEAD_MS);
    // a real edit made a minute later (by a correct clock, after that moment) still wins
    const later = merge(m, set({ x: [NOW + MAX_CLOCK_AHEAD_MS + 1, "real"] })) as SyncSet;
    expect(later.items.x.v).toBe("real");
  });
});

describe("the log only syncs recent entries", () => {
  it("drops items whose own date is outside the window", () => {
    const day = 24 * 60 * 60 * 1000;
    const a: SyncSet = { kind: "set", items: { today: { t: NOW, v: 1, a: NOW - 3600_000 }, old: { t: NOW, v: 2, a: NOW - 5 * day } }, gone: {} };
    const m = mergeStates("log", a, emptyState("log"), NOW) as SyncSet;
    expect(Object.keys(m.items)).toEqual(["today"]);
  });
});

describe("validateState", () => {
  it("accepts what the browser sends and cleans it", () => {
    const state = validateState("saved", { kind: "set", items: { x: { t: 5, v: { a: 1 }, extra: "ignored" } }, gone: { y: 3 } });
    expect(state).toEqual({ kind: "set", items: { x: { t: 5, v: { a: 1 } } }, gone: { y: 3 } });
  });

  it("rejects the wrong kind for a store", () => {
    expect(validateState("settings", { kind: "set", items: {}, gone: {} })).toBeNull();
    expect(validateState("saved", { kind: "value", t: 1, v: 1 })).toBeNull();
  });

  it("rejects bad times, empty or huge ids, and too many items", () => {
    expect(validateState("saved", { kind: "set", items: { x: { t: -1, v: 1 } }, gone: {} })).toBeNull();
    expect(validateState("saved", { kind: "set", items: { x: { t: "now", v: 1 } }, gone: {} })).toBeNull();
    expect(validateState("saved", { kind: "set", items: { [""]: { t: 1, v: 1 } }, gone: {} })).toBeNull();
    expect(validateState("saved", { kind: "set", items: { ["x".repeat(201)]: { t: 1, v: 1 } }, gone: {} })).toBeNull();
    const many = Object.fromEntries(Array.from({ length: MAX_SYNC_ITEMS + 1 }, (_, i) => [`i${i}`, { t: 1, v: 1 }]));
    expect(validateState("saved", { kind: "set", items: many, gone: {} })).toBeNull();
  });

  it("rejects an item that is too big", () => {
    expect(validateState("saved", { kind: "set", items: { x: { t: 1, v: "a".repeat(20_000) } }, gone: {} })).toBeNull();
    expect(validateState("settings", { kind: "value", t: 1, v: "a".repeat(20_000) })).toBeNull();
  });

  it("rejects junk", () => {
    for (const junk of [null, 5, "x", [], { kind: "set" }, { kind: "value" }]) {
      expect(validateState("saved", junk)).toBeNull();
      expect(validateState("settings", junk)).toBeNull();
    }
  });
});

describe("canonical and fingerprint", () => {
  it("ignores key order and undefined fields", () => {
    expect(canonical({ b: 1, a: { d: 2, c: undefined } })).toBe(canonical({ a: { d: 2 }, b: 1 }));
    expect(fingerprint({ b: 1, a: 2 })).toBe(fingerprint({ a: 2, b: 1 }));
  });

  it("changes when a value changes", () => {
    expect(fingerprint({ qty: 1 })).not.toBe(fingerprint({ qty: 2 }));
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });
});
