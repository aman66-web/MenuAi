// The strip behind the iPhone's clock and battery once a screen has scrolled (founder 2026-11-17, in screenshots: product names and headings slid under the
// clock). The page marks <html data-scrolled> when it has scrolled a little; globals.css then paints a page-coloured strip as tall as the status bar (the phone's
// safe-area inset: nothing on a desktop browser). At the top of a screen it stays off, so a recipe's picture still runs up under the status bar.
if (typeof window !== "undefined" && !(window as unknown as { __mmStatusBar?: boolean }).__mmStatusBar) {
  (window as unknown as { __mmStatusBar?: boolean }).__mmStatusBar = true;
  let frame = 0;
  const mark = () => {
    frame = 0;
    document.documentElement.toggleAttribute("data-scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", () => { if (!frame) frame = window.requestAnimationFrame(mark); }, { passive: true });
  mark();
}
export {};
