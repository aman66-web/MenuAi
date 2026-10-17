"use client";

import { useEffect, useState } from "react";
import { formatFriendCode, parseFriendCode } from "@/lib/community/friendCode";
import { COMMUNITY_FRIENDS_ENABLED } from "@/lib/mm/config";
import { site } from "@/site.config";

// The page behind a friend invite: https://numbite.com/f#<friend code>. It says what the link is and how to open it: get the app (once the App Store page exists:
// NEXT_PUBLIC_APP_STORE_URL), or open it in the app that is already there, or add the friend in the browser. English only, like the other website pages. Nothing here
// is sent anywhere: the code is read from the address in the browser. It is only a code that lets someone ask to be a friend; it shows no name, and nobody is added
// until the person who opens the invite chooses to add them.

const PILL = "inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-base font-bold transition active:scale-[0.97]";
const PRIMARY = `${PILL} bg-foreground text-background hover:bg-[color-mix(in_srgb,var(--foreground)_86%,white)]`;
const SECONDARY = `${PILL} bg-[#f4f5f6] text-foreground hover:bg-[#e9ebec]`;

export function InviteLanding() {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, "") || null);
    read(); // the address after "#" isn't known until the page is in the browser
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (!COMMUNITY_FRIENDS_ENABLED) {
    // switched off for this build (NEXT_PUBLIC_COMMUNITY_FRIENDS=0, lib/mm/config.ts): the app has no Friends screen to open yet
    return (
      <Shell>
        <h1 className="text-[2rem] font-[800] leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">Friends aren’t switched on yet</h1>
        <p className="mt-4 text-base leading-[1.65] text-muted">{site.name} will let you add friends and send them shopping lists soon. Keep this link and try it again later.</p>
      </Shell>
    );
  }
  if (hash === undefined) return <Shell><p className="text-base text-muted">Opening…</p></Shell>;

  const code = parseFriendCode(hash);
  if (!code) {
    return (
      <Shell>
        <h1 className="text-[2rem] font-[800] leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">{hash ? "This link doesn’t look right" : "Add a friend"}</h1>
        <p className="mt-4 text-base leading-[1.65] text-muted">
          {hash
            ? "This friend code isn’t valid. Ask your friend to send their invite again."
            : `This page opens a friend invite. Open the whole link your friend sent you, or open ${site.name} and type their friend code under Community › Friends.`}
        </p>
        <div className="mt-8 grid gap-3"><a href="/app/community/friends" className={PRIMARY}>Open Friends in {site.name}</a></div>
      </Shell>
    );
  }

  const shown = formatFriendCode(code);
  const inBrowser = `/app/community/friends#${code}`;
  const inApp = `numbite://f#${code}`;
  const live = !!site.appStoreUrl;

  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-[0.1em] text-muted">Friend invite</p>
      <h1 className="mt-2 text-[2rem] font-[800] leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">A friend invited you to {site.name}</h1>
      <p className="app-numbers mt-4 text-[1.125rem] leading-snug">Their friend code is <span className="select-all font-mono font-medium tracking-[0.06em]">{shown}</span>.</p>
      <p className="mt-3 text-base leading-[1.65] text-muted">
        {live
          ? `Open it in ${site.name} to add them as a friend and send each other shopping lists. ${site.name} is free. Friends need an account (a free sign-in); nothing else in the app does.`
          : `Open it to add them as a friend and send each other shopping lists. ${site.name} is free, and the iPhone app is coming soon to the App Store. Friends need an account (a free sign-in); nothing else in ${site.name} does.`}
      </p>

      <div className="mt-8 grid gap-3">
        {live ? (
          <>
            <a href={site.appStoreUrl} className={PRIMARY}>Get {site.name} on the App Store</a>
            <a href={inApp} className={SECONDARY}>I have {site.name}: add them</a>
            <a href={inBrowser} className="inline-flex min-h-11 items-center justify-center text-[0.9375rem] font-semibold text-accent underline underline-offset-[3px]">Or add them in your browser</a>
          </>
        ) : (
          <a href={inBrowser} className={PRIMARY}>Add them in your browser</a>
        )}
      </div>

      {live && (
        <div className="mt-8 rounded-[1.25rem] bg-[#f4f5f6] px-5 py-4">
          <h2 className="text-base font-bold tracking-[-0.01em]">After you’ve installed it</h2>
          <p className="mt-1 text-[0.9375rem] leading-[1.6] text-muted">Tap the link your friend sent again and the invite opens in {site.name}. Or open {site.name}, go to Community › Friends, and type their code: {shown}.</p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[0.9375rem] font-bold transition active:scale-[0.97]"
            onClick={() => { void navigator.clipboard?.writeText(code).then(() => setCopied(true), () => undefined); }}
          >
            {copied ? "Code copied" : "Copy the code"}
          </button>
        </div>
      )}
      <p className="mt-8 text-sm leading-relaxed text-muted">The code is in the link itself, and this page never sends it anywhere. Nobody can look you up in {site.name}: someone is added as a friend only when they share their code and you choose to add it.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-xl px-5 pb-10 pt-12 sm:pt-16">{children}</div>;
}
