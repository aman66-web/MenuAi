import Link from "next/link";
import { site } from "@/site.config";

// Marketing site chrome (landing page, privacy, terms, support). The web app under /app has its own layout.
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {site.name}
        </Link>
        <nav className="flex gap-5 text-sm text-muted">
          <Link href="/support" className="hover:text-foreground">Support</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-5 py-10 text-sm text-muted border-t border-line mt-16">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/privacy" className="hover:text-foreground">Privacy policy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/support" className="hover:text-foreground">Support</Link>
          <a href={`mailto:${site.supportEmail}`} className="hover:text-foreground">{site.supportEmail}</a>
        </div>
        <p className="mt-4">
          © {new Date().getFullYear()} {site.name}. Not affiliated with any restaurant. Nutrition information comes from each
          chain&apos;s published data. Not medical advice.
        </p>
      </footer>
    </div>
  );
}
