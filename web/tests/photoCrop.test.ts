import { describe, expect, it } from "vitest";
import { framedPart } from "../lib/mm/photoCrop";

// Scan your food and Make it at home take only the part of the camera's picture inside the scanning frame (founder 2026-11-18: "it should only be the frame
// that the person scanned"), not the wider picture the camera holds round a full-screen view.
describe("the framed part of the camera's picture", () => {
  it("a 4:3 picture on a tall phone screen: the sides the screen cut off are left out, and so is everything round the frame", () => {
    // camera 1440 × 1920 (portrait 3:4) shown on a 390 × 844 screen: scaled by 844/1920, so 633 px wide, 121.5 px cut off each side
    const part = framedPart(1440, 1920, 390, 844, { x: 20, y: 96, width: 350, height: 572 });
    const scale = 844 / 1920;
    expect(part.x).toBeCloseTo((20 + 121.5) / scale, 0);
    expect(part.y).toBeCloseTo(96 / scale, 0);
    expect(part.width).toBeCloseTo(350 / scale, 0);
    expect(part.height).toBeCloseTo(572 / scale, 0);
    expect(part.width).toBeLessThan(1440 * 0.6); // much less than the whole width the camera saw
  });
  it("a landscape picture on a tall screen: the frame maps into the middle of it", () => {
    const part = framedPart(1920, 1080, 390, 844, { x: 0, y: 0, width: 390, height: 844 });
    // the whole view shows the middle 499 px of the 1920 px width
    expect(part.y).toBe(0);
    expect(part.height).toBeCloseTo(1080, 0);
    expect(part.x + part.width / 2).toBeCloseTo(960, 0);
    expect(part.width).toBeCloseTo(390 / (844 / 1080), 0);
  });
  it("stays inside the picture, and is the whole picture when something is missing", () => {
    const whole = { x: 0, y: 0, width: 1600, height: 1200 };
    expect(framedPart(1600, 1200, 390, 844, { x: -50, y: -50, width: 600, height: 1000 })).toEqual(expect.objectContaining({ x: expect.any(Number) }));
    const p = framedPart(1600, 1200, 390, 844, { x: -50, y: -50, width: 600, height: 1000 });
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(1600);
    expect(p.y + p.height).toBeLessThanOrEqual(1200);
    expect(framedPart(1600, 1200, 390, 844, { x: 0, y: 0, width: 0, height: 0 })).toEqual(whole);
    expect(framedPart(0, 0, 390, 844, { x: 0, y: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
