import type { Metadata } from "next";

/**
 * Safari's Smart App Banner (founder 2026-11-27, from Opal's site): `<meta name="apple-itunes-app" content="app-id=…">` on the website's pages, so an iPhone
 * visitor sees "Open" or "Get" for the app at the top. Nothing in the copy packed inside the iPhone and Android apps (APP_BUILD), where the same privacy,
 * terms and support pages would otherwise offer the app inside itself. Used by app/(site)/layout.tsx.
 */
export function smartAppBanner(appBuild: boolean, appStoreId: string): Metadata {
  return appBuild ? {} : { itunes: { appId: appStoreId } };
}
