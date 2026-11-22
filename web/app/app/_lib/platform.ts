"use client";

import { useSyncExternalStore } from "react";
import { nativePlatform, type NativePlatform } from "@/lib/mm/native";

const subscribe = () => () => undefined;

/**
 * Which app the page is in ("ios", "android", or null on the website). The pages are built once and prerendered with no bridge, so the server's answer is null and the phone's is
 * read straight after hydration (React then draws the lines that name the phone's store); the answer never changes while the page is open.
 */
export function useNativePlatform(): NativePlatform | null {
  return useSyncExternalStore(subscribe, nativePlatform, () => null);
}
