import { DEMO_AREA } from "../data/geo";
import { RESTAURANTS } from "../data/restaurants";

/** Offline fallback: a drawn neighbourhood with the fictional stores at their relative positions. */
export function IllustratedMap({ selected, onSelect, note }: { selected: string | null; onSelect: (id: string) => void; note?: string }) {
  const pts = [DEMO_AREA.user, ...RESTAURANTS.map((r) => r.location)];
  const lat = [Math.min(...pts.map((p) => p.lat)), Math.max(...pts.map((p) => p.lat))];
  const lng = [Math.min(...pts.map((p) => p.lng)), Math.max(...pts.map((p) => p.lng))];
  const pos = (p: { lat: number; lng: number }) => ({
    x: 12 + ((p.lng - lng[0]) / (lng[1] - lng[0] || 1)) * 76,
    y: 16 + (1 - (p.lat - lat[0]) / (lat[1] - lat[0] || 1)) * 64,
  });
  const you = pos(DEMO_AREA.user);
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#EEF0EA]" role="region" aria-label="Illustrated map of nearby real and demo restaurants">
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
        <rect x="0" y="62" width="100" height="10" fill="#DCE6EF" />
        <path d="M0 30 H100 M0 48 H100 M22 0 V100 M55 0 V100 M80 0 V100" stroke="#fff" strokeWidth="2.2" />
        <rect x="60" y="8" width="16" height="16" rx="2" fill="#D7E6CF" />
      </svg>
      <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#2A6FDB] shadow" style={{ left: `${you.x}%`, top: `${you.y}%` }} aria-label="You (demo location)" />
      {RESTAURANTS.map((r) => {
        const p = pos(r.location);
        const active = r.id === selected;
        return (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            aria-pressed={active}
            aria-label={r.identity === "real" ? `${r.name} (real restaurant, not affiliated)` : `${r.name} (fictional demo restaurant)`}
            className={`absolute -translate-x-1/2 -translate-y-full rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap shadow-card ${active ? "bg-ink text-white" : "bg-surface text-ink"} ${r.identity === "real" ? "border border-dashed border-ink-3/60" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {r.name}
            {r.identity === "demo" && <span className="ml-1 text-[9px] font-bold opacity-60">DEMO</span>}
          </button>
        );
      })}
      <p className="absolute right-2 bottom-1.5 text-[10px] text-ink-3">{note ?? "Illustrated demo map"} · DEMO restaurants are fictional</p>
    </div>
  );
}
