"use client";

import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { BackButton } from "../_components/PageHeader";
import { ShoppingListPill } from "../_components/TopActions";
import { Button } from "../_components/ui";

// The groceries screens' shared pieces, in Home's design language (founder 2026-10-15: "the home screen now looks beautiful ... the rest of
// the app should match that elegance too"): a compact heavy title, round white actions with a 1.5 px edge inside 44 px tap areas, white cards with 20 px
// corners and the 1px line, small labels in sentence case, figures in DM Mono (colour meeting, 19 November 2026, approved by the founder that day). The words
// are each screen's own: nothing here adds or changes a string.

/** A page title, compact and heavy, like Home's. */
export const TITLE = "text-[1.75rem] font-[800] leading-none tracking-[-0.02em]";
/** A section heading, like Home's "Today's meals". */
export const HEADING = "text-xl font-[800] tracking-[-0.01em]";
/** A small label inside a card, in the secondary grey: sentence case, semibold, 13 px (spaced capitals were hard to read for older testers). */
export const LABEL = "text-[0.8125rem] font-semibold leading-snug text-muted";
/** A white card with the 1px line on the grey page (the page fill with no edge when it sits inside another card: globals.css). */
export const CARD = "glass rounded-[1.25rem]";
/** A white pill input (search boxes, the typed shopping item): the field look, white with the 1.5 px edge, the placeholder in the mid grey. */
export const PILL_INPUT = "min-h-12 w-full text-ellipsis rounded-full border-[1.5px] border-edge bg-card px-5 text-base text-foreground placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
/**
 * A choice chip as classes (a portion, an allergen, the shop switcher). `CHIP`, not chosen: white with the 1.5 px edge and an empty tick ring before its
 * words; `CHIP_ON`, chosen: lime with the 2 px dark green edge (a 1.5 px border plus a half-pixel ring, so nothing moves), a dark green tick and bold dark
 * green words. The ring and tick are drawn by globals.css (.choice-off, .choice-on) on a button or a link, unless the chip starts with its own icon (a
 * caller's own tick, the fridge's "+"); a plain span with CHIP (a figure, not a choice) has none.
 */
export const CHIP = "choice-off inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-edge bg-card text-sm font-semibold text-foreground transition active:scale-[0.97] hover:bg-background";
export const CHIP_ON = "choice-on inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-on-sun bg-sun text-sm font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)] transition active:scale-[0.97]";
/** A small white circle with the 1.5 px edge holding an icon, like Home's calendar button (colour meeting, 19 November 2026: never a grey disc you tap). */
export const ROUND = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-edge bg-card";
/**
 * "Back", as a small white pill with an edge inside a 44 px tap area (the word stays: founder 2026-10-11, every back button says Back). It goes to the page the person
 * came from (the browser's own Back, `useBack`); `href` is the fixed page it goes to when there is no earlier page of the app (a page opened by address,
 * a shared link, a fresh launch), and `label` names that page for screen readers, so it is spoken only then (otherwise it is plain "Back").
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return <BackButton href={href} label={label} />;
}

/**
 * "Shopping list" (founder 2026-11-18: "it should say shopping list for consistency": Home's card has the same name): the one Shopping list pill of
 * TopActions.tsx, the same on every tab (colour meeting, 19 November 2026). It counts what is left to pick up, as on Home and Eat out, so `count` is no
 * longer read (kept so the screens that pass it still build).
 */
export function ListLink(props: { count?: number }) {
  void props;
  return <ShoppingListPill />;
}

function Chevron() {
  return <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
}

/**
 * A select as a white field with the 1.5 px edge and its small label inside it, above the chosen value ("Aisle / Every aisle"), with an ink chevron. The
 * whole field is the select, so a tap anywhere opens the browser's own list; the label element wraps it, so the select's name is the label's words.
 */
export function SelectField({ label, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className={`relative block rounded-[1.25rem] border-[1.5px] border-edge bg-card transition-colors hover:bg-background has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent ${className ?? ""}`}>
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
export const ROW = "glass flex min-h-[5.75rem] flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[1.25rem] p-3 pe-3.5 transition active:scale-[0.99] hover:bg-[color-mix(in_srgb,var(--card)_60%,var(--fill))]";

/** "Show n more": a white pill with the 1.5 px edge across the list's width. */
export function MoreButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-3.5 inline-flex min-h-12 w-full items-center justify-center rounded-full border-[1.5px] border-edge bg-card px-5 text-[0.9375rem] font-bold text-foreground transition active:scale-[0.98] active:bg-background hover:bg-background">
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
