"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { describeOrder, lineFromItem, orderName, orderNutrients } from "@/lib/mm/order";
import { builderHref, chainHref } from "@/lib/mm/routes";
import { addLogEntry, addSavedOrder, countProAction } from "@/lib/mm/stores";
import { useGate } from "../_components/Paywall";
import { ChevronLeftIcon, InfoIcon } from "../_components/icons";
import { ItemPhotoHero } from "../_components/ItemPhoto";
import { AllergenSection } from "../_components/Allergens";
import { ItemHero, NutrientTable } from "../_components/Nutrition";
import { ShareButton } from "../_components/ShareButton";
import { ReportSheet } from "../_components/Submit";
import { Badge, Button, ErrorBox, Spinner } from "../_components/ui";
import { useChain, useMenu } from "../_lib/hooks";

// SPEC §7.5: name, serving, big calories, then protein/carbs/fat, then the optional nutrients ("not published").
export function ItemScreen({ chainId, itemId }: { chainId: string; itemId: string }) {
  const router = useRouter();
  const { gate } = useGate();
  const menu = useMenu();
  const { status, index, error, retry } = useChain(chainId);
  const [message, setMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const back = (
    <Link href={chainHref(chainId)} aria-label="Back to menu" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
  );
  if (status === "loading") return (<div>{back}<Spinner label="Loading item" /></div>);
  if (status === "error" || !index) return (<div>{back}<ErrorBox message={error ?? "Couldn't load this menu."} onRetry={retry} /></div>);

  const item = index.items.get(itemId);
  if (!item) return (<div>{back}<ErrorBox message="That item is no longer on the menu." /></div>);
  const { chain } = index;
  const line = lineFromItem(index, item.id);
  const lines = line ? [line] : [];
  const description = describeOrder(index, lines) || item.name;

  return (
    <div>
      {back}
      <div className="mt-5">
        <ItemHero nutrients={item.nutrients} name={item.name}>
          <Link href={chainHref(chain.id)} className="kicker inline-flex min-h-11 items-center hover:underline">{chain.name}</Link>
          <h1 className="text-[1.9rem] font-extrabold leading-[1.1] tracking-tight">{item.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {item.serving && <span>{item.serving}</span>}
            {item.category && <Badge>{item.category}</Badge>}
            {item.limitedTime && <Badge>Limited time</Badge>}
            {chain.sample && <Badge>Sample data</Badge>}
          </div>
        </ItemHero>
      </div>
      <ItemPhotoHero image={item.image} chainName={chain.name} />
      <div className="mt-3"><AllergenSection chain={chain} allergens={item.allergens} itemName={item.name} /></div>
      <div className="mt-3"><NutrientTable nutrients={item.nutrients} /></div>
      {chain.note && (
        <p className="mt-3 flex gap-2.5 px-1 text-sm text-muted">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{chain.note}</span>
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button
          full
          onClick={() =>
            gate("orderBuilder", () => {
              analytics.track({ name: "builderOpened", origin: "item" });
              router.push(builderHref({ chain: chain.id, item: item.id }));
            })
          }
        >
          Customise
        </Button>
        <Button
          variant="secondary"
          full
          onClick={() =>
            gate("log", () => {
              addLogEntry({ chainId: chain.id, chainName: chain.name, name: item.name, nutrients: item.nutrients, source: "item" });
              analytics.track({ name: "mealLogged" });
              countProAction();
              setMessage("Logged to Today.");
            })
          }
        >
          Log
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
              setMessage("Saved.");
            })
          }
        >
          Save
        </Button>
        <ShareButton full chainName={chain.name} orderName={item.name} description={description} nutrients={item.nutrients} />
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-center text-sm font-medium text-accent">{message}</p>

      <p className="mt-4 text-sm text-muted">
        Not affiliated with {chain.name}.{" "}
        <button type="button" className="min-h-11 font-medium text-accent underline" onClick={() => setReporting(true)}>Report a number</button>
      </p>

      <ReportSheet
        open={reporting}
        onClose={() => setReporting(false)}
        target={{ chainId: chain.id, chainName: chain.name, items: chain.items, item, ...(menu.dataVersion ? { dataVersion: menu.dataVersion } : {}) }}
      />
    </div>
  );
}
