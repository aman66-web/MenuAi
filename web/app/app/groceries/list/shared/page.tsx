"use client";

import { useEffect, useMemo, useState } from "react";
import { addToList, CUSTOM_RETAILER, formatPrice, groupName, itemCode, itemPhotoSources, type ShoppingItem } from "@/lib/mm/groceries";
import { decodePayload, SHARE_PROBLEM } from "@/lib/mm/shareList";
import { shoppingStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { ShopMark } from "../../../_components/ChainMark";
import { BasketIcon, CheckIcon } from "../../../_components/icons";
import { Button, ErrorBox, LinkButton, Spinner } from "../../../_components/ui";
import { useHiddenLogos } from "../../../_lib/hiddenLogos";
import { useT } from "../../../_lib/i18n";
import { useSharedList } from "../../../_lib/sharedList";
import { BackLink, CARD, TITLE } from "../../PageBits";
import { ListThumb } from "../../ProductPhoto";

// A shopping list a friend sent (founder 2026-10-15). It is in the address after the "#" (lib/mm/shareList.ts), which never leaves this phone; the shops' own
// lists give the names, pictures and prices. Read it here, then add it all to your own list. Looks follow the Shopping list: the shop under a small capital
// label in one white card, a picture beside each name, the quantity at the end (here read-only).

/** What follows the "#" in the address, read after the page opens (the address isn't known while it is built) and again if it changes: null when there is none. */
function useHash(): string | null | undefined {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, "") || null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return hash;
}

export default function SharedListPage() {
  const t = useT();
  const hash = useHash();
  const decoded = useMemo(() => (hash === undefined ? undefined : decodePayload(hash ?? "")), [hash]);
  const entries = decoded?.ok ? decoded.entries : null;
  const [retry, setRetry] = useState(0);
  const state = useSharedList(entries, retry);
  useHiddenLogos(); // a shop taken down at its owner's request (public/logos/hidden.json) shows none of its pictures, also when that list arrives after the page opens
  // "Added" belongs to the list that was added: a different link opened in this same page (the "#" changes) starts as not added.
  const [addedFor, setAddedFor] = useState<string | null>(null);
  const added = hash != null && addedFor === hash;

  const back = <BackLink href="/app/groceries/list" label={t("Back to shopping list")} />;
  const heading = <h1 className={`mt-5 ${TITLE}`}>{t("Shared shopping list")}</h1>;

  if (decoded === undefined) return <div>{back}{heading}<Spinner label={t("Opening the list")} /></div>;
  if (!decoded.ok) {
    return (
      <div>
        {back}
        {heading}
        <div className="mt-4"><ErrorBox message={t(SHARE_PROBLEM[decoded.reason], { app: site.name })} /></div>
        <LinkButton href="/app/groceries/list" variant="secondary" full className="mt-4 min-h-12">{t("Back to shopping list")}</LinkButton>
      </div>
    );
  }
  if (state.status === "loading") return <div>{back}{heading}<Spinner label={t("Opening the list")} /></div>;
  if (state.status === "error") return <div>{back}{heading}<div className="mt-4"><ErrorBox message={t("Couldn't open this list. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>;

  const { items, missing } = state;
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of items) groups.set(i.retailer, [...(groups.get(i.retailer) ?? []), i]);
  const addAll = () => {
    shoppingStore.update((list) => items.reduce((l, { qty, addedAt: _addedAt, ...item }) => addToList(l, item, new Date(), qty), list)); // eslint-disable-line @typescript-eslint/no-unused-vars
    setAddedFor(hash ?? null);
  };

  return (
    <div>
      {back}
      {heading}
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("A friend shared this shopping list with you. Add it to yours to tick things off as you shop.")}</p>

      {items.length === 0 ? (
        <div className="mt-4"><ErrorBox message={t("None of the products in this list could be found in the shops' lists any more.")} /></div>
      ) : (
        <>
          {[...groups.entries()].map(([retailer, rows]) => (
            <section key={retailer} aria-label={groupName(retailer, t)} className="mt-7">
              <h2 className="kicker mb-3 flex min-h-7 items-center gap-2.5 ps-1">{retailer !== CUSTOM_RETAILER && <ShopMark shopId={retailer} size="xs" />}{groupName(retailer, t)}</h2>
              <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
                {rows.map((i) => {
                  const detail = [i.brand, i.size, i.price !== undefined ? formatPrice(i.price) : ""].filter(Boolean).join(" · ");
                  return (
                    <li key={itemCode(i) + i.retailer} className="flex min-h-[4.5rem] items-center gap-3 px-3 py-2.5">
                      <ListThumb sources={itemPhotoSources(i)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold leading-snug [overflow-wrap:anywhere]">{i.name}</span>
                        {detail && <span className="app-numbers mt-0.5 block text-sm text-muted [overflow-wrap:anywhere]">{detail}</span>}
                      </span>
                      <span className="app-numbers shrink-0 font-mono text-base" aria-label={t("Quantity {n}", { n: i.qty })}>×{i.qty}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {missing > 0 && <p className="mt-4 px-1 text-sm leading-snug text-muted">{missing === 1 ? t("1 product from this list couldn't be found in the shops' lists any more.") : t("{n} products from this list couldn't be found in the shops' lists any more.", { n: missing })}</p>}

          <div className="mt-7">
            {added ? (
              <>
                <p role="status" className="flex items-center gap-2 px-1 text-base font-semibold text-accent"><CheckIcon className="h-5 w-5" strokeWidth={3} />{t("Added to your shopping list.")}</p>
                <LinkButton href="/app/groceries/list" full className="mt-3 min-h-12 text-base"><BasketIcon className="h-5 w-5" />{t("Open my shopping list")}</LinkButton>
              </>
            ) : (
              <Button full className="min-h-12 text-base" onClick={addAll}>{t("Add all to my shopping list")}</Button>
            )}
          </div>
          <p className="mt-3 px-1 text-sm leading-snug text-muted">{t("Prices are what each shop showed on its website, and they change: check in store.")}</p>
        </>
      )}
    </div>
  );
}
