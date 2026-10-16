"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { ARM_MS } from "@/lib/mm/mapFullscreen";
import { ExpandIcon, ShrinkIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";

// The Nearby map's frame (founder 2026-10-16: a full screen button at the bottom right, then move and pinch like Google Maps). One
// persistent element holds the map: in the page it fills the slot below; in full screen the SAME element becomes position:fixed over the
// whole screen, so the map is never moved, remounted or rebuilt (its canvas, pins, logos, selection and camera stay as they are) and the
// page behind keeps its height and scroll position.
//
// The slot is an in-flow placeholder with NO glass/overflow/rounding/transform/z-index: it keeps the page height while the frame is fixed
// (a transform, filter or backdrop-filter on an ancestor of the frame would trap position:fixed). Scroll lock and the hidden tab bar are
// CSS keyed off the frame's attribute, so they vanish with the frame if the page unmounts. `.app-surface > nav` is AppShell's tab bar.
const CSS = `
  :root:has([data-nearby-fs="full"]) { overflow: hidden; overscroll-behavior: none; }
  :root:has([data-nearby-fs="full"]) .app-surface > nav { display: none; }
  .map-fs-button { position: absolute; z-index: 10; right: 22px; bottom: 22px; }
  [data-nearby-fs="full"] .map-fs-button { right: calc(max(12px, env(safe-area-inset-right)) + 10px); bottom: calc(max(12px, env(safe-area-inset-bottom)) + 10px + var(--fs-lift, 0px)); }
`;

export function MapFrame({ full, frameRef, buttonRef, onToggle, failed, card, children }: {
  full: boolean;
  frameRef: RefObject<HTMLDivElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  /** The map could not load: there is nothing to enlarge, so no button. */
  failed: boolean;
  /** The selected restaurant's card, shown inside the frame while it is full (the page's own copy is hidden behind it). */
  card: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const mountedAt = useRef(0);
  useEffect(() => { mountedAt.current = performance.now(); }, []);
  const label = full ? t("Exit full screen") : t("Full screen");
  return (
    <div data-nearby-slot className="relative mt-5 h-[46dvh] min-h-72">
      <style>{CSS}</style>
      {/* The frame's `style` prop is never used: SelectedCard sets --fs-lift on it imperatively. */}
      <div
        ref={frameRef}
        data-nearby-fs={full ? "full" : "page"}
        role={full ? "dialog" : undefined}
        aria-modal={full ? true : undefined}
        aria-label={full ? t("Map") : undefined}
        tabIndex={full ? -1 : undefined}
        className={full
          ? "fixed inset-0 z-50 touch-none overflow-hidden overscroll-none bg-soft-strong outline-none"
          : "glass absolute inset-0 overflow-hidden rounded-[1.25rem] bg-soft-strong"}
      >
        {children}
        {!failed && (
          <button
            ref={buttonRef}
            type="button"
            // ignored in the first half second: the page-entrance animation leaves a transform on an ancestor, which would trap position:fixed
            onClick={() => { if (performance.now() - mountedAt.current >= ARM_MS) onToggle(); }}
            aria-label={label}
            title={label}
            className="map-fs-button inline-flex h-[44px] w-[44px] touch-manipulation items-center justify-center rounded-2xl bg-white text-foreground shadow-[0_1px_2px_rgba(17,24,20,0.06),0_10px_24px_-16px_rgba(17,24,20,0.3)] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95"
          >
            {full ? <ShrinkIcon className="h-6 w-6" /> : <ExpandIcon className="h-6 w-6" />}
          </button>
        )}
        {full && card}
      </div>
    </div>
  );
}
