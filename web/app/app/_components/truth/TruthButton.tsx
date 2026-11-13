"use client";

import { useEffect, useMemo, useState } from "react";
import { smartSwap } from "@/lib/mm/truth/swap";
import type { Chain, MenuItem } from "@/lib/mm/types";
import { useSettings } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { Button } from "../ui";
import { TruthSheet } from "./TruthSheet";

/**
 * The two big buttons on a dish: "See the truth" (the Truth card) and, when the same restaurant has a lighter dish with at least as much protein that fits
 * the person's diet and allergy settings, "Show a Smart Swap at {chain}" (the same card, scrolled to the swap). Both are 48 px tall.
 */
export function TruthButton({ chain, item }: { chain: Chain; item: MenuItem }) {
  const t = useT();
  const settings = useSettings();
  const [open, setOpen] = useState<null | "truth" | "swap">(null);
  const swap = useMemo(() => smartSwap(chain, item, settings.preferences), [chain, item, settings.preferences]);

  useEffect(() => {
    if (open !== "swap") return;
    const timer = setTimeout(() => document.getElementById("truth-swap")?.scrollIntoView({ block: "start" }), 380);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <div className="space-y-2.5">
      <Button size="lg" full aria-haspopup="dialog" onClick={() => setOpen("truth")}>{t("See the truth")}</Button>
      {swap && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen("swap")}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--tl-green)] px-6 text-center text-base font-bold leading-snug text-[var(--tl-ink)] transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("Show a Smart Swap at {chain}", { chain: chain.name })}
        </button>
      )}
      <TruthSheet open={open !== null} onClose={() => setOpen(null)} chain={chain} item={item} swap={swap} />
    </div>
  );
}
