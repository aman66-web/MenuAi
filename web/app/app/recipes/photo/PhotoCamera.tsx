"use client";

import { useEffect, useRef, useState } from "react";
import { framedPart } from "@/lib/mm/photoCrop";
import { CameraIcon, CloseIcon, PhotoIcon } from "../../_components/icons";
import { Pip } from "../../_components/Mascot";
import { useT } from "../../_lib/i18n";

// Make it at home, the camera step (founder 2026-11-17: "it launches the camera, and on the camera you should be able to see a cool scanning animation ...
// after the scanning animation, they scan their food, and it takes about 2 seconds. It says scanning, scanning, scanning"). A full-screen live camera with a
// frame and a light that sweeps over the dish; the person taps the shutter, the frozen picture is "scanned" for a couple of seconds (ScanningPhoto), then the
// flow goes on to the supermarket. Nothing is read or sent from the live picture: only the one photo that is taken, made smaller on the phone (_lib/photo.ts).
// Where the page can't show the camera (no camera API, or the person refused it) the same screen offers the phone's own camera and photo picker instead.
// Founder 2026-11-17: the Scan food button is pressed and HELD ("that way it ensures you get good photos"): a lime ring fills round it while the light sweeps fast,
// and the photo is taken when the ring is full (let go early and nothing is taken). From a keyboard, Enter or Space takes it at once.

/** The longest side of the picture taken from the live view (only the part inside the scanning frame); shrinkPhoto then makes it smaller still for sending. */
const CAPTURE_SIDE = 1600;
/** How long the taken photo is "scanned" before the flow goes on (a moment shorter when the phone is set to reduce motion). */
const SCAN_MS = 2600;
const SCAN_MS_CALM = 1200;
/** How long Scan food has to be held before the photo is taken. */
export const HOLD_MS = 1500;
/** The ring round the button: its circumference for a radius of 36 (the SVG's own units). */
const RING = 2 * Math.PI * 36;

/** Four corner marks and a light that sweeps down and up the frame: the scanning look, shared by the live view and the taken photo. */
function ScanFrame({ strong = false }: { strong?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className="scan-corner start-4 top-4 rounded-ss-3xl border-s-4 border-t-4" />
      <span className="scan-corner end-4 top-4 rounded-se-3xl border-e-4 border-t-4" />
      <span className="scan-corner bottom-4 start-4 rounded-es-3xl border-b-4 border-s-4" />
      <span className="scan-corner bottom-4 end-4 rounded-ee-3xl border-b-4 border-e-4" />
      <span className={`scan-line ${strong ? "scan-line-fast" : ""}`} />
    </div>
  );
}

