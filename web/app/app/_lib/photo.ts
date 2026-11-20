// Make it at home: the photo someone picks is made smaller on the phone before anything is sent (lib/mm/photoRecipe.ts MAX_PHOTO_SIDE): a JPEG with its long side
// at most 1024 pixels, which is plenty for Pip to see the dish and keeps the request small. The original never leaves the phone.

import { MAX_PHOTO_BASE64, MAX_PHOTO_SIDE, foodCrop, type FoodBox } from "@/lib/mm/photoRecipe";

export interface ShrunkPhoto {
  /** base64 of the JPEG, no "data:" prefix (what the API takes). */
  base64: string;
  /** A local address for showing it on this screen (revoke it when done). */
  url: string;
}

async function draw(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
  } catch {
    // older browsers: through an <img>
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("unreadable")); img.src = url; });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

/** The photo as a smaller JPEG, or null when it can't be read as a picture. */
export async function shrinkPhoto(file: Blob, maxSide = MAX_PHOTO_SIDE): Promise<ShrunkPhoto | null> {
  if (!file.type.startsWith("image/") && file.type !== "") return null;
  try {
    const pic = await draw(file);
    const scale = Math.min(1, maxSide / Math.max(pic.width, pic.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(pic.width * scale));
    canvas.height = Math.max(1, Math.round(pic.height * scale));
    canvas.getContext("2d")?.drawImage(pic.source, 0, 0, canvas.width, canvas.height);
    pic.done();
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) return null;
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
        reader.onerror = () => reject(new Error("unreadable"));
        reader.readAsDataURL(blob);
      });
      if (base64.length <= MAX_PHOTO_BASE64) return { base64, url: URL.createObjectURL(blob) };
    }
    return null;
  } catch {
    return null;
  }
}

/** The saved recipe's picture as a JPEG: the whole photo, never cropped, at least 800 x 600 where a card shows it (long side at most 1,600), so the person can move
 *  it to choose which part shows (founder 2026-11-20: tap the photo, drag, Done; lib/mm/recipePhotos.ts keeps where). Until 20 November it was cropped from the
 *  middle to 4:3, which left nothing to move. Null when it can't be made. */
export async function recipeThumbnail(url: string): Promise<Blob | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const pic = await draw(blob);
    const scale = Math.min(Math.max(800 / pic.width, 600 / pic.height), 1600 / Math.max(pic.width, pic.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(pic.width * scale));
    canvas.height = Math.max(1, Math.round(pic.height * scale));
    canvas.getContext("2d")?.drawImage(pic.source, 0, 0, canvas.width, canvas.height);
    pic.done();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch {
    return null;
  }
}

/**
 * The photo cropped round the food (founder 2026-11-18: "You should automatically adjust the photo yourself to make sure the food is in it"): where the food
 * check said the dish is (FoodBox), with a margin, at 4:3 (the recipe picture's and the cards' shape), long side at most 1024 pixels, as a local address.
 * Null when it can't be made (the screen then shows the photo as taken).
 */
export async function photoOfFood(url: string, box: FoodBox): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const pic = await draw(blob);
    const c = foodCrop(pic.width, pic.height, box);
    const scale = Math.min(1, 1024 / Math.max(c.width, c.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(c.width * scale));
    canvas.height = Math.max(1, Math.round(c.height * scale));
    canvas.getContext("2d")?.drawImage(pic.source, c.x, c.y, c.width, c.height, 0, 0, canvas.width, canvas.height);
    pic.done();
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return out ? URL.createObjectURL(out) : null;
  } catch {
    return null;
  }
}
