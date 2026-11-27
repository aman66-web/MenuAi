"use client";

import { useEffect } from "react";
import { APP_BUILD } from "@/lib/mm/config";
import { retireServiceWorker } from "@/lib/retireServiceWorker";

/** On the website's pages: removes the old web app's service worker and its caches from this browser (lib/retireServiceWorker.ts). Nothing in the phone apps. */
export function RetireServiceWorker() {
  useEffect(() => {
    if (!APP_BUILD) void retireServiceWorker();
  }, []);
  return null;
}
