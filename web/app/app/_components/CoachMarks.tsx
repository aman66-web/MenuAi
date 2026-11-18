"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COACH_SCREENS, coachDue, coachScreenFor, coachSeen, type CoachScreen } from "@/lib/mm/coach";
import { coachStore } from "@/lib/mm/stores";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Pip } from "./Mascot";
import { coachStepsFor, type CoachStep } from "./coachSteps";

// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"; lib/mm/coach.ts, coachSteps.ts). The first time a tab opens
// after the welcome screens, the page dims, one real control at a time is lit with a lime ring, and a card with Pip says what it does: "Tip 2 of 5", Next (Done
// on the last), and "Stop the tips". It is a modal <dialog>, so the page behind can't be tapped by mistake, the focus stays on the card and a screen reader reads
// the tip; Escape counts as Done. It waits until the tab has drawn its controls and no other sheet is open (and the iPhone app's trial offer waits for it).

const PAD = 6; // px of page shown round the lit control
const GAP = 12; // px between the lit control and the card
const EDGE = 16; // px the card keeps from the screen's edges
const TAB_BAR = 96; // px the floating tab bar covers at the foot of the screen

type Box = { top: number; left: number; width: number; height: number; vw: number; vh: number };

export function CoachMarks() {
  const pathname = usePathname();
  const state = useStore(coachStore);
  const screen = coachScreenFor(pathname);
  if (!screen || !coachDue(state, screen)) return null;
  return <CoachRun key={screen} screen={screen} />;
}

