"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cuisineGroupId, cuisineGroups } from "@/lib/mm/cuisine";
import { DEFAULT_RADIUS_MILES, directionsUrl, formatMiles, geocode, groupByChain, MAX_MAP_BRANCHES, MILES_RADII, nearbyBranches, type Area, type BranchesDoc, type LatLng } from "@/lib/mm/geo";
import { chainHref } from "@/lib/mm/routes";
import { HALAL_CAUTION, isAllHalal } from "@/lib/mm/halal";
import { tk } from "@/lib/mm/i18n";
import { settingsStore } from "@/lib/mm/stores";
import { ChainMark } from "../_components/ChainMark";
import { ChevronLeftIcon, DirectionsIcon, LocateIcon, PinIcon, SearchIcon } from "../_components/icons";
import { Button, Chip, EmptyState, ErrorBox, inputClass, Spinner } from "../_components/ui";
import { useMenu } from "../_lib/hooks";
import { loadBranches } from "../_lib/branches";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import type { MapPin } from "./MapView";

// Restaurants near the user, on a map and as a list, with filters (founder's request 2026-10-06). The phone works out the
// nearest branches itself: the location, or the typed area, never leaves this browser except that a typed postcode or town is
// looked up by postcodes.io (disclosed on the privacy page). See lib/mm/geo.ts.

function MapLoading() {
  const t = useT();
  return <div className="grid h-full place-items-center text-sm text-muted">{t("Loading map…")}</div>;
}

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <MapLoading />,
});

const AREA_KEY = "mm.v1.mapArea"; // a typed area (label + coordinates) is remembered on this device only; GPS positions never are

type Origin = (LatLng & { label: string; source: "gps" | "typed" }) | null;
type Locating = { state: "idle" } | { state: "locating" } | { state: "error"; message: string };

function readSavedArea(): Origin {
  try {
    const a = JSON.parse(localStorage.getItem(AREA_KEY) ?? "null") as Area | null;
    if (a && typeof a.lat === "number" && typeof a.lng === "number" && typeof a.label === "string") return { ...a, source: "typed" };
  } catch { /* storage blocked: nothing remembered */ }
  return null;
}

function useDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia("(prefers-color-scheme: dark)");
      q.addEventListener("change", cb);
      return () => q.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

