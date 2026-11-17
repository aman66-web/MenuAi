"use client";

import { ShopMark } from "../_components/ChainMark";
import { CheckIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";

/**
 * Where the person is shopping, one shop at a time (founder 2026-11-17: "they only have the option to select one store ... they can change the store they're
 * shopping at"). A list of radio rows, each with the shop's own logo and its name; a shop that can't make the recipe being looked at is shown but can't be
 * chosen, and says so. Used by the Recipes page (every shop that can make recipes) and by a recipe page (the shops that can make that recipe).
 */
export function ShopChoice({ shops, value, onChange, canMake }: { shops: ReadonlyArray<{ id: string; name: string }>; value: string | null; onChange: (id: string) => void; canMake?: (id: string) => boolean }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("Shopping at")} className="space-y-2">
      {shops.map((s) => {
        const on = s.id === value;
        const can = canMake ? canMake(s.id) : true;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!can && !on}
            onClick={() => onChange(s.id)}
            className={`flex min-h-[3.5rem] w-full items-center gap-3 rounded-[1.25rem] p-2.5 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-sun text-on-accent" : can ? "glass hover:bg-soft-strong" : "glass opacity-100 text-muted"}`}
          >
            <ShopMark shopId={s.id} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-[1.0625rem] font-bold leading-snug [overflow-wrap:anywhere]">{s.name}</span>
              {!can && !on && <span className="block text-[0.8125rem] leading-snug">{t("Can't make this recipe")}</span>}
            </span>
            {on && <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-background"><CheckIcon className="h-4 w-4" /></span>}
          </button>
        );
      })}
    </div>
  );
}
