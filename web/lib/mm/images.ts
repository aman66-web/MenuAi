// Item photos: the chain's own photo of an item (founder's decision 2026-10-06, CLAUDE.md rule 2). The menu JSON carries
// `image: "<chain-id>/<file>.webp"`; the files live in public/menu-images/ and their sources in images.csv + SOURCES.md.
// A malformed value (anything but that shape) yields no photo rather than a path we didn't expect.
// A chain listed in public/logos/hidden.json (the taken-down list) shows no photos either, without an app update.
// The iPhone app can be built without them (web/app-content.json "menuPhotos": false → NEXT_PUBLIC_MENU_PHOTOS=0): then no item shows one.
import { MENU_PHOTOS_ENABLED } from "./config";
import { isTakenDown } from "./logos";

const IMAGE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;

export function itemImageUrl(image: string | undefined): string | undefined {
  if (!MENU_PHOTOS_ENABLED || !image || !IMAGE_RE.test(image)) return undefined;
  return isTakenDown(image.split("/")[0]) ? undefined : `/menu-images/${image}`; // a chain on the taken-down list loses its photos as well as its logo
}
