"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { BasketIcon, ChevronLeftIcon } from "../_components/icons";
import { Button } from "../_components/ui";
import { backName, useBack } from "../_lib/backNav";
import { useT } from "../_lib/i18n";

// The groceries screens' shared pieces, in Home's design language (founder 2026-10-15: "the home screen now looks beautiful ... the rest of
// the app should match that elegance too"): a compact heavy title, round white actions with a 1.5 px edge inside 44 px tap areas (colour meeting,
// 19 November 2026), white cards with 20 px
// corners, small spaced-capital labels, figures in DM Mono. The words are each screen's own: nothing here adds or changes a string.

/** A page title, compact and heavy, like Home's. */
export const TITLE = "text-[1.75rem] font-[800] leading-none tracking-[-0.02em]";
/** A section heading, like Home's "Today's meals". */
export const HEADING = "text-xl font-[800] tracking-[-0.01em]";
/** A small label inside a card: spaced capitals in the muted grey (set in capitals by CSS, the words are unchanged). */
export const LABEL = "text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted";
/** A white card on the grey page (a light grey tile when it sits inside another card: globals.css). */
export const CARD = "glass rounded-[1.25rem]";
/** A white pill input (search boxes, the typed shopping item). */
export const PILL_INPUT = "glass min-h-12 w-full text-ellipsis rounded-full px-5 text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
/** An outlined chip that is a link (the shop switcher, other sizes), with the 1.5 px edge of every control you can tap; `CHIP_ON` when it is the current one (the same width of edge, so nothing moves). */
export const CHIP = "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] text-sm font-semibold transition active:scale-[0.97] border-edge bg-transparent hover:bg-soft-strong";
export const CHIP_ON = "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] border-transparent bg-ink text-sm font-semibold text-on-ink transition active:scale-[0.97]";
/** A small white circle with the 1.5 px edge holding an icon, like Home's calendar button (colour meeting, 19 November 2026: never a grey disc you tap). */
export const ROUND = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-edge bg-card";
/** A small pill you can tap: white with the 1.5 px mid-grey edge (testers said the grey pills looked broken), the page's grey when pressed or hovered. */
const PILL = "border-[1.5px] border-edge bg-card transition-colors group-hover:bg-background group-active:bg-background";

/**
 * "Back", as a small white pill with an edge inside a 44 px tap area (the word stays: founder 2026-10-11, every back button says Back). It goes to the page the person
 * came from (the browser's own Back, `useBack`); `href` is the fixed page it goes to when there is no earlier page of the app (a page opened by address,
 * a shared link, a fresh launch), and `label` names that page for screen readers, so it is spoken only then (otherwise it is plain "Back").
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const t = useT();
  const back = useBack(href);
  return (
    <Link href={back.href} onClick={back.onClick} aria-label={backName(t("Back"), label, back.cameFromApp)} className="group -ms-1 inline-flex min-h-11 shrink-0 items-center transition active:scale-95">
      <span className={`inline-flex h-9 items-center gap-0.5 whitespace-nowrap rounded-full ps-2 pe-3.5 text-[0.9375rem] font-semibold ${PILL}`}>
        <ChevronLeftIcon className="h-[18px] w-[18px]" /><span>{t("Back")}</span>
      </span>
    </Link>
  );
}

/** "Shopping list" with how many things are on it, as a small white pill with an edge inside a 44 px tap area (founder 2026-11-18: "it should say shopping list for consistency": Home's card has the same name); the count on an ink circle. */
export function ListLink({ count }: { count: number }) {
  const t = useT();
  return (
    <Link href="/app/groceries/list" className="group -me-1 inline-flex min-h-11 shrink-0 items-center transition active:scale-95">
      <span className={`inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full ps-3 pe-3.5 text-[0.9375rem] font-semibold ${PILL}`}>
        <BasketIcon className="h-[18px] w-[18px]" />{t("Shopping list")}
        {count > 0 && <span className="app-numbers grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 font-mono text-[0.6875rem] font-medium text-on-ink">{count}</span>}
      </span>
    </Link>
  );
}

function Chevron() {
  return <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
}

/**
 * A select as a white field with its label in small spaced capitals inside it, above the chosen value ("AISLE / Every aisle"), like the
 * small labels in Home's cards. The whole field is the select, so a tap anywhere opens the browser's own list; the label element wraps it,
 * so the select's name is the label's words.
 */
export function SelectField({ label, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className={`glass relative block rounded-[1.25rem] transition-colors hover:bg-[color-mix(in_srgb,white_70%,var(--soft-strong))] has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-1 has-[select:focus-visible]:outline-accent ${className ?? ""}`}>
      <span className={`pointer-events-none absolute start-4 top-2.5 max-w-[calc(100%-3.5rem)] truncate ${LABEL}`}>{label}</span>
      <select className="block min-h-[3.75rem] w-full cursor-pointer appearance-none truncate rounded-[1.25rem] bg-transparent pb-2 pe-10 ps-4 pt-[1.6rem] text-base font-semibold leading-snug focus-visible:outline-none" {...rest} />
      <Chevron />
    </label>
  );
}

/** The one main action on a screen: Home's black pill ("Open"), the words only (no icon circle: founder 2026-10-15). */
export function MainButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button full className={`min-h-[3.25rem] text-base ${className ?? ""}`} {...rest}>
      {children}
    </Button>
  );
}

/** A product in a list: a white card with 20 px corners and a soft press, its photo on the left. */
export const ROW = "glass flex min-h-[5.75rem] flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[1.25rem] p-3 pe-3.5 transition active:scale-[0.99] hover:bg-[color-mix(in_srgb,white_60%,var(--fill))]";

/** "Show n more": a white pill with the 1.5 px edge across the list's width. */
export function MoreButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-3.5 inline-flex min-h-12 w-full items-center justify-center rounded-full border-[1.5px] border-edge bg-card px-5 text-[0.9375rem] font-bold transition active:scale-[0.98] active:bg-background hover:bg-background">
      {children}
    </button>
  );
}

/** The quiet note at the foot of a screen (where the data is from, not affiliated). */
export function FootNote({ children }: { children: ReactNode }) {
  return <p className="mt-8 border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-muted">{children}</p>;
}

/** A quiet note under a figure or a card (checked date, what the numbers are from). */
export const NOTE = "text-[0.8125rem] leading-relaxed text-muted";
