import { describe, expect, it } from "vitest";
import { otherPlace, overlaps, placeToast, recentTap, RECENT_TAP_MS, SAME_SPOT_PX, shouldFocusUndo, triggerBand, UNDO_GUARD_MS, undoIsAccident, type LastInput } from "../lib/mm/toastPlace";

// Where the Undo toast goes, when Undo gets the focus, and which Undo presses are accidents (review findings 16, 17 and 18 of the improvement pass).

const tapAt = (y: number, at = 1000, x = 300): LastInput => ({ x, y, pointerAt: at, keyAt: -Infinity });
const keyAt = (at = 1000): LastInput => ({ x: 0, y: 0, pointerAt: -Infinity, keyAt: at });

describe("the control that made the toast", () => {
  it("is around a recent tap, else the focused control, else unknown", () => {
    expect(triggerBand(tapAt(600), 1200, null)).toEqual({ top: 600 - SAME_SPOT_PX, bottom: 600 + SAME_SPOT_PX });
    expect(triggerBand(tapAt(600), 1000 + RECENT_TAP_MS + 1, { top: 10, bottom: 54 })).toEqual({ top: 10, bottom: 54 }); // the tap was long ago
    expect(triggerBand(keyAt(), 1100, { top: 10, bottom: 54 })).toEqual({ top: 10, bottom: 54 });
    expect(triggerBand(keyAt(), 1100, null)).toBe(null);
  });
  it("a key pressed after the tap means the keyboard did it", () => {
    expect(recentTap({ x: 1, y: 2, pointerAt: 1000, keyAt: 1100 }, 1200)).toBe(null);
    expect(recentTap({ x: 1, y: 2, pointerAt: 1100, keyAt: 1000 }, 1200)).toEqual({ x: 1, y: 2 });
  });
});

describe("where the toast goes", () => {
  const bottomPill = { top: 600, bottom: 656 };
  const topPill = { top: 47, bottom: 103 };
  it("stays where it was asked to go when the control used is elsewhere or unknown", () => {
    expect(placeToast("bottom", { top: 200, bottom: 244 }, bottomPill)).toBe("bottom");
    expect(placeToast("top", null, topPill)).toBe("top");
    expect(placeToast("top", { top: 1, bottom: 2 }, null)).toBe("top");
  });
  it("goes to the other end when the control used sits under it (My meals' Log at the foot; a recipe's Save under a top toast)", () => {
    expect(placeToast("bottom", { top: 620, bottom: 664 }, bottomPill)).toBe("top");
    expect(placeToast("top", { top: 59, bottom: 103 }, topPill)).toBe("bottom");
  });
  it("touching edges is not overlapping", () => {
    expect(overlaps({ top: 0, bottom: 10 }, { top: 10, bottom: 20 })).toBe(false);
    expect(otherPlace("top")).toBe("bottom");
    expect(otherPlace("bottom")).toBe("top");
  });
});

describe("Undo and the keyboard focus", () => {
  it("gets the focus only when the focused control went away and the action wasn't a tap", () => {
    expect(shouldFocusUndo(true, keyAt(1000), 1050)).toBe(true); // Enter on the "−" at quantity 1
    expect(shouldFocusUndo(true, tapAt(500, 1000), 1050)).toBe(false); // a tap: nobody needs the focus moved
    expect(shouldFocusUndo(false, keyAt(1000), 1050)).toBe(false); // Log still has the focus: a second Enter logs again
    expect(shouldFocusUndo(true, { x: 0, y: 0, pointerAt: -Infinity, keyAt: -Infinity }, 1050)).toBe(true); // an activation with no pointer (a screen reader)
  });
});

describe("an accidental Undo", () => {
  it("is a press at the spot of the tap that made the toast, within a moment", () => {
    const made = { x: 300, y: 620 };
    expect(undoIsAccident(1000, 1000 + UNDO_GUARD_MS - 1, { x: 310, y: 630 }, made, false)).toBe(true);
    expect(undoIsAccident(1000, 1000 + UNDO_GUARD_MS, { x: 310, y: 630 }, made, false)).toBe(false); // later: meant
    expect(undoIsAccident(1000, 1100, { x: 300 + SAME_SPOT_PX + 1, y: 620 }, made, false)).toBe(false); // somewhere else: meant
    expect(undoIsAccident(1000, 1100, { x: 300, y: 620 }, null, false)).toBe(false); // the toast wasn't made by a tap
  });
  it("is a key press on an Undo that the toast itself focused, within a moment (Enter pressed twice)", () => {
    expect(undoIsAccident(1000, 1200, null, null, true)).toBe(true);
    expect(undoIsAccident(1000, 1000 + UNDO_GUARD_MS, null, null, true)).toBe(false);
    expect(undoIsAccident(1000, 1200, null, null, false)).toBe(false); // the person moved there themselves
  });
});
