"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { coachDue } from "@/lib/mm/coach";
import { hintShows, withHintShown } from "@/lib/mm/homePages";
import { tk } from "@/lib/mm/i18n";
import { coachStore, homePagesStore } from "@/lib/mm/stores";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { ChevronRightIcon } from "./icons";
import { PAIR_STACK_REM } from "./HomeToday";

// Home's numbers as three pages you slide sideways, with three dots under them (founder 2026-11-19: "I also want like 3 dots here showing that they can also
// swipe right to see different things like stats"; the 20-person meeting's conclusion the same day): Today (the two dark cards, as before), Calories and protein
// this week, and Today: sugar, salt and fibre.
// - Only the browser's own scrolling: CSS scroll snap, one page per swipe (snap-stop), no touch handlers, no library. WebKit keeps a vertical drag for the page.
// - The dots are real buttons (44 pt each, touching), so nobody has to swipe; the one shown is a dark pill. Home always opens on Today; nothing is remembered.
// - A first-time hint under the dots ("Slide the cards sideways, or tap here, to see your week") until page 2 or 3 is seen, on at most five days, and one slow
//   demonstration slide once per device (never while Pip's tips are due, never with reduced motion). On this device only (homePagesStore).
// - When the cards stack (a narrow phone or large text: the content is under PAIR's 20.375rem), the pages show one under another with no dots, hint or slide:
//   nothing sits behind a swipe for the people who most need big text.
// - VoiceOver reads the three pages in order ("Today, 1 of 3"...); none is ever hidden.

export interface HomePage {
  /** The page's name, for its dot and for a screen reader ("Calories and protein this week"). */
  name: string;
  node: ReactNode;
}

const GAP = 40; // two 20 px gutters: at rest, nothing of the next page shows
const SLIDE_PX = 80;

