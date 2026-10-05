import { LinkButton } from "../_components/ui";

export const metadata = { title: "Offline" };

// Shown by the service worker (public/sw.js) when a page that hasn't been opened yet is requested without a connection.
export default function OfflinePage() {
  return (
    <div className="pt-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">You&apos;re offline</h1>
      <p className="mx-auto mt-2 max-w-xs text-muted">This page hasn&apos;t been opened on this device yet. Restaurants and menus you&apos;ve already opened still work.</p>
      <div className="mt-6 flex justify-center"><LinkButton href="/app">Back to home</LinkButton></div>
    </div>
  );
}
