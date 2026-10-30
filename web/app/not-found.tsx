"use client";

import { useEffect } from "react";
import { settingsStore } from "@/lib/mm/stores";
import { LinkButton } from "./app/_components/ui";
import { useT } from "./app/_lib/i18n";
import { applyTextSize } from "./app/_lib/textSize";

/** A plain "nothing here" mark drawn for this page (a magnifier with a question mark), in the stroke style of the app's other icons. */
function NotFoundMark() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable={false}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20 20" />
      <path d="M8.75 8.75a1.9 1.9 0 1 1 2.6 1.75c-.55.25-.85.7-.85 1.25" />
      <path d="M10.5 13.9h.01" strokeWidth={2.4} />
    </svg>
  );
}

// Any address no page answers, on the website and inside the iPhone app (its static export writes this as 404.html, which the app's
// scheme handler serves for an unknown path: MenuMacros/Features/WebApp/WebAppFiles.swift). It renders in the root layout only, outside
// the /app layout, so it carries its own .app-surface: globals.css then gives the page the app's light grey and weights (the fonts come
// from the root layout). Look: the offline page's, one white card in the middle of the screen with a round grey mark, the heading in
// Home's compact heavy style, the sentence in muted running text and the black pill home. A client component for useT, like the
// offline page's words; the text size from Settings is applied as AppShell does (this page has no inline script before the first paint).
export default function NotFound() {
  const t = useT();
  useEffect(() => {
    applyTextSize(settingsStore.get().textSize);
  }, []);
  return (
    <div className="app-surface relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <main className="flex flex-1 flex-col justify-center px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <section className="glass rounded-[1.25rem] px-5 pb-6 pt-8 text-center [overflow-wrap:anywhere]">
          <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-soft-strong text-foreground">
            <NotFoundMark />
          </span>
          <h1 className="mt-5 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]">{t("Page not found")}</h1>
          <p className="mx-auto mt-2.5 max-w-[19rem] text-[0.9375rem] leading-[1.45] text-muted">{t("This page doesn't exist or has moved.")}</p>
          <div className="mt-6">
            <LinkButton href="/app" full>{t("Back to home")}</LinkButton>
          </div>
        </section>
      </main>
    </div>
  );
}
