import { useNavigate, useParams } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { Plate } from "../components/Plate";
import { approx, ProvenanceBadge } from "../components/ProvenanceBadge";
import { DeliveryTime, RealRestaurantInfo, RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Button, Eyebrow } from "../components/ui";
import { getRestaurant } from "../data/restaurants";
import { euro } from "../lib/format";
import { NotFound } from "./NotFound";

export function RestaurantPage() {
  const { restaurantId } = useParams();
  const r = getRestaurant(restaurantId);
  const navigate = useNavigate();
  const { openLevel } = useSheet();
  if (!r) return <NotFound />;
  if (r.identity === "real")
    return (
      <Screen
        title={r.name}
        back="/macrotable/explore"
        footer={
          <div className="space-y-2">
            <Button icon="camera" onClick={() => navigate(`/macrotable/scan?type=menu&restaurant=${r.id}`, { state: { userTap: true } })}>
              Scan the menu here
            </Button>
            <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "restaurant" }} label="Ask MacroAgent" />
          </div>
        }
      >
        <div className="pt-2">
          <p className="text-[13.5px] text-ink-3">{r.cuisine}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RestaurantBadge restaurant={r} />
            <DeliveryTime restaurant={r} />
          </div>
        </div>
        <div className="mt-5 mb-6 rounded-[22px] border border-line-2 bg-surface p-5 shadow-card">
          <RealRestaurantInfo restaurant={r} />
        </div>
      </Screen>
    );
  return (
    <Screen
      title={r.name}
      back="/macrotable/explore"
      footer={
        <div className="space-y-2">
          <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "restaurant" }} variant="primary" label={`Ask MacroAgent about ${r.name}`} />
          <Button variant="ghost" onClick={() => navigate(`/macrotable/preferences?scope=${r.id}`)}>
            Guided search here
          </Button>
        </div>
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
