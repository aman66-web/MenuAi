"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../_lib/i18n";
import { CloseIcon, ExpandIcon, MinusIcon, PlusIcon } from "./icons";

// The whole picture, full screen (founder 2026-11-18: "There should be a thing in the bottom right of the image of the photo where you can zoom in for full
// view of what it looks like"): a round button for a picture's bottom corner opens it on ink (colour meeting, 19 November 2026), all of it in view; pinch or double-tap to zoom (up to four
// times), drag to look round, a zoom button for anyone who can't pinch, and Close (or Escape, or the phone's back gesture through the dialog). A native modal
// <dialog>, like the app's sheets: it sits above everything, keeps the focus inside and leaves the page behind alone.

const MAX_ZOOM = 4;
const TAP_ZOOM = 2.5;

type View = { s: number; x: number; y: number };

/** The round button that opens the viewer; put it inside a `relative` picture. `className` places it (the recipe photo: bottom-12 end-4). */
export function FullPictureButton({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("See the whole picture")}
        className={`photo-chip absolute inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}>
        <ExpandIcon className="h-5 w-5" strokeWidth={2.2} />
      </button>
      {open && <PhotoViewer src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const from = useRef<{ view: View; d: number; mx: number; my: number } | null>(null);
  const tap = useRef<{ at: number; x: number; y: number; moved: boolean }>({ at: 0, x: 0, y: 0, moved: false });
  const closing = useRef(onClose);
  useEffect(() => { closing.current = onClose; }, [onClose]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    // a close event arrives a moment after close(); one that lands when the dialog is open again (React running this twice) is not a real close
    const done = () => { if (!d.open) closing.current(); };
    d.addEventListener("close", done);
    return () => { d.removeEventListener("close", done); if (d.open) d.close(); };
  }, []);

  /** Keeps the picture from being dragged out of the screen. */
  const fit = (v: View): View => {
    const r = box.current?.getBoundingClientRect();
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s));
    const mx = r ? (r.width * (s - 1)) / 2 : 0;
    const my = r ? (r.height * (s - 1)) / 2 : 0;
    return { s, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  };
  /** Zoomed to `s` about a point on the screen, which stays under the finger. */
  const zoomAt = (s: number, px: number, py: number): View => {
    const r = box.current?.getBoundingClientRect();
    if (!r || s <= 1) return { s: 1, x: 0, y: 0 };
    const dx = px - (r.left + r.width / 2);
    const dy = py - (r.top + r.height / 2);
    return fit({ s, x: dx * (1 - s), y: dy * (1 - s) });
  };
  const restart = (v: View) => {
    const ps = [...points.current.values()];
    if (ps.length >= 2) {
      const [a, b] = ps as [{ x: number; y: number }, { x: number; y: number }];
      from.current = { view: v, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    } else if (ps.length === 1) {
      from.current = { view: v, d: 0, mx: ps[0]!.x, my: ps[0]!.y };
    } else from.current = null;
  };

  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.current.size === 1) tap.current = { ...tap.current, moved: false };
    setMoving(true);
    restart(view);
  };
  const move = (e: React.PointerEvent) => {
    if (!points.current.has(e.pointerId) || !from.current) return;
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...points.current.values()];
    const f = from.current;
    if (ps.length >= 2) {
      const [a, b] = ps as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const s = Math.min(MAX_ZOOM, Math.max(1, (f.view.s * d) / f.d));
      const r = box.current?.getBoundingClientRect();
      const cx = r ? r.left + r.width / 2 : 0;
      const cy = r ? r.top + r.height / 2 : 0;
      // the point between the fingers stays between them
      const k = s / f.view.s;
      setView(fit({ s, x: mx - cx - (f.mx - cx - f.view.x) * k, y: my - cy - (f.my - cy - f.view.y) * k }));
      tap.current.moved = true;
    } else {
      const dx = e.clientX - f.mx;
      const dy = e.clientY - f.my;
      if (Math.hypot(dx, dy) > 8) tap.current.moved = true;
      if (f.view.s > 1) setView(fit({ ...f.view, x: f.view.x + dx, y: f.view.y + dy }));
    }
  };
  const up = (e: React.PointerEvent) => {
    if (!points.current.has(e.pointerId)) return;
    points.current.delete(e.pointerId);
    if (points.current.size === 0) {
      setMoving(false);
      if (!tap.current.moved) {
        const now = e.timeStamp;
        // a double tap zooms in where it lands, or back out
        if (now - tap.current.at < 320 && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) < 30) {
          setView(view.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(TAP_ZOOM, e.clientX, e.clientY));
          tap.current = { at: 0, x: 0, y: 0, moved: false };
          return;
        }
        tap.current = { at: now, x: e.clientX, y: e.clientY, moved: false };
      }
    }
    restart(view);
  };
  const wheel = (e: React.WheelEvent) => {
    const s = Math.min(MAX_ZOOM, Math.max(1, view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const k = s / view.s;
    setView(s <= 1 ? { s: 1, x: 0, y: 0 } : fit({ s, x: e.clientX - cx - (e.clientX - cx - view.x) * k, y: e.clientY - cy - (e.clientY - cy - view.y) * k }));
  };
  const zoomed = view.s > 1.01;

  return (
    <dialog ref={dialog} aria-label={t("The whole picture")} onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="on-ink fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden bg-ink p-0 text-on-ink backdrop:bg-ink">
      <div ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
        className="absolute inset-0 flex touch-none select-none items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- the same picture as on the page, already loaded */}
        <img src={src} alt={alt} draggable={false} className="max-h-full max-w-full object-contain will-change-transform"
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`, transition: moving ? "none" : "transform 0.22s ease-out" }} />
      </div>
      <button type="button" onClick={onClose} autoFocus aria-label={t("Close")}
        className="photo-chip absolute end-4 top-[max(0.75rem,env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition active:scale-95">
        <CloseIcon className="h-5 w-5" strokeWidth={2.4} />
      </button>
      <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-4">
        <button type="button" onClick={() => { const r = box.current?.getBoundingClientRect(); setView(zoomed ? { s: 1, x: 0, y: 0 } : zoomAt(TAP_ZOOM, r ? r.left + r.width / 2 : 0, r ? r.top + r.height / 2 : 0)); }}
          className="photo-chip inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-bold text-foreground transition active:scale-95">
          {zoomed ? <MinusIcon className="h-5 w-5" /> : <PlusIcon className="h-5 w-5" />}{zoomed ? t("Zoom out") : t("Zoom in")}
        </button>
        <p className="text-center text-[0.8125rem] text-on-ink-2">{t("Pinch or double-tap to zoom.")}</p>
      </div>
    </dialog>
  );
}
