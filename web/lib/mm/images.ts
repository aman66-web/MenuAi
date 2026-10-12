// Item photos: the chain's own photo of an item (founder's decision 2026-10-06, CLAUDE.md rule 2). The menu JSON carries
// `image: "<chain-id>/<file>.webp"`; the files live in public/menu-images/ and their sources in images.csv + SOURCES.md.
// A malformed value (anything but that shape) yields no photo rather than a path we didn't expect.
// The iPhone app can be built without them (web/app-content.json "menuPhotos": false → NEXT_PUBLIC_MENU_PHOTOS=0): then no item shows one.
import { MENU_PHOTOS_ENABLED } from "./config";

const IMAGE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;

export function itemImageUrl(image: string | undefined): string | undefined {
  return MENU_PHOTOS_ENABLED && image && IMAGE_RE.test(image) ? `/menu-images/${image}` : undefined;
}
