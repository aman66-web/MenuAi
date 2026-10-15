"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cuisineGroupId, cuisineGroups } from "@/lib/mm/cuisine";
import { DEFAULT_RADIUS_MILES, directionsUrl, formatMiles, geocode, groupByChain, MAX_MAP_BRANCHES, MILES_RADII, nearbyBranches, type Area, type BranchesDoc, type LatLng } from "@/lib/mm/geo";
import { chainHref } from "@/lib/mm/routes";
import { HALAL_CAUTION, isAllHalal } from "@/lib/mm/halal";
import { tk } from "@/lib/mm/i18n";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { site } from "@/site.config";
import { settingsStore } from "@/lib/mm/stores";
import { ChainMark } from "../_components/ChainMark";
import { ChevronLeftIcon, DirectionsIcon, ForkIcon, LocateIcon, PinIcon } from "../_components/icons";
import { Button, Chip, EmptyIcon, EmptyState, ErrorBox, Spinner } from "../_components/ui";
import { useMenu } from "../_lib/hooks";
import { loadBranches } from "../_lib/branches";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import type { MapPin } from "./MapView";

// Restaurants near the user, on a map and as a list, with filters (founder's request 2026-10-06). The phone works out the
// nearest branches itself: the location, or the typed area, never leaves this browser except that a typed postcode or town is
// looked up by postcodes.io (disclosed on the privacy page). See lib/mm/geo.ts.
// Look (founder 2026-10-15, "the rest of the app should match that elegance"): Home's language. A grey Back pill (36 px in a 44 px tap
// area) and a compact heavy title; the place you're near as a white pill with a lime pin (lime = the one highlighted thing); a typed
// place in one grey field with its white Search button inside it (the button drops under the field when the words need the room); the
// distance and filter chips under small spaced labels; the map in a 20 px card; each restaurant as a white card with its tile, name and
// distance, and its actions as even grey tiles with an icon over the word, like the tab bar. Only the selected restaurant's card (the one
// focused thing on the screen) has a black "Menu" tile; in the list every tile is grey, so a long list isn't a column of black blocks.
// Every word, role and name is as before.

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

/** Back: a 36 px grey pill inside a 44 px tap area, like Home's round buttons. */
const BACK = "group -ms-1 inline-flex min-h-11 items-center rounded-full px-1 transition active:scale-95";
const BACK_PILL = "inline-flex min-h-9 items-center gap-1 rounded-full bg-soft-strong py-1 ps-2 pe-3.5 text-[0.9375rem] font-bold leading-tight transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]";
/** A restaurant's actions: even tiles with the icon over the word (the minimum width is in rem, so at large text a tile drops to the next
    row and widens to fill it). */
const ACTIONS = "flex flex-wrap gap-2";
const ACTION = "flex min-h-[3.75rem] min-w-0 grow basis-[6.25rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center text-[0.875rem] font-semibold leading-tight transition active:scale-[0.97] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0";
const ACTION_MAIN = `${ACTION} bg-foreground text-background hover:bg-[color-mix(in_srgb,var(--foreground)_86%,white)]`;
const ACTION_SOFT = `${ACTION} bg-soft-strong text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]`;
/** A secondary action inside a white card: the same grey as Home's round buttons (the shared secondary Button fades to the card fill here). */
const pill = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-soft-strong px-5 text-[0.9375rem] font-semibold transition hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";
// -my/py: a scroller clips vertically too, so the chips get room for their focus ring (2 px wide, 3 px out).
const chipRow = "no-scrollbar -mx-5 -my-1.5 flex gap-2 overflow-x-auto px-5 py-1.5";

