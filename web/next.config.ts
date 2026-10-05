import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Menu data for the iOS app (published by scripts/publish_menus.sh). Clients revalidate every time;
        // Vercel's CDN still serves it from the edge and refreshes it on every deploy.
        source: "/menus/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
