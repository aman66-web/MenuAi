"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../_lib/i18n";
import { CheckIcon } from "./icons";

/** How long a toast stays, at the least (colour meeting, 19 November 2026: older people read slowly). */
export const TOAST_MIN_MS = 8000;

/**
 * The one toast after an action ("Added to your list", "Plan removed."), the same on every screen (colour meeting, 19 November 2026; approved by the founder
 * that day): ink with white words (16:1), a lime tick before them (success is a tick and words, never a colour alone), a thin light edge so it stands apart from
 * the dark tab bar, and Undo as white, bold, underlined words in a 44 px target (never lime: lime is never an action). It is a polite live region, so a screen
 * reader reads it out.
 *
 * It sits at the top of the screen by default, clear of the + buttons a second tap might hit (Home, the shopping list); `place="bottom"` puts it just above the
 * tab bar with a gap. It closes itself after `duration` ms (at least 8 seconds; `null` keeps it until `onClose` is called by the screen), and never while a
 * finger or the keyboard is on it: the time starts again when they leave. For a new message, give it a new `key` so its time starts afresh.
 *
 * A swipe sends it away at once (founder 2026-11-20: "the person should be able to swipe that off the screen if they want. Like if they swipe up on that, it'll
 * go"): up for the top one, down for the bottom one, or sideways either way. It follows the finger, goes when pulled far enough and springs back when not; a
 * pull the wrong way only stretches a little. A swipe that starts on Undo never undoes. Under Reduce Motion it just goes, with no slide.
 */
const SWIPE_AWAY = 32; // px towards the edge it sits at
const SWIPE_SIDE = 64; // px sideways
const SLIDE_MS = 180;
export function Toast({ children, onClose, onUndo, undoLabel, duration = TOAST_MIN_MS, place = "top", tick = true, className }: {
  children: ReactNode;
  onClose: () => void;
  onUndo?: () => void;
  /** The spoken name of Undo when the plain word isn't enough ("Undo the last water you added"). */
  undoLabel?: string;
  duration?: number | null;
  place?: "top" | "bottom";
  tick?: boolean;
  className?: string;
}) {
  const t = useT();
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  const [held, setHeld] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const away = place === "top" ? -1 : 1; // the direction that sends it off the screen
  const place2 = (dx: number, dy: number, slide: boolean) => {
    const el = box.current;
    if (!el) return;
    el.style.transition = slide ? `transform ${SLIDE_MS}ms ease-out, opacity ${SLIDE_MS}ms ease-out` : "none";
    el.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
    el.style.opacity = dx || dy ? String(Math.max(0.15, 1 - Math.max(Math.abs(dx), Math.abs(dy)) / 180)) : "";
  };
  const endDrag = (id: number) => {
    const d = drag.current;
    if (!d || d.id !== id) return;
    drag.current = null;
    if (!d.moved) return;
    const gone = Math.abs(d.dx) > SWIPE_SIDE || d.dy * away > SWIPE_AWAY;
    if (!gone) { place2(0, 0, true); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { close.current(); return; }
    place2(d.dx ? Math.sign(d.dx) * window.innerWidth : 0, d.dx ? 0 : away * 200, true);
    window.setTimeout(() => close.current(), SLIDE_MS);
  };
  const ms = duration === null ? null : Math.max(TOAST_MIN_MS, duration);
  useEffect(() => {
    if (ms === null || held) return;
    const id = window.setTimeout(() => close.current(), ms);
    return () => window.clearTimeout(id);
  }, [ms, held]);

  return (
    <div
      ref={box}
      role="status"
      onPointerDown={(e) => {
        dragged.current = false;
        if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.moved) {
          if (Math.hypot(dx, dy) < 8) return; // a tap, not a swipe
          d.moved = true;
          dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        const sideways = Math.abs(dx) > Math.abs(dy);
        d.dx = sideways ? dx : 0;
        d.dy = sideways ? 0 : dy * away > 0 ? dy : dy / 4;
        place2(d.dx, d.dy, false);
      }}
      onPointerUp={(e) => endDrag(e.pointerId)}
      onPointerCancel={(e) => endDrag(e.pointerId)}
      onClickCapture={(e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; } }}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
      className={`on-ink fixed inset-x-4 z-30 mx-auto flex max-w-md touch-none select-none items-center justify-between gap-3 rounded-[1.75rem] border border-on-ink-2 bg-ink py-1.5 ps-4 pe-2 text-on-ink shadow-[var(--shadow-lift)] ${place === "top" ? "top-[max(0.75rem,env(safe-area-inset-top))]" : "bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))_+_5.5rem)]"} ${className ?? ""}`}
    >
      <span className="flex min-h-11 min-w-0 items-center gap-2.5 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">
        {tick && <CheckIcon aria-hidden strokeWidth={2.6} className="h-5 w-5 shrink-0 text-sun" />}
        <span className="min-w-0">{children}</span>
      </span>
      {onUndo && (
        <button type="button" onClick={onUndo} aria-label={undoLabel} className="min-h-11 shrink-0 rounded-full px-3.5 text-[0.9375rem] font-bold text-on-ink underline underline-offset-2 transition hover:bg-ink-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
          {t("Undo")}
        </button>
      )}
    </div>
  );
}
