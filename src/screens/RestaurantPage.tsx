import { useLocation, useNavigate, useParams } from "react-router-dom";
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
import { readFromRecommendation, type FromRecommendation } from "../lib/menuNav";
import { changesFromDefault, computeConfiguration, describeChange } from "../lib/nutrition";
import { useAppState } from "../state/AppState";
import { useSearch } from "../state/useMealSelection";
import type { Meal, Restaurant } from "../types";
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
  const location = useLocation();
  const { openLevel } = useSheet();
  const { target, prefs, selectMeal, log, lock } = useAppState();
  const best = useSearch(r.id).ranked[0];
  // Normal mode: the full-menu layout, and the recommendation this page was opened from.
  // Research trials keep the frozen treatment layout below unchanged.
  const extended = !lock;
  const fromRec = extended ? readFromRecommendation(location.state, r.id) : null;
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

      {fromRec ? (
        <RecommendedForYou r={r} fromRec={fromRec} />
      ) : best && (
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

      <Eyebrow className="mt-6">{extended ? `Full menu · ${r.meals.length} dishes` : "Menu"}</Eyebrow>
      {extended && <p className="mt-0.5 text-[12px] text-ink-3">Nutrition and prices as listed, before any changes.</p>}
      <ul className="mt-2 mb-6 divide-y divide-line-2 overflow-hidden rounded-[22px] border border-line-2 bg-surface shadow-card">
        {r.meals.map((m) => extended ? (
          <FullMenuRow key={m.id} m={m} r={r} recommended={fromRec?.mealId === m.id} onOpen={() => navigate(`/macrotable/meal/${m.id}`)} />
        ) : (
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

const DIETARY_LABEL: Record<string, string> = { vegetarian: "Vegetarian", vegan: "Vegan", pescatarian: "Pescatarian", "high-protein": "High protein", spicy: "Spicy" };

/** True when the restaurant supports at least one change to this dish (beyond its defaults). */
const hasSupportedChanges = (m: Meal) => m.modifierGroups.some((g) => g.options.some((o) => o.supported && o.id !== g.defaultOptionId));

/**
 * The exact configuration this menu was opened from (not recomputed): deterministic totals for the
 * selections that were recommended, so the user can compare it against the rest of the menu.
 */
function RecommendedForYou({ r, fromRec }: { r: Restaurant; fromRec: FromRecommendation }) {
  const navigate = useNavigate();
  const { target, prefs, selectMeal, log } = useAppState();
  const meal = r.meals.find((m) => m.id === fromRec.mealId)!;
  const { nutrition, price } = computeConfiguration(meal, fromRec.selections);
  const changes = changesFromDefault(meal, fromRec.selections);
  const ap = approx(meal.provenance);
  const backToIt = fromRec.from === "meal";
  return (
    <section className="mt-5" aria-labelledby="rec-h" data-section="recommended-for-you">
      <Eyebrow tone="brand">
        <span id="rec-h">Recommended for you</span>
      </Eyebrow>
      <button
        onClick={() => {
          // Opened from the recommendation screen: go back to it (same entry, same configuration).
          if (backToIt) return navigate(-1);
          selectMeal({ mealId: meal.id, selections: fromRec.selections, recommended: fromRec.selections });
          log("recommendation_selected", { mealId: meal.id, detail: { rank: 1, entry: "restaurant-menu" } });
          navigate(`/macrotable/meal/${meal.id}`);
        }}
        className="mt-2 block w-full rounded-[22px] border border-brand/35 bg-surface p-4 text-left shadow-card ring-1 ring-brand/15 hover:bg-sunken/40"
      >
        <span className="flex items-center gap-3">
          <Plate palette={meal.palette} size={52} />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold tracking-tight">{meal.name}</span>
            <span className="tnum block text-[13px] text-ink-2">
              {ap}
              {nutrition.calories} kcal · {ap}
              {nutrition.protein} g protein · {ap}
              {nutrition.carbs} g carbs · {ap}
              {nutrition.fat} g fat
            </span>
          </span>
          <span className="tnum shrink-0 text-[16px] font-semibold">{euro(price)}</span>
        </span>
        <span className="mt-3 block">
          <MacroFit nutrition={nutrition} target={target} prefs={prefs} provenance={meal.provenance} compact />
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-1.5">
          <ProvenanceBadge provenance={meal.provenance} restaurantName={r.name} size="sm" />
          {changes.map((c) => (
            <span key={c.group.id} className="rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand">
              {describeChange(c)}
            </span>
          ))}
        </span>
        <span className="mt-3 flex items-center gap-1 text-[13px] font-semibold text-brand">
          {backToIt ? "Back to this recommendation" : "View this recommendation"} <Icon name="chevronRight" size={15} />
        </span>
      </button>
    </section>
  );
}

/** One menu dish: the same structure for every row; only data that exists is shown. */
function FullMenuRow({ m, r, recommended, onOpen }: { m: Meal; r: Restaurant; recommended: boolean; onOpen: () => void }) {
  const ap = approx(m.provenance);
  const n = m.nutrition;
  return (
    <li className="relative" data-menu-item={m.id}>
      {/* Stretched row button; badges sit above it so buttons are never nested. */}
      <button onClick={onOpen} aria-label={`${m.name}, ${euro(m.price)}`} className="absolute inset-0 hover:bg-sunken/50" />
      <div className={`pointer-events-none relative flex w-full items-start gap-3.5 px-4 py-3.5 text-left ${m.available ? "" : "opacity-60"}`}>
        <Plate palette={m.palette} size={44} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] leading-snug font-semibold">{m.name}</span>
            <span className="tnum shrink-0 text-[14px] font-semibold">{euro(m.price)}</span>
          </span>
          <span className="tnum mt-0.5 block text-[12.5px] text-ink-2">
            {!m.available
              ? (m.unavailableReason ?? "Unavailable")
              : n
                ? `${ap}${n.calories} kcal · ${ap}${n.protein} g protein · ${ap}${n.carbs} g carbs · ${ap}${n.fat} g fat`
                : "Nutrition unavailable"}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
            {recommended && <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand">Recommended above</span>}
            {n && m.available && (
              <span className="pointer-events-auto">
                <ProvenanceBadge provenance={m.provenance} restaurantName={r.name} size="sm" />
              </span>
            )}
            {m.dietaryTags.map((t) => (
              <span key={t} className="rounded-full bg-sunken px-2 py-0.5">
                {DIETARY_LABEL[t] ?? t}
              </span>
            ))}
            {r.integrationLevel >= 2 && hasSupportedChanges(m) && (
              <span className="inline-flex items-center gap-1">
                <Icon name="sliders" size={12} /> Changes supported
              </span>
            )}
          </span>
        </span>
      </div>
    </li>
  );
}
