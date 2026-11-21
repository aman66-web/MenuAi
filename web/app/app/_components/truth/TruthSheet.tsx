"use client";

import { useState } from "react";
import type { Chain, MenuItem } from "@/lib/mm/types";
import type { SwapSuggestion } from "@/lib/mm/truth/swap";
import { useT } from "../../_lib/i18n";
import { useCreatorMode } from "../../_lib/creator";
import { Chip, Sheet } from "../ui";
import { TruthBody } from "./TruthBody";

/**
 * The Truth & Swap view as a bottom sheet over the dish. It is the light card by default; "Dark card" switches it to the high-contrast #09090B card
 * (so a phone camera filming the screen never blows out a white card), and Creator View (Shift+F, or Settings) turns the dark card on with bigger figures
 * and a Replay button that plays the opening animation again.
 */
export function TruthSheet({ open, onClose, chain, item, swap, onWhatsApp }: { open: boolean; onClose: () => void; chain: Chain; item: MenuItem; swap: SwapSuggestion | null; onWhatsApp?: () => void }) {
  const t = useT();
  const creator = useCreatorMode();
  const [dark, setDark] = useState(false);
  const [replay, setReplay] = useState(0);
  const isDark = creator || dark;
  return (
    <Sheet open={open} onClose={onClose} title={item.name} dark={isDark}>
      {creator && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip size="lg" onClick={() => setReplay((n) => n + 1)}>
            {t("Replay")}
          </Chip>
        </div>
      )}
      <TruthBody chain={chain} item={item} swap={swap} creator={creator} replay={replay} onWhatsApp={onWhatsApp} />
      {/* for filming the screen: under the card, out of the way of the dish (founder 2026-11-21: the top was "a lot of wording") */}
      {!creator && (
        <div className="mt-1 flex flex-wrap gap-2">
          <Chip size="lg" selected={dark} onClick={() => setDark((d) => !d)}>
            {t("Dark card")}
          </Chip>
        </div>
      )}
    </Sheet>
  );
}
