"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PAID_ACCESS_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import { FREE_LEADERBOARD_ROWS } from "@/lib/mm/paid";
import { formatPrice } from "@/lib/mm/groceries";
import { recipeShops } from "@/lib/mm/shopProducts";
import { cheapestProtein, comparePair, costOf100gProtein, CURATED_PAIRS, proteinValue, type ProteinValue } from "@/lib/mm/truth/proteinValue";
import { MenuSourcesLink } from "../../_components/MenuSourcesLink";
import { useGate } from "../../_components/Paywall";
import { Button, EmptyState, ErrorBox, Spinner } from "../../_components/ui";
import { useIsPro } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
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
    <span className="app-numbers block text-base leading-snug text-muted">
      {formatPrice(v.product.unitPrice ?? 0)} {unit} · {v.proteinPer100} g {t("protein per 100")} {v.per}
    </span>
  );
}

function PairCard({ shop, title, branded, everyday }: { shop: string; title: string; branded: ProteinValue; everyday: ProteinValue }) {
  const t = useT();
  const r = comparePair(branded, everyday);
  return (
    <li className={`${CARD} p-4`}>
      <h3 className="text-xl font-extrabold leading-snug tracking-tight">{t(title)}</h3>
      <div className="mt-3 space-y-2.5">
        {[{ v: branded, label: t("Sold on its protein") }, { v: everyday, label: t("Everyday") }].map(({ v, label }) => (
          <div key={v.product.id + label} className="rounded-[1.25rem] bg-[var(--fill)] p-3.5">
            <p className="text-base font-bold uppercase tracking-wide text-muted">{label}</p>
            <Link href={productHref(shop, v.product.id)} className="mt-0.5 block min-h-11 text-lg font-bold leading-snug underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] underline-offset-4 [overflow-wrap:anywhere]">{v.product.name}</Link>
            <p className="app-numbers text-3xl font-extrabold leading-tight tracking-tight">{pence(v.pence10g)} <span className="text-base font-semibold text-muted">{t("for 10 g of protein")}</span></p>
            <ValueLine v={v} />
          </div>
        ))}
      </div>
      {r.saving > 0 ? (
        <p className="truth-bounce mt-3 rounded-[1.25rem] bg-[var(--sun)] px-4 py-4 text-center text-3xl font-extrabold leading-tight tracking-tight text-[var(--tl-ink)]">
          {t("Save {amount} on every 100 g of protein", { amount: formatPrice(r.saving) })}
        </p>
      ) : (
        <p className="mt-3 rounded-[1.25rem] bg-[var(--fill)] px-4 py-3 text-lg font-bold">{t("They cost the same for the protein.")}</p>
      )}
      <p className="app-numbers mt-2.5 text-base leading-snug text-muted">
        {t("100 g of protein: {a} from {cheap}, {b} from {dear}.", { a: formatPrice(costOf100gProtein(r.cheaper)), cheap: r.cheaper.product.name, b: formatPrice(costOf100gProtein(r.dearer)), dear: r.dearer.product.name })}
      </p>
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
            {pairs.map((p) => <PairCard key={p.id} shop={shop.id} title={p.title} branded={p.branded} everyday={p.everyday} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="board-heading" className="mt-8">
        <h2 id="board-heading" className={HEADING}>{t("The {n} cheapest protein foods", { n: top.length })}</h2>
        <ol className={`${CARD} mt-3 divide-y divide-line overflow-hidden`}>
          {top.slice(0, gated ? FREE_LEADERBOARD_ROWS : top.length).map((v, i) => (
            <li key={v.product.id}>
              <Link href={productHref(shop.id, v.product.id)} className="flex min-h-[4.75rem] items-center gap-3.5 px-4 py-3 transition hover:bg-[var(--fill)] active:bg-[var(--fill)]">
                <span aria-hidden className="app-numbers w-8 shrink-0 text-center text-2xl font-extrabold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]"><span className="sr-only">{i + 1}. </span>{v.product.name}</span>
                  <ValueLine v={v} />
                </span>
                <span className="app-numbers shrink-0 text-end">
                  <span className="block text-2xl font-extrabold leading-none tracking-tight">{pence(v.pence10g)}</span>
                  <span className="block text-sm font-semibold text-muted">{t("per 10 g")}</span>
                </span>
              </Link>
            </li>
          ))}
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