/** True for an element that is drawn (not hidden and not empty). */
function drawn(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Brings a control into view above the tab bar: a tall one (the shops' grid) with its top near the top, any other in the middle. Fixed ones (the tab bar) stay. */
function bring(el: HTMLElement) {
  if (el.closest("nav") && getComputedStyle(el.closest("nav")!).position === "fixed") return;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = calm ? "auto" : "smooth";
  if (r.height > vh * 0.42) window.scrollBy({ top: r.top - 96, behavior });
  else if (r.top < EDGE + 60 || r.bottom > vh - TAB_BAR - 200) window.scrollBy({ top: r.top + r.height / 2 - (vh - TAB_BAR) / 2 + 60, behavior });
}

function CoachRun({ screen }: { screen: CoachScreen }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [steps, setSteps] = useState<CoachStep[] | null>(null);
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  // the page has stopped moving the control into place (the card and the ring wait for it, so they never jump about mid-scroll)
  const [settled, setSettled] = useState(false);
  const [cardHeight, setCardHeight] = useState(220);

  // Wait for the tab's controls (a list may still be loading) and for any other sheet to close, then start with the tips whose controls are there.
  useEffect(() => {
    const all = coachStepsFor(screen);
    const started = Date.now();
    let timer = 0;
    const look = () => {
      const waited = Date.now() - started;
      const found = all.filter((s) => drawn(document.querySelector(s.at)));
      const busy = !!document.querySelector("dialog[open]");
      if (!busy && found.length > 0 && (found.length === all.length || waited > 3000)) return setSteps(found);
      if (!busy && found.length === 0 && waited > 10000) return; // nothing to point at this time; the tips wait for the next visit
      timer = window.setTimeout(look, 250);
    };
    timer = window.setTimeout(look, 600);
    return () => window.clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    const d = dialog.current;
    if (steps && d && !d.open) d.showModal();
  }, [steps]);

  // Follow the lit control while the page scrolls into place or the screen turns; a control that has gone is skipped.
  useEffect(() => {
    if (!steps) return;
    const el = document.querySelector(steps[at]!.at);
    if (!drawn(el)) {
      if (at < steps.length - 1) setAt(at + 1);
      else finish();
      return;
    }
    setSettled(false);
    bring(el);
    let frame = 0;
    let last = "";
    let still = performance.now();
    const began = still;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const next: Box = { top: r.top, left: r.left, width: r.width, height: r.height, vw: window.innerWidth, vh: window.innerHeight };
      const key = Object.values(next).map(Math.round).join(",");
      const now = performance.now();
      if (key !== last) {
        last = key;
        still = now;
        setBox(next);
      } else if (now - still > 150 || now - began > 1500) setSettled(true);
      frame = requestAnimationFrame(tick);
    };
    tick();
    title.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish only reads the store
  }, [steps, at]);

  useEffect(() => {
    if (card.current) setCardHeight(card.current.offsetHeight);
  }, [box, at]);

  function close() {
    dialog.current?.close();
  }
  function finish() {
    coachStore.set(coachSeen(coachStore.get(), screen));
    close();
  }
  function stopAll() {
    coachStore.set({ armed: false, seen: [...COACH_SCREENS] });
    close();
  }

  const step = steps?.[at];
  const last = !!steps && at === steps.length - 1;

  // The lit hole: the control and a little round it, never past the screen's edges; a tall control shows its top part.
  let hole: { top: number; left: number; width: number; height: number } | null = null;
  let place: React.CSSProperties = { bottom: EDGE + TAB_BAR };
  const inView = !!box && box.top + Math.min(box.height, box.vh * 0.42) > 8 && box.top < box.vh - 8;
  if (box && settled && inView) {
    const top = Math.max(4, box.top - PAD);
    const bottom = Math.min(box.vh - 4, box.top + Math.min(box.height, box.vh * 0.42) + PAD);
    const left = Math.max(4, box.left - PAD);
    const right = Math.min(box.vw - 4, box.left + box.width + PAD);
    hole = { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    const below = box.vh - (bottom + GAP) - EDGE;
    const above = top - GAP - EDGE;
    // the card goes where it fits (below first); if it fits neither side, on the side with more room, scrolling inside itself
    if (below >= cardHeight || (below >= above && above < cardHeight)) {
      const room = Math.max(below, 160);
      place = { top: Math.max(EDGE, Math.min(bottom + GAP, box.vh - EDGE - Math.min(cardHeight, room))), maxHeight: room };
    } else {
      const room = Math.max(above, 160);
      place = { bottom: Math.max(EDGE, Math.min(box.vh - top + GAP, box.vh - EDGE - Math.min(cardHeight, room))), maxHeight: room };
    }
  }
  const showing = settled && inView;

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
          {/* the dimmed page with the lit control's hole (a huge shadow round the hole), and the lime ring */}
          {hole && showing ? (
            <div
              aria-hidden
              className="pointer-events-none fixed rounded-[1.25rem] outline-[3px] outline-[var(--sun)] [outline-style:solid] motion-safe:transition-[top,left,width,height] motion-safe:duration-300"
              style={{ ...hole, boxShadow: "0 0 0 200vmax rgba(17,24,20,0.62)" }}
            />
          ) : (
            <div aria-hidden className="fixed inset-0 bg-[rgba(17,24,20,0.62)]" />
          )}
          <div
            ref={card}
            className={`fixed inset-x-0 mx-auto w-[calc(100%-2rem)] max-w-[24rem] overflow-y-auto rounded-[1.5rem] bg-white p-4 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)] motion-safe:transition-opacity motion-safe:duration-200 ${showing ? "opacity-100" : "opacity-0"}`}
            style={place}
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="shrink-0"><Pip mood={at === 0 ? "wave" : "point"} size={52} /></span>
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="app-numbers text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-muted">{t("Tip {n} of {total}", { n: at + 1, total: steps.length })}</p>
                <h2 ref={title} id="coach-title" tabIndex={-1} className="mt-0.5 text-[1.1875rem] font-[800] leading-snug tracking-[-0.01em] outline-none">{t(step.title)}</h2>
                <p id="coach-text" className="mt-1 text-[1.0625rem] leading-snug">{t(step.text)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (last ? finish() : setAt(at + 1))}
                className="inline-flex min-h-12 min-w-[7rem] flex-1 items-center justify-center rounded-full bg-foreground px-5 text-[1.0625rem] font-bold text-background transition active:scale-[0.98]"
              >
                {last ? t("Done") : t("Next")}
              </button>
              <button type="button" onClick={stopAll} className="inline-flex min-h-12 items-center justify-center rounded-full px-4 text-[0.9375rem] font-semibold text-muted transition hover:bg-soft-strong">
                {t("Stop the tips")}
              </button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
