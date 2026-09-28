import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { DEMO_AREA } from "../data/geo";
import { RESTAURANTS } from "../data/restaurants";
import { IllustratedMap } from "./IllustratedMap";

/*
 * Real map (OpenStreetMap tiles, attributed) with FICTIONAL demo-store pins.
 * Tiles need a network connection; if they fail we switch to the illustrated map.
 * Tiles are not precached (OSM tile usage policy).
 */
export default function LeafletMap({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const [failed, setFailed] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    if (failed || !el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([DEMO_AREA.center.lat, DEMO_AREA.center.lng], DEMO_AREA.zoom);
    map.current = m;
    let errors = 0;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · stores are fictional',
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

    for (const r of RESTAURANTS) {
      const mk = L.marker([r.location.lat, r.location.lng], {
        title: `${r.name} (fictional demo store)`,
        alt: `${r.name} (fictional demo store)`,
        icon: pinIcon(r.name, r.integrationLevel, false),
        keyboard: true,
      })
        .on("click", () => onSelect(r.id))
        .addTo(m);
      markers.current[r.id] = mk;
    }
    return () => {
      m.remove();
      map.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  useEffect(() => {
    for (const r of RESTAURANTS) markers.current[r.id]?.setIcon(pinIcon(r.name, r.integrationLevel, r.id === selected));
    const r = RESTAURANTS.find((x) => x.id === selected);
    if (r && map.current) map.current.panTo([r.location.lat, r.location.lng]);
  }, [selected]);

  if (failed) return <IllustratedMap selected={selected} onSelect={onSelect} note="Map tiles unavailable — showing the illustrated demo map." />;
  return <div ref={el} className="h-full w-full" role="region" aria-label="Map of fictional demo stores" />;
}

function pinIcon(name: string, level: number, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="mt-pin${active ? " mt-pin-active" : ""}" data-level="${level}">${escapeHtml(name)}</span>`,
    iconSize: undefined,
    iconAnchor: [14, 30],
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
