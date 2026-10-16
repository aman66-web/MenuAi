"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { enteredFull, FS_IDLE, fsStep, popRestoresScroll, SETTLE_MS, type FsEvent, type FsState } from "@/lib/mm/mapFullscreen";

/**
 * State, history entry, Escape and focus for the Nearby map's full screen. `machine` is the source of truth for bookkeeping (it is read
 * by event handlers that may run twice before React renders); `view` mirrors it for rendering.
 */
export function useMapFullscreen(frameRef: RefObject<HTMLElement | null>, buttonRef: RefObject<HTMLElement | null>) {
  const machine = useRef<FsState>(FS_IDLE);
  const [view, setView] = useState<FsState>(FS_IDLE);
  const savedScroll = useRef(0);
  const settleTimer = useRef<number | null>(null);

  const restoreScroll = useCallback(() => {
    if (Math.abs(window.scrollY - savedScroll.current) > 1) window.scrollTo({ top: savedScroll.current, left: 0, behavior: "instant" });
  }, []);

  const dispatch = useCallback(function dispatch(event: FsEvent) {
    const before = machine.current;
    const { state, effects } = fsStep(before, event);
    if (enteredFull(before, state)) savedScroll.current = window.scrollY; // on every way in, pushed entry or not (PUSH_FULLSCREEN_ENTRY off, push failed)
    machine.current = state;
    setView(state);
    for (const effect of effects) {
      if (effect === "push") {
        try {
          window.history.pushState(null, ""); // NO url: Next's patched pushState then only copies its own internal state into the new entry
        } catch {
          dispatch("pushFailed"); // a sandboxed context: full screen still works, Back just leaves the page as before
        }
      } else {
        window.history.back();
        settleTimer.current = window.setTimeout(() => dispatch("settled"), SETTLE_MS);
      }
    }
  }, []);

  useEffect(() => { // pure add/remove: safe under StrictMode's double run
    const onPop = () => {
      const before = machine.current;
      dispatch("pop");
      if (popRestoresScroll(before)) window.requestAnimationFrame(restoreScroll); // not for a Back that just leaves the page
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !machine.current.full || e.defaultPrevented) return; // MapLibre's keyboard handler ignores Escape
      e.preventDefault();
      dispatch("leave");
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      // No history.back() here: the only unmount-while-full path (the card's Menu link) has already replaced our entry.
    };
  }, [dispatch, restoreScroll]);

  const wasFull = useRef(false);
  useEffect(() => { // focus into the dialog on enter, back to the button on exit; belt-and-braces scroll guard
    if (view.full) frameRef.current?.focus({ preventScroll: true });
    else if (wasFull.current) {
      buttonRef.current?.focus({ preventScroll: true });
      restoreScroll();
    }
    wasFull.current = view.full;
  }, [view.full, frameRef, buttonRef, restoreScroll]);

  const toggle = useCallback(() => dispatch(machine.current.full ? "leave" : "enter"), [dispatch]);
  const leave = useCallback(() => dispatch("leave"), [dispatch]);
  return { full: view.full, ownEntry: view.ownEntry, toggle, leave };
}

/**
 * While `active`, every direct child of `root` except the one containing `keep` is inert (no Tab, no VoiceOver, no taps). `inert` is
 * inherited, so it is applied to siblings of the slot, never to an ancestor of the frame.
 */
export function useInertOutside(root: RefObject<HTMLElement | null>, keep: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const r = root.current;
    const k = keep.current;
    if (!active || !r || !k) return;
    const touched: Element[] = [];
    for (const child of Array.from(r.children)) {
      if (child.contains(k) || child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      touched.push(child);
    }
    return () => touched.forEach((c) => c.removeAttribute("inert"));
  }, [root, keep, active]);
}
