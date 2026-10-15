"use client";

import { LinkButton } from "../_components/ui";
import { useT } from "../_lib/i18n";

/** A plain "no connection" mark drawn for this page (three signal arcs and a slash), in the stroke style of the app's other icons. */
function OfflineMark() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable={false}>
      <path d="M2.5 9a14.5 14.5 0 0 1 19 0" />
      <path d="M5.5 12.5a10 10 0 0 1 13 0" />
      <path d="M8.5 16a5.5 5.5 0 0 1 7 0" />
      <path d="M12 19.5h.01" strokeWidth={2.6} />
      <path d="M4 4l16 16" />
    </svg>
  );
}

// The offline page's words, in the chosen language (the page itself stays a server component for its metadata).
// Look (founder 2026-10-15, "the rest of the app should match [Home's] elegance"): one white card in the middle of the screen, a round grey
// mark, the heading in Home's compact heavy style, the sentence in muted running text, and the black pill as the one action.
// The card is centred in the shell's real content box: 100dvh less <main>'s own padding (top max(1.25rem, safe area), bottom 8rem = pb-32)
// so it stays centred at every text size and on notched phones. When the shell's "You're offline" strip sits above <main> (the page's usual
// state), its own top margin (max(0.5rem, safe area)) and its height are taken off too: 3.625rem = its padding and border plus room for two
// lines, since the sentence wraps at Extra large; with one line the card sits about 10 px above the centre, and the page never scrolls.
export function OfflineContent() {
  const t = useT();
  return (
    <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_8rem)] flex-col justify-center [p[role=status]~main_&]:min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_max(0.5rem,env(safe-area-inset-top))_-_11.625rem)]">
      <section className="glass rounded-[1.25rem] px-5 pb-6 pt-8 text-center [overflow-wrap:anywhere]">
        <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-soft-strong text-foreground">
          <OfflineMark />
        </span>
        <h1 className="mt-5 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]">{t("You're offline")}</h1>
        <p className="mx-auto mt-2.5 max-w-[19rem] text-[0.9375rem] leading-[1.45] text-muted">{t("This page hasn't been opened on this device yet. Restaurants and menus you've already opened still work.")}</p>
        <div className="mt-6">
          <LinkButton href="/app" full>{t("Back to home")}</LinkButton>
        </div>
      </section>
    </div>
  );
}
