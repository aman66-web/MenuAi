"use client";

import { useSyncExternalStore } from "react";
import { readMemory, remember, type TabDef, type TabMemory } from "@/lib/mm/tabMemory";

// Where each tab was last (lib/mm/tabMemory.ts), kept for this tab of the browser only.
const KEY = "mm.tabs";
let memory: TabMemory = {};
let loaded = false;
const listeners = new Set<() => void>();
const EMPTY: TabMemory = {};

function load(tabs: readonly TabDef[]): void {
  if (loaded) return;
  loaded = true;
  try { memory = { ...readMemory(sessionStorage.getItem(KEY), tabs), ...memory }; } catch { /* storage blocked: tabs just open their first page */ }
}

/** The person arrived on this page: remember it for its tab. */
export function noteTabPage(tabs: readonly TabDef[], path: string, search: string): void {
  const before = memory;
  load(tabs);
  memory = remember(memory, tabs, path, search);
  if (memory !== before) {
    try { sessionStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* ignore */ }
    listeners.forEach((fn) => fn());
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useTabMemory(): TabMemory {
  return useSyncExternalStore(subscribe, () => memory, () => EMPTY);
}
