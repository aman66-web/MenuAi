"use client";

import { RETAILERS } from "@/lib/mm/groceries";
import { useT } from "../_lib/i18n";
import { ShopMark } from "./ChainMark";
import { PickMark } from "./DietPicker";

/**
 * The supermarkets someone uses (onboarding and Settings): tap to add or remove; the order tapped is kept (first = the one Groceries and
 * Recipes open on). One white card with a row per shop and hairlines between them, like Settings' Goal list: the shop's own logo on its
 * tile, its name in plain text, and the round mark at the end (the lime tick and a bolder name once chosen).
 */
export function ShopPicker({ value, onChange }: { value: readonly string[]; onChange: (shops: string[]) => void }) {
  const t = useT();
  return (
    <div role="group" aria-label={t("Your supermarkets")} className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
      {RETAILERS.map((r) => {
        const on = value.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
            className="flex min-h-[3.75rem] w-full items-center gap-3.5 px-4 py-2.5 text-start transition hover:bg-soft-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-soft-strong"
          >
            {/* the shop's own logo on its tile (decorative), then its name in plain text */}
            <ShopMark shopId={r.id} size="sm" />
            <span className={`min-w-0 flex-1 text-[1.0625rem] leading-snug [overflow-wrap:break-word] ${on ? "font-bold" : "font-medium"}`}>{r.name}</span>
            <PickMark on={on} />
          </button>
        );
      })}
    </div>
  );
}
