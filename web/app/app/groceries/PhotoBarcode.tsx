"use client";

import { useRef, useState } from "react";
import { toGray, type GrayImage } from "@/lib/mm/barcode";
import { PHOTO_REGIONS, PHOTO_SIDE, readStill } from "@/lib/mm/barcodePhoto";
import { barcodeQuery } from "@/lib/mm/groceries";
import { tk } from "@/lib/mm/i18n";
import { PhotoIcon } from "../_components/icons";
import { Button } from "../_components/ui";
import { useT } from "../_lib/i18n";

// "Choose a photo" of a barcode (founder 2026-11-21: "allow people to upload a photo ... of the barcode if the food they want to note the calories for"): the
// photo is opened and read on the phone with the camera's own reader (lib/mm/barcodePhoto.ts: the whole photo, its middle, then nine parts), and never sent
// anywhere. A code found goes on exactly as a scanned one does.

export const NO_CODE_IN_PHOTO = tk("No barcode found in that photo. Try a closer, sharper photo, or type the number under the barcode.");
const PHOTO_WONT_OPEN = tk("That photo couldn't be opened. Try another one, or type the number under the barcode.");

/** The picture in a file, ready to draw (createImageBitmap turns it the right way up from its camera data; an <img> where that is missing). */
async function openPicture(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const b = await createImageBitmap(file);
      return { source: b, width: b.width, height: b.height, done: () => b.close() };
    } catch { /* an older WebKit: the <img> below */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

/** The barcode in a photo the person picked, or null. Throws when the file isn't a picture the phone can open. */
export async function readBarcodeFromFile(file: Blob): Promise<string | null> {
  const pic = await openPicture(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !pic.width || !pic.height) return null;
    const views = function* (): Generator<GrayImage> {
      for (const r of PHOTO_REGIONS) {
        const sx = Math.round(r.x * pic.width), sy = Math.round(r.y * pic.height);
        const sw = Math.max(1, Math.round(r.w * pic.width)), sh = Math.max(1, Math.round(r.h * pic.height));
        const scale = Math.min(1, PHOTO_SIDE / Math.max(sw, sh));
        const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(pic.source, sx, sy, sw, sh, 0, 0, w, h);
        yield { data: toGray(ctx.getImageData(0, 0, w, h).data, w, h), width: w, height: h };
      }
    };
    return readStill(views());
  } finally {
    pic.done();
  }
}

/** A "Choose a photo" button: opens the phone's photo picker and passes on the code it reads, or a calm line saying why not. */
export function PhotoBarcodeButton({ onCode, onNote, variant = "secondary", label }: { onCode: (code: string) => void; onNote: (note: string | null) => void; variant?: "primary" | "secondary"; label?: string }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    onNote(null);
    try {
      const code = await readBarcodeFromFile(file);
      if (code && barcodeQuery(code)) onCode(code);
      else onNote(NO_CODE_IN_PHOTO);
    } catch {
      onNote(PHOTO_WONT_OPEN);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} full className="min-h-12" busy={busy} busyLabel={t("Reading the photo")} onClick={() => input.current?.click()}>
        <PhotoIcon aria-hidden className="h-5 w-5" />
        {label ?? t("Choose a photo")}
      </Button>
      {/* no "capture": the phone offers its photo library (and the camera) */}
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}
