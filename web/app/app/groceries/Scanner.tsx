"use client";

import { useEffect, useRef, useState } from "react";
import { createVoter, decodeImage, toGray } from "@/lib/mm/barcode";
import { barcodeDigits } from "@/lib/mm/barcodes";
import { barcodeQuery } from "@/lib/mm/groceries";
import { tk } from "@/lib/mm/i18n";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { site } from "@/site.config";
import { CloseIcon, PhotoIcon } from "../_components/icons";
import { Button, Sheet } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { PILL_INPUT } from "./PageBits";
import { NO_CODE_IN_PHOTO, PhotoBarcodeButton, readBarcodeFromFile } from "./PhotoBarcode";

// Barcode scanning happens on the device: the camera feed is read here and never sent anywhere. Founder 2026-10-15 ("for the scan barcode can it launch
// like a camera where you can scan it"): tapping Scan opens a full-screen camera with a box to hold the barcode in, and the code is read as soon as it is
// seen. In the iPhone app the iPhone's own scanner does it (lib/mm/native.ts). In a browser or a web view the page reads the frames itself
// (lib/mm/barcode.ts: iPhone Safari has no BarcodeDetector), using the browser's own BarcodeDetector where there is one. Where the camera can't be used
// or is refused, or the person would rather, the number printed under the barcode can be typed instead.

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

/** How long to wait between looking at one picture and the next (the reading of a picture takes a few hundredths of a second itself). */
const FRAME_GAP_MS = 70;
/** The largest side of the picture that is read; a bigger camera picture is scaled down to this first. */
const MAX_SIDE = 1280;

const NO_CAMERA_API = tk("This browser can't read barcodes with the camera. Type the number printed under the barcode instead.");
const CAMERA_REFUSED = tk("The camera isn't available (or was refused). Type the number printed under the barcode instead.");

