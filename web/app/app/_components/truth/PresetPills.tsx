"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PAID_ACCESS_ENABLED } from "@/lib/mm/config";
import { FREE_PRESET_RESULTS } from "@/lib/mm/paid";
import { applyPreset, presetsFor, type PresetId } from "@/lib/mm/truth/presets";
import type { Chain, MenuItem } from "@/lib/mm/types";
import { useIsPro } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { useGate } from "../Paywall";
import { MenuSourcesLink } from "../MenuSourcesLink";
import { Button, Chip } from "../ui";

/** True in the free iPhone app's copy (build-time constant): no paid tier there, so the locked-list button and its words are left out of the app's files (App Store 3.1.1, App Review 2.3.1). */
const FREE_APP = process.env.NEXT_PUBLIC_APP_BUILD === "1" && process.env.NEXT_PUBLIC_IAP !== "1";

/** How many dishes a preset shows. */
export const PRESET_TOP = 5;

/**
 * The "Menu Translator": five big one-tap pills at the top of a restaurant's page that cut a long menu down to the top five that fit a plain rule, written
 * in the pill ("Under 500 calories", "35 g+ protein"). A pill a restaurant can't answer from what it publishes (protein, sugar) is not shown for it.
 * `items` should already be the diet- and allergy-filtered menu, so the answer never offers a dish the person has said they avoid.
 */
export function PresetPills({ chain, items, renderList }: { chain: Chain; items: readonly MenuItem[]; renderList: (items: readonly MenuItem[]) => ReactNode }) {
  const t = useT();
  const pro = useIsPro();
  const { showPaywall } = useGate();
  // Free tier (only when paid access exists): the first two results of a list; "Small appetite" (the GLP-1 and smaller-meal optimiser) is paid.
  const gated = !FREE_APP && PAID_ACCESS_ENABLED && !pro;
  const defs = useMemo(() => presetsFor(chain), [chain]);
  const counts = useMemo(() => new Map(defs.map((d) => [d.id, applyPreset(d.id, items).length])), [defs, items]);
  const [active, setActive] = useState<PresetId | null>(null);
  const results = useMemo(() => (active ? applyPreset(active, items) : []), [active, items]);
  // the answer comes into view when a pill is tapped (usability test 2026-11-19: at large text it was below the screen, so the tap seemed to do nothing)
  const answer = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) answer.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [active]);
  if (defs.length === 0) return null;
  const def = defs.find((d) => d.id === active);
  return (
    <section aria-labelledby="quick-heading" className="mt-7">
      <h2 id="quick-heading" className="text-xl font-extrabold leading-snug tracking-tight">{t("Quick answers")}</h2>
      <p className="mt-1 text-base leading-snug text-muted">{t("Tap one to see the top 5 on this menu.")}</p>
      <div role="group" aria-label={t("Quick answers")} className="mt-3 flex flex-wrap gap-2.5">
        {defs.map((d) => {
          const n = counts.get(d.id) ?? 0;
          return (
            <Chip key={d.id} size="lg" selected={active === d.id} disabled={n === 0} className="disabled:opacity-100 disabled:border-transparent disabled:bg-soft-strong disabled:text-muted" onClick={() => { if (gated && d.id === "small-appetite") return showPaywall("smallAppetite"); setActive((a) => (a === d.id ? null : d.id)); }}>
              {t(d.label)}
            </Chip>
          );
        })}
      </div>
      <div ref={answer} className="mt-3 scroll-mt-4" role="status" aria-live="polite">
        {def && (
          <p className="text-base leading-snug text-muted">
            {results.length > PRESET_TOP ? t("Showing the top {n} of {total}.", { n: PRESET_TOP, total: results.length }) : t("{n} on this menu.", { n: results.length })} {t(chain.nutritionLevel === "calories" && def.ruleCaloriesOnly ? def.ruleCaloriesOnly : def.rule)}
          </p>
        )}
      </div>
      {/* App Review 1.4.1: the limits behind each list are Numbite's own; the sheet says so, with the other menu sources. */}
      {def && <MenuSourcesLink className="mt-0.5" chain={chain} />}
      {def && results.length > 0 && <div className="mt-2.5">{renderList(results.slice(0, gated ? FREE_PRESET_RESULTS : PRESET_TOP))}</div>}
      {def && gated && Math.min(results.length, PRESET_TOP) > FREE_PRESET_RESULTS && (
        <Button size="lg" full variant="secondary" className="mt-2.5" onClick={() => showPaywall("moreResults")}>{t("Unlock the other {n}", { n: Math.min(results.length, PRESET_TOP) - FREE_PRESET_RESULTS })}</Button>
      )}
    </section>
  );
}
