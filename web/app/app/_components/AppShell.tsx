"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { APP_BUILD } from "@/lib/mm/config";
import { chooseWarmChains } from "@/lib/mm/popular";
import { favoritesStore, outbox, savedStore } from "@/lib/mm/stores";
import { tabTarget } from "@/lib/mm/tabMemory";
import { useHydrated, useMenu, useSettings, useStore } from "../_lib/hooks";
import { installBackDepth } from "../_lib/backNav";
import { refreshHiddenLogos } from "../_lib/hiddenLogos";
import { menuClient } from "../_lib/menu";
import { warmOffline } from "../_lib/warm";
import { applyTextSize } from "../_lib/textSize";
import { bootAccount, useAccountChecking, useAccountUser } from "../_lib/account";
import { noteTabPage, useTabMemory } from "../_lib/tabMemoryStore";
import { useReminderSync } from "../_lib/reminderSync";
import { setLanguage, useT } from "../_lib/i18n";
import { TABS } from "../_lib/tabs";
import { TabLabel } from "./TabLabel";
import { CreatorKeys } from "../_lib/creator";
import { RefCapture } from "../../components/RefCapture";
import { recheckStoredToken } from "@/lib/payments/client";
import { GATING_ENABLED, IAP_ENABLED, SIGN_IN_REQUIRED } from "@/lib/mm/config";
import { signInGate } from "@/lib/mm/signInGate";
import { hasNative } from "@/lib/mm/native";
import { refreshAppStoreAccess } from "@/lib/payments/iap";
import { CommunityBadge } from "./CommunityBadge";
import { PaywallProvider } from "./Paywall";
import { TrialOffer } from "./TrialOffer";
import { RatingPrompt } from "./RatingPrompt";
import { SignInScreen } from "./SignInScreen";
import { Spinner } from "./ui";

