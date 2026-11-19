"use client";

// A shortcut row of one grouped card (a round light-green icon, the title and its line, a quiet chevron): shared by Eat out and Groceries. Every icon is the same
// lime (founder 2026-11-17: "make all the icons light green so people can see them and recognize them"; only the first one used to be).

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
      <span aria-hidden className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sun text-[var(--on-accent)] [&>svg]:h-5 [&>svg]:w-5`}>{icon}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="block text-base font-bold leading-snug">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">{line}</span>
      </span>
      <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </>
  );
  if (props.href !== undefined) return <Link href={props.href} data-coach={coach} className={ROW}>{inner}</Link>;
  return <button type="button" data-coach={coach} onClick={props.onClick} className={`${ROW} w-full text-start`}>{inner}</button>;
}
