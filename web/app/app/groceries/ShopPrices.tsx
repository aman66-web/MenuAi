"use client";

import { formatPrice } from "@/lib/mm/groceries";
import { ShopMark } from "../_components/ChainMark";
import { useT } from "../_lib/i18n";

/** One shop that sells a product: its shelf price there (null where its website prints none) and any loyalty-card price. */
export interface ShopPrice { shop: string; name: string; price: number | null; member?: { amount: number; scheme: string } | null }

/**
 * Every shop that sells a product, each by its own logo with its price under it (founder 2026-11-18: "like a domino, but you can see the logo from each
 * store that has them"; "You should also reference the price too"; "add the prices next to the logos on other screens too"). Side by side, each logo whole,
 * never one over another (CLAUDE.md rule 2); with several shops priced, the cheapest in bold; a loyalty-card price under the shelf price; "In store" where the
 * shop's website prints no price. The logos and prices are silent; a screen reader hears "Sold at Asda: £2.00, Sainsbury's: £2.00 and Waitrose: £2.20".
 */
export function ShopPrices({ items }: { items: readonly ShopPrice[] }) {
  const t = useT();
  const priced = items.filter((s) => s.price !== null);
  const cheapest = priced.length > 1 ? Math.min(...priced.map((s) => s.price!)) : null;
  const card = (m: { amount: number; scheme: string }) => `${formatPrice(m.amount)} ${m.scheme.replace(/ price$/i, "")}`;
  const sold = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(items.map((s) => t("{shop}: {price}", {
    shop: s.name,
    price: s.price !== null ? (s.member ? `${formatPrice(s.price)}, ${card(s.member)}` : formatPrice(s.price)) : t("price in store"),
  })));
  return (
    <>
      <span className="sr-only">{t("Sold at {shops}", { shops: sold })}</span>
      <span aria-hidden className="inline-flex flex-wrap items-start gap-x-2 gap-y-1.5">
        {items.map((s) => (
          <span key={s.shop} className="inline-flex flex-col items-center gap-0.5">
            <ShopMark shopId={s.shop} size="xs" />
            <span className={`app-numbers whitespace-nowrap text-[0.75rem] leading-none ${s.price !== null && s.price === cheapest ? "font-extrabold text-foreground" : "font-semibold text-muted"}`}>
              {s.price !== null ? formatPrice(s.price) : t("In store")}
            </span>
            {s.member && <span className="app-numbers whitespace-nowrap text-[0.6875rem] font-semibold leading-none text-foreground">{card(s.member)}</span>}
          </span>
        ))}
      </span>
    </>
  );
}
