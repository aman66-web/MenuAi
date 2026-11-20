"use client";

import { BackButton } from "../../_components/PageHeader";
import { MenuSourcesBody } from "../../_components/MenuSourcesBody";
import { SourcesBody } from "../../_components/SourcesBody";
import { useT } from "../../_lib/i18n";

// Opened from Settings > About, so "the page before" is Settings: the app's own Back pill (it says "Back", like every Back since 2026-10-11, and a screen reader
// hears "Back to settings" when it goes there), and no Settings cog: this page is part of Settings.
export function SourcesContent() {
  const t = useT();
  return (
    <div>
      <BackButton href="/app/settings" label={t("Back to settings")} />
      <h1 className="mt-5 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]">{t("Where your daily targets come from")}</h1>
      <div className="glass mt-5 rounded-[1.25rem] p-5">
        <SourcesBody withNumbersLink level="h2" />
      </div>
      {/* The menu screens' numbers (the Truth card, Quick answers, Cheapest protein): the same words as the sheet those screens open. */}
      <div id="menu" className="glass mt-4 rounded-[1.25rem] p-5">
        <MenuSourcesBody level="h2" withAdvice={false} />
      </div>
    </div>
  );
}
