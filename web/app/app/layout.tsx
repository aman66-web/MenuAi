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
    { media: "(prefers-color-scheme: dark)", color: "#04100a" },
  ],
};

// First visit (SPEC §7.1): send people to onboarding before the app's JavaScript has even loaded, so they see the welcome
// screen straight from its static HTML instead of a spinner then a redirect. Same rule as AppShell's effect, which stays as
// the fallback (e.g. storage blocked). The settings key and shape are lib/mm/stores.ts + persist.ts ({ v, data }).
// The chosen language (lib/mm/i18n.ts) also applies before the first paint: <html lang/dir> straight away, and the page stays hidden
// until that language's words have loaded (AppShell) so nobody sees a flash of English; it shows anyway after 3 seconds.
const RTL = ["ur", "ar"];
const LANGS: Record<string, string> = { pl: "pl", ro: "ro", pa: "pa", ur: "ur", pt: "pt", es: "es", ar: "ar", bn: "bn", gu: "gu", it: "it" };
const ONBOARDING_REDIRECT = `try{var z=JSON.parse(localStorage.getItem("mm.v1.settings")||"null"),t=z&&z.data&&z.data.textSize,l=z&&z.data&&z.data.language,h=document.documentElement,L=${JSON.stringify(LANGS)};if(t==="large")h.style.fontSize="115%";else if(t==="xlarge")h.style.fontSize="130%";if(l&&L[l]){h.lang=L[l];h.dir=${JSON.stringify(RTL)}.indexOf(l)>=0?"rtl":"ltr";h.dataset.i18nPending="1";setTimeout(function(){delete h.dataset.i18nPending},3000)}}catch(e){}try{var p=location.pathname;if(!/^\\/app\\/(welcome|offline)/.test(p)){var s=JSON.parse(localStorage.getItem("mm.v1.settings")||"null");if(!(s&&s.data&&s.data.hasCompletedOnboarding))location.replace("/app/welcome?next="+encodeURIComponent(p+location.search))}}catch(e){}`;

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: ONBOARDING_REDIRECT }} />
      <AppShell>{children}</AppShell>
    </>
  );
}
