import { describe, expect, it } from "vitest";
import { fitContain } from "../lib/mm/logoFit";

describe("fitContain (a logo is scaled to fit its tile, never cropped or stretched)", () => {
  it("keeps the picture's proportions and stays inside the box", () => {
    for (const [w, h] of [[300, 100], [100, 300], [64, 64], [1200, 800], [40, 400]]) {
      const f = fitContain(w, h, 24, 24);
      expect(f.w / f.h).toBeCloseTo(w / h, 6);
      expect(f.w).toBeLessThanOrEqual(24 + 1e-9);
      expect(f.h).toBeLessThanOrEqual(24 + 1e-9);
      expect(Math.max(f.w, f.h)).toBeCloseTo(24, 6); // as large as the box allows
    }
  });
  it("centres it", () => {
    const wide = fitContain(300, 100, 24, 24);
    expect(wide).toEqual({ x: 0, y: 8, w: 24, h: 8 });
    const tall = fitContain(100, 300, 24, 24);
    expect(tall.x).toBeCloseTo(8, 6);
    expect(tall.y).toBe(0);
  });
  it("treats an unknown size as square instead of failing", () => {
    expect(fitContain(0, 0, 24, 24)).toEqual({ x: 0, y: 0, w: 24, h: 24 });
    expect(fitContain(Number.NaN, 50, 24, 24).w).toBeGreaterThan(0);
  });
});
