"use client";

import { useEffect, useRef, useState } from "react";
import { barcodeQuery } from "@/lib/mm/groceries";
import { tk } from "@/lib/mm/i18n";
import { Button, inputClass, Sheet } from "../_components/ui";
import { useT } from "../_lib/i18n";

// Barcode scanning happens in this browser: the camera feed is read here and never sent anywhere. Where the browser has no barcode
// reader (BarcodeDetector), or the camera is refused, the number can be typed instead.

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

export function Scanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setNote(tk("This browser can't read barcodes with the camera. Type the number printed under the barcode instead.")); // eslint-disable-line react-hooks/set-state-in-effect -- reflects a capability check on open
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          try {
            const found = await detector.detect(video.current);
            const code = found[0]?.rawValue;
            if (code && barcodeQuery(code)) onCode(code);
          } catch { /* a frame that can't be read: try the next */ }
        }, 300);
      } catch {
        setNote(tk("The camera isn't available (or was refused). Type the number printed under the barcode instead."));
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onCode]);

  return (
    <Sheet open={open} onClose={onClose} title={t("Scan a barcode")}>
      <div className="space-y-3 pb-2">
        {!note && <video ref={video} playsInline muted aria-label={t("Camera view: point it at the barcode")} className="aspect-[4/3] w-full rounded-3xl bg-black object-cover" />}
        {note && <p role="status" className="text-sm text-muted">{t(note)}</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = barcodeQuery(typed);
            if (c) onCode(c);
            else setNote(tk("A barcode is 8 to 14 digits."));
          }}
        >
          <label className="flex-1">
            <span className="sr-only">{t("Barcode number")}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" placeholder={t("Barcode number")} autoComplete="off" className={inputClass} />
          </label>
          <Button type="submit" variant="secondary">{t("Find")}</Button>
        </form>
      </div>
    </Sheet>
  );
}
