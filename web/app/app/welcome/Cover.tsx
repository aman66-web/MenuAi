"use client";

import { useMemo } from "react";
import { LOGOS_ENABLED, TELEMETRY_ENABLED } from "@/lib/mm/config";
import { RETAILERS } from "@/lib/mm/groceries";
import { logoFor } from "@/lib/mm/logos";
import { POPULAR_ORDER } from "@/lib/mm/popular";
import { site } from "@/site.config";
import { CheckIcon, FlameIcon, GiftIcon, ShieldIcon } from "../_components/icons";
import { LogoWall, type WallItem } from "../_components/LogoWall";
import { Pip } from "../_components/Mascot";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useHydrated, useMenu } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { useShopManifest } from "../_lib/shopProducts";
import { Bottom, BottomButton, H1, QuietLink, SCREEN, TopBar } from "./Frame";

// The welcome cover (no counter), kept as built: the moving wall of the official logo files of the chains and shops in the app (CLAUDE.md rule 2: unmodified, on
// white tiles; names and cuisine icons with logos off; LogoWall's 44 pt Pause), two floating counts from the data, Pip waving once beside the greeting, the
// headline, three promises, one ink "Get started", the sign-in link and the footer. Nothing is downloaded here beyond the wall.
// The onboarding redesign meeting (20 November 2026, approved by the founder) adds only single lines: a status line after Settings › Clear data (?cleared=1) or
// after "Delete my account" (?deleted=1); for someone who left part-way, "Carry on from step {n}" on the pill with a quiet "Start again" under it; and, for
// someone already set up who opened this from Settings, Back at the top left.

// Logo files over about 60 KB: kept off the welcome wall so the first screen loads quickly (they still show everywhere else; a chain with its own small square icon
// is shown by that instead).
const HEAVY_LOGOS = new Set(["british-garden-centres", "daves-hot-chicken", "pubsmiths", "popeyes", "park-holidays-uk", "toby-carvery", "the-breakfast-club", "butcombe-inns", "parsons-bakery", "buzz-bingo", "greene-king", "giggling-squid", "joseph-holt", "castle-carvery"]);

export type CoverNotice = "cleared" | "deleted" | null;

