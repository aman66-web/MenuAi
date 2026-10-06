import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A new deploy registers a new service worker URL (/sw.js?v=<id>), so the offline cache is refreshed with it.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()) },
  async headers() {
    return [
      {
        // Menu data for the iOS app (published by scripts/publish_menus.sh). Clients revalidate every time;
        // Vercel's CDN still serves it from the edge and refreshes it on every deploy.
        source: "/:dir(menus|menus-sample)/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
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

export default nextConfig;
