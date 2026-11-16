import { describe, expect, it } from "vitest";
import { mayHavePhoto, orphanedPhotos } from "../lib/mm/recipePhotos";

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
