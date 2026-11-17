// Item photos: the chain's own photo of an item (founder's decision 2026-10-06, CLAUDE.md rule 2). The menu JSON carries
// `image: "<chain-id>/<file>.webp"`; the files live in public/menu-images/ and their sources in images.csv + SOURCES.md, with a small copy of
// each in public/menu-images/thumbs/<chain-id>/ for list tiles (tools/uk_extract/make_thumbs.py).
// A malformed value (anything but that shape) yields no photo rather than a path we didn't expect.
// A chain listed in public/logos/hidden.json (the taken-down list) shows no photos either, without an app update.
// The iPhone app can be built without them (web/app-content.json "menuPhotos": false → NEXT_PUBLIC_MENU_PHOTOS=0): then no item shows one.
import { MENU_PHOTOS_ENABLED, assetUrl } from "./config";
import { isTakenDown } from "./logos";

const IMAGE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;
/** The folder of the small copies (menu-images/thumbs/), never a chain id (tools/uk_extract/make_thumbs.py stops if a chain is given that name). */
const THUMBS = "thumbs";

/** The photo's "<chain-id>/<file>.webp" when it may be shown: the right shape, photos switched on, and its chain not on the taken-down list. */
function shown(image: string | undefined): string | undefined {
  if (!MENU_PHOTOS_ENABLED || !image || !IMAGE_RE.test(image)) return undefined;
  const chain = image.split("/")[0];
  return chain === THUMBS || isTakenDown(chain) ? undefined : image; // a chain on the taken-down list loses its photos as well as its logo
}

/** The full photo (at most 640 px), for the item page. */
export function itemImageUrl(image: string | undefined): string | undefined {
  const ok = shown(image);
  return ok && assetUrl(`/menu-images/${ok}`);
}

/**
 * The small copy of the same photo (at most 160 px, made by tools/uk_extract/make_thumbs.py: resized only), for the 56 px tiles in lists, so a
 * list doesn't fetch, and the iPhone app doesn't keep, every full photo. It may not exist yet for a photo added since the last run, so a tile
 * falls back to itemImageUrl when it fails to load (ItemThumb). Same checks and takedown as the full photo.
 */
export function itemThumbUrl(image: string | undefined): string | undefined {
  const ok = shown(image);
  return ok && assetUrl(`/menu-images/${THUMBS}/${ok}`);
}
