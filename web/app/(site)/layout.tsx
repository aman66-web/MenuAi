import Link from "next/link";
import { APP_BUILD } from "@/lib/mm/config";
import { site } from "@/site.config";
import { SiteBack } from "./SiteBack";

// Marketing site chrome (landing page, privacy, terms, support). The web app under /app has its own layout.
// Look (founder 2026-10-15): the app's own icon beside the name, quiet links, and the app's black pill for "Open app".
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-full flex flex-col">
      {APP_BUILD ? (
        // Inside the iPhone app these pages (privacy, terms, support) are reached from Settings or the welcome screen: a plain Back bar (it returns to the page that opened them), not the website's header.
        <header className="sticky top-0 z-30 border-b border-line bg-[var(--nav-bg)] backdrop-blur-xl pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex min-h-14 w-full max-w-3xl items-center px-3">
            <SiteBack />
          </div>
        </header>
      ) : (
      <header className="sticky top-0 z-30 border-b border-line bg-[var(--nav-bg)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-x-2 px-[20px] py-2.5">
          <Link href={APP_BUILD ? "/app" : "/"} className="inline-flex min-h-11 items-center gap-2.5 whitespace-nowrap text-lg font-[650] tracking-[-0.01em]">
            {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
            <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
            {site.name}
          </Link>
          <nav aria-label="Site" className="flex flex-wrap items-center gap-1 text-[0.9375rem] font-semibold text-muted">
            <Link href="/support" className="inline-flex min-h-11 items-center rounded-full px-3 transition-colors hover:text-foreground">Support</Link>
            <Link href="/privacy" className="hidden min-h-11 items-center rounded-full px-3 transition-colors hover:text-foreground sm:inline-flex">Privacy</Link>
            {!APP_BUILD && (
              <Link href="/app" className="ms-2 inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-foreground px-5 font-semibold text-background transition hover:bg-[color-mix(in_srgb,var(--foreground)_86%,white)] active:scale-[0.97]">
                Open app
              </Link>
            )}
          </nav>
        </div>
      </header>
      )}
      <main className="flex-1">{children}</main>
      <footer className="mx-auto mt-16 w-full max-w-5xl border-t border-line px-[20px] py-10 text-sm text-muted">
        <div className="flex flex-col gap-6 sm:flex-row-reverse sm:items-start sm:justify-between sm:gap-10">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Link href="/privacy" className="inline-flex min-h-11 items-center transition-colors hover:text-foreground">Privacy policy</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center transition-colors hover:text-foreground">Terms</Link>
            <Link href="/support" className="inline-flex min-h-11 items-center transition-colors hover:text-foreground">Support</Link>
            <a href={`mailto:${site.supportEmail}`} className="inline-flex min-h-11 items-center break-all transition-colors hover:text-foreground">{site.supportEmail}</a>
          </div>
          <p className="max-w-md leading-relaxed sm:pt-2.5">
            © {new Date().getFullYear()} {site.name}. Not affiliated with any restaurant. Nutrition information comes from each
            chain&apos;s published data. Not medical advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