/** The full-screen camera: the live picture, a box to hold the barcode in, and a way out to typing the number. */
function CameraView({ onCode, onClose, onType, onFallback }: { onCode: (code: string) => void; onClose: () => void; onType: () => void; onFallback: (note: string) => void }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [found, setFound] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setReadingPhoto(true);
    let code: string | null = null;
    try { code = await readBarcodeFromFile(file); } catch { code = null; }
    setReadingPhoto(false);
    if (code && barcodeQuery(code)) handlers.current.onCode(code);
    else handlers.current.onFallback(NO_CODE_IN_PHOTO);
  };
  // the parent passes new functions every time it renders: the camera must not restart for that
  const handlers = useRef({ onCode, onFallback });
  handlers.current = { onCode, onFallback }; // eslint-disable-line react-hooks/refs -- the latest handlers, read only when a code is found

  // A modal dialog: the page behind it is out of reach while the camera is up. It is taken away with the view (no close() call, which would
  // report a close as if the person had dismissed it).
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const voter = createVoter();
    const view = video.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let gray: Uint8Array | undefined;
    let detector: Detector | null = null;

    const accept = (code: string) => {
      if (stopped) return;
      stopped = true;
      setFound(true);
      try { navigator.vibrate?.(25); } catch { /* not every browser can */ }
      setTimeout(() => handlers.current.onCode(code), 220);
    };

    /** One look at the camera picture. */
    const look = async () => {
      const v = video.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      if (detector) {
        const code = (await detector.detect(v))[0]?.rawValue;
        if (code && barcodeQuery(code)) accept(code);
        return;
      }
      if (!ctx) return;
      const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
      const w = Math.max(40, Math.round(v.videoWidth * scale));
      const h = Math.max(40, Math.round(v.videoHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(v, 0, 0, w, h);
      gray = toGray(ctx.getImageData(0, 0, w, h).data, w, h, gray);
      const read = decodeImage({ data: gray, width: w, height: h });
      const code = read && voter.add(read.code, read.hits, performance.now());
      if (code && barcodeQuery(code)) accept(code);
    };

    const loop = async () => {
      if (stopped) return;
      try { await look(); } catch { /* a picture that can't be read: try the next */ }
      if (!stopped) timer = setTimeout(() => void loop(), FRAME_GAP_MS);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        handlers.current.onFallback(NO_CAMERA_API);
        return;
      }
      try {
        // the back camera, as sharp as it will give: a barcode in a small picture has stripes too thin to measure
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch {
        if (!stopped) handlers.current.onFallback(CAMERA_REFUSED);
        return;
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.current.srcObject = stream;
      try { await video.current.play(); } catch { /* it starts when the picture is ready */ }
      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (Ctor) {
        try { detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }); } catch { detector = null; }
      }
      void loop();
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (view) view.srcObject = null;
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={t("Scan a barcode")}
      onClose={onClose}
      className="on-ink fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden bg-ink p-0 text-on-ink backdrop:bg-ink"
    >
      <video ref={video} playsInline muted autoPlay aria-label={t("Camera view: point it at the barcode")} className="absolute inset-0 h-full w-full object-cover" />

      {/* the box to hold the barcode in; everything outside it is dimmed, and it turns lime the moment a code is read */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className={`aspect-[7/4] w-[82%] max-w-md rounded-[1.5rem] border-[3px] shadow-[0_0_0_1px_var(--scrim),0_0_0_100vmax_var(--scrim)] transition-colors duration-150 ${found ? "border-sun" : "border-on-ink"}`} />
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="min-w-0 flex-1 text-xl font-[800] leading-tight tracking-[-0.01em] [text-shadow:0_1px_8px_var(--scrim)]">{t("Scan a barcode")}</h2>
        <button type="button" onClick={onClose} aria-label={t("Close")} className="photo-chip inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p role="status" className="max-w-sm text-center text-base font-semibold leading-snug [text-shadow:0_1px_8px_var(--scrim)]">{t("Point the camera at the barcode")}</p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button type="button" onClick={onType} className="inline-flex min-h-12 items-center justify-center rounded-full bg-card px-6 text-base font-bold text-ink transition active:scale-[0.97] hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
            {t("Type the number instead")}
          </button>
          {/* a photo of the barcode instead (founder 2026-11-21): read on the phone; one with no code goes to the sheet with a line saying so */}
          <button type="button" disabled={readingPhoto} onClick={() => photo.current?.click()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-card px-6 text-base font-bold text-ink transition active:scale-[0.97] hover:bg-background disabled:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
            <PhotoIcon aria-hidden className="h-5 w-5" />
            {readingPhoto ? t("Reading the photo") : t("Choose a photo")}
          </button>
          <input ref={photo} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void fromPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
    </dialog>
  );
}

export function Scanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<"camera" | "typed">("camera");
  const [scanRound, setScanRound] = useState(0);
  const native = open && hasNative();
  // the parent passes a new onCode every time it renders: the iPhone's scanner must not start again for that (2026-11-20: a second scanner opened over the
  // first, and its Cancel did nothing), so it is read from here when a code comes back
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; });

  // Closed, it forgets what it showed, so that the next opening starts with the camera (or, in the iPhone app, its own scanner) and a clean sheet.
  useEffect(() => {
    if (open) return;
    setNote(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset when closed (and the two below)
    setMode("camera");
    setTyped("");
  }, [open]);

  // In the iPhone app: the iPhone's own scanner opens over the sheet; cancelling it leaves the sheet with the typed number and "Scan again".
  useEffect(() => {
    if (!open || !native) return;
    let live = true;
    setNote(null); // eslint-disable-line react-hooks/set-state-in-effect -- a new scan starts with a clean sheet
    // the phone's own scanner always answers (a code, cancelled, denied or unavailable), so the wait is long: a barcode read after two minutes of aiming was thrown
    // away by the usual 2-minute timeout (the 30-person meeting, 21 November 2026, Grace)
    void nativeCall("scan", {}, 30 * 60_000).then((r) => {
      if (!live) return;
      if (r.code && barcodeQuery(r.code)) onCodeRef.current(r.code);
      else if (r.error === "denied") setNote(tk("{app} isn't allowed to use the camera. Turn it on in the iPhone's Settings, under {app}, or type the number printed under the barcode."));
      else if (r.error === "unavailable") setNote(tk("This iPhone can't scan barcodes with the camera. Type the number printed under the barcode instead."));
      else setNote(tk("Type the number printed under the barcode, or scan again."));
    });
    return () => { live = false; };
  }, [open, native, scanRound]);

  const camera = open && !native && mode === "camera";
  const sheet = open && (native || mode === "typed");

  return (
    <>
      {camera && (
        <CameraView
          onCode={onCode}
          onClose={onClose}
          onType={() => { setNote(null); setMode("typed"); }}
          onFallback={(why) => { setNote(why); setMode("typed"); }}
        />
      )}
      {/* The sheet closes itself when the camera takes over again ("Scan again"): that is not the person closing the scanner. */}
      <Sheet open={sheet} onClose={() => { if (sheet) onClose(); }} title={t("Scan a barcode")}>
        <div className="space-y-3.5 pb-2 pt-1">
          {note && <p role="status" className="text-[0.9375rem] leading-snug text-muted">{t(note, { app: site.name })}</p>}
          {(native ? note : true) && <Button full variant={native ? "primary" : "secondary"} onClick={() => (native ? setScanRound((n) => n + 1) : (setNote(null), setMode("camera")))}>{t("Scan again")}</Button>}
          <PhotoBarcodeButton onCode={(c) => onCode(c)} onNote={setNote} />
          <form
            className="flex gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              // the digits as typed, leading zeros kept (the design review of 2026-11-20: 01318180 came back as 1318180); each screen looks it up its own way
              const c = barcodeDigits(typed);
              if (c) onCode(c);
              else setNote(tk("A barcode is 8 to 14 digits."));
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t("Barcode number")}</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" placeholder={t("Barcode number")} autoComplete="off" className={`${PILL_INPUT} app-numbers`} />
            </label>
            <Button type="submit" className="min-h-12">{t("Find")}</Button>
          </form>
        </div>
      </Sheet>
    </>
  );
}
