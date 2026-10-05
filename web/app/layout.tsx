import type { Metadata } from "next";
import localFont from "next/font/local"; // font files live in app/fonts: nothing is fetched from Google by visitors
import { site } from "@/site.config";
import "./globals.css";

// Plus Jakarta Sans (UI, variable weight) and Playfair Display italic (small editorial accents). Both SIL OFL.
const sans = localFont({
  src: "./fonts/PlusJakartaSans-latin.woff2",
  variable: "--font-sans-loaded",
  weight: "200 800",
  display: "swap",
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
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
