"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { tk } from "@/lib/mm/i18n";
import { hasMacros } from "@/lib/mm/nutrients";
import { describeOrder, lineFromItem, orderName, orderNutrients } from "@/lib/mm/order";
import { builderHref, chainHref } from "@/lib/mm/routes";
import { addLogEntry, addSavedOrder, countProAction, noteItemViewed } from "@/lib/mm/stores";
import { useGate } from "../_components/Paywall";
import { ChevronLeftIcon, ChevronRightIcon, InfoIcon } from "../_components/icons";
import { ItemPhotoHero } from "../_components/ItemPhoto";
import { AllergenSection } from "../_components/Allergens";
import { ItemHero, NutrientTable } from "../_components/Nutrition";
import { ShareButton } from "../_components/ShareButton";
import { CompareButton } from "../_components/CompareButton";
import { compareDish } from "../_lib/compare";
import { ReportSheet } from "../_components/Submit";
import { Badge, Button, ErrorBox, Spinner } from "../_components/ui";
import { useChain, useMenu } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// SPEC §7.5: name, serving, big calories, then protein/carbs/fat, then the optional nutrients ("not published").
// Kept plain for older users (founder 2026-10-11): calories and protein are the big numbers; the other nutrients open under "More detail".
// Look (founder 2026-10-15, "the rest of the app should match that elegance"): Home's language. One white card for the dish (its
// photo, name and numbers), the allergens, "More detail" opening inside its own card, the chain's note, then the actions: Customise as
// the one black pill, Log, Save and Share as white pills side by side, and Compare under them.

/**
 * Log, Save and Share: three to a row; at large text Log and Save side by side and Share under them, full width (ShareButton's button
 * sits in a `display: contents` wrapper, so it is the grid item).
 */
const ACTIONS = "grid grid-cols-2 gap-2.5 [&>div:last-child>button]:col-span-2 @min-[22rem]:grid-cols-3 @min-[22rem]:[&>div:last-child>button]:col-span-1";

