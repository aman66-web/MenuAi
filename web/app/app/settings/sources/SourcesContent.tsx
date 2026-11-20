"use client";

import Link from "next/link";
import { ChevronLeftIcon } from "../../_components/icons";
import { MenuSourcesBody } from "../../_components/MenuSourcesBody";
import { SourcesBody } from "../../_components/SourcesBody";
import { useBack } from "../../_lib/backNav";
import { useT } from "../../_lib/i18n";

// Opened from Settings > About, so "the page before" is Settings; the pill names its place ("Settings") like "How we get our numbers" does.
export function SourcesContent() {
  const t = useT();
  const back = useBack("/app/settings");
  return (
    <div>
      <Link href={back.href} onClick={back.onClick} className="glass border-[1.5px] border-[color:var(--edge)] bg-soft inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-[var(--fill)]"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Settings")}</span></Link>
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
