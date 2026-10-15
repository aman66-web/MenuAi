"use client";

import { useEffect, useState } from "react";
import { retailerName } from "@/lib/mm/groceries";
import { decodePayload, shopsOf, SHARE_PROBLEM, SHARED_APP_PATH, type Decoded } from "@/lib/mm/shareList";
import { englishT } from "@/lib/mm/i18n";
import { site } from "@/site.config";

// The page behind a shopping list link: https://numbite.com/l#<list>. It says what the link is, how many things are in it and from which shops, and how to open
// it: get the app (once the App Store page exists: NEXT_PUBLIC_APP_STORE_URL), or open it in the app that is already there, or read it in the browser. English
// only, like the other website pages. Nothing here is sent anywhere: the list is read from the address in the browser.

const PILL = "inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-base font-bold transition active:scale-[0.97]";
const PRIMARY = `${PILL} bg-foreground text-background hover:bg-[color-mix(in_srgb,var(--foreground)_86%,white)]`;
const SECONDARY = `${PILL} bg-[#f4f5f6] text-foreground hover:bg-[#e9ebec]`;

const list = (words: string[]) => (words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

export function SharedLanding() {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, "") || null);
    read(); // the address after "#" isn't known until the page is in the browser
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (hash === undefined) return <Shell><p className="text-base text-muted">Opening…</p></Shell>;

  const decoded: Decoded | null = hash ? decodePayload(hash) : null;
  if (!hash || !decoded?.ok) {
    return (
      <Shell>
        <h1 className="text-[2rem] font-[800] leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">{hash ? "This link doesn’t look right" : "Open a shopping list"}</h1>
        <p className="mt-4 text-base leading-[1.65] text-muted">
          {hash && decoded && !decoded.ok
            ? englishT(SHARE_PROBLEM[decoded.reason], { app: site.name })
            : `This page opens a shopping list that a friend shared with you. Open the whole link they sent you.`}
        </p>
        <div className="mt-8 grid gap-3"><a href="/app" className={PRIMARY}>Open {site.name}</a></div>
      </Shell>
    );
  }

  const { entries } = decoded;
  const shops = shopsOf(entries).map(retailerName);
  const typed = entries.filter((e) => e.kind === "typed").length;
  const total = entries.length;
  const noun = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
  const fromShops = total - typed;
  const what = shops.length === 0
    ? `${noun(total)} you can pick up anywhere`
    : typed === 0
      ? `${noun(total)} from ${list(shops)}`
      : `${noun(total)}: ${fromShops} from ${list(shops)}, and ${typed} you can pick up anywhere`;
  const inBrowser = `${SHARED_APP_PATH}#${hash}`;
  const inApp = `numbite://l#${hash}`;
  const live = !!site.appStoreUrl;

  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-[0.1em] text-muted">Shared with you</p>
      <h1 className="mt-2 text-[2rem] font-[800] leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">A friend shared a shopping list</h1>
      <p className="app-numbers mt-4 text-[1.125rem] leading-snug">{what}.</p>
      <p className="mt-3 text-base leading-[1.65] text-muted">
        {live
          ? `Open it in ${site.name} to see every product with its picture and price, and add it to your own list. ${site.name} is free.`
          : `Open it to see every product with its picture and price, and add it to your own list. ${site.name} is free, and the iPhone app is coming soon to the App Store.`}
      </p>

      <div className="mt-8 grid gap-3">
        {live ? (
          <>
            <a href={site.appStoreUrl} className={PRIMARY}>Get {site.name} on the App Store</a>
            <a href={inApp} className={SECONDARY}>I have {site.name}: open the list</a>
            <a href={inBrowser} className="inline-flex min-h-11 items-center justify-center text-[0.9375rem] font-semibold text-accent underline underline-offset-[3px]">Or read the list in your browser</a>
          </>
        ) : (
          <a href={inBrowser} className={PRIMARY}>View the list</a>
        )}
      </div>

      {live && (
        <div className="mt-8 rounded-[1.25rem] bg-[#f4f5f6] px-5 py-4">
          <h2 className="text-base font-bold tracking-[-0.01em]">After you’ve installed it</h2>
          <p className="mt-1 text-[0.9375rem] leading-[1.6] text-muted">Tap the link your friend sent again and the list opens in {site.name}. Or open {site.name}, go to Shopping list, choose “Got a list from a friend?” and paste the link.</p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[0.9375rem] font-bold transition active:scale-[0.97]"
            onClick={() => { void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true), () => undefined); }}
          >
            {copied ? "Link copied" : "Copy the link"}
          </button>
        </div>
      )}
      <p className="mt-8 text-sm leading-relaxed text-muted">The list is in the link itself: it was never stored on a server, and only people who have the link can see it.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-xl px-5 pb-10 pt-12 sm:pt-16">{children}</div>;
}
