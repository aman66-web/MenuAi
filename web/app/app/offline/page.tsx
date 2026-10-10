import { OfflineContent } from "./OfflineContent";

export const metadata = { title: "Offline" };

// Shown by the service worker (public/sw.js) when a page that hasn't been opened yet is requested without a connection.
export default function OfflinePage() {
  return <OfflineContent />;
}
