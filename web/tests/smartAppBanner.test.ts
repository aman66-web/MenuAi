import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { smartAppBanner } from "../lib/smartAppBanner";
import { site } from "../site.config";

describe("Safari's Smart App Banner", () => {
  it("is on the website's pages and never in the apps' own copy", () => {
    expect(smartAppBanner(false, site.appStoreId)).toEqual({ itunes: { appId: "6822767746" } });
    expect(smartAppBanner(true, site.appStoreId)).toEqual({});
  });

  it("names the same app as the App Store link (the default one, when no NEXT_PUBLIC_APP_STORE_URL overrides it)", () => {
    if (!process.env.NEXT_PUBLIC_APP_STORE_URL) expect(site.appStoreUrl).toContain(`/id${site.appStoreId}`);
  });

  it("is what the website's layout uses, with the build's own APP_BUILD switch", () => {
    const layout = readFileSync(join(__dirname, "../app/(site)/layout.tsx"), "utf8");
    expect(layout).toContain("export const metadata: Metadata = smartAppBanner(APP_BUILD, site.appStoreId);");
  });
});