/** Whether the person asked for less motion. */
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function HomePages({ pages, now }: { pages: HomePage[]; now: Date }) {
  const t = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [column, setColumn] = useState(false);
  const [current, setCurrent] = useState(0);
  const state = useStore(homePagesStore);
  // decided once for this visit, so the hint doesn't vanish mid-visit when page 2 is seen (it goes on the next visit), unless the hint itself is tapped
  const [hint, setHint] = useState(() => hintShows(homePagesStore.get(), now));

  // column mode: the content is narrower than the two cards side by side need (the same threshold as PAIR's stacking)
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setColumn(el.clientWidth < PAIR_STACK_REM * rem - 0.5);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the hint counts as shown on this day (at most five days, lib/mm/homePages.ts)
  useEffect(() => {
    if (hint && !column) homePagesStore.set(withHintShown(homePagesStore.get(), now));
  }, [hint, column]); // eslint-disable-line react-hooks/exhaustive-deps -- once per visit

  const step = useCallback(() => {
    const items = track.current?.children;
    if (!items || items.length < 2) return 1;
    return Math.abs((items[1] as HTMLElement).offsetLeft - (items[0] as HTMLElement).offsetLeft) || 1;
  }, []);

  const markSeen = useCallback(() => {
    const s = homePagesStore.get();
    if (!s.seen) homePagesStore.set({ ...s, seen: true });
  }, []);

  // which page is showing follows the scroll (one check a frame); |scrollLeft| also works right to left, where it is negative
  useEffect(() => {
    const el = scroller.current;
    if (!el || column) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const page = Math.max(0, Math.min(pages.length - 1, Math.round(Math.abs(el.scrollLeft) / step())));
        setCurrent(page);
        if (page > 0) markSeen();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [column, pages.length, step, markSeen]);

  const go = useCallback((page: number) => {
    const el = scroller.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollTo({ left: page * step() * (rtl ? -1 : 1), behavior: reducedMotion() ? "auto" : "smooth" });
    setCurrent(page);
    if (page > 0) markSeen();
  }, [step, markSeen]);

  // the one demonstration slide: about a second after Home shows, the cards move a little towards page 2 and back. Once per device, only with the hint on
  // screen, never while Pip's tips for Home are due (they would cover it), never with reduced motion or when the pages are stacked.
  useEffect(() => {
    if (column || !hint || state.slid || reducedMotion() || coachDue(coachStore.get(), "home")) return;
    const el = track.current;
    if (!el || typeof el.animate !== "function") return;
    const timer = setTimeout(() => {
      homePagesStore.set({ ...homePagesStore.get(), slid: true });
      const rtl = getComputedStyle(el).direction === "rtl";
      const x = `${rtl ? SLIDE_PX : -SLIDE_PX}px`;
      el.animate([{ transform: "translateX(0)" }, { transform: `translateX(${x})`, offset: 0.45 }, { transform: `translateX(${x})`, offset: 0.6 }, { transform: "translateX(0)" }], { duration: 1300, easing: "ease-in-out" });
    }, 1000);
    return () => clearTimeout(timer);
  }, [column, hint]); // eslint-disable-line react-hooks/exhaustive-deps -- decided once per visit

  if (column) {
    return (
      <div ref={wrap} data-coach="home-numbers" className="@container mt-6 space-y-3.5">
        {pages.map((p, i) => (
          <section key={i} role="group" aria-label={t("{name}, {n} of {total}", { name: p.name, n: i + 1, total: pages.length })}>{p.node}</section>
        ))}
      </div>
    );
  }

  return (
    // a container, so each page is exactly the content's width (100cqw), whatever the strip's own width
    <div ref={wrap} data-coach="home-numbers" className="@container mt-6">
      {/* the strip runs edge to edge (like the Recipes row), so a card slides out at the screen's edge; the bottom padding keeps the cards' whole shadow; `relative`
          so the pages' screen-reader text is clipped with them (else it would widen the whole page) */}
      <div
        ref={scroller}
        role="region"
        aria-label={t("Your numbers")}
        tabIndex={0}
        className="no-scrollbar relative -mx-5 -mb-12 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain pb-12 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ scrollPaddingInline: 20 }}
      >
        <div ref={track} className="flex w-max items-stretch px-5" style={{ gap: GAP }}>
          {pages.map((p, i) => (
            <section
              key={i}
              role="group"
              aria-label={t("{name}, {n} of {total}", { name: p.name, n: i + 1, total: pages.length })}
              className="w-[100cqw] shrink-0 snap-start [scroll-snap-stop:always]"
            >
              {p.node}
            </section>
          ))}
        </div>
      </div>
      {/* three dots under the cards, where the founder drew them: real 44 pt buttons, the page shown a dark pill */}
      {/* close together, an even 14 pt apart (founder 2026-11-20: "make that gap more short and even so it looks nicer"). Each dot's button is its own share of
          the row with no overlap: 7 pt of the gap on each inner side, 30 pt more on the outer ends; all 44 pt tall, so the outer dots get wide targets and the
          middle one 24 pt (WCAG 2.5.8's minimum), and a tap on any dot always opens that dot's page */}
      <div role="group" aria-label={t("Choose what to show")} className="relative z-10 flex h-11 items-stretch justify-center">
        {pages.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={p.name}
            aria-current={current === i ? "true" : undefined}
            onClick={() => go(i)}
            className={`flex h-11 items-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${i === 0 ? "ps-[30px] pe-[7px]" : i === pages.length - 1 ? "ps-[7px] pe-[30px]" : "px-[7px]"}`}
          >
            <span aria-hidden className={`block h-2.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${current === i ? "w-6 bg-ink" : "w-2.5 bg-muted"}`} />
          </button>
        ))}
      </div>
      {hint && !state.seen && (
        <button type="button" onClick={() => { go(1); setHint(false); }} className="mx-auto -mt-1 block min-h-11 rounded-full px-3 py-1 text-center text-[0.875rem] font-semibold leading-snug text-accent">
          {t("Slide the cards sideways, or tap here, to see your week")}
          <ChevronRightIcon aria-hidden className="ms-0.5 inline-block h-4 w-4 -translate-y-px align-middle" />
        </button>
      )}
    </div>
  );
}

/** The pages' names (their dots and what a screen reader says). */
export const HOME_PAGE_NAMES = { today: tk("Today"), week: tk("Calories and protein this week"), labels: tk("Sugar, salt and fibre") };
