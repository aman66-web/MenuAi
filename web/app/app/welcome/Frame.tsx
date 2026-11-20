"use client";

import { useEffect, useRef } from "react";
import { site } from "@/site.config";
import { CheckIcon, ChevronLeftIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";

// The frame every welcome screen shares (moved out of page.tsx when the screens were rebuilt for the onboarding redesign meeting of 20 November 2026): the top
// bar with Back, the app's name, the bar and "Step n of N"; the bottom bar that stays in place with its one ink button; the choice styles; and the quiet links.

export const SCREEN = "flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col";
// The colour meeting (19 November 2026, approved by the founder that day): lime means only "chosen" here. A chosen answer is lime with a 2 px dark green edge, a
// tick and bold dark green words; an unchosen one is white with the 1.5 px control edge and an empty tick ring in the same place, so a choice never looks like a
// button and the words never jump when it is ticked (the half pixel of edge it lacks is padding, so nothing moves).
export const CHOICE = "flex w-full items-center gap-3.5 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const CHOSEN = "border-2 border-on-sun bg-sun px-4 py-3 text-on-sun";
export const UNCHOSEN = "border-[1.5px] border-edge bg-card px-[16.5px] py-[12.5px] text-foreground hover:bg-background active:bg-background";
// A secondary control (Back, Skip, Close): white with the 1.5 px control edge and ink words, the page fill when pressed.
export const SECONDARY = "border-[1.5px] border-edge bg-card text-foreground transition active:scale-[0.97] active:bg-background hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
// Every headline takes the focus when its screen appears (so a screen reader starts there); the app's no-focus-box rule (17 Nov) keeps it unboxed.
export const H1 = "outline-none";
// The line beside a grey Continue that says why it is grey (one screen at a time, so one id), linked to the button with aria-describedby.
export const WHY_GREY = "welcome-why-grey";
export const WHY_GREY_LINE = "mb-2 text-center text-[0.9375rem] font-semibold leading-snug";

/**
 * The app's name (with its icon) at the top of every screen, Back (or the replay's Close) at the start, something at the far end (a question's Skip), then the
 * progress as segments and "Step n of N" (sentence case, semibold, 15 px: the meeting's counter). The counter is part of the headline for a screen reader
 * (page.tsx reads it with each h1), so it is not read out again here.
 */
export function TopBar({ onBack, start, end, segments, current = 0, status }: { onBack?: () => void; start?: React.ReactNode; end?: React.ReactNode; segments?: number; current?: number; status?: string }) {
  const t = useT();
  return (
    <div>
      <div className="flex min-h-11 items-center gap-2.5">
        {start}
        {!start && onBack && (
          // Back always shows its word (colour meeting, 19 November 2026): a white pill with the control edge, an ink chevron and "Back"; its spoken name starts
          // with the same word
          <button type="button" onClick={onBack} aria-label={t("Back to the previous step")} className={`${SECONDARY} -ms-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full pe-3.5 ps-2 text-base font-semibold`}>
            <ChevronLeftIcon aria-hidden className="h-5 w-5 text-ink rtl:rotate-180" />{t("Back")}
          </button>
        )}
        <span className="inline-flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
          <span className="truncate text-lg font-[800] tracking-[-0.02em]">{site.name}</span>
        </span>
        <span className="flex-1" />
        {end}
      </div>
      {segments ? (
        <div aria-hidden className="mt-4 flex gap-1">
          {Array.from({ length: segments }, (_, i) => (<span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none ${i <= current ? "bg-[var(--bar)]" : "bg-[var(--line)]"}`} />))}
        </div>
      ) : null}
      {status && <p aria-hidden className="app-numbers mt-2.5 text-[0.9375rem] font-semibold text-muted">{status}</p>}
    </div>
  );
}

/** A white pill at the top: a question's Skip, or the replay's Close. */
export function TopButton({ onClick, label, children }: { onClick: () => void; label?: string; children: React.ReactNode }) {
  // a real button, not faint text (usability test 2026-11-19: most testers never saw "Skip"); at the largest text its words wrap rather than run off the side
  return <button type="button" onClick={onClick} aria-label={label} className={`${SECONDARY} -me-1 inline-flex min-h-11 min-w-0 items-center rounded-full px-4 py-1 text-center text-[1rem] font-bold leading-tight`}>{children}</button>;
}

/** The tick's place at the end of a choice: an empty ring in the control edge, or, chosen, a dark green disc with a lime tick (at least 16 px, 2 px or more). */
export function TickSlot({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${on ? "bg-on-sun text-sun" : "border-[1.5px] border-edge"}`}>
      {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
    </span>
  );
}

/**
 * The bar that stays at the bottom of the screen (so the next step is never below the fold on small or notched phones). Solid behind its words and buttons, with
 * a 1.5rem fade at its top only (its top padding), so nothing on the page shows through behind a reason line or the button (usability test 2026-11-19: all 16
 * read the reason line printed over the privacy line as broken).
 */
export function Bottom({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${className} sticky bottom-0 z-10 -mx-5 mt-auto w-[calc(100%+2.5rem)] bg-[linear-gradient(to_top,var(--color-background)_calc(100%-1.5rem),transparent)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6`}>{children}</div>;
}

/**
 * A quiet underlined line of text in the page's ink with a 44 pt tap area, under the bottom button: "Skip these questions" on the questions about the person,
 * step 3's "Skip setup and make my account", the cover's "Start again". Not a second pill (a white pill under a grey Continue would be the most tappable thing
 * on the screen).
 */
export function QuietLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mx-auto mt-1 flex min-h-11 items-center justify-center px-3 text-center text-[1rem] font-semibold text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {children}
    </button>
  );
}

/** How long after a screen appears a finger's tap on its button is ignored (see BottomButton). */
const SETTLE_MS = 600;

/**
 * The big pill at the bottom of a screen: the ink pill with white words (colour meeting, 19 November 2026: ink means "do this"), or with `light` the secondary look
 * (white, the control edge, ink words). Nothing else inside it: no circles or icons. One that can't be pressed yet is the line grey with the reason written above
 * it (never faded).
 * Every screen's button sits in the same place, so a quick second tap of a double tap would land on the next screen's button and skip that screen unseen
 * (the activity, the targets, the foods to avoid...). A tap or pen press on a button in its first 0.6 s on screen is therefore ignored. A mouse click, the
 * keyboard and a screen reader's activation are never held back (nobody double-clicks past a screen with those, and a screen reader takes longer anyway).
 */
export function BottomButton({ children, onClick, disabled, light, describedBy, className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; light?: boolean; describedBy?: string; className?: string }) {
  const shownAt = useRef(0);
  const pointer = useRef("");
  useEffect(() => { shownAt.current = performance.now(); }, []);
  return (
    <button
      type="button"
      onPointerDown={(e) => { pointer.current = e.pointerType; }}
      onClick={() => {
        const finger = pointer.current === "touch" || pointer.current === "pen";
        pointer.current = "";
        if (finger && performance.now() - shownAt.current < SETTLE_MS) return;
        onClick();
      }}
      disabled={disabled}
      aria-describedby={describedBy}
      className={`${className} flex min-h-14 w-full items-center justify-center rounded-full px-6 py-3 text-center text-[1.0625rem] font-bold leading-snug transition active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${light ? "border-[1.5px] border-edge bg-card text-foreground hover:bg-background active:bg-background disabled:border-transparent disabled:bg-line disabled:text-muted" : "bg-ink text-on-ink hover:not-disabled:bg-ink-pressed active:bg-ink-pressed disabled:bg-line disabled:text-muted"}`}
    >
      <span className="min-w-0 text-balance">{children}</span>
    </button>
  );
}

/** Whether the person has asked for less motion (read when called; false on the server). */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fades an element in over `ms` (the windows: 200 ms; a chip's new dishes: 180 ms). Nothing under Reduce Motion, or where the browser can't animate. */
export function fadeIn(el: HTMLElement | null, ms: number): void {
  if (!el || reducedMotion() || typeof el.animate !== "function") return;
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: "ease-out" });
}