export default function NearbyPage() {
  const t = useT();
  const menu = useMenu();
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

  // `quietly`: only if the person already allowed it (on opening the map); never shows a prompt or an error.
  const locateMe = useCallback((quietly = false) => {
    const found = (lat: number, lng: number) => {
      setOrigin({ lat, lng, label: tk("your location"), source: "gps" });
      setLocating({ state: "idle" });
      setEditing(false);
      setChoices([]);
      setSelectedId(null);
    };
    if (hasNative()) {
      // In the iPhone app the iPhone finds the location (one system prompt); it stays on the phone like in the browser.
      if (!quietly) setLocating({ state: "locating" });
      void nativeCall("locate", { onlyIfAllowed: quietly }, 20_000).then((r) => {
        if (r.lat !== undefined && r.lng !== undefined) return found(r.lat, r.lng);
        if (quietly) return;
        setLocating({
          state: "error",
          message: r.error === "denied"
            ? tk("{app} isn't allowed to use your location. Turn it on in the iPhone's Settings, under {app}, or type a postcode or town instead.")
            : tk("Couldn't work out where you are. Try again, or type a postcode or town instead."),
        });
      });
      return;
    }
    if (!("geolocation" in navigator)) {
      setLocating({ state: "error", message: tk("This browser can't share your location. Type a postcode or town instead.") });
      return;
    }
    setLocating({ state: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => found(pos.coords.latitude, pos.coords.longitude),
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
    if (hasNative()) locateMe(true);
    else navigator.permissions?.query({ name: "geolocation" }).then((p) => { if (!cancelled && p.state === "granted") locateMe(); }, () => undefined);
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
      <Link href="/app/eat-out" aria-label={t("Back to restaurants")} className={BACK}><span className={BACK_PILL}><ChevronLeftIcon className="h-[1.125rem] w-[1.125rem]" /><span>{t("Back")}</span></span></Link>
      <h1 className="mt-4 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]"><Rich text={t("Restaurants {near} you")} values={{ near: <span className="serif-em">{t("near")}</span> }} /></h1>

      {origin && !editing ? (
        <div className="glass mt-5 flex items-center gap-3 rounded-[1.75rem] p-1.5">
          <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sun text-[var(--on-accent)]"><PinIcon className="h-5 w-5" /></span>
          <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]"><Rich text={t("Near {place}")} values={{ place: <span className="font-bold">{origin.source === "gps" ? t(origin.label) : origin.label}</span> }} /></p>
          <button type="button" onClick={() => setEditing(true)} className={pill}>{t("Change")}</button>
        </div>
      ) : (
      <form onSubmit={search} className="glass mt-5 space-y-3 rounded-[1.25rem] p-4">
        <Button type="button" full onClick={() => locateMe()} disabled={locating.state === "locating"}>
          <LocateIcon className="h-5 w-5" /> {locating.state === "locating" ? t("Finding you…") : t("Use my location")}
        </Button>
        {/* One grey field with its white Search button inside; when the words need the room (large text, a long translation) the
            button drops under the field and fills the width. The focus ring goes round the whole field. */}
        <div className="flex flex-wrap items-center gap-1 rounded-[1.625rem] bg-soft-strong p-1 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent">
          <label className="min-w-[min(100%,13.5rem)] grow-[999] basis-0">
            <span className="sr-only">{t("Postcode or town")}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("Or type a postcode or town")} enterKeyHint="search" autoComplete="off" className="min-h-11 w-full rounded-full bg-transparent ps-4 pe-1 text-base placeholder:text-muted focus-visible:outline-none!" />
          </label>
          <button type="submit" className="inline-flex min-h-11 grow items-center justify-center rounded-full bg-white px-4 text-[0.9375rem] font-bold shadow-[0_1px_2px_rgba(17,24,20,0.08)] transition hover:bg-[var(--fill)] active:scale-[0.97]">{t("Search")}</button>
        </div>
        <p className="text-[0.8125rem] leading-snug text-muted">{t("Your location stays on your phone: we use it only to find the closest branches. A typed postcode or town is looked up by postcodes.io.")}</p>
        {locating.state === "error" && <p role="alert" className="text-sm font-medium text-accent">{t(locating.message, { app: site.name })}</p>}
        {lookupMessage && <p role="alert" className="text-sm font-medium text-accent">{t(lookupMessage)}</p>}
        {origin && <Button type="button" variant="ghost" full onClick={() => setEditing(false)}>{t("Cancel")}</Button>}
        {choices.length > 0 && (
          <ul aria-label={t("Did you mean")} className="space-y-1.5">
            {choices.map((c) => (
              <li key={c.label}><button type="button" className={`${pill} w-full justify-start text-start`} onClick={() => chooseArea(c)}><PinIcon className="h-5 w-5 shrink-0" /> {c.label}</button></li>
            ))}
          </ul>
        )}
      </form>

      )}

      {!origin ? (
        <div className="mt-6"><EmptyState icon={<EmptyIcon><PinIcon /></EmptyIcon>} title={t("Where are you eating?")} body={t("Share your location or type a postcode or town to see the restaurants around you.")} /></div>
      ) : docError ? (
        <div className="mt-6"><ErrorBox message={t("Couldn't load the restaurant locations. Check your connection.")} onRetry={retryBranches} /></div>
      ) : !doc || menu.status !== "ready" ? (
        <Spinner label={t("Loading restaurants")} />
      ) : (
        <>
          <div className="mt-6 space-y-4">
            <div>
              <p aria-hidden className="kicker mb-2 ps-1">{t("Distance")}</p>
              <div role="group" aria-label={t("Distance")} className={chipRow}>
                {MILES_RADII.map((m) => (<Chip key={m} selected={radius === m} onClick={() => setRadius(m)}>{m} mi</Chip>))}
              </div>
            </div>
            <div>
              <p aria-hidden className="kicker mb-2 ps-1">{t("Filters")}</p>
              <div role="group" aria-label={t("Filters")} className={chipRow}>
                <Chip selected={fullOnly} onClick={() => setFullOnly((v) => !v)} aria-describedby="full-help">{t("Full nutrition only")}</Chip>
                {(anyHalal || halalOnly) && <Chip selected={halalOnly} onClick={() => setHalalOnly((v) => !v)}>{t("Halal")}</Chip>}
                {typeChips.length > 1 && <Chip selected={types.size === 0} onClick={() => setTypes(new Set())}>{t("All types")}</Chip>}
                {typeChips.length > 1 && typeChips.map((g) => (<Chip key={g.id} selected={types.has(g.id)} onClick={() => toggleType(g.id)}>{t(g.label)}</Chip>))}
              </div>
            </div>
            <p id="full-help" className="sr-only">{t("Only restaurants that publish calories, protein, carbs and fat for every item.")}</p>
            {halalOnly && <p className="text-sm leading-snug text-muted">{t("Restaurants whose own website says all their food is halal.")} {t(HALAL_CAUTION)}</p>}
          </div>

          <div className="glass relative mt-5 h-[46dvh] min-h-72 overflow-hidden rounded-[1.25rem] bg-soft-strong">
            {mapFailed ? (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">{t("The map couldn't load (it needs a connection). The list below still works.")}</div>
            ) : (
              <MapView center={origin} radiusMiles={radius} pins={pins} selectedId={selectedId} onSelect={setSelectedId} onFailed={() => setMapFailed(true)} />
            )}
          </div>
          <p className="mt-2 px-1 text-[0.75rem] leading-snug text-muted">{t("Map © OpenFreeMap, data © OpenStreetMap contributors. Branch positions © OpenStreetMap contributors.")}</p>

          {selected && selectedChain && (
            <div className="glass sheet-in mt-3.5 rounded-[1.25rem] p-4" role="status" aria-live="polite">
              <div className="flex items-center gap-3.5">
                <ChainMark chainId={selectedChain.id} cuisine={selectedChain.cuisine} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold leading-snug [overflow-wrap:anywhere]">{selectedChain.name}</p>
                  <p className="app-numbers mt-0.5 text-sm leading-snug text-muted">{t("{distance} away", { distance: formatMiles(selected.miles, t) })}</p>
                </div>
              </div>
              <div className={`mt-3.5 ${ACTIONS}`}>
                <Link href={chainHref(selectedChain.id)} className={ACTION_MAIN}><ForkIcon /><span>{t("Menu")}</span></Link>
                <a href={directionsUrl(selected)} target="_blank" rel="noopener noreferrer" className={ACTION_SOFT}><DirectionsIcon /><span>{t("Directions")}<span className="sr-only"> {t("(opens in a new tab)")}</span></span></a>
              </div>
            </div>
          )}

          <h2 className="app-numbers mt-8 text-xl font-[800] tracking-[-0.01em]">
            {rows.length === 0
              ? t("No restaurants here")
              : `${branches.length === 1 ? t("1 branch") : t("{n} branches", { n: branches.length })} · ${rows.length === 1 ? t("1 restaurant") : t("{n} restaurants", { n: rows.length })}`}
          </h2>
          {branches.length > MAX_MAP_BRANCHES && <p className="mt-1.5 text-sm leading-snug text-muted">{t("The map shows the nearest {n} branches; narrow the distance or type to see the rest.", { n: MAX_MAP_BRANCHES })}</p>}

          {rows.length === 0 ? (
            <div className="mt-3.5">
              <EmptyState
                icon={<EmptyIcon><PinIcon /></EmptyIcon>}
                title={radius === 1 ? t("Nothing within 1 mile that matches.") : t("Nothing within {n} miles that matches.", { n: radius })}
                body={t("Try a bigger distance, or switch off a filter.")}
                action={radius < MILES_RADII[MILES_RADII.length - 1]! ? <button type="button" className={pill} onClick={() => setRadius(MILES_RADII[MILES_RADII.length - 1]!)}>{t("Look within {n} miles", { n: MILES_RADII[MILES_RADII.length - 1]! })}</button> : undefined}
              />
            </div>
          ) : (
            <ul className="mt-3.5 space-y-3">
              {rows.map((g) => {
                const chain = byId.get(g.chainId);
                if (!chain) return null;
                const id = `${g.nearest.chainId}@${g.nearest.lat},${g.nearest.lng}`;
                return (
                  <li key={g.chainId} className="glass rounded-[1.25rem] p-4">
                    <div className="flex items-center gap-3.5">
                      <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold leading-snug [overflow-wrap:anywhere]">{chain.name}</p>
                        <p className="app-numbers mt-0.5 text-sm leading-snug text-muted">
                          {t("{distance} away", { distance: formatMiles(g.nearest.miles, t) })}{g.branches > 1 ? ` · ${t("{n} within {radius} mi", { n: g.branches, radius })}` : ""}
                          {(chain.nutritionLevel ?? "full") === "calories" ? ` · ${t("calories only")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className={`mt-3.5 ${ACTIONS}`}>
                      <Link href={chainHref(chain.id)} className={ACTION_SOFT}><ForkIcon /><span>{t("Menu")}</span></Link>
                      <button type="button" className={ACTION_SOFT} onClick={() => { setSelectedId(id); document.querySelector("[data-nearby-map]")?.scrollIntoView({ block: "center", behavior: "smooth" }); }}><PinIcon /><span>{t("Show on map")}</span></button>
                      <a href={directionsUrl(g.nearest)} target="_blank" rel="noopener noreferrer" className={ACTION_SOFT}><DirectionsIcon /><span>{t("Directions")}<span className="sr-only"> {t("to the nearest {name} (opens in a new tab)", { name: chain.name })}</span></span></a>
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
