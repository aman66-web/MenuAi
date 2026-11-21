"use client";

import { warnPreferences } from "@/lib/mm/user-data";
import { useEffect, useMemo, useState } from "react";
import { PAID_ACCESS_ENABLED, WEB_PRO_ENABLED } from "@/lib/mm/config";
import { hasMacros } from "@/lib/mm/nutrients";
import { noteShareUnlock, tryOpenTruth } from "@/lib/mm/stores";
import { smartSwap } from "@/lib/mm/truth/swap";
import type { Chain, MenuItem } from "@/lib/mm/types";
import { useIsPro, useSettings } from "../../_lib/hooks";
import { useGate } from "../Paywall";
import { useT } from "../../_lib/i18n";
import { ChevronRightIcon, FlameIcon } from "../icons";
import { TruthSheet } from "./TruthSheet";

/**
 * On a dish: "See the truth" as a white row with a line under it saying what it opens (the Truth card), so the page keeps one black pill
 * (Customise); then, when the same restaurant has a lighter dish with at least as much protein that fits the person's diet and allergy
 * settings, the green pill "Show a Smart Swap at {chain}" (the same card, scrolled to the swap), 48 px tall.
 */
export function TruthButton({ chain, item }: { chain: Chain; item: MenuItem }) {
  const t = useT();
  const settings = useSettings();
  const [open, setOpen] = useState<null | "truth" | "swap">(null);
  const pro = useIsPro();
  const { showPaywall } = useGate();
  // Free tier (only when paid access exists): three different dishes' Truth cards a day; the same dish again is free.
  const request = (which: "truth" | "swap") => {
    if (!PAID_ACCESS_ENABLED || pro || tryOpenTruth(`${chain.id}/${item.id}`)) setOpen(which);
    else showPaywall("truthLimit");
  };
  // the swap offered fits the diet and allergies they told us and any filter they chose (a suggestion, not a filter: nothing is hidden)
  const warn = useMemo(() => warnPreferences(settings), [settings]);
  const swap = useMemo(() => smartSwap(chain, item, warn), [chain, item, warn]);

  useEffect(() => {
    if (open !== "swap") return;
    const timer = setTimeout(() => document.getElementById("truth-swap")?.scrollIntoView({ block: "start" }), 380);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => request("truth")}
        className="glass flex min-h-[4.75rem] w-full items-center gap-3.5 rounded-[1.25rem] px-4 py-3 text-start transition-colors hover:bg-background active:bg-background"
      >
        {/* a page-fill well with the icon in the link green (lime is never a disc or decoration) */}
        <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-accent"><FlameIcon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="block text-base font-bold leading-snug">{t("See the truth")}</span>
          {/* what the card can really show: a dish with no protein, carbs or fat published has no protein score or traffic lights */}
          <span className="mt-0.5 block text-sm leading-snug text-muted">{hasMacros(item.nutrients) ? t("Calories, protein score and traffic lights") : t("Calories and the share of a day")}</span>
        </span>
        <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-ink" />
      </button>
      {swap && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => request("swap")}
          // secondary (Elsie found Smart Swap the loudest button on the dish page); the traffic-light green is only for the FSA pills
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full border-[1.5px] border-edge bg-card px-6 text-center text-base font-semibold leading-snug text-foreground transition active:scale-[0.97] hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("Show a Smart Swap at {chain}", { chain: chain.name })}
        </button>
      )}
      <TruthSheet open={open !== null} onClose={() => setOpen(null)} chain={chain} item={item} swap={swap} onWhatsApp={WEB_PRO_ENABLED ? () => noteShareUnlock() : undefined} />
    </div>
  );
}
