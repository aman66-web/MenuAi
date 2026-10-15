"use client";

import { useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { countProAction } from "@/lib/mm/stores";
import type { Nutrients } from "@/lib/mm/types";
import { site } from "@/site.config";
import { useT } from "../_lib/i18n";
import { shareOrderCard } from "../_lib/share-card";
import { ShareIcon } from "./icons";
import { Button } from "./ui";

/**
 * "Share" on an item or an order: draws the share card and hands it to the share sheet (or downloads it). A secondary pill like
 * its neighbours. In a row of three it has a little less side padding (12 px, as the builder gives its pills), its icon shows only
 * where the pill has room for it beside the word, and the word itself never breaks between letters (the page allows that
 * elsewhere for long names): the longest translation, Polish "Udostępnij", fits a third of the row on a 390 px phone.
 */
export function ShareButton({ chainName, orderName, description, nutrients, full }: { chainName: string; orderName: string; description: string; nutrients: Nutrients; full?: boolean }) {
  const t = useT();
  const [message, setMessage] = useState<string | null>(null);
  const host = (() => {
    try {
      const h = new URL(site.url).host;
      return h.startsWith("localhost") ? "numbite.com" : h;
    } catch {
      return "numbite.com";
    }
  })();
  return (
    // The button stays a direct child of the grid of buttons it sits in; the note (download fallback only) takes a whole row after
    // that grid (order-last, col-span-full), so the other pills keep their height and their rows.
    <div className="contents">
      <Button
        variant="secondary"
        full={full}
        className={full ? "@container px-3!" : undefined}
        onClick={async () => {
          try {
            const result = await shareOrderCard({ chainName, orderName, description, nutrients, appName: site.name, siteHost: host, t });
            if (result === "cancelled") return;
            analytics.track({ name: "shareCardCreated" });
            countProAction();
            setMessage(result === "downloaded" ? t("Image saved to your downloads.") : null);
          } catch {
            setMessage(t("Couldn't create the share image."));
          }
        }}
      >
        <ShareIcon className={`h-5 w-5 shrink-0 ${full ? "hidden @[7.5rem]:block" : ""}`} /> <span className="[overflow-wrap:normal]">{t("Share")}</span>
      </Button>
      {message && <span role="status" className="sr-only">{message}</span>}
      {message && <p aria-hidden className="order-last col-span-full basis-full text-center text-sm font-medium leading-snug text-muted">{message}</p>}
    </div>
  );
}
