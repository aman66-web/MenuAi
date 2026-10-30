"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../_lib/i18n";

/** What a toast says, with its own key so the same words shown twice still start a fresh timer. */
export interface ToastMessage {
  key: string;
  text: string;
}

/**
 * The dark pill that offers Undo for a few seconds ("Deleted “…”.", "Added “…” to Lunch.", "Shopping list cleared.").
 * A screen reader hears it through a status line that is always on the page (a status region mounted together with its words is
 * often not read); the visible pill is hidden from it so nothing is read twice. The timer stops while the pointer is over the pill
 * or the Undo button has the keyboard focus, so a keyboard or switch user can reach Undo in time, and starts again when they leave.
 * `top` puts it under the status bar, clear of rows with + buttons; otherwise it sits above the floating tab bar.
 */
export function UndoToast({ message, onUndo, onDone, ms = 8000, top }: { message: ToastMessage | null; onUndo?: () => void; onDone: () => void; ms?: number; top?: boolean }) {
  const t = useT();
  const key = message?.key ?? null;
  // Held only for the toast that was being pointed at or focused, so a new toast always starts its own timer.
  const [heldKey, setHeldKey] = useState<string | null>(null);
  const held = key !== null && heldKey === key;
  const setHeld = (on: boolean) => setHeldKey(on ? key : null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    if (key === null || held) return;
    const timer = setTimeout(() => done.current(), ms);
    return () => clearTimeout(timer);
  }, [key, held, ms]);

  return (
    <>
      <p role="status" className="sr-only">{message?.text ?? ""}</p>
      {message && (
        <div
          aria-hidden={onUndo ? undefined : true}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          className={`fixed inset-x-4 z-30 mx-auto flex max-w-md items-center justify-between gap-3 bg-foreground py-1.5 ps-5 pe-2 text-background shadow-lg ${top ? "top-[max(0.75rem,env(safe-area-inset-top))] rounded-[1.75rem]" : "bottom-[calc(7rem+env(safe-area-inset-bottom))] rounded-full"}`}
        >
          <span aria-hidden="true" className="min-w-0 py-2.5 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{message.text}</span>
          {onUndo && (
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-full px-3.5 text-[0.9375rem] font-bold text-[var(--sun)] transition hover:bg-white/10"
              onFocus={() => setHeld(true)}
              onBlur={() => setHeld(false)}
              onClick={() => { onUndo(); onDone(); }}
            >
              {t("Undo")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
