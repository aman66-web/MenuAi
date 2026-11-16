"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { otherPlace, placeToast, recentTap, shouldFocusUndo, triggerBand, undoIsAccident, type Band, type LastInput, type ToastPlace } from "@/lib/mm/toastPlace";
import { useT } from "../_lib/i18n";

/** What a toast says, with its own key so the same words shown twice still start a fresh timer. */
export interface ToastMessage {
  key: string;
  text: string;
}

// The last tap and key press anywhere on the page (lib/mm/toastPlace.ts decides from them where the toast goes and whether Undo gets the focus).
const lastInput: LastInput = { x: 0, y: 0, pointerAt: -Infinity, keyAt: -Infinity };
let listening = false;
function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("pointerdown", (e) => { lastInput.x = e.clientX; lastInput.y = e.clientY; lastInput.pointerAt = performance.now(); }, { capture: true, passive: true });
  window.addEventListener("keydown", () => { lastInput.keyAt = performance.now(); }, { capture: true, passive: true });
}

const focusLost = (): boolean => !document.activeElement || document.activeElement === document.body;
const bandOf = (el: Element | null): Band | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
};
/** Where the focus goes when it was on Undo and the toast has gone: the page's heading (the list, the day, the recipe), never nowhere. */
function focusPageHeading(): void {
  const h = document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("h1");
  if (!h) return;
  if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  h.focus({ preventScroll: true });
}

/**
 * The dark pill that offers Undo for a few seconds ("Deleted “…”.", "Added “…” to Lunch.", "Shopping list cleared.").
 * A screen reader hears it through two status lines that are always on the page (a status region mounted together with its words is often not read):
 * each new toast goes into the other one, so the same words twice in a row ("Logged to Today." for a second serving) are read again. The visible pill is
 * hidden from it so nothing is read twice. The timer stops while the pointer is over the pill or the Undo button has the keyboard focus, and starts again
 * when they leave. When the control that had the keyboard focus disappeared with the action (the "−" at quantity 1, Clear, Delete), Undo gets the focus,
 * so a keyboard or switch user doesn't have to tab through the page to reach it; when Undo is used or the toast goes, the focus moves to the page's heading.
 * `top` puts it under the status bar, otherwise it sits above the floating tab bar; either way it goes to the other end when the control just used sits where
 * it would be, and an Undo pressed at that same spot a moment after (a double tap) does nothing (lib/mm/toastPlace.ts). `topInset` and `bottomInset` move
 * those two places for a page with its own controls there (a recipe's picture pills, its "Add all to my shopping list" bar).
 */
export function UndoToast({ message, onUndo, onDone, ms = 8000, top, topInset, bottomInset }: {
  message: ToastMessage | null;
  onUndo?: () => void;
  onDone: () => void;
  ms?: number;
  top?: boolean;
  topInset?: string;
  bottomInset?: string;
}) {
  const t = useT();
  const key = message?.key ?? null;
  const preferred: ToastPlace = top ? "top" : "bottom";

  // A new toast (a new key, or the same key back again) starts afresh: not held, at its preferred place, in the other status line.
  const [seen, setSeen] = useState<{ key: string | null; n: number }>({ key, n: 0 });
  const [heldKey, setHeldKey] = useState<string | null>(null);
  const [flippedKey, setFlippedKey] = useState<string | null>(null);
  if (seen.key !== key) {
    setSeen({ key, n: key === null ? seen.n : seen.n + 1 });
    setHeldKey(null);
    setFlippedKey(null);
  }
  const held = key !== null && heldKey === key;
  const setHeld = (on: boolean) => setHeldKey(on ? key : null);
  const place: ToastPlace = key !== null && flippedKey === key ? otherPlace(preferred) : preferred;

  const pill = useRef<HTMLDivElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  // about the toast on screen: when it appeared, the tap that made it, whether it moved the focus to Undo, whether the focus was in it when it closed
  const shown = useRef<{ at: number; tap: { x: number; y: number } | null; movedFocus: boolean; hadFocus: boolean }>({ at: 0, tap: null, movedFocus: false, hadFocus: false });
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(listen, []);

  // Once per toast, after layout and before it is painted: away from the control just used, and Undo focused if the focused control went away.
  useLayoutEffect(() => {
    if (key === null) return;
    const now = performance.now();
    const lost = focusLost();
    const trigger = triggerBand(lastInput, now, lost ? null : bandOf(document.activeElement));
    shown.current = { at: now, tap: recentTap(lastInput, now), movedFocus: false, hadFocus: false };
    if (placeToast(preferred, trigger, bandOf(pill.current)) !== preferred) setFlippedKey(key); // the pill's place is only known once laid out; this runs before paint
    if (onUndo && undoButton.current && shouldFocusUndo(lost, lastInput, now)) {
      undoButton.current.focus({ preventScroll: true });
      shown.current.movedFocus = true;
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- once per toast: the place and the focus are decided when it appears

  useEffect(() => {
    if (key === null || held) return;
    const timer = setTimeout(() => {
      shown.current.hadFocus = !!pill.current?.contains(document.activeElement);
      done.current();
    }, ms);
    return () => clearTimeout(timer);
  }, [key, held, ms]);

  // Gone: if the focus was on Undo it would fall to the page, so it goes to the page's heading.
  useEffect(() => {
    if (key !== null) return;
    if (shown.current.hadFocus && focusLost()) focusPageHeading();
    shown.current.hadFocus = false;
  }, [key]);

  const pressUndo = (e: MouseEvent<HTMLButtonElement>) => {
    const press = e.detail > 0 ? { x: e.clientX, y: e.clientY } : null; // detail 0: Enter or Space, or a screen reader's activation
    if (undoIsAccident(shown.current.at, performance.now(), press, shown.current.tap, shown.current.movedFocus)) return;
    shown.current.hadFocus = !!pill.current?.contains(document.activeElement);
    setHeldKey(null);
    onUndo?.();
    onDone();
  };

  const slot = seen.n % 2;
  return (
    <>
      <p role="status" className="sr-only">{message && slot === 0 ? message.text : ""}</p>
      <p role="status" className="sr-only">{message && slot === 1 ? message.text : ""}</p>
      {message && (
        <div
          ref={pill}
          aria-hidden={onUndo ? undefined : true}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          style={place === "top" ? { top: topInset ?? "max(0.75rem, env(safe-area-inset-top))" } : { bottom: bottomInset ?? "calc(7rem + env(safe-area-inset-bottom))" }}
          className={`fixed inset-x-4 z-30 mx-auto flex max-w-md items-center justify-between gap-3 bg-foreground py-1.5 ps-5 pe-2 text-background shadow-lg ${place === "top" ? "rounded-[1.75rem]" : "rounded-full"}`}
        >
          {/* keyed by the toast, so a second toast with the same words visibly comes in again */}
          <span key={message.key} aria-hidden="true" className="rise min-w-0 py-2.5 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{message.text}</span>
          {onUndo && (
            <button
              ref={undoButton}
              type="button"
              className="min-h-11 shrink-0 rounded-full px-3.5 text-[0.9375rem] font-bold text-[var(--sun)] transition hover:bg-white/10"
              onFocus={() => setHeld(true)}
              onBlur={() => setHeld(false)}
              onClick={pressUndo}
            >
              {t("Undo")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
