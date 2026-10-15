"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { barcodeQuery, RETAILERS } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { ChevronRightIcon, CompareIcon, ScanIcon, SearchIcon } from "../_components/icons";
import { ShopMark } from "../_components/ChainMark";
import { Spinner } from "../_components/ui";
import { useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { useShopManifest } from "../_lib/shopProducts";
import { CARD, FootNote, HEADING, ListLink, ROUND, TITLE } from "./PageBits";
import { Scanner } from "./Scanner";

// Groceries starts with one plain question, "Which shop?" (founder 2026-10-11: simple enough for a 90-year-old). Each big tile opens that shop's own
// list: every product its pages showed, with its own photo and price, and the numbers where we have them. The person's own shops (onboarding, Settings)
// come first, each as a wide tile across the row with a small lime "Your shop" mark under its count, so the two-across tiles below all have the same
// height (a tag in a half-width tile made its row taller than the rest, and no place beside the logo is wide enough for it in every language). Searching every shop at once, scanning a barcode and comparing are three rows of one card.
// Looks follow Home (founder 2026-10-15): the compact title, a grey pill for "My list", white tiles two across, no chevrons on tiles.

/** Two tiles side by side, one above the other when the text is large (the minimum width is in rem, so it grows with the text size). */
const PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3.5";

export default function GroceriesPage() {
  const t = useT();
  const router = useRouter();
  const list = useStore(shoppingStore);
  const settings = useSettings();
  const lists = useShopManifest();
  const [scanning, setScanning] = useState(false);
  const mine = settings.shops ?? [];
  const order = (id: string) => (mine.includes(id) ? mine.indexOf(id) : 100 + RETAILERS.findIndex((r) => r.id === id));
  const shops = lists ? [...lists.retailers].sort((a, b) => order(a.id) - order(b.id)) : null;
  const missing = lists ? RETAILERS.filter((r) => !lists.retailers.some((x) => x.id === r.id)).map((r) => r.name) : [];
  const row = "flex min-h-14 w-full items-center gap-3.5 px-4 text-start text-base font-semibold transition hover:bg-[var(--fill)] active:bg-soft-strong first:rounded-t-[1.25rem] last:rounded-b-[1.25rem]";

  return (
    <div>
      {/* wraps, so at large text "My list" moves under the title instead of breaking the word "Groceries" */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className={TITLE}>{t("Groceries")}</h1>
        <ListLink count={list.length} />
      </div>
      <h2 className={`mt-7 ${HEADING}`}>{t("Which shop?")}</h2>
      <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Tap a shop to see its products, prices and photos.")}</p>

      {!shops ? (
        <Spinner label={t("Loading products")} />
      ) : (
        <ul className={`mt-4 ${PAIR}`}>
          {shops.map((r) => (
            <li key={r.id} className={`@container flex ${mine.includes(r.id) ? "col-span-full" : ""}`}>
              {/* the shop's name comes first in the tile's text, then its count, then a small lime "Your shop" tag. When a tile has the whole
                  row the logo sits beside the words instead of above them, so the tiles stay short; when that row is also wide for its text size
                  (a wide "Your shop" tile at the standard size), the tag moves to the tile's end, level with the words (a three-column grid; the
                  words' wrapper steps aside with `contents`, so the reading order stays name, count, tag) */}
              <Link href={`/app/groceries/shop?r=${r.id}`} prefetch={false} className={`${CARD} lift flex w-full flex-col items-start p-4 [overflow-wrap:anywhere] @[300px]:flex-row @[300px]:items-center @[300px]:gap-4 @[20rem]:grid @[20rem]:grid-cols-[auto_minmax(0,1fr)_auto] @[20rem]:gap-y-0!`}>
                <span className="contents @[20rem]:row-span-2 @[20rem]:flex"><ShopMark shopId={r.id} size="md" /></span>
                <span className="mt-4 block min-w-0 @[300px]:mt-0 @[20rem]:contents">
                  <span className="block text-lg font-[800] leading-snug tracking-[-0.01em] @[20rem]:col-start-2">{r.name}</span>
                  <span className="app-numbers mt-0.5 block text-[0.9375rem] leading-snug text-muted @[20rem]:col-start-2">{r.count === 1 ? t("1 product") : t("{n} products", { n: r.count.toLocaleString("en-GB") })}</span>
                  {mine.includes(r.id) && <span className="bg-sun mt-3 inline-flex items-center justify-self-end whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-on-accent @[300px]:mt-2 @[20rem]:col-start-3 @[20rem]:row-span-2 @[20rem]:row-start-1 @[20rem]:mt-0!">{t("Your shop")}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && <p className="mt-3.5 text-[0.9375rem] leading-snug text-muted">{t("Not here yet: {shops}.", { shops: missing.join(", ") })}</p>}

      <div className={`${CARD} mt-6 divide-y divide-line`}>
        <button type="button" className={row} onClick={() => setScanning(true)}>
          <span aria-hidden className={ROUND}><ScanIcon className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1">{t("Scan a barcode")}</span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>
        <Link href="/app/groceries/search" className={row}>
          <span aria-hidden className={ROUND}><SearchIcon className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1">{t("Search every shop at once")}</span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </Link>
        <Link href="/app/compare?tab=food" className={row}>
          <span aria-hidden className={ROUND}><CompareIcon className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1">{t("Compare products")}</span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </Link>
      </div>

      <FootNote>{t("Prices appear only where we've read them from the supermarket's own website. Not affiliated with any supermarket.")}</FootNote>

      <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(code) => { setScanning(false); const c = barcodeQuery(code); if (c) router.push(`/app/groceries/product?code=${c}`); }} />
    </div>
  );
}
