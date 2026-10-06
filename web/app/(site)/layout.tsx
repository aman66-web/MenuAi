import Link from "next/link";
import { site } from "@/site.config";

// Marketing site chrome (landing page, privacy, terms, support). The web app under /app has its own layout.
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-[var(--nav-bg)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-x-2 px-5 py-2.5">
          <Link href="/" className="inline-flex min-h-11 items-center whitespace-nowrap text-lg font-extrabold tracking-tight">
            {site.name}
          </Link>
          <nav aria-label="Site" className="flex flex-wrap items-center gap-1 text-sm font-semibold text-muted">
            <Link href="/support" className="inline-flex min-h-11 items-center rounded-full px-3 hover:text-foreground">Support</Link>
            <Link href="/privacy" className="hidden min-h-11 items-center rounded-full px-3 hover:text-foreground sm:inline-flex">Privacy</Link>
            <Link href="/app" className="btn-sun ml-2 inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 font-bold text-on-accent">Open app</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-5 py-10 text-sm text-muted border-t border-line mt-16">
        <div className="flex flex-wrap gap-x-6">
          <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-foreground">Privacy policy</Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-foreground">Terms</Link>
          <Link href="/support" className="inline-flex min-h-11 items-center hover:text-foreground">Support</Link>
          <a href={`mailto:${site.supportEmail}`} className="inline-flex min-h-11 items-center break-all hover:text-foreground">{site.supportEmail}</a>
        </div>
        <p className="mt-4">
          © {new Date().getFullYear()} {site.name}. Not affiliated with any restaurant. Nutrition information comes from each
          chain&apos;s published data. Not medical advice.
        </p>
      </footer>
    </div>
  );
}
