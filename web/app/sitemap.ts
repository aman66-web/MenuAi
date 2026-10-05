import type { MetadataRoute } from "next";
import { site } from "@/site.config";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/support", "/privacy", "/terms"].map((path) => ({ url: `${site.url}${path}` }));
}