export function ItemScreen({ chainId, itemId }: { chainId: string; itemId: string }) {
  const t = useT();
  const router = useRouter();
  const { gate } = useGate();
  const menu = useMenu();
  const { status, index, error, retry } = useChain(chainId);
  const [message, setMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [detail, setDetail] = useState(false);
  const found = status === "ready" && !!index?.items.get(itemId);
  useEffect(() => { if (found) noteItemViewed(chainId, itemId); }, [found, chainId, itemId]); // "Recently viewed" on the restaurant's page for a day

  const back = (
    <Link href={chainHref(chainId)} aria-label={t("Back to menu")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
  );
  if (status === "loading") return (<div>{back}<Spinner label={t("Loading item")} /></div>);
  if (status === "error" || !index) return (<div>{back}<ErrorBox message={error ? t(error) : t("Couldn't load this menu.")} onRetry={retry} /></div>);

  const item = index.items.get(itemId);
  if (!item) return (<div>{back}<ErrorBox message={t("That item is no longer on the menu.")} /></div>);
  const { chain } = index;
  const line = lineFromItem(index, item.id);
  const lines = line ? [line] : [];
  const description = describeOrder(index, lines) || item.name;

  return (
    <div>
      {back}
      <div className="mt-4">
        <ItemHero nutrients={item.nutrients} name={item.name} media={<ItemPhotoHero image={item.image} chainName={chain.name} />}>
          <Link href={chainHref(chain.id)} className="kicker -my-2 inline-flex min-h-11 items-center hover:text-foreground">{chain.name}</Link>
          <h1 className="mt-1.5 text-[2rem] font-[800] leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]">{item.name}</h1>
          {(item.serving || item.category || item.limitedTime || chain.sample) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[0.9375rem] text-muted">
              {item.serving && <span>{item.serving}</span>}
              {item.category && <Badge>{item.category}</Badge>}
              {item.limitedTime && <Badge>{t("Limited time")}</Badge>}
              {chain.sample && <Badge>{t("Sample data")}</Badge>}
            </div>
          )}
        </ItemHero>
      </div>

      <div className="mt-3.5"><AllergenSection chain={chain} allergens={item.allergens} itemName={item.name} /></div>

      {/* "More detail" opens inside its own card: one box, not two. */}
      <div className="glass mt-3.5 overflow-hidden rounded-[1.25rem]">
        <button type="button" aria-expanded={detail} aria-controls="more-detail" onClick={() => setDetail((d) => !d)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-[var(--fill)] active:bg-[var(--fill)]">
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-[800] leading-snug tracking-[-0.01em]">{t("More detail")}</span>
            <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{t("Saturated fat, salt, sugar and fibre")}</span>
          </span>
          <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft-strong">
            <ChevronRightIcon className={`h-[18px] w-[18px] transition-transform ${detail ? "-rotate-90" : "rotate-90"}`} />
          </span>
        </button>
        {detail && <div id="more-detail" className="border-t border-line px-4"><NutrientTable bare nutrients={item.nutrients} /></div>}
      </div>

      {chain.note && (
        <p className="mt-5 flex gap-2.5 px-1 text-[0.9375rem] leading-snug text-muted">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{chain.note}</span>
        </p>
      )}

      {/* The actions: one black pill for the main one, the rest as white pills. */}
      {hasMacros(item.nutrients) ? (
        <div className="@container mt-6">
          <Button
            full
            className="min-h-12 text-base"
            onClick={() =>
              gate("orderBuilder", () => {
                analytics.track({ name: "builderOpened", origin: "item" });
                router.push(builderHref({ chain: chain.id, item: item.id }));
              })
            }
          >
            {t("Customise")}
          </Button>
          <div className={`mt-2.5 ${ACTIONS}`}>
            <Button
              variant="secondary"
              full
              onClick={() =>
                gate("log", () => {
                  addLogEntry({ chainId: chain.id, chainName: chain.name, name: item.name, nutrients: item.nutrients, source: "item" });
                  analytics.track({ name: "mealLogged" });
                  countProAction();
                  setMessage(tk("Logged to Today."));
                })
              }
            >
              {t("Log")}
            </Button>
            <Button
              variant="secondary"
              full
              onClick={() =>
                gate("saveLimit", () => {
                  const total = orderNutrients(index, lines) ?? item.nutrients;
                  addSavedOrder({ chainId: chain.id, chainName: chain.name, name: orderName(index, lines) || item.name, lines, nutrients: total, dataVersionAtSave: menu.dataVersion ?? 0 });
                  analytics.track({ name: "orderSaved" });
                  countProAction();
                  setMessage(tk("Saved."));
                })
              }
            >
              {t("Save")}
            </Button>
            <ShareButton full chainName={chain.name} orderName={item.name} description={description} nutrients={item.nutrients} />
          </div>
          {/* Empty (and no height) until something is logged or saved; it stays in the page so a screen reader hears it. */}
          <p role="status" aria-live="polite" className="mt-2.5 text-center text-sm font-semibold text-accent empty:mt-0">{message && t(message)}</p>
          <div className="mt-2.5"><CompareButton full item={compareDish(chain, item)} /></div>
        </div>
      ) : (
        <>
          <p className="mt-6 px-1 text-[0.9375rem] leading-snug text-muted">{t("{chain} publishes calories only, so ordering, saving, logging and sharing aren't available for this item (they need protein, carbs and fat).", { chain: chain.name })}</p>
          <div className="mt-3"><CompareButton full item={compareDish(chain, item)} /></div>
        </>
      )}

      <p className="mt-6 px-1 text-sm leading-snug text-muted">
        {t("Not affiliated with {chain}.", { chain: chain.name })}{" "}
        <button type="button" className="min-h-11 font-semibold text-accent underline decoration-[color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-[3px]" onClick={() => setReporting(true)}>{t("Report a number")}</button>
      </p>

      <ReportSheet
        open={reporting}
        onClose={() => setReporting(false)}
        target={{ chainId: chain.id, chainName: chain.name, items: chain.items, item, ...(menu.dataVersion ? { dataVersion: menu.dataVersion } : {}) }}
      />
    </div>
  );
}
