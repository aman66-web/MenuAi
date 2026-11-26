"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COACH_KEEP_CLEAR, COACH_STOPPED, coachRoundFor, coachScreenFor, coachSeen, placeTip, TIP_CARD_MIN, type CoachRound, type CoachScreen, type Span } from "@/lib/mm/coach";
import { coachStore } from "@/lib/mm/stores";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Pip } from "./Mascot";
import { coachStepsFor, type CoachStep } from "./coachSteps";

// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"; lib/mm/coach.ts, coachSteps.ts). Only after Settings › Help ›
// "Show me the buttons on each screen" (since 26 November 2026 they never start by themselves), the first time each tab opens the page dims a little (--tips-wash: older testers were flustered by the heavy dimming; colour meeting, 19 November 2026), one
// real control at a time is lit with a 3 px ink ring and a 2 px white gap, and a card with Pip says what it does: "Tip 2 of 5", Next (Done on the last), and
// "Stop the tips". It is a modal <dialog>, so the page behind can't be tapped by mistake, the focus stays on the card and a screen reader reads the tip; Escape
// counts as Done. It waits until the tab has drawn its controls, no other sheet is open and Home's arrival toast has gone (anything marked data-coach-wait;
// the iPhone app's trial offer waits for the tips), and no toast is showing (data-toast-host: opened over one, its Undo couldn't be tapped and the one-time
// free-week note went unread behind the tips; Quinn and Ella, the 30-person meeting, 21 November 2026). Every toast closes itself, so the tips start after it.
// The onboarding redesign meeting (20 November 2026): the card keeps clear of Home's numbers and the Start here card wherever it fits whole (lib/mm/coach.ts placeTip: it
// scrolls the page once if it must, never past the lit control's top), and in "Moving around" Pip stands on the real tab bar and hops once along it (no hop
// with Reduce Motion). The 30-person audit (20 November 2026): the card is never shorter than TIP_CARD_MIN, its tip scrolls inside it while Next and "Stop the
// tips" stay whole under it, so it can never become a modal with no way out on a small phone.

const PAD = 6; // px of page shown round the lit control
const GAP = 12; // px between the lit control and the card
const EDGE = 16; // px the card keeps from the screen's edges, at the least (more under the status bar and over the home indicator: safeInsets)
const TAB_BAR = 96; // px the floating tab bar covers at the foot of the screen
const HOP_PIP = 40; // Pip's size on the tab bar
const HOP_ROOM = (HOP_PIP * 150) / 140 + 4; // his height standing on the bar, kept clear of the card

/**
 * The status bar's and the home indicator's heights (env(safe-area-inset-top/bottom)), read once from a hidden probe: the card's 16 px from the screen's
 * edges put it under them on a phone with a notch (Quinn, 21 November 2026). Nothing (0) where there is no such inset.
 */
function safeInsets(): { top: number; bottom: number } {
  if (typeof document === "undefined" || !document.body) return { top: 0, bottom: 0 };
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const out = { top: parseFloat(s.paddingTop) || 0, bottom: parseFloat(s.paddingBottom) || 0 };
  probe.remove();
  return out;
}

/** Where the lit control is; `fixed`: it stays put when the page scrolls (1) or not (0). */
type Box = { top: number; left: number; width: number; height: number; vw: number; vh: number; fixed: number };

export function CoachMarks() {
  const pathname = usePathname();
  const state = useStore(coachStore);
  const screen = coachScreenFor(pathname);
  const round = coachRoundFor(state, screen);
  if (!screen || !round) return null;
  return <CoachRun key={round} screen={screen} round={round} />;
}

