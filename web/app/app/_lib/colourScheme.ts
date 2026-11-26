import { DEFAULT_COLOUR_SCHEME, schemeAttribute, type ColourScheme } from "@/lib/mm/colourSchemes";
import { updateSettings } from "@/lib/mm/stores";

/** Draws the app in a colour scheme (app/globals.css reads <html data-scheme>; the layout's first-paint script sets it before anything shows, too). */
export function applyColourScheme(scheme: ColourScheme | undefined): void {
  if (typeof document === "undefined") return;
  const attr = schemeAttribute(scheme);
  const html = document.documentElement;
  if (attr) html.dataset.scheme = attr;
  else delete html.dataset.scheme;
}

/** Picks a scheme: saved on this device (Lime as none) and drawn at once, so the whole screen shows it while the person is still choosing. */
export function chooseColourScheme(scheme: ColourScheme): void {
  updateSettings({ colourScheme: scheme === DEFAULT_COLOUR_SCHEME ? undefined : scheme });
  applyColourScheme(scheme);
}
