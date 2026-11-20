"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { backName, useBack } from "../_lib/backNav";
import { useT } from "../_lib/i18n";
import { ChevronLeftIcon } from "./icons";
import { SettingsGear, ShoppingListPill } from "./TopActions";

// One header for every page (colour meeting, 19 November 2026; approved by the founder that day), in one fixed order so people find things by where they are:
// on the left Back (always with its word) or the page's title; then the page's own action; then the Shopping list pill; the Settings cog with its word always
// far right. Settings itself, sheets and the full-screen camera have no cog (`settings={false}`). Over a full-width food photo (`photo`) every control is a
// photo chip; the caller places the header over the photo (and adds the .status-band behind it).

/**
 * Where Back goes. A link (`href`): the browser's own Back when this page was reached from another page of the app, else the fixed page `href`, whose name
 * `label` is spoken only then ("Back to recipes"); `onClick` runs first and may call preventDefault() to stay (a "Leave without saving?" question). A button
 * (`onPress`): a step inside the page (the plan's questions), with an optional spoken `label`.
 */
export type PageBack =
  | { href: string; label: string; onClick?: (e: MouseEvent<HTMLElement>) => void }
  | { onPress: () => void; label?: string };

/** White with the 1.5 px edge, an ink chevron and the word "Back" (founder 2026-10-11: every back button says Back), in a 44 px target. */
const PILL = "inline-flex h-9 items-center gap-0.5 whitespace-nowrap rounded-full border-[1.5px] border-edge bg-card ps-2 pe-3.5 text-[0.9375rem] font-semibold text-foreground transition-colors group-hover:bg-background group-active:bg-background";
const PHOTO = "photo-chip inline-flex min-h-11 items-center gap-0.5 whitespace-nowrap rounded-full ps-2.5 pe-4 text-[0.9375rem] font-bold";
const TARGET = "group inline-flex min-h-11 shrink-0 items-center rounded-full transition active:scale-95";

function BackLinkPill({ href, label, onClick, photo, className }: { href: string; label: string; onClick?: (e: MouseEvent<HTMLElement>) => void; photo?: boolean; className?: string }) {
  const t = useT();
  const back = useBack(href);
  return (
    <Link
      href={back.href}
      onClick={(e) => {
        onClick?.(e);
        back.onClick(e); // does nothing when the caller kept the person here (preventDefault)
      }}
      aria-label={backName(t("Back"), label, back.cameFromApp)}
      className={`${TARGET} ${className ?? ""}`}
    >
      <span className={photo ? PHOTO : PILL}>
        <ChevronLeftIcon className="h-[18px] w-[18px] shrink-0 text-ink" />
        <span>{t("Back")}</span>
      </span>
    </Link>
  );
}

function BackPressPill({ onPress, label, photo, className }: { onPress: () => void; label?: string; photo?: boolean; className?: string }) {
  const t = useT();
  return (
    <button type="button" onClick={onPress} aria-label={label} className={`${TARGET} ${className ?? ""}`}>
      <span className={photo ? PHOTO : PILL}>
        <ChevronLeftIcon className="h-[18px] w-[18px] shrink-0 text-ink" />
        <span>{t("Back")}</span>
      </span>
    </button>
  );
}

/** The Back pill on its own (for a page that lays out its own top): a link or a button, see PageBack. */
export function BackButton(props: PageBack & { photo?: boolean; className?: string }) {
  return "href" in props ? <BackLinkPill {...props} /> : <BackPressPill {...props} />;
}

/** A page's title: compact and heavy, like Home's (groceries/PageBits.tsx TITLE). */
const TITLE = "text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]";

export function PageHeader({ title, titleId, back, action, list, settings = true, photo, coach, className }: {
  /** The page's h1. With Back it goes on its own line under the header row; without, it sits at the left of the row. */
  title?: ReactNode;
  titleId?: string;
  back?: PageBack;
  /** The page's own action (My recipes, Save), placed before the Shopping list pill. */
  action?: ReactNode;
  /** Show the Shopping list pill (Home, Groceries, Eat out, Recipes). */
  list?: boolean;
  /** The Settings cog; false on Settings itself, in sheets and on the full-screen camera. */
  settings?: boolean;
  /** Over a full-width food photo: every control is a photo chip. */
  photo?: boolean;
  /** A Pip's tips marker (data-coach) on the right-hand controls. */
  coach?: string;
  className?: string;
}) {
  const right = action || list || settings;
  const heading = title != null && title !== false && <h1 id={titleId} className={TITLE}>{title}</h1>;
  return (
    <>
      <div className={`flex flex-wrap items-start justify-between gap-x-2 gap-y-1 ${className ?? ""}`}>
        <div className="flex min-h-11 min-w-0 items-center">
          {back ? <BackButton {...back} photo={photo} /> : heading}
        </div>
        {right && (
          <div data-coach={coach} className="-me-1 ms-auto flex max-w-full flex-wrap items-start justify-end gap-x-1 gap-y-1">
            {action && <div className="flex min-h-11 items-center">{action}</div>}
            {list && <ShoppingListPill photo={photo} />}
            {settings && <SettingsGear photo={photo} />}
          </div>
        )}
      </div>
      {back && heading && <div className="mt-3">{heading}</div>}
    </>
  );
}