// The five tabs (and the measured word under each icon) live in _lib/tabs.ts and TabLabel.tsx, shared with the welcome tour's copy of the bar.

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const settings = useSettings();
  const textSize = settings.textSize;
  const language = settings.language;
  // Everyone signs in (founder 2026-11-17; lib/mm/config.ts SIGN_IN_REQUIRED): until someone is, every page but the welcome and offline screens shows the sign-in
  // screen in its place (the address, a shared list's "#" included, stays as it is, so the page opens once they're in).
  const user = useAccountUser();
  const checking = useAccountChecking();
  const gate = signInGate({ required: SIGN_IN_REQUIRED, hydrated, signedIn: !!user, checking, pathname });
  const fullScreen = pathname.startsWith("/app/welcome") || gate !== "open";
  const online = useOnline();
  const animate = useNavigatedOnce(pathname);
  const menu = useMenu();
  const favorites = useStore(favoritesStore);
  const saved = useStore(savedStore);
  const ownChains = [...new Set([...favorites.map((f) => f.chainId), ...saved.map((o) => o.chainId)])].sort().join("|");

  // Warm the offline cache once the catalogue is known (production only; see _lib/warm.ts): the user's own chains first,
  // then the popular ones, capped so a catalogue of 150+ chains isn't downloaded on a first visit.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || menu.status !== "ready" || menu.chains.length === 0) return;
    void warmOffline(chooseWarmChains(menu.chains, ownChains ? ownChains.split("|") : []));
  }, [menu.status, menu.chains, ownChains]);

  // Tabs remember where you were (lib/mm/tabMemory.ts): coming back to a tab opens the page last seen in it; the open tab's own link goes to its first page.
  const tabMemory = useTabMemory();
  useEffect(() => {
    if (hydrated) noteTabPage(TABS, pathname, window.location.search);
  }, [hydrated, pathname]);

  // Text size from Settings / onboarding (the layout's inline script applies it before the first paint too).
  useEffect(() => {
    if (hydrated) applyTextSize(textSize);
  }, [hydrated, textSize]);

  // The app's language (Settings / the first onboarding screen); English until another is chosen.
  useEffect(() => {
    if (hydrated) void setLanguage(language ?? "en");
  }, [hydrated, language]);

  // A stored payment token that no longer checks out (run out, changed) is forgotten. Only when payments are on. In the In-App Purchase app, Apple's list of current
  // purchases then decides (lib/payments/iap.ts), and again whenever the app comes back to the front: a renewal, an approved Ask to Buy or a refund shows up there.
  useEffect(() => {
    if (!hydrated || !GATING_ENABLED) return;
    const checked = recheckStoredToken();
    if (!IAP_ENABLED || !hasNative()) return;
    void checked.then(() => refreshAppStoreAccess());
    const back = () => { if (document.visibilityState === "visible") void refreshAppStoreAccess(); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [hydrated]);

  // Signed in? (Optional: with no account nothing is sent anywhere.) Asks the server who this device is signed in as and starts syncing.
  useEffect(() => {
    if (hydrated) void bootAccount();
  }, [hydrated]);

  // Logos taken down at their owner's request (public/logos/hidden.json), read once per launch.
  useEffect(() => { refreshHiddenLogos(); }, []);

  // Reminders (Home's Reminders section): in the iPhone app the plan of what to ring is handed to the phone when the reminders change, when the app starts
  // and when it comes back to the front; on the website this only notes that there is nothing to ring with (_lib/reminderSync.ts).
  useReminderSync();

  // Every history entry the app makes carries how deep it is, so a Back button can take the browser's own Back when the page was reached from another
  // page of the app (and its fixed page only when there is nothing earlier): lib/mm/navDepth.ts, _lib/backNav.ts.
  useEffect(() => { installBackDepth(); }, []);

  // Offline support (public/sw.js). Production website only: development never serves stale files, and the iPhone app carries its files.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !APP_BUILD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`, { scope: "/app", updateViaCache: "none" }).catch(() => undefined);
    }
  }, []);

  // Retry queued submissions whenever the app becomes active or the network returns (SPEC §12).
  useEffect(() => {
    const flush = () => void outbox().flush();
    const reconnected = () => {
      void outbox().flush({ afterReconnect: true });
      if (menuClient.getSnapshot().status === "error") void menuClient.ensureManifest(true); // menus couldn't load: try again
    };
    const visible = () => document.visibilityState === "visible" && flush();
    flush();
    window.addEventListener("online", reconnected);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", reconnected);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  return (
    <PaywallProvider>
      <CreatorKeys />
      <RefCapture />
      <div className="app-surface relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {!online && (
          <p role="status" className="glass mx-4 mt-[max(0.5rem,env(safe-area-inset-top))] rounded-full px-4 py-2 text-center text-sm text-muted">
            {t("You're offline. Menus you've opened still work.")}
          </p>
        )}
        <main className={`flex-1 px-5 ${fullScreen ? "pb-8" : "pb-32"} pt-[max(1.25rem,env(safe-area-inset-top))]`}>
          {gate === "open" ? <div key={pathname} className={animate ? "rise" : undefined}>{children}</div> : gate === "wait" ? <Spinner /> : <SignInScreen />}
        </main>
        {!fullScreen && (
          // A dark floating bar like the founder's reference pictures (2026-10-15), the open tab in the app's lime. Its words stay under the
          // icons so everyone can read where each tab goes. Colours are fixed: the bar is the same on every screen.
          <nav
            aria-label={t("Main")}
            className="fixed inset-x-[12px] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto max-w-[calc(28rem-1.5rem)] rounded-[2rem] bg-[#1d2320] p-[6px] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)]"
          >
            <ul className="flex">
              {TABS.map((tab) => {
                const { href, label, Icon, match } = tab;
                const active = match(pathname);
                return (
                  <li key={href} className="min-w-0 flex-1">
                    <Link
                      href={tabTarget(tabMemory, tab, active)}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.5rem] text-center text-[0.8125rem] font-semibold leading-[1.1] transition-colors focus-visible:outline-[#d6efa0] ${active ? "text-[#d6efa0]" : "text-[#c2c9c4] hover:text-white"}`}
                    >
                      <span
                        aria-hidden
                        className={`inline-flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300 ${active ? "bg-[#d6efa0] text-[#0b1a12]" : "group-hover:bg-white/10"}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <TabLabel text={t(label)} />
                      {href === "/app/community" && <CommunityBadge />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
      {gate === "open" && <TrialOffer />}
      {gate === "open" && <RatingPrompt />}
    </PaywallProvider>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * True after the first in-app navigation. The screen a visit opens on appears at once (it is already in the HTML, and a
 * fade-in there only delays the first paint); screens reached inside the app get the gentle .rise entrance.
 */
function useNavigatedOnce(pathname: string): boolean {
  const [first] = useState(pathname);
  const [navigated, setNavigated] = useState(false);
  useEffect(() => {
    if (pathname !== first) setNavigated(true); // eslint-disable-line react-hooks/set-state-in-effect -- latches once
  }, [pathname, first]);
  return navigated || pathname !== first;
}
