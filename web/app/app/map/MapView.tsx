"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LatLng } from "@/lib/mm/geo";

// The map itself: MapLibre drawing free OpenFreeMap tiles (founder's decision 2026-10-06). Pins are a GeoJSON layer, so a few
// hundred branches cost nothing. Our own colours only: no restaurant brand colours (CLAUDE.md rule 2). The tile server sees
// which area is on screen, like any map website; it never sees where the user is (that stays in this browser).

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

export function MapView({ center, radiusMiles, pins, selectedId, onSelect, dark, onFailed }: {
  center: LatLng;
  radiusMiles: number;
  pins: readonly MapPin[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  dark: boolean;
  onFailed: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  // Latest props, read by map event handlers that were created once.
  const latest = useRef({ center, radiusMiles, pins, selectedId, onSelect, onFailed });
  useEffect(() => { latest.current = { center, radiusMiles, pins, selectedId, onSelect, onFailed }; });

  const collection = (list: readonly MapPin[]) => ({
    type: "FeatureCollection" as const,
    features: list.map((p) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] }, properties: { id: p.id, chainId: p.chainId } })),
  });

  // Create the map (again when the light/dark theme changes).
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    ready.current = false;
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
          map.addSource("branches", { type: "geojson", data: collection(latest.current.pins), cluster: true, clusterRadius: 42, clusterMaxZoom: 15 });
          map.addSource("you", { type: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [L.center.lng, L.center.lat] }, properties: {} }] } });
          map.addLayer({ id: "clusters", type: "circle", source: "branches", filter: ["has", "point_count"], paint: { "circle-color": accent, "circle-opacity": 0.92, "circle-stroke-color": ink, "circle-stroke-width": 2, "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 40, 26] } });
          map.addLayer({ id: "cluster-count", type: "symbol", source: "branches", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13, "text-allow-overlap": true }, paint: { "text-color": dark ? "#04100a" : "#ffffff" } });
          map.addLayer({ id: "pins", type: "circle", source: "branches", filter: ["!", ["has", "point_count"]], paint: { "circle-color": accent, "circle-stroke-color": ink, "circle-stroke-width": 2, "circle-radius": 8 } });
          map.addLayer({ id: "selected", type: "circle", source: "branches", filter: ["==", ["get", "id"], latest.current.selectedId ?? ""], paint: { "circle-color": dark ? "#ffffff" : "#0b1a12", "circle-stroke-color": accent, "circle-stroke-width": 4, "circle-radius": 11 } });
          map.addLayer({ id: "you-halo", type: "circle", source: "you", paint: { "circle-color": "#3b82f6", "circle-opacity": 0.2, "circle-radius": 18 } });
          map.addLayer({ id: "you-dot", type: "circle", source: "you", paint: { "circle-color": "#3b82f6", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3, "circle-radius": 7 } });
          map.on("click", "pins", (e) => {
            const id = e.features?.[0]?.properties?.id;
            if (typeof id === "string") latest.current.onSelect(id);
          });
          map.on("click", "clusters", async (e) => {
            const f = e.features?.[0];
            if (!f || !map) return;
            const src = map.getSource("branches") as GeoJSONSource;
            const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
            map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5, duration: reduced() ? 0 : 400 });
          });
          for (const layer of ["pins", "clusters"]) {
            map.on("mouseenter", layer, () => { if (map) map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", layer, () => { if (map) map.getCanvas().style.cursor = ""; });
          }
          ready.current = true;
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
  }, [dark]);

  // New pins (filters or radius changed).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    (map.getSource("branches") as GeoJSONSource | undefined)?.setData(collection(pins));
  }, [pins]);

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
    if (map.getLayer("selected")) map.setFilter("selected", ["==", ["get", "id"], selectedId ?? ""]);
    const pin = selectedId ? latest.current.pins.find((p) => p.id === selectedId) : undefined;
    if (pin) map.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 15), duration: reduced() ? 0 : 400 });
  }, [selectedId]);

  return <div ref={box} role="region" aria-label="Map of nearby restaurants. The list below has the same restaurants." className="h-full w-full" />;
}
