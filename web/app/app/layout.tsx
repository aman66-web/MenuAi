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
    { media: "(prefers-color-scheme: light)", color: "#fbf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#050507" },
  ],
};

// First visit (SPEC §7.1): send people to onboarding before the app's JavaScript has even loaded, so they see the welcome
// screen straight from its static HTML instead of a spinner then a redirect. Same rule as AppShell's effect, which stays as
// the fallback (e.g. storage blocked). The settings key and shape are lib/mm/stores.ts + persist.ts ({ v, data }).
const ONBOARDING_REDIRECT = `try{var p=location.pathname;if(!/^\\/app\\/(welcome|offline)/.test(p)){var s=JSON.parse(localStorage.getItem("mm.v1.settings")||"null");if(!(s&&s.data&&s.data.hasCompletedOnboarding))location.replace("/app/welcome?next="+encodeURIComponent(p+location.search))}}catch(e){}`;

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: ONBOARDING_REDIRECT }} />
      <AppShell>{children}</AppShell>
    </>
  );
}
