"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { APP_BUILD } from "@/lib/mm/config";
import { chooseWarmChains } from "@/lib/mm/popular";
import { favoritesStore, outbox, savedStore } from "@/lib/mm/stores";
import { tabTarget } from "@/lib/mm/tabMemory";
import { useHydrated, useMenu, useSettings, useStore } from "../_lib/hooks";
import { installBackDepth } from "../_lib/backNav";
import { refreshHiddenLogos } from "../_lib/hiddenLogos";
import { refreshAppSwitches, useSignInRequired } from "../_lib/appSwitches";
import { menuClient } from "../_lib/menu";
import { warmOffline } from "../_lib/warm";
import { applyTextSize } from "../_lib/textSize";
import { bootAccount, useAccountChecking, useAccountUser } from "../_lib/account";
import { noteTabPage, useTabMemory } from "../_lib/tabMemoryStore";
import { useReminderSync } from "../_lib/reminderSync";
import { setLanguage, useT } from "../_lib/i18n";
import { litTab, SHARED_PAGES, TABS } from "../_lib/tabs";
import { TabLabel } from "./TabLabel";
import { CreatorKeys } from "../_lib/creator";
import { RefCapture } from "../../components/RefCapture";
import { site } from "@/site.config";
import { recheckStoredToken } from "@/lib/payments/client";
import { GATING_ENABLED, IAP_ENABLED } from "@/lib/mm/config";
import { signInGate } from "@/lib/mm/signInGate";
import { hasNative } from "@/lib/mm/native";
import { refreshAppStoreAccess } from "@/lib/payments/iap";
import { afterSignInGate } from "@/lib/mm/premiumFeatures";
import { welcomeProgressStore } from "@/lib/mm/welcomeSteps";
import { CoachMarks } from "./CoachMarks";
import { CommunityBadge } from "./CommunityBadge";
import { InfoBanner } from "./Note";
import { PaywallProvider } from "./Paywall";
import { holdTrialOfferThisVisit, TrialOffer } from "./TrialOffer";
import { RatingPrompt } from "./RatingPrompt";
import { SignInScreen } from "./SignInScreen";
import { Spinner } from "./ui";

