"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COACH_KEEP_CLEAR, COACH_STOPPED, coachRoundFor, coachScreenFor, coachSeen, placeTip, type CoachRound, type CoachScreen, type Span } from "@/lib/mm/coach";
import { coachStore } from "@/lib/mm/stores";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Pip } from "./Mascot";
import { coachStepsFor, type CoachStep } from "./coachSteps";

// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"; lib/mm/coach.ts, coachSteps.ts). The first time a tab opens
// after the welcome screens, the page dims a little (--tips-wash: older testers were flustered by the heavy dimming; colour meeting, 19 November 2026), one
// real control at a time is lit with a 3 px ink ring and a 2 px white gap, and a card with Pip says what it does: "Tip 2 of 5", Next (Done on the last), and
// "Stop the tips". It is a modal <dialog>, so the page behind can't be tapped by mistake, the focus stays on the card and a screen reader reads the tip; Escape
// counts as Done. It waits until the tab has drawn its controls, no other sheet is open and Home's arrival toast has gone (anything marked data-coach-wait;
// the iPhone app's trial offer waits for the tips).
// The onboarding redesign meeting (20 November 2026): after the welcome screens Home's tips come over two visits (a later visit is another time Home opens:
// a tab and back, or the app opened again), the card never covers Home's numbers or the Start here card (lib/mm/coach.ts placeTip: it scrolls the page once
// if it must), and in "Moving around" Pip stands on the real tab bar and hops once along it (no hop with Reduce Motion).

const PAD = 6; // px of page shown round the lit control
const GAP = 12; // px between the lit control and the card
const EDGE = 16; // px the card keeps from the screen's edges
const TAB_BAR = 96; // px the floating tab bar covers at the foot of the screen
const HOP_PIP = 40; // Pip's size on the tab bar
const HOP_ROOM = (HOP_PIP * 150) / 140 + 4; // his height standing on the bar, kept clear of the card

/** Where the lit control is; `fixed`: it stays put when the page scrolls (1) or not (0). */
type Box = { top: number; left: number; width: number; height: number; vw: number; vh: number; fixed: number };

export function CoachMarks() {
  const pathname = usePathname();
  const state = useStore(coachStore);
  const screen = coachScreenFor(pathname);
  // each time a page opens is a visit; Home's second round of tips waits for a visit after the one that showed its first
  const [visit, setVisit] = useState({ path: pathname, n: 0 });
  if (visit.path !== pathname) setVisit({ path: pathname, n: visit.n + 1 });
  const [homeShownOn, setHomeShownOn] = useState<number | null>(null);
  const round = coachRoundFor(state, screen);
  if (!screen || !round) return null;
  if (round === "homeLater" && homeShownOn === visit.n) return null;
  return <CoachRun key={round} screen={screen} round={round} onShown={() => { if (round === "home") setHomeShownOn(visit.n); }} />;
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

/** The parts of the page this tab's card must never cover, where they are now. */
function keepClear(screen: CoachScreen): Span[] {
  return (COACH_KEEP_CLEAR[screen] ?? []).flatMap((sel) => {
    const el = document.querySelector(sel);
    if (!drawn(el)) return [];
    const r = el.getBoundingClientRect();
    return [{ top: r.top, bottom: r.bottom }];
  });
}

function CoachRun({ screen, round, onShown }: { screen: CoachScreen; round: CoachRound; onShown: () => void }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);
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

  // Wait for the tab's controls (a list may still be loading), for any other sheet to close and for the arrival toast to go, then start with the tips whose
  // controls are there (a tip whose `unless` is on the page is left out: the Start here card already teaches the +).
  useEffect(() => {
    const all = coachStepsFor(round, coachStore.get());
    const started = Date.now();
    let timer = 0;
    const look = () => {
      const waited = Date.now() - started;
      const found = all.filter((s) => drawn(document.querySelector(s.at)) && !(s.unless && drawn(document.querySelector(s.unless))));
      const busy = !!document.querySelector("dialog[open], [data-coach-wait]");
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
      const kept = keepClear(screen);
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
    // the card's whole height, even while it scrolls inside itself
    if (card.current) setCardHeight(card.current.scrollHeight);
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
    plan = placeTip({ hole: holeSpan, clear, card: cardHeight, vh: box.vh, fixed: box.fixed === 1, scrolled: scrolledFor === at, edge: EDGE, gap: GAP });
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

  // once the first tip shows, this round counts as shown on this visit (Home's second round waits for another visit)
  useEffect(() => {
    if (showing && at === 0) onShown();
  }, [showing, at]); // eslint-disable-line react-hooks/exhaustive-deps -- once

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
          {/* the lightly dimmed page with the lit control's hole (a huge shadow round the hole), a 2 px white gap and the 3 px ink ring outside it */}
          {hole && showing ? (
            <div
              aria-hidden
              className="pointer-events-none fixed rounded-[1.25rem] outline-[3px] outline-offset-2 outline-ink [outline-style:solid] motion-safe:transition-[top,left,width,height] motion-safe:duration-300"
              style={{ ...hole, boxShadow: "0 0 0 2px var(--card), 0 0 0 200vmax var(--tips-wash)" }}
            />
          ) : (
            <div aria-hidden className="fixed inset-0 bg-[var(--tips-wash)]" />
          )}
          {/* Pip on the real tab bar, bare (never on the ink itself): he stands on its top edge over the first tab and hops once to the last */}
          {hopping && hole && (
            <span ref={hopper} aria-hidden data-coach-hop="" className="pointer-events-none fixed" style={{ left: rtlPage() ? hole.left + hole.width - 20 - HOP_PIP : hole.left + 20, top: hole.top - HOP_ROOM + 2 }}>
              <Pip mood="point" size={HOP_PIP} />
            </span>
          )}
          <div
            ref={card}
            className={`fixed inset-x-0 mx-auto w-[calc(100%-2rem)] max-w-[24rem] overflow-y-auto rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-lift)] motion-safe:transition-opacity motion-safe:duration-200 ${showing ? "opacity-100" : "opacity-0"}`}
            style={place}
          >
            <div className="flex items-start gap-3">
              {/* in "Moving around" Pip is on the tab bar instead */}
              {!step.hop && <span aria-hidden data-mood={mood} className="shrink-0"><Pip mood={mood} size={56} /></span>}
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {/* sentence case, like every label (the onboarding redesign meeting: no spaced capitals) */}
                <p className="app-numbers text-[0.875rem] font-bold text-muted">{t("Tip {n} of {total}", { n: at + 1, total: steps.length })}</p>
                <h2 ref={title} id="coach-title" tabIndex={-1} className="mt-0.5 text-[1.1875rem] font-[800] leading-snug tracking-[-0.01em] outline-none">{t(step.title)}</h2>
                <p id="coach-text" className="mt-1 text-[1.0625rem] leading-snug">{t(step.text)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (last ? finish() : setAt(at + 1))}
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
