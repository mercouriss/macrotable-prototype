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
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [failed, setFailed] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    if (failed || !el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([DEMO_AREA.center.lat, DEMO_AREA.center.lng], DEMO_AREA.zoom);
    map.current = m;
    let errors = 0;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · DEMO pins are fictional',
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
        title: r.identity === "real" ? `${r.name} (real restaurant, not affiliated)` : `${r.name} (fictional demo restaurant)`,
        alt: r.identity === "real" ? `${r.name} (real restaurant, not affiliated)` : `${r.name} (fictional demo restaurant)`,
        icon: pinIcon(r.name, r.identity, r.integrationLevel, false, 0),
        keyboard: true,
      })
        .on("click", () => onSelect(r.id))
        .addTo(m);
      markers.current[r.id] = mk;
    }
    m.on("zoomend", () => layoutLabels());
    requestAnimationFrame(() => layoutLabels());
    return () => {
      m.remove();
      map.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  useEffect(() => {
    layoutLabels();
    const r = RESTAURANTS.find((x) => x.id === selected);
    if (r && map.current) map.current.panTo([r.location.lat, r.location.lng]);
  }, [selected]);

  /**
   * Label collision pass (pixel space). Pins keep their TRUE coordinates; a label that would
   * overlap one above it is nudged down until free (e.g. two places in the same food court).
   */
  function layoutLabels() {
    const m = map.current;
    if (!m) return;
    const placed: { x1: number; x2: number; y1: number; y2: number }[] = [];
    const items = RESTAURANTS.map((r) => ({ r, p: m.latLngToLayerPoint([r.location.lat, r.location.lng]) })).sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
    for (const { r, p } of items) {
      const w = r.name.length * 6.6 + (r.identity === "demo" ? 52 : 26);
      let shift = 0;
      const box = () => ({ x1: p.x - 20, x2: p.x - 20 + w, y1: p.y - 30 + shift, y2: p.y - 30 + shift + 24 });
      while (placed.some((q) => { const b = box(); return b.x1 < q.x2 && q.x1 < b.x2 && b.y1 < q.y2 && q.y1 < b.y2; }) && shift < 200) shift += 26;
      placed.push(box());
      markers.current[r.id]?.setIcon(pinIcon(r.name, r.identity, r.integrationLevel, r.id === selectedRef.current, shift));
    }
  }

  if (failed) return <IllustratedMap selected={selected} onSelect={onSelect} note="Map tiles unavailable — showing the illustrated demo map." />;
  return <div ref={el} className="h-full w-full" role="region" aria-label="Map of nearby real and demo restaurants" />;
}

function pinIcon(name: string, identity: "demo" | "real", level: number, active: boolean, shiftPx = 0) {
  return L.divIcon({
    className: "",
    html: `<span class="mt-pin${active ? " mt-pin-active" : ""}" data-identity="${identity}" data-level="${level}">${escapeHtml(name)}${identity === "demo" ? '<small class="mt-pin-tag">DEMO</small>' : ""}</span>`,
    iconSize: undefined,
    iconAnchor: [14, 30 - shiftPx],
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
