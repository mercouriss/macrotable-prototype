import { useNavigate, useParams } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { MacroFit } from "../components/MacroFit";
import { Plate } from "../components/Plate";
import { approx, ProvenanceBadge } from "../components/ProvenanceBadge";
import { DeliveryTime, LEVEL_META, RealRestaurantInfo, RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Button, Card, Eyebrow } from "../components/ui";
import { getScopedRestaurant } from "../data/restaurants";
import { euro } from "../lib/format";
import { useAppState } from "../state/AppState";
import { useSearch } from "../state/useMealSelection";
import type { Restaurant } from "../types";
import { NotFound } from "./NotFound";

export function RestaurantPage() {
  const { restaurantId } = useParams();
  const r = getScopedRestaurant(restaurantId);
  if (!r) return <NotFound />;
  return r.identity === "real" ? <RealRestaurantPage r={r} /> : <DemoRestaurantPage r={r} />;
}

function Header({ r }: { r: Restaurant }) {
  return (
    <div className="flex items-center gap-4 pt-2">
      <BrandMark restaurant={r} size={56} />
      <div className="min-w-0">
        <p className="text-[13.5px] text-ink-3">
          {r.cuisine}
          {r.priceRange ? ` · ${r.priceRange}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <RestaurantBadge restaurant={r} />
          <DeliveryTime restaurant={r} />
        </div>
      </div>
    </div>
  );
}

function RealRestaurantPage({ r }: { r: Restaurant }) {
  const navigate = useNavigate();
  const known: [boolean, string][] = [
    [true, `Name and address · verified ${r.real!.verifiedOn}`],
    [false, "Menu and prices"],
    [false, "Nutrition"],
    [false, "Ordering through MacroTable"],
  ];
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
      <Header r={r} />
      <Card as="section" className="mt-5 p-5">
        <Eyebrow>What MacroTable knows</Eyebrow>
        <ul className="mt-3 space-y-2">
          {known.map(([yes, text]) => (
            <li key={text} className="flex items-center gap-2.5 text-[14px]">
              <Icon name={yes ? "check" : "minus"} size={16} stroke={2.4} className={yes ? "text-brand" : "text-ink-3"} />
              <span className={yes ? "text-ink" : "text-ink-3"}>
                {text}
                {!yes && <span className="sr-only"> — not available</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13.5px] leading-snug text-ink-2">
          Photograph the menu and MacroAgent reads it. Numbers printed on the menu are labelled MENU-READ; anything inferred is ESTIMATED.
        </p>
      </Card>
      <div className="mt-3 mb-6 rounded-[22px] border border-line-2 bg-surface p-5 shadow-card">
        <RealRestaurantInfo restaurant={r} />
      </div>
    </Screen>
  );
}

function DemoRestaurantPage({ r }: { r: Restaurant }) {
  const navigate = useNavigate();
  const { openLevel } = useSheet();
  const { target, prefs, selectMeal, log } = useAppState();
  const best = useSearch(r.id).ranked[0];
  return (
    <Screen
      title={r.name}
      back="/macrotable/explore"
      footer={
        <div className="space-y-2">
          <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "restaurant" }} variant="primary" label={`Ask MacroAgent about ${r.name}`} />
        </div>
      }
    >
      <Header r={r} />
      <button onClick={() => openLevel(r.integrationLevel, r.name)} className="mt-3 min-h-9 text-left text-[13.5px] leading-snug text-ink-2">
        {LEVEL_META[r.integrationLevel].can.join(" · ")}. <span className="font-semibold text-brand">What this means</span>
      </button>

      {best && (
        <section className="mt-5" aria-labelledby="best-h">
          <Eyebrow tone={best.meets ? "brand" : "muted"}>
            <span id="best-h">{best.meets ? "Best for you here" : "Closest for you here"}</span>
          </Eyebrow>
          <button
            onClick={() => {
              selectMeal({ mealId: best.meal.id, selections: best.selections, recommended: best.selections });
              log("recommendation_selected", { mealId: best.meal.id, detail: { rank: 1, entry: "restaurant" } });
              navigate(`/macrotable/meal/${best.meal.id}`);
            }}
            className="mt-2 block w-full rounded-[22px] border border-brand/25 bg-surface p-4 text-left shadow-card hover:bg-sunken/40"
          >
            <span className="flex items-center gap-3">
              <Plate palette={best.meal.palette} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold tracking-tight">{best.meal.name}</span>
                <span className="tnum block text-[13px] text-ink-2">
                  {approx(best.meal.provenance)}
                  {best.nutrition.calories} kcal · {approx(best.meal.provenance)}
                  {best.nutrition.protein} g protein · {euro(best.price)}
                </span>
              </span>
              <Icon name="chevronRight" size={18} className="text-ink-3" />
            </span>
            <span className="mt-3 block">
              <MacroFit nutrition={best.nutrition} target={target} prefs={prefs} provenance={best.meal.provenance} compact />
            </span>
          </button>
        </section>
      )}

      <Eyebrow className="mt-6">Menu</Eyebrow>
      <ul className="mt-2 mb-6 divide-y divide-line-2 overflow-hidden rounded-[22px] border border-line-2 bg-surface shadow-card">
        {r.meals.map((m) => (
          <li key={m.id} className="relative">
            {/* Stretched row button; the provenance badge sits above it so buttons are never nested. */}
            <button onClick={() => navigate(`/macrotable/meal/${m.id}`)} aria-label={`${m.name}, ${euro(m.price)}`} className="absolute inset-0 hover:bg-sunken/50" />
            <div className={`pointer-events-none relative flex w-full items-center gap-3.5 px-4 py-3.5 text-left ${m.available ? "" : "opacity-60"}`}>
              <Plate palette={m.palette} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{m.name}</span>
                <span className="tnum mt-0.5 block text-[12.5px] text-ink-3">
                  {!m.available
                    ? (m.unavailableReason ?? "Unavailable")
                    : m.nutrition
                      ? `${approx(m.provenance)}${m.nutrition.calories} kcal · ${approx(m.provenance)}${m.nutrition.protein} g protein · as listed`
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
