"use client";

// The last safety net (founder 2026-11-18: "please make sure it doesn't [crash]"): if the page's own frame breaks, this plain page replaces it, with a button to
// load the app again. It draws its own page (Next.js: global-error has no layout, styles or fonts of the app), so its look is written here, in the app's colours.
// English only, like the app. Nothing about the error is sent anywhere.

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const reload = () => {
    try {
      retry();
    } catch {
      window.location.reload();
    }
  };
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", background: "#f4f5f6", color: "#0b1a12", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <main role="alert" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 800, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 17, lineHeight: 1.4, margin: 0, maxWidth: 360, color: "#4b5563" }}>Nothing you&apos;ve saved is lost. Press the button to open the app again.</p>
          <button type="button" onClick={reload} style={{ minHeight: 56, width: "100%", maxWidth: 320, borderRadius: 999, border: 0, background: "#0b1a12", color: "#fff", fontSize: 18, fontWeight: 700 }}>
            Try again
          </button>
          <a href="/app" style={{ minHeight: 48, display: "inline-flex", alignItems: "center", fontSize: 16, fontWeight: 600, color: "#0b1a12" }}>
            Go to Home
          </a>
        </main>
      </body>
    </html>
  );
}
