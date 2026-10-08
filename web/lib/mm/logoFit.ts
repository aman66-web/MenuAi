// Where a chain's logo goes inside its square tile on the map: scaled to fit and centred, never cropped and never stretched
// (CLAUDE.md rule 2: a logo file is shown unmodified). Pure, so it is unit-tested.

export interface Fit {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largest size with the image's own proportions that fits inside boxW x boxH, centred. An unknown size is treated as square. */
export function fitContain(naturalW: number, naturalH: number, boxW: number, boxH: number): Fit {
  const nw = Number.isFinite(naturalW) && naturalW > 0 ? naturalW : 1;
  const nh = Number.isFinite(naturalH) && naturalH > 0 ? naturalH : 1;
  const scale = Math.min(boxW / nw, boxH / nh);
  const w = nw * scale;
  const h = nh * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}
