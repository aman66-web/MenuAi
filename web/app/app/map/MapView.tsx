"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef } from "react";
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LatLng } from "@/lib/mm/geo";
import type { T } from "@/lib/mm/i18n";
import { fitContain } from "@/lib/mm/logoFit";
import { logoFor } from "@/lib/mm/logos";
import { useT } from "../_lib/i18n";

// The map itself: MapLibre drawing free OpenFreeMap tiles (founder's decision 2026-10-06). Pins are a GeoJSON layer, so a few
// hundred branches cost nothing. Every branch is its own pin, never grouped into a number bubble (founder 2026-10-10: "just add
// every restaurant on the map"); pins shrink as the map zooms out so a busy town stays readable. Our own colours only: no restaurant brand colours (CLAUDE.md rule 2). The tile server sees
// which area is on screen, like any map website; it never sees where the user is (that stays in this browser).
//
// Logos: where a chain has an official logo file (lib/mm/logos.ts), its pin shows that file unmodified on the plain tile the
// file names, scaled to fit and never cropped or stretched; chains without one keep the green dot. Logos are drawn to small
// canvas images and handed to the map as icons, so they cost no more than the dots did.

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  chainId: string;
}

const STYLE = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" } as const;

function boundsFor(c: LatLng, miles: number): [[number, number], [number, number]] {
  const dLat = miles / 69;
  const dLng = miles / (69.17 * Math.max(0.2, Math.cos((c.lat * Math.PI) / 180)));
  return [[c.lng - dLng, c.lat - dLat], [c.lng + dLng, c.lat + dLat]];
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** MapLibre's own words (zoom buttons, the two-finger hint, the credits button), in the app's language. */
function mapLocale(t: T): Record<string, string> {
  return {
    "AttributionControl.ToggleAttribution": t("Toggle attribution"),
    "AttributionControl.MapFeedback": t("Map feedback"),
    "Map.Title": t("Map"),
    "NavigationControl.ZoomIn": t("Zoom in"),
    "NavigationControl.ZoomOut": t("Zoom out"),
    "CooperativeGesturesHandler.WindowsHelpText": t("Use Ctrl + scroll to zoom the map"),
    "CooperativeGesturesHandler.MacHelpText": t("Use ⌘ + scroll to zoom the map"),
    "CooperativeGesturesHandler.MobileHelpText": t("Use two fingers to move the map"),
  };
}

const TILE = 34; // css px: the plain tile a logo sits on
const CANVAS = 40; // css px: the tile plus room for its soft shadow
const PAD = 5; // css px between the tile edge and the logo
const PIXEL_RATIO = 2; // the stored icon is drawn at 2x so it stays sharp on phones

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Whether anything but the plain tile was drawn inside the logo's box (some phones drew an empty tile for a file that had loaded). */
function hasArtwork(data: ImageData, darkTile: boolean): boolean {
  const bg = darkTile ? 11 : 255;
  const from = Math.round(((CANVAS - TILE) / 2 + PAD) * PIXEL_RATIO);
  const to = Math.round(((CANVAS + TILE) / 2 - PAD) * PIXEL_RATIO);
  let ink = 0;
  for (let y = from; y < to; y++) {
    for (let x = from; x < to; x++) {
      const i = (y * data.width + x) * 4;
      if (Math.abs(data.data[i]! - bg) + Math.abs(data.data[i + 1]! - bg) + Math.abs(data.data[i + 2]! - bg) > 48) ink++;
    }
  }
  return ink >= 12;
}

/** The chain's logo file on its plain tile, as map icon pixels; null if the file can't be loaded or drew nothing (the green dot stays). */
async function drawLogoTile(src: string, darkTile: boolean): Promise<ImageData | null> {
  const img = await loadImage(src);
  if (!img) return null;
  await img.decode().catch(() => undefined); // decoded before drawing, so the tile is never drawn empty
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CANVAS * PIXEL_RATIO;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  const x0 = (CANVAS - TILE) / 2;
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = darkTile ? "#0b0b0b" : "#ffffff";
  ctx.beginPath();
  ctx.roundRect(x0, x0, TILE, TILE, 9);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1;
  ctx.strokeStyle = darkTile ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.16)";
  ctx.stroke();
  const box = TILE - 2 * PAD;
  const fit = fitContain(img.naturalWidth, img.naturalHeight, box, box);
  ctx.drawImage(img, x0 + PAD + fit.x, x0 + PAD + fit.y, fit.w, fit.h);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return hasArtwork(data, darkTile) ? data : null;
}

