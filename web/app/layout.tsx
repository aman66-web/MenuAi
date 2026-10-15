import type { Metadata } from "next";
import localFont from "next/font/local"; // font files live in app/fonts: nothing is fetched from Google by visitors
import { site } from "@/site.config";
import "./globals.css";

// Urbanist (all text, variable weight: the round geometric font of the founder's reference pictures, 2026-10-15: "change the font of
// the writing to match the font of the other ones I sent"), DM Mono (figures in data rows, like the Home picture) and Playfair Display
// italic (the website's small editorial accents). All SIL OFL (licences next to the files). Urbanist's latin-ext face comes next in the
// font stack, so Polish and Romanian letters (ł, ś, ă, ț) are drawn in the same font; the browser fetches it only when a page needs one
// of them. No size-adjusted fallback face for these two: it would sit between them and draw those letters in Arial instead.
const sans = localFont({
  src: "./fonts/Urbanist-latin.woff2",
  variable: "--font-sans-loaded",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: false,
});
const sansExt = localFont({
  src: "./fonts/Urbanist-latin-ext.woff2",
  variable: "--font-sans-ext",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});
const mono = localFont({
  src: [
    { path: "./fonts/DMMono-400-latin.woff2", weight: "400" },
    { path: "./fonts/DMMono-500-latin.woff2", weight: "500" },
  ],
  variable: "--font-mono-loaded",
  display: "swap",
  preload: false,
});
const serif = localFont({
  src: "./fonts/PlayfairDisplay-Italic-latin.woff2",
  variable: "--font-serif-loaded",
  weight: "400 700",
  style: "italic",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name}: ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: { title: site.name, description: site.description, type: "website" },
};

// Page chrome lives in the route-group layouts: app/(site) for the marketing site, app/app for the web app.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${sansExt.variable} ${mono.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
