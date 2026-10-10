"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { tk } from "@/lib/mm/i18n";
import { chooseWarmChains } from "@/lib/mm/popular";
import { favoritesStore, outbox, savedStore } from "@/lib/mm/stores";
import { useHydrated, useMenu, useSettings, useStore } from "../_lib/hooks";
import { menuClient } from "../_lib/menu";
import { warmOffline } from "../_lib/warm";
import { applyTextSize } from "../_lib/textSize";
import { setLanguage, useT } from "../_lib/i18n";
import { BasketIcon, ForkIcon, GearIcon, HomeIcon, PotIcon } from "./icons";
import { PaywallProvider } from "./Paywall";

// Five tabs, one job each (founder 2026-10-10): Home is today (your numbers and your own lists), then the three things the app does —
// eat out, shop, cook — then Settings. Pages inside a tab keep that tab lit.
const TABS = [
  { href: "/app", label: tk("Home"), Icon: HomeIcon, match: (p: string) => p === "/app" || p.startsWith("/app/today") || p.startsWith("/app/saved") || p.startsWith("/app/groceries/list") || p.startsWith("/app/recipes/saved") },
  { href: "/app/eat-out", label: tk("Eat out"), Icon: ForkIcon, match: (p: string) => p.startsWith("/app/eat-out") || p.startsWith("/app/map") || p.startsWith("/app/chain") || p.startsWith("/app/item") || p.startsWith("/app/search") || p.startsWith("/app/builder") },
  { href: "/app/groceries", label: tk("Groceries"), Icon: BasketIcon, match: (p: string) => p.startsWith("/app/groceries") && !p.startsWith("/app/groceries/list") },
  { href: "/app/recipes", label: tk("Recipes"), Icon: PotIcon, match: (p: string) => p.startsWith("/app/recipes") && !p.startsWith("/app/recipes/saved") },
  { href: "/app/settings", label: tk("Settings"), Icon: GearIcon, match: (p: string) => p.startsWith("/app/settings") },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const settings = useSettings();
  const onboarded = settings.hasCompletedOnboarding;
  const textSize = settings.textSize;
  const language = settings.language;
  const fullScreen = pathname.startsWith("/app/welcome");
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

  // Text size from Settings / onboarding (the layout's inline script applies it before the first paint too).
  useEffect(() => {
    if (hydrated) applyTextSize(textSize);
  }, [hydrated, textSize]);

  // The app's language (Settings / the first onboarding screen); English until another is chosen.
  useEffect(() => {
    if (hydrated) void setLanguage(language ?? "en");
  }, [hydrated, language]);

  // First visit (SPEC §7.1): onboarding comes first, wherever the link pointed. It returns there when done.
  useEffect(() => {
    if (!hydrated || onboarded || pathname.startsWith("/app/welcome") || pathname.startsWith("/app/offline")) return;
    const next = window.location.pathname + window.location.search;
    router.replace(`/app/welcome?next=${encodeURIComponent(next)}`);
  }, [hydrated, onboarded, pathname, router]);

  // Offline support (public/sw.js). Production only, so development never serves stale files.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
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
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {!online && (
          <p role="status" className="glass mx-4 mt-[max(0.5rem,env(safe-area-inset-top))] rounded-full px-4 py-2 text-center text-xs text-muted">
            {t("You're offline. Menus you've opened still work.")}
          </p>
        )}
        <main className={`flex-1 px-5 ${fullScreen ? "pb-8" : "pb-32"} pt-[max(1.25rem,env(safe-area-inset-top))]`}>
          <div key={pathname} className={animate ? "rise" : undefined}>{children}</div>
        </main>
        {!fullScreen && (
          <nav
            aria-label={t("Main")}
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto max-w-[calc(28rem-1.5rem)] rounded-[1.75rem] border border-line bg-[var(--nav-bg)] p-1.5 shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_20px_44px_-18px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150"
          >
            <ul className="flex">
              {TABS.map(({ href, label, Icon, match }) => {
                const active = match(pathname);
                return (
                  <li key={href} className="flex-1">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold tracking-wide transition-colors ${active ? "text-accent" : "text-muted hover:text-foreground"}`}
                    >
                      <span
                        aria-hidden
                        className={`inline-flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300 ${active ? "bg-sun text-on-accent shadow-[0_6px_16px_-6px_var(--brand-shadow)]" : "group-hover:bg-soft-strong"}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      {/* one line in every language: a long word is cut short rather than pushing the bar taller */}
                      <span className="block max-w-full truncate px-0.5">{t(label)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
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
