import type { Metadata, Viewport } from "next";
import { site } from "@/site.config";
import { APP_BUILD, LANGUAGES_ENABLED, TEXT_SIZE_CHOICE_ENABLED } from "@/lib/mm/config";
import { AUTO_TOUR_ON_WEBSITE, TOUR_GATE_SCRIPT } from "@/lib/mm/tour";
import { AppShell } from "./_components/AppShell";

export const metadata: Metadata = {
  title: "App",
  robots: { index: false, follow: false }, // the marketing site is what search engines should index
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#f4f5f6", // the app's light grey (globals.css .app-surface); there is no dark mode
};

// Links still open at once (founder's brief, 13 Nov 2026: "instant utility first"): a link to a chain, a dish, a shared list or a friend's invite opens it straight
// away with sensible defaults, and Home and Eat out offer a quiet card to set a goal and a diet (_components/StartPrompt.tsx). Only a plain first launch (the
// app's start page with nothing after it, by someone with nothing set up or stored: lib/mm/tour.ts) opens the welcome tour, sent there by TOUR_GATE_SCRIPT before
// anything is drawn. This script first applies the chosen text size before the first paint so a large-text reader never sees the page jump, then runs that
// gate. The settings key and shape are lib/mm/stores.ts + persist.ts ({ v, data }).
// The chosen language (lib/mm/i18n.ts) also applies before the first paint: <html lang/dir> straight away, and the page stays hidden
// until that language's words have loaded (AppShell) so nobody sees a flash of English; it shows anyway after 3 seconds.
const RTL = ["ur", "ar"];
const LANGS: Record<string, string> = !LANGUAGES_ENABLED ? {} : { pl: "pl", ro: "ro", pa: "pa", ur: "ur", pt: "pt", es: "es", ar: "ar", bn: "bn", gu: "gu", it: "it" };
const FIRST_PAINT = `try{var z=JSON.parse(localStorage.getItem("mm.v1.settings")||"null"),t=z&&z.data&&z.data.textSize,l=z&&z.data&&z.data.language,h=document.documentElement,L=${JSON.stringify(LANGS)};${TEXT_SIZE_CHOICE_ENABLED ? 'if(t==="large")h.style.fontSize="115%";else if(t==="xlarge")h.style.fontSize="130%";' : ""}if(l&&L[l]){h.lang=L[l];h.dir=${JSON.stringify(RTL)}.indexOf(l)>=0?"rtl":"ltr";h.dataset.i18nPending="1";setTimeout(function(){delete h.dataset.i18nPending},3000)}}catch(e){}`;

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: FIRST_PAINT + (APP_BUILD || AUTO_TOUR_ON_WEBSITE ? TOUR_GATE_SCRIPT : "") }} />
      <AppShell>{children}</AppShell>
    </>
  );
}
