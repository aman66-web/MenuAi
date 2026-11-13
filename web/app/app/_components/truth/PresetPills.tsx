"use client";

import { useMemo, useState, type ReactNode } from "react";
import { applyPreset, presetsFor, type PresetId } from "@/lib/mm/truth/presets";
import type { Chain, MenuItem } from "@/lib/mm/types";
import { useT } from "../../_lib/i18n";
import { Chip } from "../ui";

/** How many dishes a preset shows. */
export const PRESET_TOP = 5;

/**
 * The "Menu Translator": five big one-tap pills at the top of a restaurant's page that cut a long menu down to the top five that fit a plain rule, written
 * in the pill ("Under 500 calories", "35 g+ protein"). A pill a restaurant can't answer from what it publishes (protein, sugar) is not shown for it.
 * `items` should already be the diet- and allergy-filtered menu, so the answer never offers a dish the person has said they avoid.
 */
export function PresetPills({ chain, items, renderList }: { chain: Chain; items: readonly MenuItem[]; renderList: (items: readonly MenuItem[]) => ReactNode }) {
  const t = useT();
  const defs = useMemo(() => presetsFor(chain), [chain]);
  const counts = useMemo(() => new Map(defs.map((d) => [d.id, applyPreset(d.id, items).length])), [defs, items]);
  const [active, setActive] = useState<PresetId | null>(null);
  const results = useMemo(() => (active ? applyPreset(active, items) : []), [active, items]);
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
            <Chip key={d.id} size="lg" selected={active === d.id} disabled={n === 0} className="disabled:opacity-100 disabled:text-muted" onClick={() => setActive((a) => (a === d.id ? null : d.id))}>
              {t(d.label)}
            </Chip>
          );
        })}
      </div>
      <div className="mt-3" role="status" aria-live="polite">
        {def && (
          <p className="text-base leading-snug text-muted">
            {results.length > PRESET_TOP ? t("Showing the top {n} of {total}.", { n: PRESET_TOP, total: results.length }) : t("{n} on this menu.", { n: results.length })} {t(def.rule)}
          </p>
        )}
      </div>
      {def && results.length > 0 && <div className="mt-2.5">{renderList(results.slice(0, PRESET_TOP))}</div>}
    </section>
  );
}
