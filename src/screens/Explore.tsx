import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { Icon } from "../components/Icon";
import { approx } from "../components/ProvenanceBadge";
import { LEVEL_META, RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { Card } from "../components/ui";
import { DEMO_AREA, distanceFromUser, formatDistance } from "../data/geo";
import { RESTAURANTS } from "../data/restaurants";
import { euro } from "../lib/format";
import { explainConfiguration, runSearch } from "../lib/optimizer";
import { useAppState } from "../state/AppState";

const LeafletMap = lazy(() => import("../explore/LeafletMap"));

/** Explore: real map (fictional pins) + store cards with a deterministic fit indication. */
export function Explore() {
  const { target, prefs } = useAppState();
  const [selected, setSelected] = useState<string | null>(null);
  const stores = RESTAURANTS.map((r) => ({ r, best: runSearch(target, prefs, r.id).ranked[0], km: distanceFromUser(r.location) })).sort((a, b) => a.km - b.km);

  return (
    <Screen nav bleed>
      <div className="px-5 pt-6">
        <h1 className="font-display text-[27px] font-semibold tracking-[-0.02em]">Explore</h1>
        <p className="mt-0.5 text-[13.5px] text-ink-3">
          Near you · {DEMO_AREA.label} · <span className="font-medium text-ink-2">all stores are fictional</span>
        </p>
      </div>
      <div className="mx-5 mt-4 h-[248px] overflow-hidden rounded-[22px] border border-line-2 shadow-card">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-sunken" />}>
          <LeafletMap selected={selected} onSelect={setSelected} />
        </Suspense>
      </div>
      <ul className="mt-4 mb-6 space-y-3 px-5">
        {stores.map(({ r, best, km }) => {
          const gaps = best ? explainConfiguration(best, target).misses : [];
          return (
            <li key={r.id}>
              <Card className={`p-4 transition-shadow ${selected === r.id ? "ring-2 ring-ink/70" : ""}`}>
                <button className="block w-full text-left" onClick={() => setSelected(r.id)} aria-pressed={selected === r.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[16.5px] font-semibold tracking-tight">{r.name}</p>
                    <span className="tnum shrink-0 text-[12.5px] text-ink-3">
                      {formatDistance(km)} · {r.priceRange}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-ink-3">
                    {r.cuisine} · {r.serviceModes.map((m) => (m === "pickup" ? `pickup ~${r.pickupMinutes} min` : "in-store")).join(" · ")} · fictional demo store
                  </p>
                </button>
                <div className="mt-2">
                  <RestaurantBadge restaurant={r} size="sm" />
                </div>
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
                <p className="mt-0.5 text-[12px] text-ink-3">{LEVEL_META[r.integrationLevel].short === "Not integrated" ? "Recommend + hand-off only" : "Order pickup or in-store through MacroTable"}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "explore" }} label="Ask Agent" />
                  <Link
                    to={`/macrotable/explore/${r.id}`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface text-[14px] font-semibold text-ink-2 hover:bg-sunken"
                  >
                    <Icon name="receipt" size={16} /> View menu
                  </Link>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
