"use client";

import Link from "next/link";
import { useState } from "react";
import { addToCompare, COMPARE_MAX, inCompare, removeFromCompare, type CompareItem } from "@/lib/mm/compare";
import { compareStore } from "@/lib/mm/stores";
import { useHydrated, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { CompareIcon } from "./icons";

/** "Compare" on a product or dish page: adds it to the compare list (or takes it off), and links to the comparison. */
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
    <div className={full ? "w-full" : undefined}>
      <button
        type="button"
        aria-pressed={on}
        onClick={toggle}
        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition active:scale-[0.97] ${full ? "w-full" : ""} ${on ? "bg-accent-soft text-accent ring-1 ring-accent/40" : "glass hover:bg-soft-strong"}`}
      >
        <CompareIcon className="h-5 w-5" />
        {on ? t("In your comparison") : t("Compare")}
      </button>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-center text-sm font-medium text-accent">
        {note ?? (on ? (
          <>
            {count === 1 ? t("Add another to compare it with.") : t("{n} to compare.", { n: count })}{" "}
            <Link href={href} className="underline underline-offset-2">{t("See the comparison")}</Link>
          </>
        ) : null)}
      </p>
    </div>
  );
}
