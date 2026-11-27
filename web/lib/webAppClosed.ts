// The web app (/app) is closed on the deployed website (founder, 27 November 2026: people use only the iPhone and Android apps). next.config.ts sends every /app
// and /app/... address to the homepage's App Store and Google Play badges with a temporary (307) redirect, so browsers don't keep it and it can be undone
// (docs/SITE_NO_WEB_APP_REPORT.md).
//
// Only a build on Vercel gets the redirect (production and previews: Vercel sets VERCEL=1 when it builds a deployment). Local `npm run dev` and `next start`,
// the e2e scripts, the store-screenshot scripts (which serve the app's own export) and the phone apps' static export (APP_BUILD=1, which has no redirects at
// all) keep every /app page. Nothing else is touched: /api (both apps' sign-in and data), /auth/callback, /menus, /logos, /app-switches.json and the other files
// start with a different first segment, so neither rule can match them.

/** The id of the homepage's store badges (app/components/StoreBadges.tsx), and the address the closed web app sends people to. */
export const GET_THE_APP_ID = "get-the-app";
export const GET_THE_APP = `/#${GET_THE_APP_ID}`;

type Env = Readonly<Record<string, string | undefined>>;

/** True on a Vercel build of the website. */
export const webAppClosed = (env: Env): boolean => env.VERCEL === "1";

export interface WebAppRedirect {
  source: string;
  destination: string;
  permanent: false;
}

/** The redirects next.config.ts adds to the website's build: none off Vercel. */
export function webAppRedirects(env: Env): WebAppRedirect[] {
  if (!webAppClosed(env)) return [];
  return [
    { source: "/app", destination: GET_THE_APP, permanent: false },
    { source: "/app/:path*", destination: GET_THE_APP, permanent: false },
  ];
}
