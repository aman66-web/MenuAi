"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A tab's word under its icon, measured with the label's own font so it works in every language and script (a character count can't:
 * "Groceries" fits, "الإعدادات" at the same length may not): 13 px on one line; else 11 px if that keeps it on one line; else 13 px over two
 * lines, breaking only between words; else 11 px with the letters a touch closer if that saves the word (not in Arabic or Urdu, whose
 * letters join); else 11 px, hyphenated (broken anywhere only as a last resort), so the five tabs always fit.
 * Moved out of AppShell unchanged (2026-11-17): the welcome tour's copy of the bar uses it too.
 */
export function TabLabel({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<"" | "small" | "tight">("");
  useLayoutEffect(() => {
    const el = ref.current;
    const tab = el?.parentElement;
    const pen = document.createElement("canvas").getContext("2d");
    if (!el || !tab || !pen) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const room = tab.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1; // 1 px for rounding
      const width = (px: number, s: string) => { pen.font = `${cs.fontWeight} ${px}px ${cs.fontFamily}`; return pen.measureText(s).width; };
      const longest = (px: number) => Math.max(...text.split(/\s+/).map((word) => width(px, word)));
      const TIGHT = 0.03; // em taken off each letter's spacing
      const tightWidth = Math.max(...text.split(/\s+/).map((word) => width(11, word) - [...word].length * TIGHT * 11));
      if (width(13, text) <= room || (width(11, text) > room && longest(13) <= room)) setSize("");
      else if (width(11, text) <= room || longest(11) <= room || cs.direction === "rtl" || tightWidth > room) setSize("small");
      else setSize("tight");
    };
    fit();
    let live = true;
    document.fonts?.ready.then(() => { if (live) fit(); });
    const watch = new ResizeObserver(fit);
    watch.observe(tab);
    return () => { live = false; watch.disconnect(); };
  }, [text]);
  return (
    <span ref={ref} className={`line-clamp-2 block max-w-full hyphens-auto [overflow-wrap:anywhere] ${size === "small" ? "text-[11px]" : size === "tight" ? "text-[11px] tracking-[-0.03em]" : ""}`}>
      {text}
    </span>
  );
}
