import { describe, expect, it } from "vitest";
import { enteredFull, FS_IDLE, fsStep, popRestoresScroll, type FsEffect, type FsEvent, type FsState } from "../lib/mm/mapFullscreen";

/** Runs events in order and collects every effect, like the hook does (without the DOM). */
function run(events: readonly FsEvent[], canPush = true): { state: FsState; effects: FsEffect[] } {
  let state = FS_IDLE;
  const effects: FsEffect[] = [];
  for (const e of events) {
    const r = fsStep(state, e, canPush);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

describe("full screen: enter", () => {
  it("opens and pushes one history entry that it owns", () => {
    const r = fsStep(FS_IDLE, "enter", true);
    expect(r.state).toEqual({ full: true, ownEntry: true, awaitingPop: false });
    expect(r.effects).toEqual(["push"]);
  });
  it("is ignored while full, or while its own history.back() is still in flight", () => {
    const full: FsState = { full: true, ownEntry: true, awaitingPop: false };
    expect(fsStep(full, "enter")).toEqual({ state: full, effects: [] });
    const settling: FsState = { full: false, ownEntry: false, awaitingPop: true };
    expect(fsStep(settling, "enter")).toEqual({ state: settling, effects: [] });
  });
  it("opens without touching the history when pushing is switched off", () => {
    const r = fsStep(FS_IDLE, "enter", false);
    expect(r.state).toEqual({ full: true, ownEntry: false, awaitingPop: false });
    expect(r.effects).toEqual([]);
  });
});

describe("full screen: leave", () => {
  it("closes at once and pops the entry it pushed", () => {
    const r = fsStep({ full: true, ownEntry: true, awaitingPop: false }, "leave");
    expect(r.state).toEqual({ full: false, ownEntry: false, awaitingPop: true });
    expect(r.effects).toEqual(["back"]);
  });
  it("never goes back when it owns no entry", () => {
    const r = fsStep({ full: true, ownEntry: false, awaitingPop: false }, "leave");
    expect(r.state.full).toBe(false);
    expect(r.effects).toEqual([]);
  });
  it("does nothing when not full", () => {
    expect(fsStep(FS_IDLE, "leave")).toEqual({ state: FS_IDLE, effects: [] });
  });
});

describe("full screen: popstate", () => {
  it("swallows the pop it asked for", () => {
    const r = fsStep({ full: false, ownEntry: false, awaitingPop: true }, "pop");
    expect(r.state).toEqual(FS_IDLE);
    expect(r.effects).toEqual([]);
  });
  it("closes when the person pressed Back or swiped, without calling back() again", () => {
    const r = fsStep({ full: true, ownEntry: true, awaitingPop: false }, "pop");
    expect(r.state).toEqual(FS_IDLE);
    expect(r.effects).toEqual([]);
  });
  it("ignores a pop while idle, and while full without an entry of its own", () => {
    expect(fsStep(FS_IDLE, "pop")).toEqual({ state: FS_IDLE, effects: [] });
    const noEntry: FsState = { full: true, ownEntry: false, awaitingPop: false };
    expect(fsStep(noEntry, "pop")).toEqual({ state: noEntry, effects: [] });
  });
});

describe("full screen: settled and pushFailed", () => {
  it("settled forgets a pop that never arrived, and only that", () => {
    expect(fsStep({ full: false, ownEntry: false, awaitingPop: true }, "settled").state).toEqual(FS_IDLE);
    const full: FsState = { full: true, ownEntry: true, awaitingPop: false };
    expect(fsStep(full, "settled")).toEqual({ state: full, effects: [] });
  });
  it("pushFailed clears the entry flag and nothing else", () => {
    const r = fsStep({ full: true, ownEntry: true, awaitingPop: false }, "pushFailed");
    expect(r.state).toEqual({ full: true, ownEntry: false, awaitingPop: false });
    expect(r.effects).toEqual([]);
    expect(fsStep(FS_IDLE, "pushFailed")).toEqual({ state: FS_IDLE, effects: [] });
  });
});

describe("full screen: whole visits", () => {
  it("enter, leave, pop: one push, one back, back to idle", () => {
    const r = run(["enter", "leave", "pop"]);
    expect(r.state).toEqual(FS_IDLE);
    expect(r.effects).toEqual(["push", "back"]);
  });
  it("a second tap before the pop arrives cannot push twice", () => {
    const r = run(["enter", "leave", "enter", "pop"]);
    expect(r.effects).toEqual(["push", "back"]);
    expect(r.state).toEqual(FS_IDLE);
  });
  it("enter, enter, leave, leave, pop: still one push", () => {
    const r = run(["enter", "enter", "leave", "leave", "pop"]);
    expect(r.effects).toEqual(["push", "back"]);
    expect(r.state).toEqual(FS_IDLE);
  });
  it("enter then the Back gesture: idle, and no back() of our own", () => {
    const r = run(["enter", "pop"]);
    expect(r.state).toEqual(FS_IDLE);
    expect(r.effects).toEqual(["push"]);
  });
  it("enter, a failed push, leave: no back()", () => {
    const r = run(["enter", "pushFailed", "leave"]);
    expect(r.effects).toEqual(["push"]);
    expect(r.state).toEqual(FS_IDLE);
  });
  it("can be entered again after a lost pop is settled", () => {
    const r = run(["enter", "leave", "settled", "enter"]);
    expect(r.effects).toEqual(["push", "back", "push"]);
    expect(r.state.full).toBe(true);
  });
  it("with pushing off, a visit never touches the history", () => {
    const r = run(["enter", "leave"], false);
    expect(r.effects).toEqual([]);
    expect(r.state).toEqual(FS_IDLE);
  });
});

/**
 * The hook's scroll bookkeeping without the DOM: the page's scroll is recorded whenever a step takes the map into full screen, and a pop puts it
 * back only when `popRestoresScroll` says so. `scroll` is where the page is when each event happens.
 */
function visit(events: readonly [FsEvent, number][], canPush: boolean): { saved: number | null; restoresOnPop: boolean[] } {
  let state = FS_IDLE;
  let saved: number | null = null;
  const restoresOnPop: boolean[] = [];
  for (const [e, scroll] of events) {
    const before = state;
    const r = fsStep(before, e, canPush);
    if (enteredFull(before, r.state)) saved = scroll;
    if (e === "pop") restoresOnPop.push(popRestoresScroll(before));
    state = r.state;
  }
  return { saved, restoresOnPop };
}

describe("full screen: where the page was scrolled to", () => {
  it("is recorded on the way in with a history entry AND without one (pushing off, or a failed push)", () => {
    for (const canPush of [true, false]) {
      expect(enteredFull(FS_IDLE, fsStep(FS_IDLE, "enter", canPush).state)).toBe(true);
      expect(visit([["enter", 640]], canPush).saved).toBe(640);
    }
    // a push that fails after the step has accepted the enter does not undo the record: the step that took the map in already did
    const afterEnter = fsStep(FS_IDLE, "enter", true).state;
    expect(enteredFull(afterEnter, fsStep(afterEnter, "pushFailed").state)).toBe(false);
  });
  it("is not recorded again by an enter the machine ignored, nor by leaving or popping", () => {
    const full: FsState = { full: true, ownEntry: true, awaitingPop: false };
    expect(enteredFull(full, fsStep(full, "enter").state)).toBe(false);
    const settling: FsState = { full: false, ownEntry: false, awaitingPop: true };
    expect(enteredFull(settling, fsStep(settling, "enter").state)).toBe(false);
    expect(enteredFull(full, fsStep(full, "leave").state)).toBe(false);
    expect(enteredFull(full, fsStep(full, "pop").state)).toBe(false);
    expect(enteredFull(FS_IDLE, FS_IDLE)).toBe(false);
  });
  it("keeps the first record of a visit when a second enter arrives while full", () => {
    expect(visit([["enter", 300], ["enter", 0]], true).saved).toBe(300);
    expect(visit([["enter", 300], ["enter", 0]], false).saved).toBe(300);
  });
  it("a new visit records again", () => {
    expect(visit([["enter", 300], ["leave", 300], ["pop", 300], ["enter", 120]], true).saved).toBe(120);
    expect(visit([["enter", 300], ["leave", 300], ["enter", 120]], false).saved).toBe(120);
  });
  it("a pop puts the scroll back for the pop of our own back() and for a Back that closed full screen", () => {
    expect(popRestoresScroll({ full: false, ownEntry: false, awaitingPop: true })).toBe(true);
    expect(popRestoresScroll({ full: true, ownEntry: true, awaitingPop: false })).toBe(true);
    expect(visit([["enter", 300], ["leave", 300], ["pop", 300]], true).restoresOnPop).toEqual([true]);
    expect(visit([["enter", 300], ["pop", 300]], true).restoresOnPop).toEqual([true]);
  });
  it("a Back that only leaves the page (full screen without an entry of our own) must not scroll it", () => {
    expect(popRestoresScroll({ full: true, ownEntry: false, awaitingPop: false })).toBe(false);
    expect(popRestoresScroll(FS_IDLE)).toBe(false);
    expect(visit([["enter", 300], ["pop", 300]], false).restoresOnPop).toEqual([false]);
  });
});
