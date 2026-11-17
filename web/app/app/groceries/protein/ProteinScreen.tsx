"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PAID_ACCESS_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import { FREE_LEADERBOARD_ROWS } from "@/lib/mm/paid";
import { formatPrice } from "@/lib/mm/groceries";
import { recipeShops, shopPhotoSources, type ShopFile } from "@/lib/mm/shopProducts";
import type { PhotoSource } from "@/lib/mm/groceries";
import { cheapestProtein, comparePair, costOf100gProtein, CURATED_PAIRS, proteinValue, type ProteinValue } from "@/lib/mm/truth/proteinValue";
import { MenuSourcesLink } from "../../_components/MenuSourcesLink";
import { useGate } from "../../_components/Paywall";
import { Button, EmptyState, ErrorBox, Spinner } from "../../_components/ui";
import { useIsPro } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { BasketIcon } from "../../_components/icons";
import { ListThumb, usePhotoSource } from "../ProductPhoto";
import { BackLink, CARD, FootNote, HEADING, TITLE } from "../PageBits";

/** True in the free iPhone app's copy (build-time constant): no paid tier there, so the locked-list button and its words are left out of the app's files (App Store 3.1.1, App Review 2.3.1). */
const FREE_APP = process.env.NEXT_PUBLIC_APP_BUILD === "1" && process.env.NEXT_PUBLIC_IAP !== "1";

// "Cheapest protein" (founder's brief, 13 Nov 2026, "Supermarket Truth Compare" and "Cheapest Protein Leaderboard"): what 10 g of protein costs at a shop, from each
// product's own label and shelf price (lib/mm/truth/proteinValue.ts), ranked, and a few "sold on its protein or everyday?" pairs. It says what things cost and
// nothing about whether a food is good or bad: neutral words, numbers only (CLAUDE.md rule 3).

const TOP = 20;
const pence = (v: number) => `${v.toFixed(1)}p`;
const productHref = (shop: string, id: string) => `/app/groceries/shop/item?r=${encodeURIComponent(shop)}&id=${encodeURIComponent(id)}`;

function ValueLine({ v }: { v: ProteinValue }) {
  const t = useT();
  const unit = v.product.unit === "per litre" ? t("a litre") : t("a kg");
  return (
    <span className="app-numbers block text-[0.8125rem] leading-snug text-muted">
      {formatPrice(v.product.unitPrice ?? 0)} {unit} · {v.proteinPer100} g {t("protein per 100")} {v.per}
    </span>
  );
}

/** One side of a pair: the shop's own photo of the product, its name, and what 10 g of protein costs in it. The cheaper side gets a lime ring and says so (price only). */
function PairSide({ file, v, label, cheaper }: { file: ShopFile; v: ProteinValue; label: string; cheaper: boolean }) {
  const t = useT();
  return (
    <div className={`flex min-w-0 flex-col rounded-[1.25rem] p-3 ${cheaper ? "bg-white ring-2 ring-[var(--bar)]" : "bg-[var(--fill)]"}`}>
      {/* the same height on both sides, so the two photos and prices line up */}
      <span className="block min-h-[2.25rem] text-[0.75rem] font-bold uppercase leading-snug tracking-wide text-muted">{label}</span>
      <span className="relative mt-1 block">
        <PairPhoto sources={shopPhotoSources(file, v.product)} />
        {cheaper && <span className="absolute start-2 top-2 rounded-full bg-[var(--sun)] px-2.5 py-1 text-[0.75rem] font-extrabold text-[var(--on-accent)] shadow-sm">{t("Cheaper")}</span>}
      </span>
      <Link href={productHref(file.retailer, v.product.id)} className="mt-2 line-clamp-3 min-h-11 text-[0.9375rem] font-bold leading-snug [overflow-wrap:anywhere] hover:underline">{v.product.name}</Link>
      <p className="app-numbers mt-auto pt-2 text-[1.75rem] font-extrabold leading-none tracking-tight">{pence(v.pence10g)}</p>
      <p className="mt-1 text-[0.8125rem] font-semibold leading-snug text-muted">{t("for 10 g of protein")}</p>
      <span className="mt-1.5"><ValueLine v={v} /></span>
    </div>
  );
}

/** The product's picture in a pair, square, on white; a quiet tile when no picture loads. Decorative: the name is the link beside it. */
function PairPhoto({ sources }: { sources: readonly PhotoSource[] }) {
  const { current, fail } = usePhotoSource(sources);
  return (
    <span aria-hidden className="grid aspect-square w-full place-items-center overflow-hidden rounded-[1rem] bg-white">
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- the supermarket's own product picture (or our stored copy of it), decorative
        <img key={current.src} src={current.src} alt="" width={160} height={160} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} className="h-full w-full object-contain p-2" />
      ) : (
        <BasketIcon className="h-7 w-7 text-muted" />
      )}
    </span>
  );
}

function PairCard({ file, title, branded, everyday }: { file: ShopFile; title: string; branded: ProteinValue; everyday: ProteinValue }) {
  const t = useT();
  const r = comparePair(branded, everyday);
  return (
    <li className={`${CARD} p-4`}>
      <h3 className="text-lg font-extrabold leading-snug tracking-tight">{t(title)}</h3>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <PairSide file={file} v={branded} label={t("Sold on its protein")} cheaper={r.saving > 0 && r.cheaper === branded} />
        <PairSide file={file} v={everyday} label={t("Everyday")} cheaper={r.saving > 0 && r.cheaper === everyday} />
      </div>
      {r.saving > 0 ? (
        <div className="truth-bounce mt-3 rounded-[1.25rem] bg-[var(--sun)] px-4 py-3.5 text-center text-[var(--tl-ink)]">
          <p className="text-[1.375rem] font-extrabold leading-tight tracking-tight">{t("Save {amount} on every 100 g of protein", { amount: formatPrice(r.saving) })}</p>
          <p className="app-numbers mt-1 text-[0.875rem] font-semibold">{t("100 g of protein costs {a} in one and {b} in the other.", { a: formatPrice(costOf100gProtein(r.cheaper)), b: formatPrice(costOf100gProtein(r.dearer)) })}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-[1.25rem] bg-[var(--fill)] px-4 py-3 text-center text-lg font-bold">{t("They cost the same for the protein.")}</p>
      )}
    </li>
  );
}

