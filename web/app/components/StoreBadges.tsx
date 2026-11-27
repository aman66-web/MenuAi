import { APP_BUILD } from "@/lib/mm/config";
import { site } from "@/site.config";

// The two stores' own badges, unmodified (public/badges/SOURCES.md): the same height (46 px), the App Store first, a quarter of their height clear round each
// (the 16 px gap), on the page's plain white. Side by side from 360 px; on a narrower screen or at large text they stack. Website only: nothing in the phone
// apps' copy (the shared-list and invite pages are packed too, though the apps open those links on their own screens), and only on pages under the site
// layout, whose footer carries the credit lines the badges ask for.
// The homepage's set has the id the closed web app sends people to (lib/webAppClosed.ts GET_THE_APP).

const BADGE_HEIGHT = 46;
const BADGES = [
  { href: site.appStoreUrl, src: "/badges/app-store-download-en-gb-black.svg", alt: `Download ${site.name} on the App Store`, width: 138 },
  { href: site.playStoreUrl, src: "/badges/google-play-get-it-on-en.svg", alt: `Get ${site.name} on Google Play`, width: 155 },
];

export function StoreBadges({ id, className = "" }: { id?: string; className?: string }) {
  if (APP_BUILD) return null;
  return (
    <ul id={id} aria-label="Get the app" className={`flex flex-wrap items-center gap-4 ${className}`}>
      {BADGES.map((b) => (
        <li key={b.src}>
          <a href={b.href} target="_blank" rel="noopener noreferrer" className="block rounded-[0.6875rem]">
            {/* eslint-disable-next-line @next/next/no-img-element -- the store's own SVG badge, shown as it is */}
            <img src={b.src} alt={b.alt} width={b.width} height={BADGE_HEIGHT} className="block h-[46px] w-auto" />
          </a>
        </li>
      ))}
    </ul>
  );
}
