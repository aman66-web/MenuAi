// The app's colour schemes (founder 2026-11-26: "at the end of the onboarding, at the end of it, they then can pick a color scheme, and the default one's the
// one it's on now, but they can choose another color scheme if they want and make the color schemes quite nice and cool"). Picked on the welcome screens'
// last question and in Settings › Colours. Each is a set of brand colours in app/globals.css (`:root[data-scheme="…"]` and `.scheme-…`); Lime is today's look
// and the default. Light only (founder 2026-10-15: no dark mode). A scheme is this device's own, like the text size: it is never synced (lib/mm/syncStores.ts),
// and Clear data keeps it. Pure, so the tests can load it.

import { tk } from "./i18n";

export const COLOUR_SCHEMES = ["lime", "mint", "ocean", "lavender", "berry", "sunset"] as const;
export type ColourScheme = (typeof COLOUR_SCHEMES)[number];

/** Today's look: what everyone has until they pick another. */
export const DEFAULT_COLOUR_SCHEME: ColourScheme = "lime";

/** Each scheme's name on screen. */
export const COLOUR_SCHEME_NAMES: Readonly<Record<ColourScheme, string>> = {
  lime: tk("Lime"),
  mint: tk("Mint"),
  ocean: tk("Ocean"),
  lavender: tk("Lavender"),
  berry: tk("Berry"),
  sunset: tk("Sunset"),
};

export const isColourScheme = (x: unknown): x is ColourScheme => typeof x === "string" && (COLOUR_SCHEMES as readonly string[]).includes(x);

/** The scheme to draw: the one stored, or Lime when none is (or it isn't one we have). */
export const schemeOf = (s: unknown): ColourScheme => (isColourScheme(s) ? s : DEFAULT_COLOUR_SCHEME);

/** The value of <html data-scheme>: none for Lime (globals.css's plain colours are Lime's), the scheme's id otherwise. */
export const schemeAttribute = (s: unknown): string | null => {
  const scheme = schemeOf(s);
  return scheme === DEFAULT_COLOUR_SCHEME ? null : scheme;
};

/** The schemes that set <html data-scheme> (all but Lime): what the layout's first-paint script accepts from storage. */
export const SCHEME_ATTRIBUTES: readonly string[] = COLOUR_SCHEMES.filter((s) => s !== DEFAULT_COLOUR_SCHEME);
