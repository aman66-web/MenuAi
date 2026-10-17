"use client";

import type { ReactNode } from "react";
import { useT } from "../../_lib/i18n";
import { DotsIcon } from "../../_components/icons";
import { CARD, HEADING } from "../../groceries/PageBits";

// The pieces of the friends page's lists: a heading with a count, a white card of rows, and a row (a round initial, the username as plain text, what you can do).
// A username is someone else's text, so it is printed as text only and may wrap anywhere.

/** A heading above a white card, with how many are in it. */
export function ListSection({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      {/* focusable by the page (not by Tab): after a row is answered or removed, focus goes to the heading of the list it was in */}
      <h2 id={id} tabIndex={-1} className={`${HEADING} flex items-center gap-2.5 outline-none`}>
        {title}
        {count !== undefined && <span className="app-numbers grid h-6 min-w-6 place-items-center rounded-full bg-foreground px-2 font-mono text-[0.75rem] font-medium text-background">{count}</span>}
      </h2>
      <div className={`${CARD} mt-3 overflow-hidden`}>{children}</div>
    </section>
  );
}

/** A round with the name's first letter: decorative, like a contact's initial. */
export function Initial({ name }: { name: string }) {
  return <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-soft-strong text-[1.0625rem] font-[800] uppercase">{name.charAt(0)}</span>;
}

/** One person: the initial, the name, and (at the end) a button; anything for the row below the name (Accept / Decline) goes in `below`. */
export function PersonRow({ name, hint, end, below }: { name: string; hint?: string; end?: ReactNode; below?: ReactNode }) {
  return (
    <li className="relative px-4 py-3 before:pointer-events-none before:absolute before:end-0 before:start-4 before:top-0 before:h-px before:bg-[var(--line)] first:before:hidden">
      {/* the name keeps room to read: at large text, or with a long name, the button (Take back, Unblock) drops under it, at the end, instead of squeezing the name into a column of single letters */}
      <div className="flex min-h-11 flex-wrap items-center gap-x-3.5 gap-y-2">
        <Initial name={name} />
        <div className="min-w-0 flex-1 basis-[7.5rem]">
          <p className="text-base font-semibold leading-snug [overflow-wrap:anywhere]">{name}</p>
          {hint && <p className="mt-0.5 text-sm leading-snug text-muted">{hint}</p>}
        </div>
        {end && <div className="ms-auto flex shrink-0 items-center">{end}</div>}
      </div>
      {below && <div className="mt-3 grid grid-cols-2 gap-2.5">{below}</div>}
    </li>
  );
}

/** The three dots at the end of a row: a 36 px grey round inside a 44 px tap area, named for the person. */
export function RowMenuButton({ name, onClick }: { name: string; onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" aria-label={t("More options for {name}", { name })} onClick={onClick} className="group -me-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]"><DotsIcon className="h-5 w-5" /></span>
    </button>
  );
}