/** One row of the list: its place, the shop's photo, the name and the label's numbers, and what 10 g of protein costs as a pill on the right. */
function BoardRow({ file, v, rank }: { file: ShopFile; v: ProteinValue; rank: number }) {
  const t = useT();
  return (
    <li>
      <Link href={productHref(file.retailer, v.product.id)} className="flex min-h-[5.5rem] items-center gap-3 px-3.5 py-3 transition hover:bg-[var(--fill)] active:bg-[var(--fill)]">
        <span aria-hidden className={`app-numbers grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.9375rem] font-extrabold ${rank <= 3 ? "bg-[var(--sun)] text-[var(--on-accent)]" : "bg-[var(--fill)] text-muted"}`}>{rank}</span>
        <ListThumb sources={shopPhotoSources(file, v.product)} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[0.9375rem] font-bold leading-snug [overflow-wrap:anywhere]"><span className="sr-only">{rank}. </span>{v.product.name}</span>
          <span className="mt-0.5 block"><ValueLine v={v} /></span>
        </span>
        <span className="app-numbers shrink-0 rounded-[0.875rem] bg-[var(--fill)] px-2.5 py-2 text-center">
          <span className="block text-[1.125rem] font-extrabold leading-none tracking-tight">{pence(v.pence10g)}</span>
          <span className="mt-1 block text-[0.75rem] font-semibold text-muted">{t("per 10 g")}</span>
        </span>
      </Link>
    </li>
  );
}

export function ProteinScreen() {
  const t = useT();
  const pro = useIsPro();
  const { showPaywall } = useGate();
  const gated = !FREE_APP && PAID_ACCESS_ENABLED && !pro; // free tier (only when paid access exists): the first five rows
  const manifest = useShopManifest();
  const shops = recipeShops(manifest);
  const shop = shops[0] ?? null;
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop?.id ?? null, retry);

  const top = useMemo(() => (state.status === "ready" ? cheapestProtein(state.products, TOP) : []), [state]);
  const pairs = useMemo(() => {
    if (state.status !== "ready") return [];
    const byId = new Map(state.products.map((p) => [p.id, p]));
    return CURATED_PAIRS.flatMap((c) => {
      const a = byId.get(c.branded);
      const b = byId.get(c.everyday);
      const va = a && proteinValue(a);
      const vb = b && proteinValue(b);
      return va && vb ? [{ id: c.id, title: c.title, branded: va, everyday: vb }] : [];
    });
  }, [state]);

  const head = (
    <>
      <BackLink href="/app/groceries" label={t("Back to groceries")} />
      <h1 className={`mt-4 ${TITLE}`}>{t("Cheapest protein")}</h1>
    </>
  );

  if (manifest === null) return (<div>{head}<Spinner /></div>);
  if (!shop) {
    return (
      <div>
        {head}
        <EmptyState title={t("No prices to compare yet")} body={t("We haven't read the nutrition labels of any shop's products yet.")} />
      </div>
    );
  }
  if (state.status === "loading") return (<div>{head}<Spinner label={t("Loading products")} /></div>);
  if (state.status === "error") return (<div>{head}<div className="mt-4"><ErrorBox message={t("Couldn't load the products.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>);

  return (
    <div>
      {head}
      <p className="mt-2.5 text-base leading-snug">
        {t("What 10 g of protein costs at {shop}, worked out from each product's own label and shelf price.", { shop: shop.name })}
      </p>
      {/* App Review 1.4.1: the line for a "protein food" is Numbite's own; the menu sources sheet says so. */}
      <MenuSourcesLink className="mt-1" />

      {pairs.length > 0 && (
        <section aria-labelledby="pairs-heading" className="mt-6">
          <h2 id="pairs-heading" className={HEADING}>{t("Sold on its protein, or everyday?")}</h2>
          <ul className="mt-3 space-y-3">
            {pairs.map((p) => <PairCard key={p.id} file={state.file} title={p.title} branded={p.branded} everyday={p.everyday} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="board-heading" className="mt-8">
        <h2 id="board-heading" className={HEADING}>{t("The {n} cheapest protein foods", { n: top.length })}</h2>
        <ol className={`${CARD} mt-3 divide-y divide-line overflow-hidden`}>
          {top.slice(0, gated ? FREE_LEADERBOARD_ROWS : top.length).map((v, i) => <BoardRow key={v.product.id} file={state.file} v={v} rank={i + 1} />)}
        </ol>
        {gated && top.length > FREE_LEADERBOARD_ROWS && (
          <Button size="lg" full variant="secondary" className="mt-3" onClick={() => showPaywall("leaderboard")}>{t("Unlock the other {n}", { n: top.length - FREE_LEADERBOARD_ROWS })}</Button>
        )}
      </section>

      <FootNote>
        {t("Prices are what {shop} showed on {date} and they change. Foods are measured as sold, so dried foods such as lentils cook up heavier. This compares the price of protein only, and says nothing else about a food. Not affiliated with {shop}.", { shop: shop.name, date: formatDate(state.file.checkedOn, t) })}
      </FootNote>
    </div>
  );
}
