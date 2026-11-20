"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { barcodeQuery, RETAILERS } from "@/lib/mm/groceries";
import { parseShops, pickedShopsHref, toggleShop } from "@/lib/mm/shopPick";
import { CompareIcon, PodiumIcon, ScanIcon, SearchIcon } from "../_components/icons";
import { ShopMark } from "../_components/ChainMark";
import { chainGroupClass } from "../_components/ChainRow";
import { Shortcut } from "../_components/Shortcut";
import { PageHeader } from "../_components/PageHeader";
import { ChoiceMark, Spinner } from "../_components/ui";
import { useSettings } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { useShopManifest } from "../_lib/shopProducts";
import { CARD, FootNote, HEADING } from "./PageBits";
import { Scanner } from "./Scanner";

// Groceries puts its tools first, laid out like Eat out (founder 2026-11-17: the tools at the bottom were being ignored): the white "Search every shop
// at once" pill, then one card of Eat out's shortcut rows (every icon in lime: Scan a barcode; Nutrition leaderboards; Compare products), so they
// work at once even while the shop list loads. Then the unchanged plain question, "Which shop?" (founder 2026-10-11: simple enough for a 90-year-old).
// Each big tile opens that shop's own list: every product its pages showed, with its own photo and price, and the numbers where we have them. The person's
// own shops (onboarding, Settings) come first, in the same two-across tiles as the rest (founder 2026-11-18: "there's no point having like your shop. You can
// just get rid of that thing": no "Your shop" tag, so no wide tile for it either). Looks follow Home (founder 2026-10-15): the compact title, white tiles two across, no chevrons on tiles.
// The colour meeting (19 November 2026, approved by the founder that day): the same header as every tab (PageHeader: the title, the Shopping list pill, the cog
// with its word); the search looks like a field (white, the control edge); a shop's Select is a choice: white with the edge and an empty tick ring, and once
// chosen "Selected" in lime with the dark-green edge and a tick, the tile framed in the same dark green (chosen is shown on the control and the frame, never as
// a lime card); the button at the foot is the ink main button on a solid band of the page's grey.

/** Two tiles side by side, one above the other when the text is large (the minimum width is in rem, so it grows with the text size). */
const PICK_KEY = "mm.groceryPick";
const PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3.5";

