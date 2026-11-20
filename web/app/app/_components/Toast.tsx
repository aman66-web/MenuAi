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
 */
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
  const ms = duration === null ? null : Math.max(TOAST_MIN_MS, duration);
  useEffect(() => {
    if (ms === null || held) return;
    const id = window.setTimeout(() => close.current(), ms);
    return () => window.clearTimeout(id);
  }, [ms, held]);

  return (
    <div
      role="status"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
      className={`on-ink fixed inset-x-4 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-[1.75rem] border border-on-ink-2 bg-ink py-1.5 ps-4 pe-2 text-on-ink shadow-[var(--shadow-lift)] ${place === "top" ? "top-[max(0.75rem,env(safe-area-inset-top))]" : "bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))_+_5.5rem)]"} ${className ?? ""}`}
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
