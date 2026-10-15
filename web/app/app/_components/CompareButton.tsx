"use client";

import Link from "next/link";
import { useState } from "react";
import { addToCompare, COMPARE_MAX, inCompare, removeFromCompare, type CompareItem } from "@/lib/mm/compare";
import { compareStore } from "@/lib/mm/stores";
import { useHydrated, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { CheckIcon, CompareIcon } from "./icons";

/**
 * "Compare" on a product or dish page: adds it to the compare list (or takes it off), and links to the comparison.
 * A pill like the secondary actions beside it (white on the page, light grey on a card); once the item is in the comparison the
 * pill turns lime, the app's colour for "selected", with a tick where there's room for it beside the words (in half a row the
 * words come first, so they stay on one line).
 */
export function CompareButton({ item, full }: { item: CompareItem; full?: boolean }) {
  const t = useT();
  const hydrated = useHydrated();
  const list = useStore(compareStore);
  const [note, setNote] = useState<string | null>(null);
  const on = hydrated && inCompare(list, item.key);
  const count = list.filter((x) => x.kind === item.kind).length;
  const href = `/app/compare?tab=${item.kind}`;
  const toggle = () => {
    if (on) {
      compareStore.update((l) => removeFromCompare(l, item.key));
      setNote(t("Taken off your comparison."));
      return;
    }
    const next = addToCompare(compareStore.get(), { ...item, addedAt: new Date().toISOString() });
    if (next.full) {
      setNote(t("You can compare up to {n} at a time. Take one off first.", { n: COMPARE_MAX }));
      return;
    }
    compareStore.set(next.list);
    setNote(null);
  };
  return (
    // `contents`: the button sits straight in whatever holds it (on a dish's page, the grid of Log, Save, Share and Compare), and
    // the note under it takes a whole row after that grid (order-last, col-span-full), so it never stretches the pills beside it
    // or squeezes into half a row. The note is always there (empty until something happens) so screen readers hear it change.
    <div className="contents">
      <button
        type="button"
        aria-pressed={on}
        onClick={toggle}
        className={`${full ? "flex w-full @container" : "inline-flex"} min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[0.9375rem] font-semibold leading-snug transition duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-sun text-on-accent hover:bg-[color-mix(in_srgb,var(--sun)_93%,var(--foreground))]" : "glass text-foreground hover:bg-soft-strong"}`}
      >
        {on ? <CheckIcon className={`h-5 w-5 shrink-0 ${full ? "hidden @[13rem]:block" : ""}`} /> : <CompareIcon className="h-5 w-5 shrink-0" />}
        <span className="text-balance">{on ? t("In your comparison") : t("Compare")}</span>
      </button>
      <p role="status" aria-live="polite" className="order-last col-span-full basis-full text-center text-sm font-medium leading-snug text-muted [&:not(:empty)]:mt-2">
        {note ?? (on ? (
          <>
            {count === 1 ? t("Add another to compare it with.") : t("{n} to compare.", { n: count })}{" "}
            <Link href={href} className="inline-flex min-h-11 items-center font-semibold text-accent underline decoration-[color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-[3px]">{t("See the comparison")}</Link>
          </>
        ) : null)}
      </p>
    </div>
  );
}
