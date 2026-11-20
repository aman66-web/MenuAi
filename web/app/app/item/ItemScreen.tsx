"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { needsPaywall } from "@/lib/mm/entitlements";
import { tk } from "@/lib/mm/i18n";
import { hasMacros } from "@/lib/mm/nutrients";
import { describeOrder, lineFromItem, orderName, orderNutrients } from "@/lib/mm/order";
import { builderHref, chainHref } from "@/lib/mm/routes";
import { addLogEntry, addSavedOrder, countProAction, noteItemViewed } from "@/lib/mm/stores";
import { useGate } from "../_components/Paywall";
import { PremiumBadge } from "../_components/PremiumBadge";
import { HeartIcon, ChevronRightIcon, InfoIcon, PlusIcon } from "../_components/icons";
import { PageHeader } from "../_components/PageHeader";
import { Toast } from "../_components/Toast";
import { ItemPhotoHero } from "../_components/ItemPhoto";
import { AllergenSection } from "../_components/Allergens";
import { ItemHero, NutrientTable } from "../_components/Nutrition";
import { TruthButton } from "../_components/truth/TruthButton";
import { ShareButton } from "../_components/ShareButton";
import { CompareButton } from "../_components/CompareButton";
import { compareDish } from "../_lib/compare";
import { ReportSheet } from "../_components/Submit";
import { Badge, Button, ErrorBox, Spinner } from "../_components/ui";
import { useChain, useIsPro, useMenu } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// SPEC §7.5: name, serving, big calories, then protein/carbs/fat, then the optional nutrients ("not published").
// Kept plain for older users (founder 2026-10-11): calories and protein are the big numbers; the other nutrients open under "More detail".
// Look (founder 2026-10-15, "the rest of the app should match that elegance"): Home's language. Top to bottom: one white card for the
// dish (its photo, name and numbers); "See the truth" (a row with a line under it, then the Smart Swap pill); the actions right under
// the numbers, so logging a dish needs no long scroll: Customise as the one black pill, then Log, Save, Share and Compare as white pills,
// two by two (ShareButton and CompareButton sit in `display: contents` wrappers, so their buttons are the grid's items and their notes
// take a whole row after it); then the allergens, "More detail" opening inside its own card, and the chain's note.
// Since the colour meeting (19 November 2026; approved by the founder that day): the header every page has (Back, the Settings cog), the restaurant's
// name as an underlined link, "Add to today" the one ink button and the rest white, and what a tap did as the app's one toast.

