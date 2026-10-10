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

export function ShareButton({ chainName, orderName, description, nutrients, full }: { chainName: string; orderName: string; description: string; nutrients: Nutrients; full?: boolean }) {
  const t = useT();
  const [message, setMessage] = useState<string | null>(null);
  const host = (() => {
    try {
      const h = new URL(site.url).host;
      return h.startsWith("localhost") ? "menumacros.app" : h;
    } catch {
      return "menumacros.app";
    }
  })();
  return (
    <>
      <Button
        variant="secondary"
        full={full}
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
        <ShareIcon className="h-5 w-5" /> {t("Share")}
      </Button>
      {message && <span role="status" className="sr-only">{message}</span>}
      {message && <p aria-hidden className="mt-1 text-xs text-muted">{message}</p>}
    </>
  );
}