export default function NearbyPage() {
  const t = useT();
  const menu = useMenu();
  const dark = useDark();
  const [origin, setOrigin] = useState<Origin>(null);
  const [locating, setLocating] = useState<Locating>({ state: "idle" });
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS_MILES);
  const [types, setTypes] = useState<ReadonlySet<string>>(new Set());
  const [fullOnly, setFullOnly] = useState(false);
  const [halalOnly, setHalalOnly] = useState(() => settingsStore.get().preferences.halalOnly ?? false);
  const [typed, setTyped] = useState("");
  const [choices, setChoices] = useState<Area[]>([]);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [doc, setDoc] = useState<BranchesDoc | null>(null);
  const [docError, setDocError] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => { loadBranches().then(setDoc, () => setDocError(true)); }, []);
  const retryBranches = () => {
    setDocError(false);
    loadBranches().then(setDoc, () => setDocError(true));
  };

  const locateMe = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocating({ state: "error", message: tk("This browser can't share your location. Type a postcode or town instead.") });
      return;
    }
    setLocating({ state: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: tk("your location"), source: "gps" });
        setLocating({ state: "idle" });
        setEditing(false);
        setChoices([]);
        setSelectedId(null);
      },
      (err) =>
        setLocating({
          state: "error",
          message: err.code === err.PERMISSION_DENIED
            ? tk("Location is turned off for this site. Turn it on in your browser settings, or type a postcode or town instead.")
            : tk("Couldn't work out where you are. Try again, or type a postcode or town instead."),
        }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }, []);

  // On opening: use the location straight away if this site was already allowed it, else the area typed last time.
  useEffect(() => {
    // Restoring a device-only choice after hydration: reading browser storage can't happen during render.
    /* eslint-disable react-hooks/set-state-in-effect */
    let cancelled = false;
    const saved = readSavedArea();
    if (saved) setOrigin(saved);
    navigator.permissions?.query({ name: "geolocation" }).then((p) => { if (!cancelled && p.state === "granted") locateMe(); }, () => undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => { cancelled = true; };
  }, [locateMe]);

  const chooseArea = (a: Area) => {
    setOrigin({ ...a, source: "typed" });
    setEditing(false);
    setChoices([]);
    setLookupMessage(null);
    setSelectedId(null);
    try { localStorage.setItem(AREA_KEY, JSON.stringify(a)); } catch { /* not remembered, still works */ }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupMessage(null);
    setChoices([]);
    const r = await geocode(typed);
    if (r === "invalid") return setLookupMessage(tk("Type a UK postcode (like LS1 4AP) or a town or area."));
    if (r === "failed") return setLookupMessage(tk("Couldn't look that up. Check your connection and try again."));
    if (r.length === 0) return setLookupMessage(tk("We couldn't find that place. Try a postcode or the nearest town."));
    if (r.length === 1) return chooseArea(r[0]!);
    setChoices(r);
  };

  // Chains we can place on the map, narrowed by the full-nutrition switch, then (separately) by type.
  const byId = useMemo(() => new Map(menu.chains.filter((c) => !c.sample).map((c) => [c.id, c])), [menu.chains]);
  const nutritionOk = useMemo(
    () => new Set([...byId.values()].filter((c) => (!fullOnly || (c.nutritionLevel ?? "full") === "full") && (!halalOnly || isAllHalal(c.id))).map((c) => c.id)),
    [byId, fullOnly, halalOnly],
  );
  const anyHalal = useMemo(() => [...byId.keys()].some(isAllHalal), [byId]);
  const inRange = useMemo(() => (doc && origin ? nearbyBranches(doc, origin, radius, nutritionOk) : []), [doc, origin, radius, nutritionOk]);
  const typeChips = useMemo(() => cuisineGroups(groupByChain(inRange).map((g) => byId.get(g.chainId)!).filter(Boolean)), [inRange, byId]);
  const branches = useMemo(() => (types.size === 0 ? inRange : inRange.filter((b) => types.has(cuisineGroupId(byId.get(b.chainId)?.cuisine)))), [inRange, types, byId]);
  const rows = useMemo(() => groupByChain(branches), [branches]);
  const pins = useMemo<MapPin[]>(() => branches.slice(0, MAX_MAP_BRANCHES).map((b) => ({ id: `${b.chainId}@${b.lat},${b.lng}`, lat: b.lat, lng: b.lng, chainId: b.chainId })), [branches]);
  const selected = selectedId ? branches.find((b) => `${b.chainId}@${b.lat},${b.lng}` === selectedId) : undefined;
  const selectedChain = selected ? byId.get(selected.chainId) : undefined;

  const toggleType = (id: string) => setTypes((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div>
      <Link href="/app/eat-out" aria-label={t("Back to restaurants")} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Restaurants {near} you")} values={{ near: <span className="serif-em sun-text pe-0.5">{t("near")}</span> }} /></h1>

      {origin && !editing ? (
        <div className="glass mt-5 flex items-center gap-3 rounded-full py-1.5 ps-4 pe-1.5">
          <PinIcon className="h-5 w-5 shrink-0 text-accent" />
          <p className="min-w-0 flex-1 truncate text-[15px]"><Rich text={t("Near {place}")} values={{ place: <span className="font-bold">{origin.source === "gps" ? t(origin.label) : origin.label}</span> }} /></p>
          <Button variant="secondary" onClick={() => setEditing(true)}>{t("Change")}</Button>
        </div>
      ) : (
      <form onSubmit={search} className="glass mt-5 space-y-3 rounded-3xl p-4">
        <Button type="button" full onClick={locateMe} disabled={locating.state === "locating"}>
          <LocateIcon className="h-5 w-5" /> {locating.state === "locating" ? t("Finding you…") : t("Use my location")}
        </Button>
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("Postcode or town")}</span>
            <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("Or type a postcode or town")} enterKeyHint="search" autoComplete="off" className={`${inputClass} ps-11`} />
          </label>
          <Button type="submit" variant="secondary">{t("Search")}</Button>
        </div>
        <p className="text-xs text-muted">{t("Your location stays on your phone: we use it only to find the closest branches. A typed postcode or town is looked up by postcodes.io.")}</p>
        {locating.state === "error" && <p role="alert" className="text-sm font-medium text-accent">{t(locating.message)}</p>}
        {lookupMessage && <p role="alert" className="text-sm font-medium text-accent">{t(lookupMessage)}</p>}
        {origin && <Button type="button" variant="ghost" full onClick={() => setEditing(false)}>{t("Cancel")}</Button>}
        {choices.length > 0 && (
          <ul aria-label={t("Did you mean")} className="space-y-1.5">
            {choices.map((c) => (
              <li key={c.label}><Button type="button" variant="secondary" full className="justify-start" onClick={() => chooseArea(c)}><PinIcon className="h-5 w-5" /> {c.label}</Button></li>
            ))}
          </ul>
        )}
      </form>

      )}

      {!origin ? (
        <div className="mt-6"><EmptyState title={t("Where are you eating?")} body={t("Share your location or type a postcode or town to see the restaurants around you.")} /></div>
      ) : docError ? (
        <div className="mt-6"><ErrorBox message={t("Couldn't load the restaurant locations. Check your connection.")} onRetry={retryBranches} /></div>
      ) : !doc || menu.status !== "ready" ? (
        <Spinner label={t("Loading restaurants")} />
      ) : (
        <>
          <div className="mt-4 space-y-2">
            <div role="group" aria-label={t("Distance")} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {MILES_RADII.map((m) => (<Chip key={m} selected={radius === m} onClick={() => setRadius(m)}>{m} mi</Chip>))}
            </div>
            <div role="group" aria-label={t("Filters")} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              <Chip selected={fullOnly} onClick={() => setFullOnly((v) => !v)} aria-describedby="full-help">{t("Full nutrition only")}</Chip>
              {(anyHalal || halalOnly) && <Chip selected={halalOnly} onClick={() => setHalalOnly((v) => !v)}>{t("Halal")}</Chip>}
              {typeChips.length > 1 && <Chip selected={types.size === 0} onClick={() => setTypes(new Set())}>{t("All types")}</Chip>}
              {typeChips.length > 1 && typeChips.map((g) => (<Chip key={g.id} selected={types.has(g.id)} onClick={() => toggleType(g.id)}>{t(g.label)}</Chip>))}
            </div>
            <p id="full-help" className="sr-only">{t("Only restaurants that publish calories, protein, carbs and fat for every item.")}</p>
            {halalOnly && <p className="text-sm text-muted">{t("Restaurants whose own website says all their food is halal.")} {t(HALAL_CAUTION)}</p>}
          </div>

          <div className="relative mt-4 h-[46dvh] min-h-72 overflow-hidden rounded-3xl border border-line bg-soft-strong">
            {mapFailed ? (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">{t("The map couldn't load (it needs a connection). The list below still works.")}</div>
            ) : (
              <MapView center={origin} radiusMiles={radius} pins={pins} selectedId={selectedId} onSelect={setSelectedId} dark={dark} onFailed={() => setMapFailed(true)} />
            )}
          </div>
          <p className="mt-1 px-1 text-[11px] text-muted">{t("Map © OpenFreeMap, data © OpenStreetMap contributors. Branch positions © OpenStreetMap contributors.")}</p>

          {selected && selectedChain && (
            <div className="glass sheet-in mt-3 flex items-center gap-3 rounded-3xl p-4" role="status" aria-live="polite">
              <ChainMark chainId={selectedChain.id} cuisine={selectedChain.cuisine} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold tracking-tight">{selectedChain.name}</p>
                <p className="app-numbers text-sm text-muted">{t("{distance} away", { distance: formatMiles(selected.miles, t) })}</p>
              </div>
              <Link href={chainHref(selectedChain.id)} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-accent">{t("Menu")}</Link>
              <a href={directionsUrl(selected)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-accent">{t("Directions")}<span className="sr-only"> {t("(opens in a new tab)")}</span></a>
            </div>
          )}

          <h2 className="app-numbers mb-3 mt-8 text-xl font-bold tracking-tight">
            {rows.length === 0
              ? t("No restaurants here")
              : `${branches.length === 1 ? t("1 branch") : t("{n} branches", { n: branches.length })} · ${rows.length === 1 ? t("1 restaurant") : t("{n} restaurants", { n: rows.length })}`}
          </h2>
          {branches.length > MAX_MAP_BRANCHES && <p className="-mt-2 mb-3 text-sm text-muted">{t("The map shows the nearest {n} branches; narrow the distance or type to see the rest.", { n: MAX_MAP_BRANCHES })}</p>}

          {rows.length === 0 ? (
            <EmptyState
              title={radius === 1 ? t("Nothing within 1 mile that matches.") : t("Nothing within {n} miles that matches.", { n: radius })}
              body={t("Try a bigger distance, or switch off a filter.")}
              action={radius < MILES_RADII[MILES_RADII.length - 1]! ? <Button variant="secondary" onClick={() => setRadius(MILES_RADII[MILES_RADII.length - 1]!)}>{t("Look within {n} miles", { n: MILES_RADII[MILES_RADII.length - 1]! })}</Button> : undefined}
            />
          ) : (
            <ul className="space-y-2.5">
              {rows.map((g) => {
                const chain = byId.get(g.chainId);
                if (!chain) return null;
                const id = `${g.nearest.chainId}@${g.nearest.lat},${g.nearest.lng}`;
                return (
                  <li key={g.chainId} className="glass rounded-3xl p-4">
                    <div className="flex items-center gap-3">
                      <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold tracking-tight">{chain.name}</p>
                        <p className="app-numbers text-sm text-muted">
                          {t("{distance} away", { distance: formatMiles(g.nearest.miles, t) })}{g.branches > 1 ? ` · ${t("{n} within {radius} mi", { n: g.branches, radius })}` : ""}
                          {(chain.nutritionLevel ?? "full") === "calories" ? ` · ${t("calories only")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={chainHref(chain.id)} className="btn-sun inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-bold text-on-accent">{t("Menu")}</Link>
                      <Button variant="secondary" onClick={() => { setSelectedId(id); document.querySelector("[data-nearby-map]")?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>{t("Show on map")}</Button>
                      <a href={directionsUrl(g.nearest)} target="_blank" rel="noopener noreferrer" className="glass inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold"><DirectionsIcon className="h-5 w-5" />{t("Directions")}<span className="sr-only"> {t("to the nearest {name} (opens in a new tab)", { name: chain.name })}</span></a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
