import type { Metadata } from "next";
import Link from "next/link";
import { APP_BUILD } from "@/lib/mm/config";
import { site } from "@/site.config";
import { Pip } from "./app/_components/Mascot";

// Any address that isn't a page, on the website and in the iPhone app (the static build serves it as 404.html). Without it Next's own page showed, black in dark
// mode and with no way back (the overnight audit, 20 November 2026). Like app/global-error.tsx it draws its own look inline, in the app's light colours (the
// app has no dark mode: founder 2026-10-15), so it reads the same whatever the page around it. English only, like the website.

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

const pill = { minHeight: 56, width: "100%", maxWidth: 320, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, fontSize: 18, fontWeight: 700, textDecoration: "none" } as const;

export default function NotFound() {
  return (
    <main style={{ colorScheme: "light", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 24px", textAlign: "center", background: "#f4f5f6", color: "#0b1a12" }}>
      <Pip mood="think" size={96} />
      <h1 style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 800, margin: 0 }}>We can&apos;t find that page</h1>
      <p style={{ fontSize: 17, lineHeight: 1.4, margin: 0, maxWidth: 360, color: "#4b5563" }}>The link may be old, or the address may have a typo.</p>
      <Link href="/app" style={{ ...pill, background: "#0b1a12", color: "#fff" }}>Go to Home</Link>
      {!APP_BUILD && (
        <Link href="/" style={{ minHeight: 48, display: "inline-flex", alignItems: "center", fontSize: 16, fontWeight: 600, color: "#0b1a12" }}>
          {site.name} website
        </Link>
      )}
    </main>
  );
}
