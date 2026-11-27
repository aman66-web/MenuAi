import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The homepage hero's sunrise (founder 2026-11-27; app/globals.css .hero-lime): the brand lime at the top, the app icon's bright lime from the sides, its green
// rising behind the phone. The words sit only on the lime part, so black words must read on every light colour of it; the green is behind the phone only.

const CSS = readFileSync("app/globals.css", "utf8");
const root = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("}", CSS.indexOf(":root {")));
const token = (name: string): string => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, "i").exec(root);
  if (!m) throw new Error(`${name} is not a #rrggbb token in :root`);
  return m[1]!.toLowerCase();
};

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) =>
  channels(hex)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
/** color-mix(in srgb, a, b p%) */
const mix = (a: string, b: string, p: number) =>
  `#${channels(a).map((c, i) => Math.round(c * (1 - p) + channels(b)[i]! * p).toString(16).padStart(2, "0")).join("")}`;

describe("the homepage hero's sunrise", () => {
  const sun = token("--sun");
  const lime = token("--icon-lime");
  const words = token("--foreground");

  it("takes its colours from the app icon", () => {
    const icon = readFileSync("design/icon.svg", "utf8").toLowerCase();
    for (const name of ["--icon-lime", "--icon-green", "--icon-deep"]) expect(icon).toContain(token(name));
  });

  it("keeps black words above AA on every light colour the words can sit on", () => {
    // from the brand lime at the top, through the lime the gradient ends on, to the icon's bright lime at full strength (the side glows are at most 90%)
    for (const back of [sun, mix(sun, lime, 0.55), lime]) expect(ratio(words, back), `words on ${back}`).toBeGreaterThanOrEqual(11);
  });

  it("starts at exactly the brand lime, so it joins the lime header with no seam, and goes flat with Increase contrast", () => {
    const hero = CSS.slice(CSS.indexOf(".hero-lime {"), CSS.indexOf("}", CSS.indexOf(".hero-lime {")));
    expect(hero).toMatch(/linear-gradient\(180deg, var\(--sun\) 0%, var\(--sun\) \d+%/);
    expect(CSS).toContain("@media (prefers-contrast: more) { .hero-lime, :root:has(.hero-lime) .site-header { background: var(--sun); } }");
  });
});