export function ItemScreen({ chainId, itemId }: { chainId: string; itemId: string }) {
  const t = useT();
  const router = useRouter();
  const { gate } = useGate();
  // Premium's badge on a paid action, only where a tap would open the paywall (a build that sells it; the paid tier keeps both free)
  const pro = useIsPro();
  const logPaid = needsPaywall("log", { pro });
  const builderPaid = needsPaywall("orderBuilder", { pro });
  const menu = useMenu();
  const { status, index, error, retry } = useChain(chainId);
  const [message, setMessageText] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const setMessage = (m: string | null) => { setMessageText(m); if (m) setToastKey((k) => k + 1); };
  const [reporting, setReporting] = useState(false);
  const [detail, setDetail] = useState(false);
  const found = status === "ready" && !!index?.items.get(itemId);
  useEffect(() => { if (found) noteItemViewed(chainId, itemId); }, [found, chainId, itemId]); // "Recently viewed" on the restaurant's page for a day

  // the header every page has (colour meeting, 19 November 2026): Back goes to the page before (the menu, Search, Today, a recipe...) when there is one in
  // the app, else the restaurant's menu; the Settings cog far right
  const back = <PageHeader back={{ href: chainHref(chainId), label: t("Back to menu") }} />;
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
          {/* the restaurant's name, a link back to its menu: sentence case, in the link green and underlined, as every link is */}
          <Link href={chainHref(chain.id)} className="-my-2 inline-flex min-h-11 items-center text-[0.9375rem] font-semibold text-accent underline decoration-[color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-[3px] hover:decoration-current">{chain.name}</Link>
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

      <div className="mt-3.5"><TruthButton chain={chain} item={item} /></div>

      {/* The actions, right under the numbers: one black pill for the main one, the rest as white pills, two by two. */}
      {hasMacros(item.nutrients) ? (
        <div className="@container mt-5">
          {/* founder 2026-11-18 ("everyone needs to understand the point for each screen"): the one big button adds the dish to today's food; changing the
              order (the builder) is one of the smaller buttons, called what it does */}
          <Button
            full
            className="min-h-12 text-base"
            onClick={() =>
              gate("log", () => {
                // the dish's photo goes with the entry, so Home and Today can show it (lib/mm/user-data.ts LogEntry.image)
                addLogEntry({ chainId: chain.id, chainName: chain.name, name: item.name, nutrients: item.nutrients, source: "item", ...(item.image ? { image: item.image } : {}) });
                analytics.track({ name: "mealLogged" });
                countProAction();
                setMessage(tk("Added to today's food."));
              })
            }
          >
            <PlusIcon aria-hidden className="h-5 w-5" />
            {t("Add to today")}
            {logPaid && <PremiumBadge onInk />}
          </Button>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 @max-[14rem]:grid-cols-1">
            <Button
              variant="secondary"
              full
              className={builderPaid ? "flex-wrap" : undefined}
              onClick={() =>
                gate("orderBuilder", () => {
                  analytics.track({ name: "builderOpened", origin: "item" });
                  router.push(builderHref({ chain: chain.id, item: item.id }));
                })
              }
            >
              {t("Change the order")}
              {builderPaid && <PremiumBadge />}
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
                  setMessage(tk("Saved to My meals."));
                })
              }
            >
              {/* the heart, as on recipes: one sign for keeping something in My meals */}
              <HeartIcon aria-hidden className="h-5 w-5" />
              {t("Save")}
            </Button>
            <ShareButton full chainName={chain.name} orderName={item.name} description={description} nutrients={item.nutrients} />
            <CompareButton full item={compareDish(chain, item)} />
          </div>
        </div>
      ) : (
        // a calories-only dish is added and saved with its calories alone (usability test 2026-11-19: Elsie, who counts calories, could neither log nor keep
        // a Pizza Express dish); its protein, carbs and fat stay absent, never 0. Changing the order and the share card still need all three.
        <div className="@container mt-5">
          <Button full className="min-h-12 text-base" onClick={() => gate("log", () => {
            addLogEntry({ chainId: chain.id, chainName: chain.name, name: item.name, nutrients: item.nutrients, source: "item", ...(item.image ? { image: item.image } : {}) });
            analytics.track({ name: "mealLogged" });
            countProAction();
            setMessage(tk("Added to today's food."));
          })}>
            <PlusIcon aria-hidden className="h-5 w-5" />
            {t("Add to today")}
            {logPaid && <PremiumBadge onInk />}
          </Button>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 @max-[14rem]:grid-cols-1">
            <Button variant="secondary" full onClick={() => gate("saveLimit", () => {
              addSavedOrder({ chainId: chain.id, chainName: chain.name, name: item.name, lines, nutrients: item.nutrients, dataVersionAtSave: menu.dataVersion ?? 0 });
              analytics.track({ name: "orderSaved" });
              countProAction();
              setMessage(tk("Saved to My meals."));
            })}>
              <HeartIcon aria-hidden className="h-5 w-5" />
              {t("Save")}
            </Button>
            <CompareButton full item={compareDish(chain, item)} />
          </div>
          <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("{chain} publishes calories only, so only the calories are counted.", { chain: chain.name })}</p>
        </div>
      )}

      <div className="mt-3.5"><AllergenSection chain={chain} allergens={item.allergens} itemName={item.name} /></div>

      {/* "More detail" opens inside its own card: one box, not two. */}
      <div className="glass mt-3.5 overflow-hidden rounded-[1.25rem]">
        <button type="button" aria-expanded={detail} aria-controls="more-detail" onClick={() => setDetail((d) => !d)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-[var(--fill)] active:bg-[var(--fill)]">
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-[800] leading-snug tracking-[-0.01em]">{t("More detail")}</span>
            <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{t("Saturated fat, salt, sugar and fibre")}</span>
          </span>
          {/* an ink chevron, no disc (colour meeting, 19 November 2026) */}
          <ChevronRightIcon aria-hidden className={`h-5 w-5 shrink-0 text-ink transition-transform ${detail ? "-rotate-90" : "rotate-90"}`} />
        </button>
        {detail && <div id="more-detail" className="border-t border-line px-4"><NutrientTable bare nutrients={item.nutrients} /></div>}
      </div>

      {chain.note && (
        <p className="mt-5 flex gap-2.5 px-1 text-[0.9375rem] leading-snug text-muted">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{chain.note}</span>
        </p>
      )}

      <p className="mt-6 px-1 text-sm leading-snug text-muted">
        {t("Not affiliated with {chain}.", { chain: chain.name })}{" "}
        <button type="button" className="min-h-11 font-semibold text-accent underline decoration-[color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-[3px]" onClick={() => setReporting(true)}>{t("Report a number")}</button>
      </p>

      {/* "Added to today's food." and "Saved to My meals." as the app's one toast (colour meeting, 19 November 2026): it reads itself out (role="status"); a new
          message gets a new key so its time starts afresh */}
      {message && <Toast key={`${message}-${toastKey}`} onClose={() => setMessage(null)}>{t(message)}</Toast>}

      <ReportSheet
        open={reporting}
        onClose={() => setReporting(false)}
        target={{ chainId: chain.id, chainName: chain.name, items: chain.items, item, ...(menu.dataVersion ? { dataVersion: menu.dataVersion } : {}) }}
      />
    </div>
  );
}
