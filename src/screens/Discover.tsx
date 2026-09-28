import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Plate } from "../components/Plate";
import { approx, ProvenanceBadge } from "../components/ProvenanceBadge";
import { DeliveryTime, LEVEL_META, RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Button, Card, Eyebrow } from "../components/ui";
import { getRestaurant, RESTAURANTS } from "../data/restaurants";
import { euro } from "../lib/format";
import { useAppState } from "../state/AppState";
import { NotFound } from "./NotFound";

export function Discover() {
  return (
    <Screen nav>
      <h1 className="pt-6 font-display text-[27px] font-semibold tracking-[-0.02em]">Discover</h1>
      <p className="mt-1 text-[14px] text-ink-3">Restaurants near you (simulated).</p>
      <ul className="mt-5 mb-6 space-y-3">
        {RESTAURANTS.map((r) => (
          <li key={r.id}>
            <Link to={`/macrotable/discover/${r.id}`} className="block">
              <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-sunken/40">
                <div className="flex -space-x-5">
                  {r.meals.slice(0, 2).map((m) => (
                    <Plate key={m.id} palette={m.palette} size={48} />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[16.5px] font-semibold tracking-tight">{r.name}</p>
                  <p className="text-[13px] text-ink-3">
                    {r.cuisine} · {r.meals.length} dishes
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2">{LEVEL_META[r.integrationLevel].short}</span>
                    <DeliveryTime restaurant={r} />
                  </div>
                </div>
                <Icon name="chevronRight" size={18} className="text-ink-3" />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

export function RestaurantPage() {
  const { restaurantId } = useParams();
  const r = getRestaurant(restaurantId);
  const navigate = useNavigate();
  const { startSession } = useAppState();
  const { openLevel } = useSheet();
  if (!r) return <NotFound />;
  return (
    <Screen
      title={r.name}
      back="/macrotable/discover"
      footer={
        <Button
          onClick={() => {
            startSession("macrotable");
            navigate(`/macrotable/preferences?scope=${r.id}`);
          }}
        >
          Find what fits my macros here
        </Button>
      }
    >
      <div className="pt-2">
        <p className="text-[13.5px] text-ink-3">{r.cuisine}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RestaurantBadge restaurant={r} />
          <DeliveryTime restaurant={r} />
        </div>
        <button onClick={() => openLevel(r.integrationLevel, r.name)} className="mt-3 text-left text-[13.5px] leading-snug text-ink-2">
          {r.tagline}. <span className="font-semibold text-brand">What this means</span>
        </button>
      </div>
      <Eyebrow className="mt-6">Menu</Eyebrow>
      <ul className="mt-2 mb-6 divide-y divide-line-2 overflow-hidden rounded-[22px] border border-line-2 bg-surface shadow-card">
        {r.meals.map((m) => (
          <li key={m.id} className="relative">
            {/* Stretched row button; the provenance badge sits above it so buttons are never nested. */}
            <button
              onClick={() => navigate(`/macrotable/meal/${m.id}`)}
              aria-label={`${m.name}, ${euro(m.price)}`}
              className="absolute inset-0 hover:bg-sunken/50"
            />
            <div className={`pointer-events-none relative flex w-full items-center gap-3.5 px-4 py-3.5 text-left ${m.available ? "" : "opacity-60"}`}>
              <Plate palette={m.palette} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{m.name}</span>
                <span className="tnum mt-0.5 block text-[12.5px] text-ink-3">
                  {!m.available
                    ? (m.unavailableReason ?? "Unavailable")
                    : m.nutrition
                      ? `${approx(m.provenance)}${m.nutrition.calories} kcal · ${approx(m.provenance)}${m.nutrition.protein} g protein`
                      : "Nutrition unavailable"}
                </span>
                {m.nutrition && m.available && (
                  <span className="pointer-events-auto mt-1.5 inline-block">
                    <ProvenanceBadge provenance={m.provenance} restaurantName={r.name} size="sm" />
                  </span>
                )}
              </span>
              <span className="tnum text-[14px] font-semibold" aria-hidden="true">
                {euro(m.price)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
