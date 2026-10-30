"use client";

import { useEffect, useState } from "react";
import type { SortKind } from "@/lib/mm/menu-view";

// How a restaurant's full menu was left: the sort, the sections opened with "Show all …" and how far a sorted list was shown. Kept for this browser tab
// (sessionStorage, on this device only, like Eat out's choices), per restaurant, so that opening a dish and coming Back, or leaving the Eat out tab and
// coming back to it, finds the menu as it was (founder's list: "switching tabs returns to the same page"). The words in the menu's search box are kept with
// the history entry instead (useEntryQuery). Everything read back is checked: anything that doesn't fit is the default, never an error.

export interface ChainView {
  sort: SortKind;
  /** The sections opened with "Show all …" (by their heading), in the order they were opened. */
  expanded: string[];
  /** How many rows a sorted (flat) list shows. */
  limit: number;
}

export const CHAIN_VIEW_KEY = "mm.chainView";
/** The most restaurants remembered at once (the one looked at last first). */
export const MAX_REMEMBERED = 20;
const MAX_SECTIONS = 200;
const MAX_SECTION_NAME = 200;
const MAX_LIMIT = 10_000;

interface StoredView extends ChainView {
  id: string;
}

export const defaultView = (page: number): ChainView => ({ sort: "menu", expanded: [], limit: page });

const isDefault = (v: ChainView, page: number) => v.sort === "menu" && v.expanded.length === 0 && v.limit === page;

/** The stored list (the newest first), with anything that isn't a well-formed entry left out. */
function storedViews(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object" || (raw as { v?: unknown }).v !== 1) return [];
  const chains = (raw as { chains?: unknown }).chains;
  return Array.isArray(chains) ? chains.slice(0, MAX_REMEMBERED) : [];
}

/** One restaurant's view from what was stored, checked: a sort this menu doesn't offer is menu order, a limit out of range is one page. */
export function readChainView(raw: unknown, chainId: string, opts: { page: number; sorts: readonly SortKind[] }): ChainView {
  const found = storedViews(raw).find((e): e is Record<string, unknown> => !!e && typeof e === "object" && (e as { id?: unknown }).id === chainId);
  const view = defaultView(opts.page);
  if (!found) return view;
  if (typeof found.sort === "string" && opts.sorts.includes(found.sort as SortKind)) view.sort = found.sort as SortKind;
  if (Array.isArray(found.expanded)) {
    view.expanded = [...new Set(found.expanded.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= MAX_SECTION_NAME))].slice(0, MAX_SECTIONS);
  }
  if (typeof found.limit === "number" && Number.isInteger(found.limit) && found.limit >= opts.page && found.limit <= MAX_LIMIT) view.limit = found.limit;
  return view;
}

/** What to store after a restaurant's view changed: that restaurant first (or taken out, when its view is the default again), at most MAX_REMEMBERED. */
export function writeChainView(raw: unknown, chainId: string, view: ChainView, page: number): { v: 1; chains: StoredView[] } {
  const others = storedViews(raw).filter(
    (e): e is StoredView => !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && (e as { id: string }).id !== chainId,
  );
  const mine: StoredView[] = isDefault(view, page) ? [] : [{ id: chainId, sort: view.sort, expanded: view.expanded.slice(0, MAX_SECTIONS), limit: view.limit }];
  return { v: 1, chains: [...mine, ...others].slice(0, MAX_REMEMBERED) };
}

function load(): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(CHAIN_VIEW_KEY) ?? "null");
  } catch {
    return null; // storage blocked (or nothing readable there): the default view
  }
}

/**
 * A restaurant's menu view, restored for this tab. Read when the menu is first drawn (the menu only appears in the browser, after it has loaded, so what is
 * restored is never a mismatch with the server's page), written whenever it changes.
 */
export function useChainView(chainId: string, sorts: readonly SortKind[], page: number): [ChainView, (change: (v: ChainView) => ChainView) => void] {
  const [view, setView] = useState<ChainView>(() => readChainView(load(), chainId, { page, sorts }));
  useEffect(() => {
    try {
      const next = writeChainView(load(), chainId, view, page);
      if (next.chains.length > 0) sessionStorage.setItem(CHAIN_VIEW_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(CHAIN_VIEW_KEY);
    } catch { /* not remembered, still works */ }
  }, [chainId, view, page]);
  return [view, setView];
}
