"use client";

// Focus rings only for people using a keyboard (founder 2026-11-17, on the "Add water" and "Sign in" sheets: "the green box there again ... you need to fix
// that"). On an iPhone, focus the app moves itself (a sheet's title, the button a closed sheet returns to) counts as "visible", so a tap could leave a green
// ring. The page now marks <html data-keys> after a Tab, arrow or other navigation key and clears it on any touch or click; globals.css hides rings
// while it is cleared on /app screens only (text boxes keep theirs, so it's clear where typing goes; the website never loads this, so its rings are untouched). Keyboard users still see every ring; VoiceOver draws its own.
const NAV_KEYS = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Escape"]);

if (typeof window !== "undefined" && !(window as unknown as { __mmModality?: boolean }).__mmModality) {
  (window as unknown as { __mmModality?: boolean }).__mmModality = true;
  const root = document.documentElement;
  window.addEventListener("keydown", (e) => { if (NAV_KEYS.has(e.key) || ((e.key === "Enter" || e.key === " ") && root.hasAttribute("data-keys"))) root.setAttribute("data-keys", ""); }, true);
  const pointer = () => root.removeAttribute("data-keys");
  window.addEventListener("pointerdown", pointer, true);
  window.addEventListener("touchstart", pointer, { capture: true, passive: true });
}

export {};
