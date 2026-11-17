"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, CloseIcon, GridIcon } from "../../_components/icons";
import { Pip } from "../../_components/Mascot";
import { useT } from "../../_lib/i18n";

// Make it at home, the camera step (founder 2026-11-17: "it launches the camera, and on the camera you should be able to see a cool scanning animation ...
// after the scanning animation, they scan their food, and it takes about 2 seconds. It says scanning, scanning, scanning"). A full-screen live camera with a
// frame and a light that sweeps over the dish; the person taps the shutter, the frozen picture is "scanned" for a couple of seconds (ScanningPhoto), then the
// flow goes on to the supermarket. Nothing is read or sent from the live picture: only the one photo that is taken, made smaller on the phone (_lib/photo.ts).
// Where the page can't show the camera (no camera API, or the person refused it) the same screen offers the phone's own camera and photo picker instead.

/** The longest side of the picture taken from the live view; shrinkPhoto then makes it smaller still for sending. */
const CAPTURE_SIDE = 1600;
/** How long the taken photo is "scanned" before the flow goes on (a moment shorter when the phone is set to reduce motion). */
const SCAN_MS = 2600;
const SCAN_MS_CALM = 1200;

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
export function PhotoCamera({ onCapture, onClose, onPickPhoto, onPhonesCamera }: { onCapture: (photo: Blob) => void; onClose: () => void; onPickPhoto: () => void; onPhonesCamera: () => void }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [flash, setFlash] = useState(false);

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
    const scale = Math.min(1, CAPTURE_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    try { navigator.vibrate?.(20); } catch { /* not every browser can */ }
    setFlash(true);
    canvas.toBlob((blob) => { if (blob) onCapture(blob); else setFlash(false); }, "image/jpeg", 0.9);
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
      {!unavailable && <div className="absolute inset-x-5 bottom-40 top-24"><ScanFrame /></div>}
      {flash && <div aria-hidden className="absolute inset-0 bg-white/80" />}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="min-w-0 flex-1 text-xl font-[800] leading-tight tracking-[-0.01em] [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">{t("Scan your food")}</h2>
        <button type="button" onClick={onClose} aria-label={t("Close")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 transition active:scale-95 hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {unavailable ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <Pip mood="think" size={96} />
          <p role="status" className="max-w-sm text-lg font-semibold leading-snug">{t("The camera can't be shown here. Take a photo with your phone's camera, or choose one from your photos.")}</p>
          <button type="button" onClick={onPhonesCamera} className="inline-flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-white px-6 text-lg font-bold text-foreground transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <CameraIcon className="h-6 w-6" />{t("Take a photo")}
          </button>
          <button type="button" onClick={onPickPhoto} className="inline-flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-white/20 px-6 text-lg font-bold transition active:scale-[0.97] hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <GridIcon className="h-6 w-6" />{t("Choose from your photos")}
          </button>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p role="status" className="max-w-sm text-center text-base font-semibold leading-snug [text-shadow:0_1px_8px_rgba(0,0,0,0.7)]">{t("Point the camera at your food")}</p>
          <div className="flex w-full max-w-sm items-center justify-between">
            <button type="button" onClick={onPickPhoto} aria-label={t("Choose from your photos")} className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20 transition active:scale-95 hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <GridIcon className="h-6 w-6" />
            </button>
            <button type="button" onClick={shoot} disabled={!ready} aria-label={t("Take the photo")} className="grid h-[4.75rem] w-[4.75rem] place-items-center rounded-full border-4 border-white transition active:scale-95 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
              <span className="h-14 w-14 rounded-full bg-white" />
            </button>
            <span aria-hidden className="h-14 w-14" />
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
