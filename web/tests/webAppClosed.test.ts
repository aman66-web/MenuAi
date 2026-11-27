import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { GET_THE_APP, GET_THE_APP_ID, webAppClosed, webAppRedirects } from "../lib/webAppClosed";

// The website no longer runs the web app (founder, 27 November 2026): on a Vercel build every /app and /app/... address goes to the homepage's App Store and
// Google Play badges with a temporary redirect; nothing the phone apps load from the website is caught, and nothing changes off Vercel or in the apps' export.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** A redirect's source matched the way the Next server does it (next/dist/server/lib/router-utils/filesystem.js buildCustomRoute). */
const matcher = (source: string) =>
  getPathMatch(source, { strict: true, removeUnnamedParams: true, regexModifier: (regex: string) => modifyRouteRegex(regex, ["/_next"]) });
const ON_VERCEL = { VERCEL: "1" };
const caught = (path: string) => webAppRedirects(ON_VERCEL).some((r) => matcher(r.source)(path) !== false);

describe("the web app's redirect", () => {
  it("is on only in a Vercel build (production and previews), never in local dev, next start or the e2e and screenshot scripts", () => {
    expect(webAppClosed(ON_VERCEL)).toBe(true);
    expect(webAppClosed({})).toBe(false);
    expect(webAppClosed({ VERCEL: "0" })).toBe(false);
    expect(webAppRedirects({})).toEqual([]);
  });

  it("is temporary (307, so browsers don't keep it) and goes to the homepage's store badges", () => {
    const rules = webAppRedirects(ON_VERCEL);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.permanent).toBe(false);
      expect(r.destination).toBe("/#get-the-app");
    }
    expect(GET_THE_APP).toBe(`/#${GET_THE_APP_ID}`);
    // the id is on the homepage's badges
    expect(read("app/(site)/page.tsx")).toContain("<StoreBadges id={GET_THE_APP_ID}");
  });

  it("catches /app and every page under it, whatever the query", () => {
    for (const path of ["/app", "/app/", "/app/today", "/app/item", "/app/chain", "/app/settings", "/app/community/friends", "/app/groceries/list/shared", "/app/welcome", "/app/pro", "/APP/Today"]) {
      expect(caught(path), path).toBe(true);
    }
  });

  it("leaves alone everything the phone apps and the website still use", () => {
    for (const path of [
      "/", "/privacy", "/terms", "/support", "/chains", "/chains/nandos", "/chains/nandos/high-protein", "/l", "/f",
      // sign-in: both apps open /api/v1/auth/<provider>/start in a browser sheet, Supabase sends it back to /auth/callback, which ends on numbite://auth
      "/api/v1/auth/google/start", "/api/v1/auth/apple/start", "/auth/callback", "/api/v1/auth/email/start", "/api/v1/auth/email/verify", "/api/v1/auth/exchange",
      "/api/v1/auth/apple", "/api/v1/auth/refresh", "/api/v1/auth/session", "/api/v1/sync", "/api/v1/entitlement", "/api/health",
      // files the apps load from the live site
      "/menus/menus-manifest.json", "/menus-sample/x.json", "/menu-images/a/b.webp", "/recipe-images/x.webp", "/grocery-images/x.webp", "/groceries/groceries-manifest.json",
      "/branches/x.json", "/logos/hidden.json", "/logos/kfc.png", "/app-switches.json", "/app-content.json", "/apple-icon.png", "/.well-known/apple-app-site-association",
      "/.well-known/assetlinks.json", "/sw.js", "/badges/google-play-get-it-on-en.svg", "/icons/icon-192.png", "/sitemap.xml", "/robots.txt",
      "/application", "/apps", "/_next/static/chunks/app/app/page.js",
    ]) {
      expect(caught(path), path).toBe(false);
    }
  });
});

describe("next.config.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const load = async () => (await import("../next.config")).default;

  it("the website's build on Vercel has the redirect", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_BUILD", "");
    const config = await load();
    expect(await config.redirects?.()).toEqual(webAppRedirects(ON_VERCEL));
  });

  it("the website off Vercel (npm run dev, next start) keeps /app", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("APP_BUILD", "");
    const config = await load();
    expect(await config.redirects?.()).toEqual([]);
  });

  it("the phone apps' static export has no redirects at all, even when built on a machine that says VERCEL=1", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_BUILD", "1");
    const config = await load();
    expect(config.output).toBe("export");
    expect(config.redirects).toBeUndefined();
  });
});

describe("no website link opens the web app", () => {
  // the website's own pages (the (site) pages and the root 404 and error pages): an address starting /app appears only where the phone apps' copy uses it
  const pages = [
    "app/(site)/layout.tsx", "app/(site)/page.tsx", "app/(site)/l/SharedLanding.tsx", "app/(site)/f/InviteLanding.tsx", "app/(site)/chains/_components.tsx",
    "app/(site)/chains/_page.tsx", "app/(site)/chains/[slug]/_page.tsx", "app/(site)/chains/[slug]/high-protein/_page.tsx",
    "app/(site)/chains/[slug]/under-500-calories/_page.tsx", "app/(site)/support/SupportForm.tsx", "app/not-found.tsx", "app/global-error.tsx",
  ];

  it("has no plain link to /app", () => {
    for (const page of pages) {
      const code = read(page).replace(/APP_BUILD \? "\/app"/g, "APP_BUILD ? (the app's copy)");
      expect(code, page).not.toMatch(/href=\{?["'`]\/app/);
      expect(code, page).not.toMatch(/chainHref|itemHref|SHARED_APP_PATH|\/app\/community\/friends/);
    }
  });

  it("the shared-list and invite pages offer the store badges and the installed app, not the browser", () => {
    for (const page of ["app/(site)/l/SharedLanding.tsx", "app/(site)/f/InviteLanding.tsx"]) {
      const code = read(page);
      expect(code, page).toContain("<StoreBadges");
      expect(code, page).toMatch(/numbite:\/\/[lf]#/);
      expect(code, page).not.toMatch(/<a [^>]*>[^<]*in your browser/i);
    }
  });

  it("the header's pill goes to the store badges, and the install manifest is gone", () => {
    const layout = read("app/(site)/layout.tsx");
    expect(layout).toContain("<Link href={GET_THE_APP}");
    expect(layout).toContain("Get the app");
    expect(layout).not.toContain("Open app");
    expect(() => read("app/manifest.ts")).toThrow();
  });
});
