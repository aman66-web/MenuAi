// The part of the camera's picture the person framed (founder 2026-11-18, Scan your food: "it should only be the frame that the person scanned"). The live view
// fills the screen ("object-fit: cover"), so the camera's full picture is wider or taller than what is shown; the photo taken is just the scanning frame's part
// of it, the corner marks the person lined the food up in.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The rectangle of the camera's own picture (videoW × videoH pixels) under `frame`, a rectangle on a view of viewW × viewH that shows the picture with
 * object-fit: cover (centred). Kept inside the picture; the whole picture when anything is missing.
 */
export function framedPart(videoW: number, videoH: number, viewW: number, viewH: number, frame: Rect): Rect {
  const whole = { x: 0, y: 0, width: videoW, height: videoH };
  if (!(videoW > 0 && videoH > 0 && viewW > 0 && viewH > 0 && frame.width > 0 && frame.height > 0)) return whole;
  const scale = Math.max(viewW / videoW, viewH / videoH);
  const offsetX = (viewW - videoW * scale) / 2;
  const offsetY = (viewH - videoH * scale) / 2;
  const x0 = Math.max(0, (frame.x - offsetX) / scale);
  const y0 = Math.max(0, (frame.y - offsetY) / scale);
  const x1 = Math.min(videoW, (frame.x + frame.width - offsetX) / scale);
  const y1 = Math.min(videoH, (frame.y + frame.height - offsetY) / scale);
  if (x1 - x0 < 1 || y1 - y0 < 1) return whole;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
