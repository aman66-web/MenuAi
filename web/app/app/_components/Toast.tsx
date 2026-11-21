"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
 * It sits just above the tab bar with the colour meeting's 16 px gap by default (the 30-person audit, 20 November 2026: at the top it covered Back, the
 * Shopping list and the Settings cog for 8 seconds or more); `place="top"` keeps it at the top, for the one toast after Home's and Today's + sheet, so a second
 * tap on the same + can never land on Undo. It closes itself after `duration` ms (at least 8 seconds; `null` keeps it until `onClose` is called by the screen),
 * and never while a finger or the keyboard is on it: the time starts again when they leave. A tap on its words closes it at once. For a new message, give it a
 * new `key` so its time starts afresh. `focusUndo` moves the focus to Undo as it appears (Today's Remove: the keyboard and VoiceOver focus never drops to the
 * page); that move of ours doesn't hold it (it held Today's "Removed …" toast for good, its Undo working long after: Femi, the 30-person meeting, 21 November
 * 2026), only the person's own finger or keyboard does. If it goes with the focus still inside and the screen hasn't moved it, the focus goes to the page's
 * heading (focusPage), never to the bare page. It is drawn first in the page's <main> (a portal), so a screen reader comes to the message and its Undo straight
 * after the top of the page, not after everything else on it.
 *
 * A swipe sends it away at once (founder 2026-11-20: "the person should be able to swipe that off the screen if they want. Like if they swipe up on that, it'll
 * go"): up for the top one, down for the bottom one, or sideways either way. It follows the finger, goes when pulled far enough and springs back when not; a
 * pull the wrong way only stretches a little. A swipe that starts on Undo never undoes. Under Reduce Motion it just goes, with no slide.
 */
const SWIPE_AWAY = 32; // px towards the edge it sits at
const SWIPE_SIDE = 64; // px sideways
const SLIDE_MS = 180;
export function Toast({ children, onClose, onUndo, undoLabel, duration = TOAST_MIN_MS, place = "bottom", tick = true, focusUndo = false, className }: {
  children: ReactNode;
  onClose: () => void;
  onUndo?: () => void;
  /** The spoken name of Undo when the plain word isn't enough ("Undo the last water you added"). */
  undoLabel?: string;
  duration?: number | null;
  place?: "top" | "bottom";
  tick?: boolean;
  /** Move the focus to Undo when the toast appears. */
  focusUndo?: boolean;
  className?: string;
}) {
  const t = useT();
  // drawn first in <main> (see above); where there is no <main>, where it is
  const [host, setHost] = useState<HTMLElement | "here" | null>(null);
  useLayoutEffect(() => {
    const main = document.querySelector("main");
    if (!main) {
      setHost("here"); // eslint-disable-line react-hooks/set-state-in-effect -- once, on the client
      return;
    }
    const el = document.createElement("div");
    el.setAttribute("data-toast-host", "");
    main.prepend(el);
    setHost(el);
    return () => {
      // read before it goes: once removed, the focus has already fallen to the page
      const hadFocus = el.contains(document.activeElement);
      el.remove();
      // after the screen's own move, if it makes one (Today puts the focus on the next food); only if the focus is still nowhere then
      if (hadFocus) window.setTimeout(focusPage, 50);
    };
  }, []);
  const undoButton = useRef<HTMLButtonElement>(null);
  // the focus we move to Undo ourselves, which must not count as the person holding the toast
  const autoFocused = useRef(false);
  useEffect(() => {
    const undo = undoButton.current;
    // already there: focusing it again fires no focus event, which would leave the flag set for the person's own next focus
    if (!focusUndo || !host || !undo || document.activeElement === undo) return;
    autoFocused.current = true;
    undo.focus({ preventScroll: true });
    if (document.activeElement !== undo) autoFocused.current = false; // it didn't take, so the next focus is the person's own
  }, [focusUndo, host]);
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

  if (!host) return null;
  const toast = (
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
      onFocus={() => {
        if (autoFocused.current) {
          autoFocused.current = false;
          return;
        }
        setHeld(true);
      }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
      className={`on-ink fixed inset-x-4 z-30 mx-auto flex max-w-md touch-none select-none items-center justify-between gap-3 rounded-[1.75rem] border border-on-ink-2 bg-ink py-1.5 ps-4 pe-2 text-on-ink shadow-[var(--shadow-lift)] ${place === "top" ? "top-[max(0.75rem,env(safe-area-inset-top))]" : "bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))_+_5.5rem)]"} ${className ?? ""}`}
    >
      <span className="flex min-h-11 min-w-0 items-center gap-2.5 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">
        {tick && <CheckIcon aria-hidden strokeWidth={2.6} className="h-5 w-5 shrink-0 text-sun" />}
        {/* a tap on the words sends it away (a swipe does too); its Undo is a separate button */}
        <span className="min-w-0" onClick={() => close.current()}>{children}</span>
      </span>
      {onUndo && (
        <button ref={undoButton} type="button" onClick={onUndo} aria-label={undoLabel} className="min-h-11 shrink-0 rounded-full px-3.5 text-[0.9375rem] font-bold text-on-ink underline underline-offset-2 transition hover:bg-ink-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
          {t("Undo")}
        </button>
      )}
    </div>
  );
  return host === "here" ? toast : createPortal(toast, host);
}

/** The focus left with a toast that has gone: the page's heading takes it (as the welcome screens do), else the page itself; never while something has it. */
function focusPage() {
  const now = document.activeElement;
  if (now && now !== document.body && now.isConnected) return;
  const target = document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("main");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  target.focus({ preventScroll: true });
}
