"use client";

import { formatPrice } from "@/lib/mm/groceries";
import { ShopMark } from "../_components/ChainMark";
import { useT } from "../_lib/i18n";

/** One shop that sells a product: its shelf price there (null where its website prints none) and any loyalty-card price. */
export interface ShopPrice { shop: string; name: string; price: number | null; member?: { amount: number; scheme: string } | null }

/**
 * Every shop that sells a product, each by its own logo with its name in words and its price under it (founder 2026-11-18: "like a domino, but you can see
 * the logo from each store that has them"; "You should also reference the price too"; "add the prices next to the logos on other screens too"). Side by side,
 * each logo whole, never one over another (CLAUDE.md rule 2), and the name always written (colour meeting, 19 November 2026: logos alone couldn't be told
 * apart). Every price in the body's ink (a grey or green price reads as faint or as a link); with several shops priced, the lowest in extra bold with the word
 * "Lowest"; a loyalty-card price under the shelf price, smaller and naming its scheme in words, never in a scheme's colour; "In store" where the shop's website
 * prints no price. The strip is silent; a screen reader hears "Sold at Asda: £2.00, Sainsbury's: £2.00 and Waitrose: £2.20".
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
      <span aria-hidden className="inline-flex flex-wrap items-start gap-x-3 gap-y-2">
        {items.map((s) => {
          const lowest = s.price !== null && s.price === cheapest;
          return (
            <span key={s.shop} className="inline-flex max-w-[6rem] flex-col items-center gap-0.5 text-center">
              <ShopMark shopId={s.shop} size="xs" />
              <span className="max-w-full truncate text-[0.8125rem] font-semibold leading-tight text-foreground">{s.name}</span>
              <span className={`app-numbers whitespace-nowrap text-[0.8125rem] leading-tight text-foreground ${lowest ? "font-extrabold" : "font-semibold"}`}>
                {s.price !== null ? formatPrice(s.price) : t("In store")}
              </span>
              {lowest && <span className="text-[0.8125rem] font-bold leading-tight text-foreground">{t("Lowest")}</span>}
              {s.member && <span className="app-numbers whitespace-nowrap text-[0.8125rem] font-semibold leading-tight text-foreground">{card(s.member)}</span>}
            </span>
          );
        })}
      </span>
    </>
  );
}
