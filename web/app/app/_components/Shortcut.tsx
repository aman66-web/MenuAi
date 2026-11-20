"use client";

// A shortcut row of one grouped card (an icon well, the title and its line, an ink chevron): shared by Eat out and Groceries. The colour meeting (19 November
// 2026, approved by the founder that day) replaced the lime discs of 17 November ("three lime circles read as three things switched on"; lime only ever means
// chosen, today, done or progress): each icon sits in a page-fill well in the accent green (5.9:1), the title in ink, its line in the secondary grey.

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";

const ROW = "group flex min-h-[4.75rem] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-[var(--fill)] active:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!";

type Props = { icon: ReactNode; title: string; line: string; coach?: string /* names it for Pip's tips (coachSteps.ts) */ } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

/** One shortcut: a link when it has `href`, a button when it has `onClick` (the same look either way). */
export function Shortcut(props: Props) {
  const { icon, title, line, coach } = props;
  const inner = (
    <>
      <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.875rem] bg-fill text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="block text-base font-bold leading-snug">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">{line}</span>
      </span>
      <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-ink transition-transform group-hover:translate-x-0.5" />
    </>
  );
  if (props.href !== undefined) return <Link href={props.href} data-coach={coach} className={ROW}>{inner}</Link>;
  return <button type="button" data-coach={coach} onClick={props.onClick} className={`${ROW} w-full text-start`}>{inner}</button>;
}