/** The full-screen live camera. */
export function PhotoCamera({ onCapture, onClose, onPickPhoto, onPhonesCamera, notice }: { onCapture: (photo: Blob) => void; onClose: () => void; onPickPhoto: () => void; onPhonesCamera: () => void; /** Why the last photo was turned down ("That doesn't look like food ..."), shown at the top. */ notice?: string | null }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [flash, setFlash] = useState(false);
  const [holding, setHolding] = useState(false);
  const [letGo, setLetGo] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  // A modal dialog: the page behind it is out of reach while the camera is up (taken away with the view, like the barcode scanner's).
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    const view = video.current;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setUnavailable(true); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      } catch {
        if (!stopped) setUnavailable(true);
        return;
      }
      if (stopped || !video.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      video.current.srcObject = stream;
      try { await video.current.play(); } catch { /* it starts when the picture is ready */ }
      if (!stopped) setReady(true);
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (view) view.srcObject = null;
    };
  }, []);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    // only what was inside the scanning frame (founder 2026-11-18: "it should only be the frame that the person scanned"): the live view fills the screen, so the
    // camera's whole picture holds more round the edges than the person saw (lib/mm/photoCrop.ts)
    const view = v.getBoundingClientRect();
    const box = frame.current?.getBoundingClientRect();
    const part = framedPart(v.videoWidth, v.videoHeight, view.width, view.height, box ? { x: box.left - view.left, y: box.top - view.top, width: box.width, height: box.height } : { x: 0, y: 0, width: 0, height: 0 });
    const scale = Math.min(1, CAPTURE_SIDE / Math.max(part.width, part.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(part.width * scale));
    canvas.height = Math.max(1, Math.round(part.height * scale));
    canvas.getContext("2d")?.drawImage(v, part.x, part.y, part.width, part.height, 0, 0, canvas.width, canvas.height);
    try { navigator.vibrate?.(20); } catch { /* not every browser can */ }
    setFlash(true);
    canvas.toBlob((blob) => { if (blob) onCapture(blob); else setFlash(false); }, "image/jpeg", 0.9);
  };

  /** A finger (or the mouse) goes down on Scan food: the ring starts to fill, and the photo is taken when it is full. */
  const startHold = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!ready || flash || holdTimer.current) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not every browser can */ }
    setLetGo(false);
    setHolding(true);
    try { navigator.vibrate?.(10); } catch { /* not every browser can */ }
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      setHolding(false);
      shoot();
    }, HOLD_MS);
  };
  /** Let go before the ring is full: nothing is taken, and the screen says to keep holding. */
  const endHold = () => {
    if (!holdTimer.current) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
    setLetGo(true);
  };

  return (
    <dialog
      ref={dialog}
      aria-label={t("Scan your food")}
      onClose={onClose}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden bg-black p-0 text-white backdrop:bg-black"
    >
      {!unavailable && <video ref={video} playsInline muted autoPlay aria-label={t("Camera view: point it at your food")} className="absolute inset-0 h-full w-full object-cover" />}

      {/* dim the edges so the dish sits in a bright frame */}
      {!unavailable && <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_100vmax_rgba(0,0,0,0.18)]" />}
      {!unavailable && <div ref={frame} className="absolute inset-x-5 bottom-44 top-24"><ScanFrame strong={holding} /></div>}
      {flash && <div aria-hidden className="absolute inset-0 bg-white/80" />}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="min-w-0 flex-1 text-xl font-[800] leading-tight tracking-[-0.01em] [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">{t("Scan your food")}</h2>
        <button type="button" onClick={onClose} aria-label={t("Close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 transition active:scale-95 hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {notice && (
        <p role="alert" className="absolute inset-x-5 top-[calc(max(1rem,env(safe-area-inset-top))+3.75rem)] z-10 rounded-[1.25rem] bg-white px-4 py-3 text-[0.9375rem] font-semibold leading-snug text-foreground shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]">{notice}</p>
      )}

      {unavailable ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <Pip mood="think" size={96} />
          <p role="status" className="max-w-sm text-lg font-semibold leading-snug">{t("The camera can't be shown here. Take a photo with your phone's camera, or choose one from your photos.")}</p>
          <button type="button" onClick={onPhonesCamera} className="inline-flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-white px-6 text-lg font-bold text-foreground transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <CameraIcon className="h-6 w-6" />{t("Take a photo")}
          </button>
          <button type="button" onClick={onPickPhoto} className="inline-flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-white/20 px-6 text-lg font-bold transition active:scale-[0.97] hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <PhotoIcon className="h-6 w-6" />{t("Choose from your photos")}
          </button>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p role="status" className="max-w-sm text-center text-base font-semibold leading-snug [text-shadow:0_1px_8px_rgba(0,0,0,0.7)]">{holding ? t("Hold still…") : letGo ? t("Keep holding the button until the ring fills.") : t("Point the camera at your food, then press and hold the button to scan.")}</p>
          {/* two ways in: hold the shutter to scan the food with the camera, or upload a photo from the camera roll (bottom right) */}
          <div className="grid w-full max-w-sm grid-cols-3 items-end">
            <span aria-hidden />
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={!ready}
                aria-label={t("Hold to scan your food")}
                onPointerDown={startHold}
                onPointerUp={endHold}
                onPointerCancel={endHold}
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => { if (e.detail === 0) shoot(); /* Enter or Space: take it at once */ }}
                className="relative grid h-[5.25rem] w-[5.25rem] touch-none select-none place-items-center rounded-full transition [-webkit-touch-callout:none] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                {/* the ring fills (lime) while the button is held; the photo is taken when it is full */}
                <svg aria-hidden viewBox="0 0 80 80" className="absolute inset-0 h-full w-full -rotate-90">
                  <circle cx="40" cy="40" r="36" fill="none" stroke="white" strokeWidth="4" />
                  <circle key={holding ? "on" : "off"} cx="40" cy="40" r="36" fill="none" stroke="var(--sun)" strokeWidth="5" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={holding ? 0 : RING} className={holding ? "hold-ring" : ""} style={{ ["--ring" as string]: `${RING}px`, ["--hold" as string]: `${HOLD_MS}ms` }} />
                </svg>
                <span className={`h-[3.75rem] w-[3.75rem] rounded-full bg-white transition-transform duration-200 ${holding ? "scale-90" : ""}`} />
              </button>
              <span aria-hidden className="text-[0.8125rem] font-bold leading-none [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]">{t("Hold to scan")}</span>
            </div>
            <div className="flex flex-col items-center gap-2 justify-self-end">
              <button type="button" onClick={onPickPhoto} aria-label={t("Upload a photo from your camera roll")} className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/25 transition active:scale-95 hover:bg-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                <PhotoIcon className="h-6 w-6" />
              </button>
              <span aria-hidden className="text-[0.8125rem] font-bold leading-none [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]">{t("Camera roll")}</span>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The photo that was taken, "scanned" for a couple of seconds (the light sweeps fast and the word Scanning pulses), then the flow goes on. */
export function ScanningPhoto({ url, onDone }: { url: string; onDone: () => void }) {
  const t = useT();
  const done = useRef(onDone);
  done.current = onDone; // eslint-disable-line react-hooks/refs -- the latest handler, read only when the time is up
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => done.current(), calm ? SCAN_MS_CALM : SCAN_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section aria-label={t("Scanning")} className="mt-5">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.75rem] bg-black shadow-[0_18px_40px_-18px_rgba(17,24,20,0.5)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local photo on this phone, not a site image */}
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-[rgba(17,24,20,0.28)]" />
        <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/70 to-transparent px-5 pb-5 pt-12">
          <p role="status" className="scan-label flex items-center gap-1 text-xl font-[800] tracking-[-0.01em] text-white">
            <span>{t("Scanning")}</span>
            <span aria-hidden className="scan-dots"><i>.</i><i>.</i><i>.</i></span>
          </p>
        </div>
        <ScanFrame strong />
      </div>
    </section>
  );
}
