import type { NextConfig } from "next";

// Two builds from the same code:
//  * the website (default): served by Vercel, with the API and the headers below;
//  * the iPhone app's copy (APP_BUILD=1, `npm run build:app`, scripts/build_app_web.sh): a static export packed inside the app
//    (docs/APP_BUILD.md). Only .tsx route files are picked up, so the API routes and the robots/sitemap/manifest files (all .ts) are left
//    out; the app sends its messages to the live website's API instead.
const APP_BUILD = process.env.APP_BUILD === "1";

const env = { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()) };

const appConfig: NextConfig = {
  output: "export",
  distDir: ".next-app",
  pageExtensions: ["tsx"],
  images: { unoptimized: true },
  poweredByHeader: false,
  env: {
    ...env,
    NEXT_PUBLIC_APP_BUILD: "1",
    // where the app reaches the live website (newer menus, the taken-down logos list, the API)
    NEXT_PUBLIC_REMOTE_BASE: process.env.NEXT_PUBLIC_REMOTE_BASE ?? "https://numbite.com",
  },
};

// Public data the iPhone app may read from the live website (lib/cors.ts covers the API).
const openToTheApp = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const websiteConfig: NextConfig = {
  poweredByHeader: false,
  // A new deploy registers a new service worker URL (/sw.js?v=<id>), so the offline cache is refreshed with it.
  env,
  async headers() {
    return [
      {
        // Menu data (published by scripts/publish_menus.sh). Clients revalidate every time; Vercel's CDN still serves it from the edge and
        // refreshes it on every deploy. The iPhone app reads it too, for menus newer than the ones packed inside it.
        source: "/:dir(menus|menus-sample)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }, ...openToTheApp],
      },
      {
        // Logos taken down at their owner's request (lib/mm/logos.ts), read by the website and the iPhone app.
        source: "/logos/hidden.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }, ...openToTheApp],
      },
      {
        // Item photos are named by a hash of their content (tools/uk_extract/images_common.py), so a file never changes.
        source: "/menu-images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Tells iPhones which links open in the app (a shared shopping list: numbite.com/l). Apple reads it as JSON; it has no file extension.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }, { key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        // The service worker must always be re-checked so a new version reaches people promptly.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default APP_BUILD ? appConfig : websiteConfig;