// The five tabs (and the measured word under each icon) live in _lib/tabs.ts and TabLabel.tsx.

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  // a recipe opened from Home (the meal plan, the cooking tools) keeps Home lit, from Groceries keeps Groceries lit (lib: _lib/tabs.ts litTab)
  // (worked out while rendering when the address changes: the tab lit on the last page that isn't a shared one)
  const [nav, setNav] = useState<{ path: string; cameFrom: string | null }>({ path: pathname, cameFrom: null });
  if (nav.path !== pathname) setNav({ path: pathname, cameFrom: SHARED_PAGES.some((p) => nav.path.startsWith(p)) ? nav.cameFrom : litTab(nav.path, null) });
  const lit = litTab(pathname, nav.path === pathname ? nav.cameFrom : SHARED_PAGES.some((p) => nav.path.startsWith(p)) ? nav.cameFrom : litTab(nav.path, null));
  const hydrated = useHydrated();
  const settings = useSettings();
  const textSize = settings.textSize;
  const language = settings.language;
  // Everyone signs in (founder 2026-11-17; lib/mm/config.ts SIGN_IN_REQUIRED, unless numbite.com's switches file has made it optional: _lib/appSwitches.ts): until
  // someone is, every page but the welcome and offline screens shows the sign-in screen in its place (the address, a shared list's "#" included, stays as it is,
  // so the page opens once they're in). The welcome screens ask for the account themselves, as their last step (step 11, the redesign of 20 November 2026).
  const user = useAccountUser();
  const checking = useAccountChecking();
  const signInRequired = useSignInRequired();
  const gate = signInGate({ required: signInRequired, hydrated, signedIn: !!user, checking, pathname });
  const fullScreen = pathname.startsWith("/app/welcome") || gate !== "open";
  // A visit that came through the sign-in screen gets no free-trial sheet (every 1.0 user updating to 1.1 signs in once; the sheet used to pop up straight after)
  const sawSignIn = useRef(false);
  useEffect(() => {
    const next = afterSignInGate(sawSignIn.current, gate);
    sawSignIn.current = next.sawSignIn;
    if (next.holdTrialOffer) holdTrialOfferThisVisit();
  }, [gate]);
  const online = useOnline();
  const welcomeProgress = useStore(welcomeProgressStore);
  // the sign-in screen has its own offline line (the gate's, and the welcome screens' account step): no second one above it
  const signInShowing = gate !== "open" || (pathname.startsWith("/app/welcome") && welcomeProgress?.step === "save");
  usePageTitle(pathname, gate);
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
    // a purchase that arrives while the app is open (an Ask to Buy approval, a renewal, a purchase on another device): the iPhone says so at once
    // (StoreKitPurchaseService's updates listener → WebAppView), and Apple's list decides as on a return to the front
    const arrived = () => void refreshAppStoreAccess();
    document.addEventListener("visibilitychange", back);
    window.addEventListener(PURCHASES_EVENT, arrived);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener(PURCHASES_EVENT, arrived);
    };
  }, [hydrated]);

  // Signed in? (Optional: with no account nothing is sent anywhere.) Asks the server who this device is signed in as and starts syncing.
  useEffect(() => {
    if (hydrated) void bootAccount();
  }, [hydrated]);

  // Logos taken down at their owner's request (public/logos/hidden.json), and the remote switches (public/app-switches.json), each read once per launch.
  useEffect(() => { refreshHiddenLogos(); refreshAppSwitches(); }, []);

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
        {!online && !signInShowing && (
          // the approved "please note" banner (colour meeting, 19 November 2026): in the iPhone app everything packed works offline and only Pip's photo and
          // recipe features need the internet; the website keeps its own words (it works offline only for what was opened before)
          <InfoBanner heading={null} className="mx-4 mt-[max(0.5rem,env(safe-area-inset-top))]">
            {APP_BUILD ? t("You're offline. Menus, shops and recipes still work. Pip's photo and recipe features need a connection.") : t("You're offline. Menus you've opened still work.")}
          </InfoBanner>
        )}
        <main className={`flex-1 px-5 ${fullScreen ? "pb-8" : "pb-32"} pt-[max(1.25rem,env(safe-area-inset-top))]`}>
          {gate === "open" ? <div key={pathname} className={animate ? "rise" : undefined}>{children}</div> : gate === "wait" ? <Spinner /> : <SignInScreen />}
        </main>
        {!fullScreen && (
          // A dark floating bar like the founder's reference pictures (2026-10-15), the open tab in the app's lime ("where you are"). Its words stay under the
          // icons so everyone can read where each tab goes. The colour meeting's tokens (19 November 2026): the ink fill, lime for the open tab with its words in
          // the dark green, the other tabs' icons and words in the light grey for ink (10.26:1), and a lime focus ring on the ink.
          <nav
            aria-label={t("Main")}
            data-coach="tabs"
            className="on-ink fixed inset-x-[12px] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto max-w-[calc(28rem-1.5rem)] rounded-[2rem] bg-ink p-[6px] shadow-[var(--shadow-lift)]"
          >
            <ul className="flex">
              {TABS.map((tab) => {
                const { href, label, Icon } = tab;
                const active = href === lit;
                return (
                  <li key={href} className="min-w-0 flex-1">
                    <Link
                      href={tabTarget(tabMemory, tab, active)}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.5rem] text-center text-[0.8125rem] font-semibold leading-[1.1] transition-colors focus-visible:outline-sun ${active ? "text-sun" : "text-on-ink-2 hover:text-on-ink"}`}
                    >
                      <span
                        aria-hidden
                        className={`inline-flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300 ${active ? "bg-sun text-on-sun" : "group-hover:bg-ink-pressed"}`}
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
      {gate === "open" && !fullScreen && <CoachMarks />}
      {gate === "open" && <TrialOffer />}
      {gate === "open" && <RatingPrompt />}
    </PaywallProvider>
  );
}

/** The event the iPhone app fires into the page when StoreKit reports a purchase while the app is open (MenuMacros/Features/WebApp/WebAppView.swift). */
const PURCHASES_EVENT = "menumath:purchases";

/**
 * Every page used to be titled "App · Numbite", so VoiceOver's page-change announcement only worked by a timing accident. After each move inside the app the
 * title becomes the page's own heading, e.g. "Meal plan · Numbite" (the first page keeps the layout's title; the sign-in screen's heading counts too). Next.js
 * puts the layout's title back as it finishes a move, so the page's title is kept until the next move.
 */
function usePageTitle(pathname: string, gate: string): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let wanted: string | null = null;
    const keep = () => { if (wanted && document.title !== wanted) document.title = wanted; };
    const watch = new MutationObserver(keep);
    watch.observe(document.head, { childList: true, subtree: true, characterData: true });
    // the heading can arrive a moment after the page (its data loading): look again for up to a second, then fall back to the app's name alone
    let tries = 0;
    let timer = 0;
    const frame = window.requestAnimationFrame(function look() {
      const heading = headingText(document.querySelector("main h1"));
      if (heading) wanted = `${heading} · ${site.name}`;
      else if (++tries < 10) timer = window.setTimeout(look, 100);
      else wanted = site.name;
      keep();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      watch.disconnect();
    };
  }, [pathname, gate]);
}

/** A heading's own words: without a button or link inside it (Home's "Nov 20, Choose a day") or anything hidden, and without a trailing comma. */
function headingText(h1: Element | null): string | null {
  if (!h1) return null;
  const copy = h1.cloneNode(true) as Element;
  copy.querySelectorAll("button, a, [aria-hidden='true']").forEach((n) => n.remove());
  const own = (copy.textContent ?? "").replace(/\s+/g, " ").replace(/[\s,;:·-]+$/, "").trim();
  return own || (h1.textContent ?? "").replace(/\s+/g, " ").trim() || null;
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
