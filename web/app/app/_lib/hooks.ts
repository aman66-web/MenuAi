"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ChainIndex } from "@/lib/mm/chain-index";
import { isPro } from "@/lib/mm/entitlements";
import type { MenuState } from "@/lib/mm/menu-client";
import type { Store } from "@/lib/mm/persist";
import { settingsStore } from "@/lib/mm/stores";
import { menuClient } from "./menu";

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.getServerSnapshot);
}

export function useSettings() {
  return useStore(settingsStore);
}

export function useIsPro(): boolean {
  return isPro(useSettings());
}

/** The menu catalogue (which chains exist). Starts the manifest load on first use. */
export function useMenu(): MenuState {
  const state = useSyncExternalStore(menuClient.subscribe, menuClient.getSnapshot, menuClient.getSnapshot);
  useEffect(() => {
    void menuClient.ensureManifest();
  }, []);
  return state;
}

export type ChainStatus = "loading" | "ready" | "error";

/** One chain's full menu, loaded on demand. */
export function useChain(id: string): { status: ChainStatus; index?: ChainIndex; error?: string; retry: () => void } {
  const state = useMenu();
  const index = state.indexes.get(id);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (index) return;
    let cancelled = false;
    menuClient.loadChain(id).catch((e: unknown) => {
      if (!cancelled) setFailure({ id, message: e instanceof Error ? e.message : "Couldn't load this menu." });
    });
    return () => {
      cancelled = true;
    };
  }, [id, index, attempt]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  if (index) return { status: "ready", index, retry };
  if (failure?.id === id) return { status: "error", error: failure.message, retry };
  return { status: "loading", retry };
}

/** Search index over every chain; loads the remaining chains in the background so item search is complete. */
export function useSearchIndex() {
  const state = useMenu();
  useEffect(() => {
    void menuClient.loadAll();
  }, []);
  return { searchIndex: state.searchIndex, loadedCount: state.indexes.size, totalCount: state.chains.length };
}

/** Re-renders every minute (meal slot, "New" tags and "today" can change while the app is open). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const noopSubscribe = () => () => {};
/** False during server rendering and hydration, true afterwards: guards anything that reads browser-only stores. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Loads the given chains in the background and reports, per chain id, its index, or "missing" if it left the catalogue. */
export function useChainIndexes(chainIds: readonly string[]): ReadonlyMap<string, ChainIndex | "missing"> {
  const state = useMenu();
  const key = [...new Set(chainIds)].sort().join("|");
  useEffect(() => {
    if (state.status !== "ready") return;
    for (const id of key ? key.split("|") : []) {
      if (state.chains.some((c) => c.id === id) && !state.indexes.has(id)) void menuClient.loadChain(id).catch(() => undefined);
    }
  }, [key, state.status, state.chains, state.indexes]);

  const result = new Map<string, ChainIndex | "missing">();
  for (const id of key ? key.split("|") : []) {
    const ix = state.indexes.get(id);
    if (ix) result.set(id, ix);
    else if (state.status === "ready" && !state.chains.some((c) => c.id === id)) result.set(id, "missing");
  }
  return result;
}
