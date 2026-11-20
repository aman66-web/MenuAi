"use client";

import { useEffect, useRef } from "react";
import { site } from "@/site.config";
import { CheckIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";

// The frame every welcome screen shares: the top bar with the back arrow and the bar on one row (no "Step n of N" written since the seven-screen onboarding of
// 20 November 2026: the bar alone; a screen reader hears it with each headline; no app name over the steps, as in the founder's example screens); the bottom
// bar that stays in place with its one ink button; the choice styles; and the quiet links.

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

/** The plain back arrow: a white circle with the control edge and an ink arrow (founder's examples, 20 November 2026). Its spoken name says what it does. */
function BackCircle({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} aria-label={t("Back to the previous step")} className={`${SECONDARY} -ms-1 grid h-12 w-12 shrink-0 place-items-center rounded-full`}>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-ink rtl:rotate-180">
        <path d="M19 12H5M11 5l-7 7 7 7" />
      </svg>
    </button>
  );
}

/**
 * The top of every welcome screen, like the founder's example screens (20 November 2026): on the steps, the plain back arrow (or the replay's Close) at the
 * start, the progress as segments beside it with no words ("the bar alone"; "Step n of N" is part of each headline for a screen reader instead), and something
 * at the far end (Skip); nothing else. The cover, which has no bar, keeps the app's name and icon.
 */
export function TopBar({ onBack, start, end, segments, current = 0 }: { onBack?: () => void; start?: React.ReactNode; end?: React.ReactNode; segments?: number; current?: number }) {
  const back = start ?? (onBack ? <BackCircle onClick={onBack} /> : null);
  if (segments) {
    return (
      <div className="flex min-h-12 items-center gap-3">
        {back}
        <div aria-hidden className="flex min-w-0 flex-1 gap-1">
          {Array.from({ length: segments }, (_, i) => (<span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none ${i <= current ? "bg-[var(--bar)]" : "bg-[var(--line)]"}`} />))}
        </div>
        {end}
      </div>
    );
  }
  return (
    <div className="flex min-h-12 items-center gap-2.5">
      {back}
      <span className="inline-flex min-w-0 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
        <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
        <span className="truncate text-lg font-[800] tracking-[-0.02em]">{site.name}</span>
      </span>
      <span className="flex-1" />
      {end}
    </div>
  );
}

/** A white pill at the top: a question's Skip, or the replay's Close. */
export function TopButton({ onClick, label, children }: { onClick: () => void; label?: string; children: React.ReactNode }) {
  // a real button, not faint text (usability test 2026-11-19: most testers never saw "Skip"); at the largest text its words wrap rather than run off the side
  return <button type="button" onClick={onClick} aria-label={label} className={`${SECONDARY} -me-1 inline-flex min-h-12 min-w-0 shrink-0 items-center rounded-full px-4 py-1 text-center text-[1rem] font-bold leading-tight`}>{children}</button>;
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
 * A quiet underlined link with a 44 pt tap area, under the bottom button (the cover's "Start again"). Not a second pill. The one link look of the welcome
 * screens: the link green, always underlined.
 */
export const LINK = "text-accent underline decoration-solid underline-offset-[3px]";

export function QuietLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`mx-auto mt-1 flex min-h-11 items-center justify-center px-3 text-center text-[1rem] font-semibold ${LINK} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}>
      {children}
    </button>
  );
}

/** How long after a screen appears a finger's tap on its button is ignored (see BottomButton). */
const SETTLE_MS = 600;
/** When a finger last lifted from a screen's bottom button: the click the phone sends after it is ignored, on that button or on the next screen's in its place. */
let lastFingerTap = -Infinity;

/**
 * The big pill at the bottom of a screen: the ink pill with white words (colour meeting, 19 November 2026: ink means "do this"), or with `light` the secondary look
 * (white, the control edge, ink words). Nothing else inside it: no circles or icons. One that can't be pressed yet is the line grey with the reason written above
 * it (never faded).
 * Every screen's button sits in the same place, so a quick second tap of a double tap would land on the next screen's button and skip that screen unseen
 * (the activity, the targets, the foods to avoid...). A tap or pen press on a button in its first 0.6 s on screen is therefore ignored. A mouse click, the
 * keyboard and a screen reader's activation are never held back (nobody double-clicks past a screen with those, and a screen reader takes longer anyway).
 * `onBlocked`: what a tap on the grey button does instead (About you: bring the Age box into view); it then stays tappable and is marked aria-disabled.
 * A finger acts when it lifts (founder 2026-11-20: "Sometimes when I press the continue button, it doesn't work"): on an iPhone, a tap while a scrolled list is
 * still gliding only stops the glide and no click follows, so the first tap after scrolling the shops did nothing. The button now acts on the finger's lift
 * (a press that moved more than 12 px is a drag, not a tap) and ignores any click in the second after it (the phone's own click for that tap, which could otherwise
 * land on the next screen's button in the same place and skip that screen); the mouse, the keyboard and screen readers still use the click.
 */
export function BottomButton({ children, onClick, onBlocked, disabled, light, describedBy, className = "" }: { children: React.ReactNode; onClick: () => void; onBlocked?: () => void; disabled?: boolean; light?: boolean; describedBy?: string; className?: string }) {
  const blocked = !!disabled && !!onBlocked;
  const shownAt = useRef(0);
  const down = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { shownAt.current = performance.now(); }, []);
  const act = () => (blocked ? onBlocked?.() : onClick());
  return (
    <button
      type="button"
      onPointerDown={(e) => { down.current = e.pointerType === "touch" || e.pointerType === "pen" ? { x: e.clientX, y: e.clientY } : null; }}
      onPointerCancel={() => { down.current = null; }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
        const now = performance.now();
        lastFingerTap = now; // the click that may follow belongs to this tap
        if (now - shownAt.current < SETTLE_MS) return;
        act();
      }}
      onClick={() => {
        if (performance.now() - lastFingerTap < 1000) return;
        act();
      }}
      disabled={disabled && !blocked}
      aria-disabled={blocked || undefined}
      aria-describedby={describedBy}
      className={`${className} flex min-h-14 w-full items-center justify-center rounded-full px-6 py-3 text-center text-[1.0625rem] font-bold leading-snug transition active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${blocked ? "bg-line text-muted" : light ? "border-[1.5px] border-edge bg-card text-foreground hover:bg-background active:bg-background disabled:border-transparent disabled:bg-line disabled:text-muted" : "bg-ink text-on-ink hover:not-disabled:bg-ink-pressed active:bg-ink-pressed disabled:bg-line disabled:text-muted"}`}
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
