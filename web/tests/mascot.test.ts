import { describe, expect, it } from "vitest";
import { PIP_BODY, PIP_BROW_WIDTH, PIP_EYE_TOP, PIP_MOODS, pipArms, pipBrows, type PipMood } from "../app/app/_components/Mascot";

// Pip's poses (onboarding review, 19 November 2026), checked on the tables the drawing reads, without rendering: hands clear of the
// body so he never looks one-armed, 'point' aiming down at what is under him and 'pointUp' up, eyebrows clear of the eyes at tip
// size, and none on cheer.

const distance = (h: { x: number; y: number }) => Math.hypot(h.x - PIP_BODY.cx, h.y - PIP_BODY.cy);
/** The y of every point in a path's commands (M, L and Q all take x y pairs). A quadratic curve stays inside its control points, so
 *  the largest of these bounds the curve's lowest edge. */
const ys = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);

describe("Pip's arms", () => {
  it("has every mood the app uses, the old names included", () => {
    expect([...PIP_MOODS].sort()).toEqual(["cheer", "listen", "point", "pointUp", "think", "wave"]);
  });

  it("shows two hands clear of the body in every mood but think", () => {
    for (const mood of PIP_MOODS.filter((m) => m !== "think")) {
      const arms = pipArms(mood);
      expect(arms, mood).toHaveLength(2);
      for (const arm of arms) expect(distance(arm.hand), `${mood} ${arm.d}`).toBeGreaterThan(PIP_BODY.r);
    }
  });

  it("holds think's hand at his chin, in front of the body, with the other hand clear", () => {
    const arms = pipArms("think");
    expect(arms).toHaveLength(2);
    expect(arms.filter((a) => distance(a.hand) > PIP_BODY.r)).toHaveLength(1);
    const chin = arms.filter((a) => a.front);
    expect(chin).toHaveLength(1);
    expect(distance(chin[0].hand)).toBeLessThan(PIP_BODY.r);
  });

  it("points down with 'point' and up with 'pointUp'", () => {
    const hand = (mood: PipMood) => pipArms(mood).map((a) => a.hand).sort((a, b) => b.x - a.x)[0];
    expect(hand("point").y).toBeGreaterThan(PIP_BODY.cy);
    expect(hand("pointUp").y).toBeLessThan(PIP_BODY.cy);
  });

  it("waves only in 'wave'", () => {
    for (const mood of PIP_MOODS) expect(pipArms(mood).some((a) => a.wave), mood).toBe(mood === "wave");
  });
});

describe("Pip's eyebrows", () => {
  it("has none on cheer, and two on every other mood", () => {
    expect(pipBrows("cheer")).toHaveLength(0);
    for (const mood of PIP_MOODS.filter((m) => m !== "cheer")) expect(pipBrows(mood), mood).toHaveLength(2);
  });

  it("keeps every eyebrow's lowest edge, stroke included, at least 3 units above the eye whites", () => {
    for (const mood of PIP_MOODS) {
      for (const d of pipBrows(mood)) expect(Math.max(...ys(d)) + PIP_BROW_WIDTH / 2, `${mood} ${d}`).toBeLessThanOrEqual(PIP_EYE_TOP - 3);
    }
  });
});