/** True for an element that is drawn (not hidden and not empty). */
function drawn(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** True when the control stays put as the page scrolls (the floating tab bar). */
const isFixed = (el: HTMLElement): boolean => !!el.closest("nav") && getComputedStyle(el.closest("nav")!).position === "fixed";

/**
 * Brings a control into view above the tab bar: a tall one (the shops' grid) with its top near the top, any other in the middle. Fixed ones (the tab bar)
 * stay. On a tab with parts to keep clear (Home), a control already wholly in view stays put: placeTip finds the card its room, scrolling only if it must.
 */
function bring(el: HTMLElement, screen: CoachScreen) {
  if (isFixed(el)) return;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (COACH_KEEP_CLEAR[screen] && r.top >= EDGE && r.bottom <= vh - TAB_BAR) return;
  const behavior: ScrollBehavior = calm() ? "auto" : "smooth";
  if (r.height > vh * 0.42) window.scrollBy({ top: r.top - 96, behavior });
  else if (r.top < EDGE + 60 || r.bottom > vh - TAB_BAR - 200) window.scrollBy({ top: r.top + r.height / 2 - (vh - TAB_BAR) / 2 + 60, behavior });
}

/** A right-to-left language (Urdu, Arabic): Pip starts at the right. */
const rtlPage = () => typeof document !== "undefined" && document.documentElement.dir === "rtl";

/** Whether the person asked for less motion. */
const calm = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** The parts of the page this tab's card should keep clear of, where they are now: never the lit control itself, nor anything inside it or round it. */
function keepClear(screen: CoachScreen, lit: Element): Span[] {
  return (COACH_KEEP_CLEAR[screen] ?? []).flatMap((sel) => {
    const el = document.querySelector(sel);
    if (!drawn(el) || el === lit || el.contains(lit) || lit.contains(el)) return [];
    const r = el.getBoundingClientRect();
    return [{ top: r.top, bottom: r.bottom }];
  });
}

function CoachRun({ screen, round }: { screen: CoachScreen; round: CoachRound }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const hopper = useRef<HTMLSpanElement>(null);
  const [steps, setSteps] = useState<CoachStep[] | null>(null);
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  // the page has stopped moving the control into place (the card and the ring wait for it, so they never jump about mid-scroll)
  const [settled, setSettled] = useState(false);
  const [cardHeight, setCardHeight] = useState(220);
  // what must stay clear of the card, measured with the box; and whether this tip has already scrolled the page to make room
  const [clear, setClear] = useState<Span[]>([]);
  const [scrolledFor, setScrolledFor] = useState(-1);
  // measured once per round (CoachRun is only ever drawn in the browser: the tips are never due on the server)
  const [insets] = useState(safeInsets);

  // Wait for the tab's controls (a list may still be loading), for any other sheet to close and for the arrival toast to go, then start with the tips whose
  // controls are there (a tip whose `unless` is on the page is left out: the Start here card already teaches the +).
  useEffect(() => {
    const all = coachStepsFor(round);
    const started = Date.now();
    let timer = 0;
    const look = () => {
      const waited = Date.now() - started;
      const found = all.filter((s) => drawn(document.querySelector(s.at)) && !(s.unless && drawn(document.querySelector(s.unless))));
      const busy = !!document.querySelector("dialog[open], [data-coach-wait], [data-toast-host]");
      if (!busy && found.length > 0 && (found.length === all.length || waited > 3000)) return setSteps(found);
      if (!busy && found.length === 0 && waited > 10000) return; // nothing to point at this time; the tips wait for the next visit
      timer = window.setTimeout(look, 250);
    };
    timer = window.setTimeout(look, 600);
    return () => window.clearTimeout(timer);
  }, [round]);

  useEffect(() => {
    const d = dialog.current;
    if (steps && d && !d.open) d.showModal();
  }, [steps]);

  // Follow the lit control while the page scrolls into place or the screen turns; a control that has gone is skipped.
  useEffect(() => {
    if (!steps) return;
    const el = document.querySelector(steps[at]!.at);
    if (!drawn(el)) {
      if (at < steps.length - 1) setAt(at + 1); // eslint-disable-line react-hooks/set-state-in-effect -- a control that has gone from the page is skipped
      else finish();
      return;
    }
    setSettled(false);
    bring(el, screen);
    let frame = 0;
    let last = "";
    let still = performance.now();
    const began = still;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const next: Box = { top: r.top, left: r.left, width: r.width, height: r.height, vw: window.innerWidth, vh: window.innerHeight, fixed: isFixed(el) ? 1 : 0 };
      const kept = keepClear(screen, el);
      const key = [...Object.values(next), ...kept.flatMap((s) => [s.top, s.bottom])].map(Math.round).join(",");
      const now = performance.now();
      if (key !== last) {
        last = key;
        still = now;
        setBox(next);
        setClear(kept);
      } else if (now - still > 150 || now - began > 1500) setSettled(true);
      frame = requestAnimationFrame(tick);
    };
    tick();
    title.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish only reads the store
  }, [steps, at]);

  useEffect(() => {
    // the card's whole height, even while its tip scrolls inside it: the card as drawn, plus whatever of the tip is scrolled out of sight
    const c = card.current;
    const b = body.current;
    if (c && b) setCardHeight(c.offsetHeight + b.scrollHeight - b.clientHeight);
  }, [box, at]);

  const step = steps?.[at];
  const last = !!steps && at === steps.length - 1;

  // The lit hole: the control and a little round it, never past the screen's edges; a tall control shows its top part.
  let hole: { top: number; left: number; width: number; height: number } | null = null;
  let plan: ReturnType<typeof placeTip> | null = null;
  const inView = !!box && box.top + Math.min(box.height, box.vh * 0.42) > 8 && box.top < box.vh - 8;
  if (box && step && settled && inView) {
    const top = Math.max(4, box.top - PAD);
    const bottom = Math.min(box.vh - 4, box.top + Math.min(box.height, box.vh * 0.42) + PAD);
    const left = Math.max(4, box.left - PAD);
    const right = Math.min(box.vw - 4, box.left + box.width + PAD);
    hole = { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    // Pip stands on the tab bar in "Moving around": the card keeps clear of him too
    const holeSpan = { top: step.hop ? top - HOP_ROOM : top, bottom };
    plan = placeTip({ hole: holeSpan, clear, card: cardHeight, vh: box.vh, fixed: box.fixed === 1, scrolled: scrolledFor === at, edgeTop: Math.max(EDGE, insets.top), edgeBottom: Math.max(EDGE, insets.bottom), gap: GAP });
  }
  const scrollNeeded = plan && "scroll" in plan ? plan.scroll : 0;

  // the card needs room the page doesn't give where it is: scroll once (at once, while the card is hidden) and place it again
  useEffect(() => {
    if (!scrollNeeded) return;
    setScrolledFor(at); // eslint-disable-line react-hooks/set-state-in-effect -- once per tip
    setSettled(false);
    window.scrollBy({ top: scrollNeeded, behavior: "auto" });
  }, [scrollNeeded, at]);

  const placed = plan && !("scroll" in plan) ? plan : null;
  const showing = !!placed && !!hole;
  const place: React.CSSProperties = placed ? { top: placed.top, maxHeight: placed.maxHeight } : { bottom: EDGE + TAB_BAR };

  // Pip's single hop along the tab bar: from the first tab to the last, once; nothing moves with Reduce Motion
  const hopping = !!step?.hop && showing && !!hole;
  useEffect(() => {
    const el = hopper.current;
    if (!hopping || !el || !hole || calm() || typeof el.animate !== "function") return;
    const dx = Math.max(0, hole.width - HOP_PIP - 40) * (rtlPage() ? -1 : 1);
    el.animate(
      [{ transform: "translate(0, 0)" }, { transform: `translate(${dx / 2}px, -34px)`, offset: 0.5 }, { transform: `translate(${dx}px, 0) scale(1.06, 0.92)`, offset: 0.88 }, { transform: `translate(${dx}px, 0)` }],
      { duration: 1000, delay: 250, easing: "ease-in-out", fill: "forwards" },
    );
  }, [hopping]); // eslint-disable-line react-hooks/exhaustive-deps -- once per showing

  function close() {
    dialog.current?.close();
  }
  function finish() {
    coachStore.set(coachSeen(coachStore.get(), round));
    close();
  }
  function stopAll() {
    coachStore.set(COACH_STOPPED);
    close();
  }

  // Pip waves on the first tip, then points at the lit control: up when the card sits below it, down when the card sits above it
  const mood = at === 0 ? "wave" : placed && !placed.below ? "point" : "pointUp";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="coach-title"
      aria-describedby="coach-text"
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-foreground backdrop:bg-transparent"
    >
      {steps && step && (
        <>
          {/* the lightly dimmed page with the lit control's hole (a huge shadow round the hole), a 2 px white gap and the 3 px ink ring outside it. The ring and
              the plain wash shown while the page settles are two different elements (their keys): sharing one, the ring slid in from the top of the screen and
              shrank from full-screen size on every tip (founder 2026-11-21: "it keeps glitching out"). */}
          {hole && showing ? (
            <div
              key="ring"
              aria-hidden
              className="pointer-events-none fixed rounded-[1.25rem] outline-[3px] outline-offset-2 outline-ink [outline-style:solid] motion-safe:transition-[top,left,width,height] motion-safe:duration-300"
              style={{ ...hole, boxShadow: "0 0 0 2px var(--card), 0 0 0 200vmax var(--tips-wash)" }}
            />
          ) : (
            <div key="wash" aria-hidden className="fixed inset-0 bg-[var(--tips-wash)]" />
          )}
          {/* Pip on the real tab bar, bare (never on the ink itself): he stands on its top edge over the first tab and hops once to the last */}
          {hopping && hole && (
            <span ref={hopper} aria-hidden data-coach-hop="" className="pointer-events-none fixed" style={{ left: rtlPage() ? hole.left + hole.width - 20 - HOP_PIP : hole.left + 20, top: hole.top - HOP_ROOM + 2 }}>
              <Pip mood="point" size={HOP_PIP} />
            </span>
          )}
          {/* a column: the tip (it scrolls inside the card if it must), then Next and "Stop the tips", always whole; never shorter than TIP_CARD_MIN. It fades in
              where it goes and hides at once (a fade out showed it jumping to the foot of the screen), and while hidden it takes no taps (Quinn, 21 November 2026) */}
          <div
            ref={card}
            className={`fixed inset-x-0 mx-auto flex w-[calc(100%-2rem)] max-w-[24rem] flex-col overflow-hidden rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-lift)] ${showing ? "opacity-100 motion-safe:transition-opacity motion-safe:duration-200" : "pointer-events-none opacity-0"}`}
            style={{ ...place, minHeight: TIP_CARD_MIN }}
          >
            <div ref={body} className="flex min-h-0 flex-1 items-start gap-3 overflow-y-auto overscroll-contain">
              {/* in "Moving around" Pip is on the tab bar instead */}
              {!step.hop && <span aria-hidden data-mood={mood} className="shrink-0"><Pip mood={mood} size={56} /></span>}
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {/* sentence case, like every label (the onboarding redesign meeting: no spaced capitals) */}
                <p className="app-numbers text-[0.875rem] font-bold text-muted">{t("Tip {n} of {total}", { n: at + 1, total: steps.length })}</p>
                <h2 ref={title} id="coach-title" tabIndex={-1} className="mt-0.5 text-[1.1875rem] font-[800] leading-snug tracking-[-0.01em] outline-none">{t(step.title)}</h2>
                <p id="coach-text" className="mt-1 text-[1.0625rem] leading-snug">{t(step.text)}</p>
              </div>
            </div>
            <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (last) finish();
                  // hidden in the same moment as the tip changes, so the card never shows the next tip where the last one was
                  else { setSettled(false); setAt(at + 1); }
                }}
                className="inline-flex min-h-12 min-w-[7rem] flex-1 items-center justify-center rounded-full bg-ink px-5 text-[1.0625rem] font-bold text-on-ink transition hover:bg-ink-pressed active:scale-[0.98] active:bg-ink-pressed"
              >
                {last ? t("Done") : t("Next")}
              </button>
              <button type="button" onClick={stopAll} className="inline-flex min-h-12 items-center justify-center rounded-full border-[1.5px] border-edge bg-card px-5 text-[1rem] font-bold text-foreground transition hover:bg-background active:scale-[0.98] active:bg-background">
                {t("Stop the tips")}
              </button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
