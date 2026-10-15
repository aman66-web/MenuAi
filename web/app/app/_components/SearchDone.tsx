"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useT } from "../_lib/i18n";

// A "Done" button for the keyboard (founder 2026-10-15, on Compare's "Add a product" box with the keyboard up: "There needs to be like a done box
// here"). Every search box in the app filters as you type, so there is nothing to submit: the person only needs to put the keyboard away to see the
// results underneath it. The button sits inside the box, where the founder's circle was, and shows while the box is in use (its wrapper carries
// `group/search`); the keyboard's own Return key says "Done" too and does the same. The number boxes of Eat out's "Your numbers" have no Return key at
// all on an iPhone, so the group gets a Done at the card's corner (`NumberDone`).

/** Hide the keyboard: whatever has the focus (the field, or the Done button when it was reached with Tab) lets go of it. */
export function dismissKeyboard() {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}

/** On a search field's `onKeyDown`: the keyboard's Return key puts the keyboard away. Not while a word is still being composed. */
export function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
}

/** Spread on a live-filter search field: the keyboard's Return key reads "Done" and does it. */
export const DONE_KEY = { enterKeyHint: "done", onKeyDown: blurOnEnter } as const;

/** Room at the end of the field while it is in use, so typed words never run under the Done button (more when a clear button sits beside it). */
export const DONE_ROOM = "focus:pe-[6.5rem]";
export const DONE_ROOM_WITH_CLEAR = "focus:pe-[9.5rem]";

// A tap keeps the focus in the field until the click lands (otherwise the button, which shows only while the box is in use, would vanish under the
// finger before it was tapped); the click then puts the keyboard away.
const keepFocus = (e: { preventDefault(): void }) => e.preventDefault();

/**
 * Inside a search box's `relative group/search` wrapper, after the field: the Done button at the end of the box, hidden until the box is in use.
 * `children` is the box's clear button (if it has one), shown just before Done.
 */
export function SearchDone({ children }: { children?: ReactNode }) {
  const t = useT();
  return (
    <div className="absolute end-1.5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1">
      {children}
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={dismissKeyboard}
        className="relative hidden h-9 items-center rounded-full bg-foreground px-4 text-[0.9375rem] font-bold text-background transition before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] active:scale-95 group-focus-within/search:inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {t("Done")}
      </button>
    </div>
  );
}

/**
 * A Done for a group of number boxes (an iPhone's number pad has no Return key): at the card's top corner, shown (not added) while any box in the
 * group is in use. It is `invisible` rather than absent and sits outside the flow, so showing and hiding it never moves anything: a Done that
 * appeared under the boxes pushed the next thing down the moment a box lost the focus, and a tap on it (an allergy tile, say) landed in the wrong place.
 * Put it in the group's `relative group/nums` wrapper, beside the boxes and outside every `<label>`.
 */
export function NumberDone() {
  const t = useT();
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={dismissKeyboard}
      className="invisible absolute -top-2 end-0 z-10 inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[0.875rem] font-bold text-background transition before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] active:scale-95 group-focus-within/nums:visible focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {t("Done")}
    </button>
  );
}
