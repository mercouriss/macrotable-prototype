import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { Icon } from "../components/Icon";
import { approx } from "../components/ProvenanceBadge";
import { RealRestaurantInfo, RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Card } from "../components/ui";
import { DEMO_AREA, distanceFromUser, formatDistance } from "../data/geo";
import { RESTAURANTS } from "../data/restaurants";
import { euro } from "../lib/format";
import { explainConfiguration, runSearch } from "../lib/optimizer";
import { REALISM_DISCLOSURE } from "../lib/provenance";
import { useAppState } from "../state/AppState";
import type { Restaurant, UserTarget } from "../types";

const LeafletMap = lazy(() => import("../explore/LeafletMap"));

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Explore: map (real + demo pins) → selected card → restaurant / Ask MacroAgent. One dataset drives everything. */
export function Explore() {
  const { target, prefs } = useAppState();
  const [selected, setSelected] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const stores = RESTAURANTS.map((r) => ({ r, best: runSearch(target, prefs, r.id).ranked[0], km: distanceFromUser(r.location) })).sort((a, b) => a.km - b.km);

  // Map pin → selected card comes into view.
  useEffect(() => {
    if (selected) cardRefs.current[selected]?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [selected]);

  return (
    <Screen nav bleed>
      <div className="px-5 pt-6">
        <h1 className="font-display text-[27px] font-semibold tracking-[-0.02em]">Explore</h1>
        <p className="mt-0.5 text-[13.5px] text-ink-3">Near you · {DEMO_AREA.label} (demo location)</p>
      </div>
      <div className="mx-5 mt-4 h-[248px] overflow-hidden rounded-[22px] border border-line-2 shadow-card">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-sunken" />}>
          <LeafletMap selected={selected} onSelect={setSelected} />
        </Suspense>
      </div>
      <p className="mx-5 mt-2 flex gap-1.5 text-[11.5px] leading-snug text-ink-3">
        <Icon name="info" size={13} className="mt-px shrink-0" />
        {REALISM_DISCLOSURE}
      </p>
      <ul className="mt-4 mb-6 space-y-3 px-5">
        {stores.map(({ r, best, km }) => (
          <li key={r.id} ref={(el) => void (cardRefs.current[r.id] = el)} className="scroll-mt-4">
            <Card className={`p-4 transition-shadow ${selected === r.id ? "ring-2 ring-ink/70" : ""}`}>
              <button className="block w-full text-left" onClick={() => setSelected(r.id)} aria-pressed={selected === r.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[16.5px] font-semibold tracking-tight">{r.name}</p>
                  <span className="tnum shrink-0 text-[12.5px] text-ink-3">
                    {formatDistance(km)}
                    {r.priceRange ? ` · ${r.priceRange}` : ""}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink-3">
                  {r.cuisine}
                  {r.identity === "demo"
                    ? ` · ${r.serviceModes.map((m) => (m === "pickup" ? `pickup ~${r.pickupMinutes} min` : "in-store")).join(" · ")} (simulated)`
                    : ` · ${r.address}`}
                </p>
              </button>
              <div className="mt-2">
                <RestaurantBadge restaurant={r} size="sm" />
              </div>
              {r.identity === "real" ? <RealCardBody r={r} /> : <DemoCardBody r={r} best={best} target={target} />}
            </Card>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

function DemoCardBody({ r, best, target }: { r: Restaurant; best: ReturnType<typeof runSearch>["ranked"][number] | undefined; target: UserTarget }) {
  const gaps = best ? explainConfiguration(best, target).misses : [];
  return (
    <>
      <p className="tnum mt-2 text-[13px] text-ink-2">
        {best ? (
          <>
            <span className={`font-semibold ${best.meets ? "text-brand" : "text-warn"}`}>{best.meets ? "✓ Fits your target" : "Closest option"}</span>
            {" · "}
            {best.meal.name} · {approx(best.meal.provenance)}
            {best.nutrition.calories} kcal · {approx(best.meal.provenance)}
            {best.nutrition.protein} g · {euro(best.price)}
            {!best.meets && gaps[0] ? ` · ${gaps[0].toLowerCase()}` : ""}
          </>
        ) : (
          <span className="text-ink-3">Nothing within €{target.maxBudget}</span>
        )}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-3">{r.integrationLevel === 1 ? "Recommend + counter hand-off only" : "Pickup or in-store through MacroTable (simulated)"}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "explore" }} label="Ask Agent" />
        <Link
          to={`/macrotable/explore/${r.id}`}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface text-[14px] font-semibold text-ink-2 hover:bg-sunken"
        >
          <Icon name="receipt" size={16} /> View menu
        </Link>
      </div>
    </>
  );
}

function RealCardBody({ r }: { r: Restaurant }) {
  const navigate = useNavigate();
  const { openCustom } = useSheet();
  return (
    <>
      <p className="mt-2 text-[13px] leading-snug text-ink-2">No MacroTable data here. Photograph the menu and MacroAgent reads it (lower confidence).</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate(`/macrotable/scan?type=menu&restaurant=${r.id}`, { state: { userTap: true } })}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-brand text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          <Icon name="camera" size={16} /> Scan the menu
        </button>
        <button
          onClick={() => openCustom(`${r.name} is a real restaurant`, <RealRestaurantInfo restaurant={r} />)}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface text-[14px] font-semibold text-ink-2 hover:bg-sunken"
        >
          <Icon name="info" size={16} /> About
        </button>
      </div>
      <div className="mt-2">
        <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "explore" }} label="Ask Agent" variant="link" />
      </div>
    </>
  );
}
