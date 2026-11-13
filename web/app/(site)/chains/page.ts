// This route's entry is a .ts file on purpose: the iPhone app's export reads only .tsx pages (next.config.ts), so the website's chain pages stay out of the app.
// The page itself is in _page.tsx next to this file.
export { default, metadata } from "./_page";
