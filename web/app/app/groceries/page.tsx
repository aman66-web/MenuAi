"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { barcodeQuery, RETAILERS } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { BasketIcon, ChevronRightIcon, CompareIcon, ScanIcon, SearchIcon } from "../_components/icons";
import { ShopMark } from "../_components/ChainMark";
import { Button, Spinner } from "../_components/ui";
import { useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { useShopManifest } from "../_lib/shopProducts";
import { Scanner } from "./Scanner";

// Groceries starts with one plain question, "Which shop?" (founder 2026-10-11: simple enough for a 90-year-old). Each big button opens that shop's own
// list: every product its pages showed, with its own photo and price, and the numbers where we have them. The person's own shops (onboarding, Settings)
// come first. Searching every shop at once and scanning a barcode are one button each.

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

  return (
    <div>
      {/* wraps, so at large text "My list" moves under the title instead of breaking the word "Groceries" */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h1 className="text-[2.2rem] font-extrabold leading-[1.05] tracking-tight">{t("Groceries")}</h1>
        <Link href="/app/groceries/list" className="glass relative mt-1 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition active:scale-95 hover:bg-soft-strong">
          <BasketIcon className="h-5 w-5" />{t("My list")}
          {list.length > 0 && <span className="app-numbers grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-background">{list.length}</span>}
        </Link>
      </div>
      <h2 className="mt-5 text-xl font-extrabold tracking-tight">{t("Which shop?")}</h2>
      <p className="mt-1 text-base text-muted">{t("Tap a shop to see its products, prices and photos.")}</p>

      {!shops ? (
        <Spinner label={t("Loading products")} />
      ) : (
        <ul className="mt-4 space-y-2.5">
          {shops.map((r) => (
            <li key={r.id}>
              <Link href={`/app/groceries/shop?r=${r.id}`} prefetch={false} className="glass lift flex min-h-[4.5rem] items-center gap-4 rounded-[1.75rem] p-3 ps-4 hover:bg-soft-strong">
                <ShopMark shopId={r.id} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-extrabold leading-snug tracking-tight">{r.name}</span>
                  <span className="app-numbers block text-base text-muted">{r.count === 1 ? t("1 product") : t("{n} products", { n: r.count.toLocaleString("en-GB") })}{mine.includes(r.id) ? ` · ${t("Your shop")}` : ""}</span>
                </span>
                <ChevronRightIcon className="h-6 w-6 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && <p className="mt-3 text-base text-muted">{t("Not here yet: {shops}.", { shops: missing.join(", ") })}</p>}

      <div className="mt-6 space-y-2.5">
        <Button full variant="secondary" className="min-h-14 text-base" onClick={() => setScanning(true)}><ScanIcon className="h-5 w-5" />{t("Scan a barcode")}</Button>
        <Link href="/app/groceries/search" className="glass inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition active:scale-[0.98] hover:bg-soft-strong">
          <SearchIcon className="h-5 w-5" />{t("Search every shop at once")}
        </Link>
        <Link href="/app/compare?tab=food" className="glass inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition active:scale-[0.98] hover:bg-soft-strong">
          <CompareIcon className="h-5 w-5" />{t("Compare products")}
        </Link>
      </div>

      <p className="mt-8 border-t border-line pt-4 text-sm text-muted">{t("Prices appear only where we've read them from the supermarket's own website. Not affiliated with any supermarket.")}</p>

      <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(code) => { setScanning(false); const c = barcodeQuery(code); if (c) router.push(`/app/groceries/product?code=${c}`); }} />
    </div>
  );
}