// Pins shrink as the map zooms out (a town's worth of branches at once) and are full size from street level.
const BY_ZOOM = (far: number, mid: number, near: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 9, far, 12, mid, 14, near];

export function MapView({ center, radiusMiles, pins, selectedId, onSelect, dark, onFailed }: {
  center: LatLng;
  radiusMiles: number;
  pins: readonly MapPin[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  dark: boolean;
  onFailed: () => void;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  // Latest props, read by map event handlers that were created once.
  const latest = useRef({ center, radiusMiles, pins, selectedId, onSelect, onFailed });
  useEffect(() => { latest.current = { center, radiusMiles, pins, selectedId, onSelect, onFailed }; });
  // Chains whose logo icon is loaded in the CURRENT map (a theme change builds a new map, so these are reset with it).
  const logoIds = useRef<Set<string>>(new Set());
  const logoTried = useRef<Set<string>>(new Set());

  // Pins of chains with a loaded logo are drawn as logos, the rest as dots; the selected pin gets a ring either way.
  const applyLogoState = useCallback((map: MapLibreMap) => {
    const hasLogo: FilterSpecification = ["in", ["get", "chainId"], ["literal", [...logoIds.current]]];
    const isSelected: FilterSpecification = ["==", ["get", "id"], latest.current.selectedId ?? ""];
    if (map.getLayer("pins")) map.setFilter("pins", ["!", hasLogo]);
    if (map.getLayer("pin-logos")) map.setFilter("pin-logos", hasLogo);
    if (map.getLayer("selected")) map.setFilter("selected", ["all", isSelected, ["!", hasLogo]]);
    if (map.getLayer("selected-logo")) map.setFilter("selected-logo", ["all", isSelected, hasLogo]);
  }, []);

  const loadLogos = useCallback(async (map: MapLibreMap, list: readonly MapPin[]) => {
    const wanted = [...new Set(list.map((p) => p.chainId))].filter((id) => logoFor(id) && !logoTried.current.has(id));
    for (const id of wanted) {
      const logo = logoFor(id);
      if (!logo) continue;
      logoTried.current.add(id);
      const data = await drawLogoTile(logo.src, logo.tile === "dark");
      if (mapRef.current !== map || !data) continue; // the map was replaced meanwhile, or the file didn't load: the dot stays
      if (!map.hasImage(`logo-${id}`)) map.addImage(`logo-${id}`, data, { pixelRatio: PIXEL_RATIO });
      logoIds.current.add(id);
      applyLogoState(map);
    }
  }, [applyLogoState]);

  const collection = (list: readonly MapPin[]) => ({
    type: "FeatureCollection" as const,
    features: list.map((p) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] }, properties: { id: p.id, chainId: p.chainId } })),
  });

  // Create the map (again when the light/dark theme changes).
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    ready.current = false;
    logoIds.current = new Set();
    logoTried.current = new Set();
    (async () => {
      try {
        const ml = (await import("maplibre-gl")).default;
        if (cancelled || !box.current) return;
        const L = latest.current;
        map = new ml.Map({
          container: box.current,
          style: dark ? STYLE.dark : STYLE.light,
          bounds: boundsFor(L.center, L.radiusMiles),
          fitBoundsOptions: { padding: 24, maxZoom: 16 },
          attributionControl: { compact: true },
          locale: mapLocale(t),
          cooperativeGestures: true, // the map sits inside a scrolling page: one finger scrolls the page, two move the map
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", (e) => {
          if (!ready.current && /style|fetch|Failed|load/i.test(String(e.error?.message ?? ""))) latest.current.onFailed();
        });
        map.on("load", () => {
          if (!map) return;
          const accent = dark ? "#6ee7b7" : "#047857";
          const ink = dark ? "#04100a" : "#ffffff";
          map.addSource("branches", { type: "geojson", data: collection(latest.current.pins) });
          map.addSource("you", { type: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [L.center.lng, L.center.lat] }, properties: {} }] } });
          map.addLayer({ id: "pins", type: "circle", source: "branches", paint: { "circle-color": accent, "circle-stroke-color": ink, "circle-stroke-width": BY_ZOOM(1.5, 2, 2), "circle-radius": BY_ZOOM(5, 7, 8) } });
          map.addLayer({ id: "selected", type: "circle", source: "branches", filter: ["==", ["get", "id"], latest.current.selectedId ?? ""], paint: { "circle-color": dark ? "#ffffff" : "#0b1a12", "circle-stroke-color": accent, "circle-stroke-width": 4, "circle-radius": BY_ZOOM(8, 10, 11) } });
          map.addLayer({ id: "selected-logo", type: "circle", source: "branches", filter: ["==", ["get", "id"], ""], paint: { "circle-color": accent, "circle-radius": BY_ZOOM(13, 17, 21) } });
          map.addLayer({ id: "pin-logos", type: "symbol", source: "branches", filter: ["==", ["get", "chainId"], ""], layout: { "icon-image": ["concat", "logo-", ["get", "chainId"]], "icon-size": BY_ZOOM(0.6, 0.8, 1), "icon-allow-overlap": true, "icon-ignore-placement": true } });
          map.addLayer({ id: "you-halo", type: "circle", source: "you", paint: { "circle-color": "#3b82f6", "circle-opacity": 0.2, "circle-radius": 18 } });
          map.addLayer({ id: "you-dot", type: "circle", source: "you", paint: { "circle-color": "#3b82f6", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3, "circle-radius": 7 } });
          for (const layer of ["pins", "pin-logos"]) {
            map.on("click", layer, (e) => {
              const id = e.features?.[0]?.properties?.id;
              if (typeof id === "string") latest.current.onSelect(id);
            });
          }
          for (const layer of ["pins", "pin-logos"]) {
            map.on("mouseenter", layer, () => { if (map) map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", layer, () => { if (map) map.getCanvas().style.cursor = ""; });
          }
          ready.current = true;
          applyLogoState(map);
          void loadLogos(map, latest.current.pins);
        });
      } catch {
        if (!cancelled) latest.current.onFailed(); // no WebGL, or the library couldn't load
      }
    })();
    return () => {
      cancelled = true;
      ready.current = false;
      map?.remove();
      mapRef.current = null;
    };
  }, [dark, t, applyLogoState, loadLogos]); // both are stable (refs only), so this still builds the map once per theme (and language)

  // New pins (filters or radius changed).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    (map.getSource("branches") as GeoJSONSource | undefined)?.setData(collection(pins));
    void loadLogos(map, pins);
  }, [pins, loadLogos]);

  // New origin or radius: show the whole circle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    (map.getSource("you") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [center.lng, center.lat] }, properties: {} }] });
    map.fitBounds(boundsFor(center, radiusMiles), { padding: 24, maxZoom: 16, duration: reduced() ? 0 : 500 });
  }, [center, radiusMiles]);

  // Selection from the list or a tap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    applyLogoState(map);
    const pin = selectedId ? latest.current.pins.find((p) => p.id === selectedId) : undefined;
    if (pin) map.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 15), duration: reduced() ? 0 : 400 });
  }, [selectedId, applyLogoState]);

  return <div ref={box} role="region" aria-label={t("Map of nearby restaurants. The list below has the same restaurants.")} data-nearby-map className="h-full w-full" />;
}
