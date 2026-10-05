"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { outbox } from "@/lib/mm/stores";
import { useMenu } from "../_lib/hooks";
import { menuClient } from "../_lib/menu";
import { warmOffline } from "../_lib/warm";
import { BookmarkIcon, GearIcon, HomeIcon, TodayIcon } from "./icons";
import { PaywallProvider } from "./Paywall";

const TABS = [
  { href: "/app", label: "Home", Icon: HomeIcon, match: (p: string) => p === "/app" || p.startsWith("/app/chain") || p.startsWith("/app/search") || p.startsWith("/app/builder") },
  { href: "/app/saved", label: "Saved", Icon: BookmarkIcon, match: (p: string) => p.startsWith("/app/saved") },
  { href: "/app/today", label: "Today", Icon: TodayIcon, match: (p: string) => p.startsWith("/app/today") },
  { href: "/app/settings", label: "Settings", Icon: GearIcon, match: (p: string) => p.startsWith("/app/settings") },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullScreen = pathname.startsWith("/app/welcome");
  const online = useOnline();
  const menu = useMenu();

  // Warm the offline cache once the catalogue is known (production only; see _lib/warm.ts).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || menu.status !== "ready" || menu.chains.length === 0) return;
    void warmOffline(menu.chains, (id) => menuClient.loadChain(id));
  }, [menu.status, menu.chains]);

  // Offline support (public/sw.js). Production only, so development never serves stale files.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/app", updateViaCache: "none" }).catch(() => undefined);
    }
  }, []);

  // Retry queued submissions whenever the app becomes active or the network returns (SPEC §12).
  useEffect(() => {
    const flush = () => void outbox().flush();
    const reconnected = () => void outbox().flush({ afterReconnect: true });
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
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
        {!online && (
          <p role="status" className="bg-soft px-4 py-2 text-center text-xs text-muted">
            You&apos;re offline. Menus you&apos;ve opened still work.
          </p>
        )}
        <main className={`flex-1 px-4 ${fullScreen ? "pb-8" : "pb-28"} pt-[max(1rem,env(safe-area-inset-top))]`}>{children}</main>
        {!fullScreen && (
          <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-background/95 backdrop-blur">
            <ul className="mx-auto flex max-w-md pb-[env(safe-area-inset-bottom)]">
              {TABS.map(({ href, label, Icon, match }) => {
                const active = match(pathname);
                return (
                  <li key={href} className="flex-1">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-accent" : "text-muted"}`}
                    >
                      <Icon className="h-6 w-6" />
                      {label}
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
