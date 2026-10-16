"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { directionsUrl, formatMiles, type Branch } from "@/lib/mm/geo";
import { chainHref } from "@/lib/mm/routes";
import { ChainMark } from "../_components/ChainMark";
import { DirectionsIcon, ForkIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import { ACTION_MAIN, ACTION_SOFT, ACTIONS } from "./actions";

/**
 * The restaurant whose pin is selected: name, how far, and its Menu and Directions. On the page it sits under the map; in full screen it is
 * rendered INSIDE the map's frame (the page's own copy is hidden behind it, so there is only ever one live-region card). It is a sibling of
 * the map's container, never inside it, so a touch on it is not a map touch.
 */
export function SelectedCard({ branch, chain, variant, replaceHistory = false }: {
  branch: Branch;
  chain: { id: string; name: string; cuisine?: string | undefined };
  variant: "page" | "full";
  /** Full screen only: replace the history entry full screen pushed (so Back from the menu lands on Near me, not on a dead entry). */
  replaceHistory?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { // publish the card's height so the toggle and the credits ride above it (and so MapView can lift a tapped pin clear of it)
    if (variant !== "full") return;
    const el = ref.current;
    const frame = el?.closest<HTMLElement>("[data-nearby-fs]");
    if (!el || !frame) return;
    const publish = () => frame.style.setProperty("--fs-lift", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      frame.style.removeProperty("--fs-lift");
    };
  }, [variant]);
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={variant === "full"
        ? "glass sheet-in absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] right-[max(12px,env(safe-area-inset-right))] z-10 mx-auto max-h-[50dvh] max-w-md touch-pan-y overflow-y-auto overscroll-contain rounded-[1.25rem] p-4 shadow-[0_12px_32px_-12px_rgba(17,24,20,0.35)]"
        : "glass sheet-in mt-3.5 rounded-[1.25rem] p-4"}
    >
      <div className="flex items-center gap-3.5">
        <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug [overflow-wrap:anywhere]">{chain.name}</p>
          <p className="app-numbers mt-0.5 text-sm leading-snug text-muted">{t("{distance} away", { distance: formatMiles(branch.miles, t) })}</p>
        </div>
      </div>
      <div className={`mt-3.5 ${ACTIONS}`}>
        <Link href={chainHref(chain.id)} replace={replaceHistory} className={ACTION_MAIN}><ForkIcon /><span>{t("Menu")}</span></Link>
        <a href={directionsUrl(branch)} target="_blank" rel="noopener noreferrer" className={ACTION_SOFT}><DirectionsIcon /><span>{t("Directions")}<span className="sr-only"> {t("(opens in a new tab)")}</span></span></a>
      </div>
    </div>
  );
}
