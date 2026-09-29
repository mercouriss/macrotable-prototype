import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { MacroFit } from "../components/MacroFit";
import { NutritionComparison } from "../components/NutritionComparison";
import { Plate } from "../components/Plate";
import { SaveMealButton } from "../components/SaveMealButton";
import { approx, ProvenanceBadge } from "../components/ProvenanceBadge";
import { DeliveryTime, RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Button, Callout, Card, Eyebrow, ReasonLine } from "../components/ui";
import { EXCLUSION_TEXT } from "../lib/feasibility";
import { euro } from "../lib/format";
import { changesFromDefault, describeChange } from "../lib/nutrition";
import { explainConfiguration } from "../lib/optimizer";
import { useAppState } from "../state/AppState";
import { useMealSelection, useSearch } from "../state/useMealSelection";
import type { Meal, Restaurant } from "../types";
import { NotFound } from "./NotFound";

/**
 * The recommendation screen. At a glance: WHAT to order, WHY it fits (target vs meal),
 * what MacroTable CHANGED, how reliable the data is (CONFIDENCE), PRICE, and the next ACTION.
 */
export function MealDetail() {
  const { mealId } = useParams();
  const navigate = useNavigate();
  const { target, prefs, log } = useAppState();
  const { openProvenance } = useSheet();
  const { found, result, config, meets, inBudget } = useMealSelection(mealId);
  const overall = useSearch();
  const [details, setDetails] = useState(false);

  useEffect(() => {
    if (found) log("meal_viewed", { mealId: found.meal.id });
  }, [found, log]);

  if (!found) return <NotFound />;
  const { meal, restaurant } = found;
  const exclusion = result?.exclusion;

  // Hard-filtered meals: explain, never offer to order.
  if (exclusion || !config) {
    const text = exclusion ? EXCLUSION_TEXT[exclusion] : "No reliable nutrition information";
    return (
      <Screen title="Meal" back="/macrotable/explore" footer={<Button variant="secondary" onClick={() => navigate(-1)}>Choose another meal</Button>}>
        <MealHeader meal={meal} restaurant={restaurant} />
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{meal.description}</p>
        <div className="mt-5">
          {exclusion === "no-nutrition" ? (
            <Callout tone="estimated" title="Not enough information to recommend this">
              {restaurant.name} doesn't publish nutrition for this dish and there isn't enough on the menu to estimate it. MacroTable won't guess.
            </Callout>
          ) : exclusion === "unavailable" ? (
            <Callout tone="warn" title={meal.unavailableReason ?? "Unavailable"}>
              This dish can't be ordered right now, so MacroTable leaves it out of recommendations.
            </Callout>
          ) : (
            <Callout tone="warn" title={text}>
              This dish is excluded by your preferences, so MacroTable won't recommend it.
            </Callout>
          )}
        </div>
      </Screen>
    );
  }

  const handoff = restaurant.integrationLevel === 1;
  const isBest = overall.ranked[0]?.meal.id === meal.id && meets;
  const e = explainConfiguration(config, target);
  const changes = changesFromDefault(meal, config.selections);
  const ap = approx(meal.provenance);
  const verdict = handoff ? "Estimate · menu only" : isBest ? "Best feasible match" : meets ? "Fits your targets" : "Closest feasible version";

  return (
    <Screen
      title={handoff ? "Meal" : "Recommendation"}
      back="/macrotable/results"
      footer={
        handoff ? (
          <div className="space-y-2">
            <Button onClick={() => navigate("/macrotable/review")} icon="handoff" disabled={!inBudget}>
              Continue with estimate
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Choose another meal
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              disabled={!inBudget}
              onClick={() => {
                log("macrotable_version_used", { mealId: meal.id });
                navigate(`/macrotable/configure/${meal.id}`);
              }}
            >
              Configure order <Icon name="arrowRight" size={17} />
            </Button>
            <Button variant="ghost" icon="sliders" onClick={() => navigate(`/macrotable/configure/${meal.id}?edit=1`)}>
              Change it myself
            </Button>
          </div>
        )
      }
    >
      <MealHeader meal={meal} restaurant={restaurant} />

      {/* WHAT + PRICE + WHY (visual) */}
      <Card as="section" className="mt-5 p-5">
        <Eyebrow tone={meets && !handoff ? "brand" : "muted"}>{verdict}</Eyebrow>
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <p className="tnum text-[22px] leading-tight font-semibold tracking-[-0.02em]">
            {ap}
            {config.nutrition.calories} kcal <span className="text-ink-3">·</span> {ap}
            {config.nutrition.protein} g protein
          </p>
          <p className="tnum text-[22px] leading-tight font-semibold tracking-[-0.02em]">{euro(config.price)}</p>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Your target: {target.calories} kcal · ≥{target.protein} g protein · €{target.maxBudget} max
        </p>
        <div className="mt-4">
          <MacroFit nutrition={config.nutrition} target={target} prefs={prefs} provenance={meal.provenance} />
        </div>
      </Card>

      {/* CHANGE */}
      {!handoff ? (
        <section className="mt-3 rounded-[22px] bg-brand-soft/70 px-4 py-3.5" aria-labelledby="changed-h">
          <p id="changed-h" className="text-[12.5px] font-semibold text-brand">
            {changes.length ? "MacroTable changed" : "Works as listed"}
          </p>
          {changes.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {changes.map((c) => (
                <li key={c.group.id} className="rounded-full bg-surface px-2.5 py-1 text-[13px] font-medium text-ink shadow-card">
                  {describeChange(c)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-[13.5px] text-ink-2">No changes needed for your targets.</p>
          )}
          {changes.length > 0 && <p className="mt-2 text-[12px] text-ink-2">Every change is on {restaurant.name}'s supported list.</p>}
        </section>
      ) : (
        <div className="mt-3">
          <Callout tone="estimated" title="MacroTable can't change or send this order" icon="handoff">
            {restaurant.name} only has a public menu here, so nutrition is estimated and you order the dish as listed at the counter.
          </Callout>
        </div>
      )}

      {!inBudget && (
        <div className="mt-3">
          <Callout tone="warn" title="Over your budget">
            Even the cheapest supported version costs {euro(config.price)}.
          </Callout>
        </div>
      )}

      {/* WHY (words) */}
      <section className="mt-6" aria-labelledby="why-h">
        <h3 id="why-h" className="mb-2 text-[15px] font-semibold">
          {meets ? "Why this fits" : "How close it gets"}
        </h3>
        <ul className="space-y-1.5">
          {e.misses.map((t) => (
            <ReasonLine key={t} tone="warn">
              {t}
            </ReasonLine>
          ))}
          {e.meets.slice(0, 3).map((t) => (
            <ReasonLine key={t} tone="good">
              {t}
            </ReasonLine>
          ))}
        </ul>
      </section>

      {/* CONFIDENCE */}
      <section className="mt-6" aria-labelledby="conf-h">
        <h3 id="conf-h" className="mb-2 text-[15px] font-semibold">
          How reliable is this?
        </h3>
        <ProvenanceBadge provenance={meal.provenance} restaurantName={restaurant.name} showSub size="sm" />
        <p className="mt-2 text-[13px] leading-snug text-ink-2">{e.confidence.text}</p>
      </section>

      <section className="mt-5">
        <button
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
          className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 text-[14px] font-semibold"
        >
          Full comparison & trade-offs
          <Icon name="chevronDown" size={17} className={`text-ink-3 transition-transform ${details ? "rotate-180" : ""}`} />
        </button>
        {details && (
          <Card className="mt-2 animate-fade-in p-5">
            <NutritionComparison nutrition={config.nutrition} price={config.price} target={target} prefs={prefs} provenance={meal.provenance} valueHeading={handoff ? "Estimate" : "This order"} />
            {e.tradeoffs.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line-2 pt-4">
                {e.tradeoffs.map((t) => (
                  <ReasonLine key={t} tone="info">
                    {t}
                  </ReasonLine>
                ))}
              </ul>
            )}
          </Card>
        )}
      </section>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SaveMealButton mealId={meal.id} selections={config.selections} />
        <AskAgentButton context={{ kind: "meal", id: meal.id, entry: "meal" }} label="Ask MacroAgent about this" variant="link" />
        <button onClick={() => openProvenance(meal.provenance, restaurant.name)} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline">
          <Icon name="info" size={16} />
          How was this calculated?
        </button>
      </div>
    </Screen>
  );
}

function MealHeader({ meal, restaurant }: { meal: Meal; restaurant: Restaurant }) {
  return (
    <div className="flex items-start gap-4 pt-1">
      <Plate palette={meal.palette} size={72} />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[23px] leading-tight font-semibold tracking-[-0.02em]">{meal.name}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ink-2">
          <BrandMark restaurant={restaurant} size={20} />
          {restaurant.name}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RestaurantBadge restaurant={restaurant} size="sm" />
          <DeliveryTime restaurant={restaurant} />
        </div>
      </div>
    </div>
  );
}

