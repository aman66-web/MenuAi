import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// App Review rejected iPhone 1.1 (20) under 4.0 Design (23 November 2026): on the Terms page the Back bar sat under the clock. The web view draws under the status
// bar and has no inset of its own (WebAppView.swift: contentInsetAdjustmentBehavior = .never), so every page needs viewport-fit=cover for env(safe-area-inset-top)
// to be real. /app had it; the pages outside it (Terms, Privacy, Support, the invite and shared-list pages, Page not found) did not.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("viewport-fit=cover in the iPhone app", () => {
  it("is set for every page of the app build by the root layout (the website itself is left alone)", () => {
    const root = read("../app/layout.tsx");
    expect(root).toMatch(/export const viewport: Viewport = APP_BUILD \? \{ viewportFit: "cover" \} : \{\};/);
    expect(read("../app/app/layout.tsx")).toContain('viewportFit: "cover"');
  });

  it("the app's Back bar for Terms, Privacy and Support leaves room for the status bar", () => {
    expect(read("../app/(site)/layout.tsx")).toContain("pt-[env(safe-area-inset-top)]");
  });

  it("the pack script refuses a page without it", () => {
    const pack = read("../../scripts/build_app_web.sh");
    expect(pack).toContain("viewport-fit=cover");
    expect(pack).toContain("would sit under the status bar");
  });
});
