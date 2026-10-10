"use client";

import { RETAILERS } from "@/lib/mm/groceries";
import { CheckIcon } from "./icons";

/** The supermarkets someone uses (onboarding and Settings): tap to add or remove; the order tapped is kept (first = the one Groceries and Recipes open on). */
export function ShopPicker({ value, onChange }: { value: readonly string[]; onChange: (shops: string[]) => void }) {
  return (
    <div role="group" aria-label="Your supermarkets" className="grid grid-cols-2 gap-2">
      {RETAILERS.map((r) => {
        const on = value.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
            className={`flex min-h-14 items-center justify-between gap-2 rounded-2xl border px-4 text-left text-base font-bold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "hero-card" : "glass hover:bg-soft-strong"}`}
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">{r.name}</span>
            <span aria-hidden className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${on ? "bg-sun border-transparent text-on-accent" : "border-line"}`}>
              {on && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
