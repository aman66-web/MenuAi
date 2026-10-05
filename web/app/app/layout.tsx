import type { Metadata, Viewport } from "next";
import { site } from "@/site.config";
import { AppShell } from "./_components/AppShell";

export const metadata: Metadata = {
  title: "App",
  robots: { index: false, follow: false }, // the marketing site is what search engines should index
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1218" },
  ],
};

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <AppShell>{children}</AppShell>;
}
