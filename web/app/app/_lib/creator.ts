"use client";

import { useEffect, useSyncExternalStore } from "react";

// Creator "Filming mode" (founder's brief, 13 Nov 2026): a quiet switch for making videos. On, the Truth and Swap cards are the high-contrast dark card with bigger
// figures and a Replay button, and the tab bar is hidden so the screen is clean. Shift+F toggles it (never while typing in a box), and Settings has the same switch.
// Kept in the browser tab's session storage only: nothing about it is saved on the phone for good, sent anywhere or synced.

const KEY = "mm.creator";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function apply(on: boolean) {
  if (typeof document !== "undefined") document.documentElement.toggleAttribute("data-creator", on);
}

export function setCreatorMode(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked: the switch still works for this page view
    apply(on);
  }
  apply(on);
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useCreatorMode(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Whether a key press happened while the person was typing (Shift+F in a search box must type an F). */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/** Mounted once in the app shell: applies the saved state on load and listens for Shift+F. */
export function CreatorKeys() {
  useEffect(() => {
    apply(read());
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F" || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTypingTarget(e.target)) return;
      setCreatorMode(!read());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
