"use client";

import { useId, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from "../icons";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../SearchDone";
import { useT } from "../../_lib/i18n";
import type { LogEntry } from "@/lib/mm/user-data";

// The small pieces the "Add food" sheet's views share: a Back pill, a big choice, a list of picks with a black pill each, a search box with Done.

/** What a view hands up to be added to the meal: the sheet adds the time, the id and the meal. */
export type NewEntry = Pick<LogEntry, "chainId" | "chainName" | "name" | "nutrients" | "source">;

/** The way back to the four choices (or, inside a view, to its list). Light grey on the sheet's white, like Today's Back pill. */
export function BackBar({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onBack} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <ChevronLeftIcon className="h-5 w-5" />
      <span>{t("Back")}</span>
    </button>
  );
}

/** One of the sheet's big choices: a round icon, what it is, one line about it, and an arrow. */
export function Choice({ icon, title, line, onClick }: { icon: ReactNode; title: string; line: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="glass flex min-h-[4.75rem] w-full items-center gap-3.5 rounded-[1.25rem] p-3.5 text-start transition active:scale-[0.98] hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-[800] leading-snug tracking-[-0.01em]">{title}</span>
        <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{line}</span>
      </span>
      <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted" />
    </button>
  );
}

/** A list of things to pick from, on one rounded surface. */
export const PICK_LIST = "glass divide-y divide-line overflow-hidden rounded-[1.25rem]";

const PILL = "relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-[0.9375rem] font-bold text-background transition active:scale-95 disabled:bg-soft-strong disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The black "Add" pill at the end of a row. Its spoken name carries what it adds ("Add Chicken wrap"). */
export function AddPill({ name, onClick, disabled, busy }: { name: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-busy={busy || undefined} className={PILL}>
      {busy ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <PlusIcon aria-hidden className="h-4 w-4" />}
      {t("Add")}
      <span className="sr-only"> {name}</span>
    </button>
  );
}

/** The black "Choose" pill at the end of a row that leads on to a second step (a product, then how much). */
export function ChoosePill({ name, onClick }: { name: string; onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} className={PILL}>
      {t("Choose")}
      <span className="sr-only"> {name}</span>
    </button>
  );
}

/** One row of a pick list: a picture or icon, the name, a line of figures, and the pill. */
export function PickRow({ lead, title, line, action }: { lead?: ReactNode; title: string; line: ReactNode; action: ReactNode }) {
  return (
    <li className="flex min-h-[4.5rem] items-center gap-3 py-3 ps-3.5 pe-3">
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{title}</span>
        <span className="app-numbers mt-0.5 block text-[0.875rem] leading-snug text-muted [overflow-wrap:anywhere]">{line}</span>
      </span>
      {action}
    </li>
  );
}

/** A search box for the sheet's lists: filters as you type, a Done inside it puts the keyboard away. */
export function SheetSearch({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2.5 block text-[0.9375rem] font-semibold leading-snug">{label}</label>
      <div className="group/search relative">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} {...DONE_KEY} autoComplete="off" className={`glass min-h-13 w-full rounded-full ps-11 pe-4 ${DONE_ROOM} text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:appearance-none`} />
        <SearchDone />
      </div>
    </div>
  );
}
