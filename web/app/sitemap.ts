import type { MetadataRoute } from "next";
import { site } from "@/site.config";
import { chainsWithSubPage, realChains } from "./(site)/chains/_data";

// The marketing pages plus every restaurant page (founder's brief, 13 Nov 2026, deliverable 6): /chains, /chains/<id>, and the high-protein and under-500-calories pages
// only for the restaurants that have enough dishes for them. Not part of the iPhone app's build (the .ts route files are left out of it).
export default function sitemap(): MetadataRoute.Sitemap {
  const marketing = ["", "/support", "/privacy", "/terms"].map((path) => ({ url: `${site.url}${path}` }));
  const chains = realChains();
  const urls: MetadataRoute.Sitemap = [{ url: `${site.url}/chains`, changeFrequency: "weekly", priority: 0.8 }];
  for (const c of chains) urls.push({ url: `${site.url}/chains/${c.id}`, lastModified: c.checkedOn, changeFrequency: "monthly", priority: 0.7 });
  for (const id of chainsWithSubPage("high-protein")) urls.push({ url: `${site.url}/chains/${id}/high-protein`, changeFrequency: "monthly", priority: 0.6 });
  for (const id of chainsWithSubPage("under-500-calories")) urls.push({ url: `${site.url}/chains/${id}/under-500-calories`, changeFrequency: "monthly", priority: 0.6 });
  return [...marketing, ...urls];
}