export default function GroceriesPage() {
  const t = useT();
  const poss = usePossessive();
  const router = useRouter();
  const settings = useSettings();
  const lists = useShopManifest();
  const [scanning, setScanning] = useState(false);
  // the shops ticked with "Select" (founder 2026-11-17), kept for this browser tab so coming Back from the shops' page finds them still ticked
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { try { setPicked(parseShops(sessionStorage.getItem(PICK_KEY))); } catch { /* storage unavailable: start with none */ } }, []); // eslint-disable-line react-hooks/set-state-in-effect -- restoring a per-tab choice after hydration
  const pick = (id: string) => setPicked((cur) => { const next = toggleShop(cur, id); try { sessionStorage.setItem(PICK_KEY, next.join(",")); } catch { /* ignore */ } return next; });
  const mine = settings.shops ?? [];
  const order = (id: string) => (mine.includes(id) ? mine.indexOf(id) : 100 + RETAILERS.findIndex((r) => r.id === id));
  const shops = lists ? [...lists.retailers].sort((a, b) => order(a.id) - order(b.id)) : null;
  const pickedNames = picked.map((id) => lists?.retailers.find((r) => r.id === id)?.name ?? RETAILERS.find((r) => r.id === id)?.name ?? id);
  const pickedLabel = pickedNames.length === 1 ? t("See {shop} products", { shop: poss(pickedNames[0]!) })
    : pickedNames.length === 2 ? t("See products from {shops}", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(pickedNames) })
    : t("See products from {n} shops", { n: pickedNames.length });
  const missing = lists ? RETAILERS.filter((r) => !lists.retailers.some((x) => x.id === r.id)).map((r) => r.name) : [];

  return (
    <div>
      {/* the title, then the shopping list and the Settings cog at the top right, as on every tab (founder 2026-11-19); it wraps, so at large text the pill and
          the cog move under the title instead of breaking the word "Groceries" */}
      <PageHeader title={t("Groceries")} list />
      {/* what this tab is for, in one line (founder 2026-11-18: "everyone needs to understand the point for each screen") */}
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Supermarket food, with its price and the calories and protein on its label.")}</p>

      <Link href="/app/groceries/search" className="mt-5 flex min-h-[3.25rem] items-center gap-3 rounded-[1.625rem] border-[1.5px] border-edge bg-card px-5 text-muted transition hover:bg-background active:scale-[0.99]">
        <SearchIcon className="h-5 w-5 shrink-0 text-ink" />
        <span className="min-w-0 flex-1 py-3 text-base leading-snug [overflow-wrap:anywhere]">{t("Search every shop at once")}</span>
      </Link>

      <div className={`mt-3.5 ${chainGroupClass}`}>
        <Shortcut coach="groceries-scan" onClick={() => setScanning(true)} icon={<ScanIcon />} title={t("Scan a barcode")} line={t("Look up a product you're holding")} />
        {/* founder 2026-11-18: "instead of having like cheapest protein, have something called nutritional leaderboards" (Cheapest protein is one of the boards) */}
        <Shortcut href="/app/groceries/leaderboards" icon={<PodiumIcon />} title={t("Nutrition leaderboards")} line={t("The top 20 products for protein, fibre and more")} />
        <Shortcut href="/app/compare?tab=food" icon={<CompareIcon />} title={t("Compare products")} line={t("Put products side by side, even from different shops")} />
      </div>

      <h2 className={`mt-8 ${HEADING}`}>{t("Which shop?")}</h2>
      <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Tap a shop to see its products, prices and photos.")}</p>

      {!shops ? (
        <Spinner label={t("Loading products")} />
      ) : (
        <ul data-coach="groceries-shops" className={`mt-4 ${PAIR}`}>
          {shops.map((r) => (
            <li key={r.id} className="@container relative flex">
              {/* the shop's name, then its count. When a tile has the whole row (large text: one tile a row) the logo sits beside the words instead of
                  above them, so the tiles stay short */}
              <Link href={`/app/groceries/shop?r=${r.id}`} prefetch={false} className={`${CARD} lift flex w-full flex-col items-start p-4 pb-[4.25rem] [overflow-wrap:anywhere] @[300px]:flex-row @[300px]:items-center @[300px]:gap-4 ${picked.includes(r.id) ? "border-on-sun shadow-[0_0_0_1px_var(--on-sun)]" : ""}`}>
                <ShopMark shopId={r.id} size="md" />
                <span className="mt-4 block min-w-0 @[300px]:mt-0">
                  <span className="block text-lg font-[800] leading-snug tracking-[-0.01em]">{r.name}</span>
                  <span className="app-numbers mt-0.5 block text-[0.9375rem] leading-snug text-muted">{r.count === 1 ? t("1 product") : t("{n} products", { n: r.count.toLocaleString("en-GB") })}</span>
                </span>
              </Link>
              {/* "Select" at the tile's bottom right (a separate button beside the link, never inside it): ticks the shop for the button at the foot of the screen. Its words are
                  visible; the shop's name is spoken after them ("Select Tesco"), so the name always contains what is drawn. */}
              <button type="button" aria-pressed={picked.includes(r.id)} onClick={() => pick(r.id)} className={`absolute bottom-3 end-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] ps-3 pe-3.5 text-[0.9375rem] transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${picked.includes(r.id) ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card font-semibold text-foreground hover:bg-background"}`}>
                <ChoiceMark on={picked.includes(r.id)} />
                <span>{picked.includes(r.id) ? t("Selected") : t("Select")}</span>
                <span className="sr-only"> {r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && <p className="mt-3.5 text-[0.9375rem] leading-snug text-muted">{t("Not here yet: {shops}.", { shops: missing.join(", ") })}</p>}

      <FootNote>{t("Prices appear only where we've read them from the supermarket's own website. Not affiliated with any supermarket.")}</FootNote>

      {picked.length > 0 && (
        // At the foot of the screen, just above the tab bar (founder 2026-11-18: "maybe the go button should be shown instead at the bottom"), where the thumb is
        // after ticking shops further down, on a strip of the page's grey that the list slides under. The button says what it opens (founder 2026-11-18: everyone
        // should understand each screen): one shop's products, or the chosen shops' products together.
        <div className="sticky bottom-0 z-20 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-4">
          <p role="status" aria-live="polite" className="app-numbers mb-2 text-center text-[0.9375rem] font-semibold text-muted">{picked.length === 1 ? t("1 shop selected") : t("{n} shops selected", { n: picked.length })}</p>
          <Link href={pickedShopsHref(picked)} className="flex min-h-14 w-full items-center justify-center rounded-full bg-ink px-5 text-center text-lg font-bold leading-snug text-on-ink transition hover:bg-ink-pressed active:scale-[0.97] active:bg-ink-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {pickedLabel}
          </Link>
        </div>
      )}

      <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(code) => { setScanning(false); const c = barcodeQuery(code); if (c) router.push(`/app/groceries/product?code=${c}`); }} />
    </div>
  );
}