export function Cover({ notice, carryOn, onStart, onStartAgain, onSignIn, onBack, signInRequired }: {
  notice: CoverNotice;
  /** The step "Carry on" goes to, as its number in the run ("Carry on from step {n}"); null shows "Get started". */
  carryOn: number | null;
  /** "Get started" or "Carry on from step {n}". */
  onStart: () => void;
  onStartAgain: () => void;
  /** "Already have an account? Sign in" (absent when someone is signed in). */
  onSignIn?: () => void;
  /** Back, for someone already set up who opened this from Settings. */
  onBack?: () => void;
  signInRequired: boolean;
}) {
  const t = useT();
  const hydrated = useHydrated();
  const menu = useMenu();
  const shopLists = useShopManifest();
  const hiddenLogos = useHiddenLogos();
  // the chains only once the page has hydrated: the browser may already hold the menu list (cached) that the server didn't, and a different wall on the two
  // sides made React rebuild the screen ("Hydration failed" on every first visit)
  const real = useMemo(() => (hydrated ? menu.chains.filter((c) => !c.sample) : []), [menu.chains, hydrated]);
  // The welcome wall: restaurants in the app that have an official logo file (well-known ones first, then the rest; a few very large files left out so the
  // first screen stays quick), mixed with the supermarkets by name.
  const wallItems = useMemo<WallItem[]>(() => {
    // Logos on (the website, and the iPhone app while web/app-content.json says "appLogos": true): only chains whose logo file we hold. Logos off (the safe
    // fallback for App Review 5.2.1): names only, so any well-known chain can be on the wall.
    const withLogo = !LOGOS_ENABLED ? real : real.filter((c) => { const l = logoFor(c.id); return !!l && (!!l.square || !HEAVY_LOGOS.has(c.id)); });
    const popular = POPULAR_ORDER.map((id) => withLogo.find((c) => c.id === id)).filter((c): c is (typeof withLogo)[number] => !!c);
    const rest = withLogo.filter((c) => !POPULAR_ORDER.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    const chains: WallItem[] = [...popular, ...rest].slice(0, 36).map((c) => ({ id: c.id, name: c.name, kind: "restaurant" }));
    const shops: WallItem[] = RETAILERS.map((r) => ({ id: r.id, name: r.name, kind: "shop" }));
    const out: WallItem[] = [];
    for (let i = 0, j = 0; i < chains.length || j < shops.length; ) {
      for (let k = 0; k < 3 && i < chains.length; k++) out.push(chains[i++]!);
      if (j < shops.length) out.push(shops[j++]!);
    }
    return out;
  }, [real, hiddenLogos]); // eslint-disable-line react-hooks/exhaustive-deps -- logoFor reads the taken-down list, which hiddenLogos tracks

  // The three promises: which numbers, and, in the build where everyone signs in, "No ads, no tracking" (the same words as the sign-in screen; "No ads" alone
  // while the setup screen counts are on: lib/mm/config.ts TELEMETRY_ENABLED). "No account needed" only where sign-in is optional, never while everyone signs in.
  const promises = [
    { Icon: FlameIcon, text: t("Calories and protein") },
    { Icon: GiftIcon, text: t("Every menu free") },
    signInRequired ? { Icon: ShieldIcon, text: TELEMETRY_ENABLED ? t("No ads") : t("No ads, no tracking") } : { Icon: ShieldIcon, text: t("No account needed") },
  ];
  // the wall's one sentence for a screen reader, true with logos on or off: the first five names on it
  const wallLabel = t("Restaurants and shops in the app, including {names}", { names: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(wallItems.slice(0, 5).map((i) => i.name)) });
  const status = notice === "cleared" ? t("Done: everything on this device was cleared.") : notice === "deleted" ? t("Your account has been deleted. What was on this phone is still here.") : null;

  return (
    <div className={SCREEN}>
      {/* No Skip here (founder 2026-11-17): a first-time visitor starts with Get started. The picture is drawn first and the writing under it (CSS `order`), but
          the writing comes first in the page, so a screen reader hears the greeting, the headline and the promises before the picture and its two labels. */}
      <div className="order-1">
        <TopBar onBack={hydrated ? onBack : undefined} />
      </div>
      <div className="order-3">
        {status && (
          <p role="status" className="mb-3 flex items-start gap-2.5 rounded-[1.25rem] border border-line bg-card px-4 py-3 text-[0.9375rem] font-bold leading-snug text-foreground">
            <CheckIcon aria-hidden className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 text-ink" strokeWidth={2.6} />
            {status}
          </p>
        )}
        <p className="mt-2 flex items-center gap-3 text-[1.125rem] font-semibold leading-snug">
          {/* Pip on no disc (colour meeting: never on lime or a disc), waving once */}
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center"><Pip mood="wave" size={40} /></span>
          <span className="min-w-0">{t("Welcome to {app}", { app: site.name })}</span>
        </p>
        <h1 tabIndex={-1} className={`mt-4 text-[2.65rem] font-[700] leading-[1.04] tracking-[-0.035em] ${H1}`}>
          {t("Eat out, shop and cook.")} {t("Know the numbers first.")}
        </h1>
        {/* in the page's own ink at 16 px (they were the faintest words on the screen) */}
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-base font-semibold text-foreground">
          {promises.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-1.5"><Icon aria-hidden className="h-5 w-5 shrink-0 text-accent" />{text}</li>
          ))}
        </ul>
      </div>
      {/* the picture, at the top (founder 2026-11-17): the restaurants and shops in the app drifting by, with two labels from the data floating over it */}
      <div className="relative order-2 -mx-5 mt-1">
        <LogoWall hero items={wallItems} namesOnly={!LOGOS_ENABLED} label={wallLabel} />
        {real.length > 0 && <span className="bob app-numbers absolute start-6 top-[22%] rounded-full border border-line bg-card px-3.5 py-2 text-sm font-bold text-foreground shadow-[var(--photo-chip-shadow)]">{t("{n} UK restaurants", { n: real.length })}</span>}
        {/* the supermarkets whose products are in the app (Groceries' list), once that list has loaded: not every shop named on the wall */}
        {shopLists && shopLists.retailers.length > 0 && <span className="bob-slow app-numbers absolute end-6 top-[52%] rounded-full border border-line bg-card px-3.5 py-2 text-sm font-bold text-foreground shadow-[var(--photo-chip-shadow)]">{t("{n} supermarkets", { n: shopLists.retailers.length })}</span>}
      </div>
      <Bottom className="order-4">
        <BottomButton onClick={onStart}>{carryOn !== null ? t("Carry on from step {n}", { n: carryOn }) : t("Get started")}</BottomButton>
        {carryOn !== null && <QuietLink onClick={onStartAgain}>{t("Start again")}</QuietLink>}
        {/* A way in for someone coming back on a new phone. With sign-in required it opens the sign-in screen headed "Welcome back. Sign in": an account already
            set up then goes straight to Home, and one that isn't carries on into the steps. A link: accent, always underlined. */}
        {onSignIn && (
          <button type="button" onClick={onSignIn} className="mt-1 min-h-11 w-full text-center text-[15px] font-semibold text-accent underline decoration-from-font underline-offset-[3px] [text-decoration-skip-ink:auto]">{t("Already have an account? Sign in")}</button>
        )}
        {/* the two links keep a 44 px tap area (padding pulled back with negative margins, so the line stays the same height); the words are CLAUDE.md rule 2's */}
        <p className="mt-4 text-center text-sm text-muted">
          <a href="/terms" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Terms")}</a> · <a href="/privacy" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Privacy")}</a> · {t("Not affiliated with any restaurant or shop shown.")}
        </p>
      </Bottom>
    </div>
  );
}
