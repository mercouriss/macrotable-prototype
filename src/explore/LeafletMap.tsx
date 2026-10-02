import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { DEMO_AREA, distanceKm } from "../data/geo";
import type { Restaurant } from "../types";
import { IllustratedMap } from "./IllustratedMap";

/*
 * Real map (OpenStreetMap tiles, attributed). Demo brands get a labelled monogram pin
 * (fictional, tagged DEMO); real, unaffiliated restaurants are small neutral dots that
 * only show their name when selected — so ~25 places stay readable on a phone.
 * Tiles need a network connection; if they fail we switch to the illustrated map.
 * Tiles are not precached (OSM tile usage policy).
 */
/** Demo brands within this distance of "you" decide the opening view. */
const FRAME_RADIUS_KM = 1;

export default function LeafletMap({
  restaurants,
  selected,
  onSelect,
}: {
  restaurants: Restaurant[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const list = useRef(restaurants);
  list.current = restaurants;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [failed, setFailed] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const ids = restaurants.map((r) => r.id).join(",");

  useEffect(() => {
    if (failed || !el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([DEMO_AREA.center.lat, DEMO_AREA.center.lng], DEMO_AREA.zoom);
    map.current = m;
    let errors = 0;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
      .on("tileerror", () => {
        if (++errors >= 4) setFailed(true);
      })
      .addTo(m);
    L.control.zoom({ position: "bottomright" }).addTo(m);

    L.marker([DEMO_AREA.user.lat, DEMO_AREA.user.lng], {
      icon: L.divIcon({ className: "", html: '<span class="mt-you" aria-label="You (demo location)"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      keyboard: false,
      interactive: false,
    }).addTo(m);

    m.attributionControl.setPrefix(false);
    // Frame "you" + the demo brands near you (after layout, so the container has its real size).
    // Farther demo brands (the 1–2.5 km showcase stores) and real places are a zoom-out or pan
    // away and always in the list; framing them too would shrink the campus cluster into a
    // pile of overlapping pins on a phone. No animation: an in-flight pan from invalidateSize
    // would otherwise cancel the zoom.
    const frame = () => {
      const demo = list.current.filter((r) => r.identity === "demo" && distanceKm(DEMO_AREA.user, r.location) <= FRAME_RADIUS_KM);
      m.invalidateSize({ pan: false });
      if (demo.length)
        m.fitBounds(L.latLngBounds([DEMO_AREA.user, ...demo.map((r) => r.location)].map((p) => [p.lat, p.lng] as [number, number])), {
          padding: [30, 30],
          maxZoom: 16,
          animate: false,
        });
    };
    // Frame once the container has a real size (a lazy mount can report 0×0 for a frame);
    // afterwards just keep Leaflet's size in sync.
    let framed = false;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width < 10) return;
      if (!framed) {
        framed = true;
        frame();
      } else m.invalidateSize();
    });
    ro.observe(el.current);
    m.on("zoomend", () => layoutLabels());
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  // (Re)build markers when the filtered set changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of Object.values(markers.current)) mk.remove();
    markers.current = {};
    for (const r of list.current) {
      const name = r.identity === "real" ? `${r.name} (real restaurant, not affiliated)` : `${r.name} (fictional demo restaurant)`;
      markers.current[r.id] = L.marker([r.location.lat, r.location.lng], { title: name, alt: name, icon: iconFor(r, r.id === selectedRef.current), keyboard: true, riseOnHover: true, zIndexOffset: r.identity === "demo" ? 100 : 0 })
        .on("click", () => onSelectRef.current(r.id))
        .addTo(m);
    }
    requestAnimationFrame(() => layoutLabels());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, failed]);

  useEffect(() => {
    layoutLabels();
    const r = list.current.find((x) => x.id === selected);
    if (r && map.current) map.current.panTo([r.location.lat, r.location.lng]);
  }, [selected]);

  /** Only the selected place carries a full name label, so pins never collide or drift from their true position. */
  function layoutLabels() {
    for (const r of list.current) {
      const active = r.id === selectedRef.current;
      markers.current[r.id]?.setIcon(iconFor(r, active)).setZIndexOffset(active ? 1000 : r.identity === "demo" ? 100 : 0);
    }
  }

  if (failed) return <IllustratedMap restaurants={restaurants} selected={selected} onSelect={onSelect} note="Map tiles unavailable — showing the illustrated demo map." />;
  return <div ref={el} className="h-full w-full" role="region" aria-label="Map of nearby real and demo restaurants" />;
}

function iconFor(r: Restaurant, active: boolean) {
  if (!active) {
    if (r.identity === "real") return L.divIcon({ className: "", html: '<span class="mt-dot" data-identity="real"></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
    return L.divIcon({
      className: "",
      html: `<span class="mt-mono" style="background:${r.brand?.color ?? "#454A52"}">${escapeHtml(r.brand?.mark ?? r.name[0])}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }
  const mark = r.brand ? `<i class="mt-pin-mark" style="background:${r.brand.color}">${escapeHtml(r.brand.mark)}</i>` : "";
  const tag = r.identity === "demo" ? '<small class="mt-pin-tag">DEMO</small>' : "";
  return L.divIcon({
    className: "",
    html: `<span class="mt-pin mt-pin-active" data-identity="${r.identity}">${mark}${escapeHtml(r.name)}${tag}</span>`,
    iconSize: undefined,
    iconAnchor: [14, 30],
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
