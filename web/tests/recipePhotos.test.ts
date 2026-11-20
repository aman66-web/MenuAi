import { describe, expect, it } from "vitest";
import { PHOTO_CENTRE, cleanPosition, dragPosition, mayHavePhoto, objectPosition, orphanedPhotos, photoRoom } from "../lib/mm/recipePhotos";

// Make it at home: a saved recipe's own photo is kept on the phone (lib/mm/recipePhotos.ts). Only Pip's recipes ask for one, and a photo whose recipe is gone is tidied away.
describe("saved recipes' own photos", () => {
  it("are looked up only for recipes Pip made", () => {
    expect(mayHavePhoto("ai-lx2k9-abc123")).toBe(true);
    expect(mayHavePhoto("chicken-curry")).toBe(false);
  });
  it("are deleted when their recipe is no longer saved", () => {
    expect(orphanedPhotos(["ai-1", "ai-2", "ai-3"], ["ai-2", "ai-9"])).toEqual(["ai-1", "ai-3"]);
    expect(orphanedPhotos([], ["ai-1"])).toEqual([]);
    expect(orphanedPhotos(["ai-1"], [])).toEqual(["ai-1"]);
  });
});

// Founder 2026-11-20: tap the photo, drag it, Done. Only which part shows is kept (CSS object-position, per cent); the photo itself is never changed.
describe("moving a recipe's own photo", () => {
  const box = { w: 400, h: 300 };
  it("knows how far a photo runs past the picture each way", () => {
    // a portrait photo (3:4) in a landscape picture runs past top and bottom only
    const room = photoRoom(box, { w: 600, h: 800 });
    expect(room.w).toBe(0);
    expect(room.h).toBeCloseTo(233.3, 1);
    // the picture's own shape: nothing to move
    expect(photoRoom(box, { w: 800, h: 600 })).toEqual({ w: 0, h: 0 });
    expect(photoRoom(box, { w: 0, h: 0 })).toEqual({ w: 0, h: 0 });
  });
  it("follows the finger and never leaves a gap", () => {
    const portrait = { w: 600, h: 800 };
    // dragging up shows more of the bottom
    expect(dragPosition(PHOTO_CENTRE, 0, -100, box, portrait).y).toBeCloseTo(92.9, 1);
    // dragging down shows more of the top
    expect(dragPosition(PHOTO_CENTRE, 0, 100, box, portrait).y).toBeCloseTo(7.1, 1);
    // never past the edge
    expect(dragPosition(PHOTO_CENTRE, 0, -1000, box, portrait)).toEqual({ x: 50, y: 100 });
    expect(dragPosition(PHOTO_CENTRE, 0, 1000, box, portrait)).toEqual({ x: 50, y: 0 });
    // no room across: a sideways drag leaves it where it was
    expect(dragPosition({ x: 30, y: 40 }, 200, 0, box, portrait)).toEqual({ x: 30, y: 40 });
    // a wide photo moves across: dragging right shows more of its left side
    expect(dragPosition(PHOTO_CENTRE, 50, 0, box, { w: 1600, h: 600 }).x).toBeLessThan(50);
  });
  it("keeps only a clean position and gives it to the browser as object-position", () => {
    expect(cleanPosition({ x: 12.345, y: 140 })).toEqual({ x: 12.3, y: 100 });
    expect(cleanPosition({ x: "1", y: 2 })).toBeNull();
    expect(cleanPosition(null)).toBeNull();
    expect(cleanPosition({ x: Number.NaN, y: 2 })).toBeNull();
    expect(objectPosition({ x: 20, y: 80 })).toBe("20% 80%");
    expect(objectPosition(null)).toBeUndefined();
  });
  it("tidies away a kept position with its recipe", () => {
    // keys() lists photos and positions together, once each; an id no longer saved goes, photo and position
    expect(orphanedPhotos(["ai-1", "ai-2"], ["ai-2"])).toEqual(["ai-1"]);
  });
});
