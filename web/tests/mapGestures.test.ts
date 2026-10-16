import { describe, expect, it } from "vitest";
import { applyGestureMode, GESTURE_SAFE_GAP_MS, type Clock, type CooperativeTarget } from "../lib/mm/mapGestures";

/** A clock the test moves by hand: advance(ms) fires the timers that fall due, in order. */
function fakeClock(): Clock & { advance(ms: number): void; pending(): number } {
  let now = 1000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

function fakeMap(enabled: boolean): CooperativeTarget & { calls: string[] } {
  const calls: string[] = [];
  let on = enabled;
  return {
    calls,
    cooperativeGestures: {
      enable() { calls.push("enable"); on = true; },
      disable() { calls.push("disable"); on = false; },
      isEnabled: () => on,
    },
  };
}

const NEVER = () => Number.NEGATIVE_INFINITY;

describe("applyGestureMode: full screen", () => {
  it("switches the page rules off at once when no gesture was blocked lately", () => {
    const map = fakeMap(true);
    const clock = fakeClock();
    applyGestureMode(map, true, NEVER, clock);
    expect(map.calls).toEqual(["disable"]);
  });

  it("waits until the hint's own timer is done after a blocked gesture, then disables exactly once", () => {
    const map = fakeMap(true);
    const clock = fakeClock();
    const blockedAt = clock.now() - 30; // 30 ms ago: the 100 ms hint timer is still running
    applyGestureMode(map, true, () => blockedAt, clock);
    expect(map.calls).toEqual([]);
    clock.advance(GESTURE_SAFE_GAP_MS - 30 - 1);
    expect(map.calls).toEqual([]);
    clock.advance(2);
    expect(map.calls).toEqual(["disable"]);
    clock.advance(1000);
    expect(map.calls).toEqual(["disable"]);
  });

  it("starts the wait again if another gesture is blocked meanwhile", () => {
    const map = fakeMap(true);
    const clock = fakeClock();
    let blockedAt = clock.now() - 30;
    applyGestureMode(map, true, () => blockedAt, clock);
    clock.advance(100); // 130 ms after the first block, 10 ms short of safe
    blockedAt = clock.now(); // a new blocked gesture right now
    clock.advance(20); // the first wait ends here and sees the new block
    expect(map.calls).toEqual([]);
    clock.advance(GESTURE_SAFE_GAP_MS);
    expect(map.calls).toEqual(["disable"]);
  });

  it("does nothing when they are already off", () => {
    const map = fakeMap(false);
    applyGestureMode(map, true, NEVER, fakeClock());
    expect(map.calls).toEqual([]);
  });

  it("the canceller stops a switch that is still waiting", () => {
    const map = fakeMap(true);
    const clock = fakeClock();
    const blockedAt = clock.now() - 10;
    const cancel = applyGestureMode(map, true, () => blockedAt, clock);
    expect(clock.pending()).toBe(1);
    cancel();
    expect(clock.pending()).toBe(0);
    clock.advance(1000);
    expect(map.calls).toEqual([]);
  });
});

describe("applyGestureMode: back in the page", () => {
  it("switches the page rules on at once, even right after a blocked gesture", () => {
    const map = fakeMap(false);
    const clock = fakeClock();
    applyGestureMode(map, false, () => clock.now() - 1, clock);
    expect(map.calls).toEqual(["enable"]);
  });

  it("does nothing when they are already on", () => {
    const map = fakeMap(true);
    applyGestureMode(map, false, NEVER, fakeClock());
    expect(map.calls).toEqual([]);
  });

  it("leaving full screen cancels a disable that was still waiting (the page rules stay on)", () => {
    const map = fakeMap(true);
    const clock = fakeClock();
    const blockedAt = clock.now() - 10;
    const cancelFull = applyGestureMode(map, true, () => blockedAt, clock);
    cancelFull(); // what the layout effect's cleanup does before the next mode starts
    applyGestureMode(map, false, () => blockedAt, clock);
    clock.advance(1000);
    expect(map.calls).toEqual([]);
    expect(map.cooperativeGestures.isEnabled()).toBe(true);
  });
});
