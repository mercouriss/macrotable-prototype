import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { NutritionComparison } from "../components/NutritionComparison";
import { Plate } from "../components/Plate";
import { ProvenanceBadge } from "../components/ProvenanceBadge";
import { DeliveryTime, RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Button, Callout, Card, Eyebrow, ReasonLine } from "../components/ui";
import { EXCLUSION_TEXT } from "../lib/feasibility";
import { euro } from "../lib/format";
import { changesFromDefault, describeChange } from "../lib/nutrition";
import { fitReasons } from "../lib/optimizer";
import { useAppState } from "../state/AppState";
import { useMealSelection } from "../state/useMealSelection";
import { NotFound } from "./NotFound";

/** Screen 5 — "Why this meal": target vs this order, reasons, and provenance. */
export function MealDetail() {
  const { mealId } = useParams();
  const navigate = useNavigate();
  const { target, prefs, log } = useAppState();
  const { openProvenance } = useSheet();
  const { found, result, config, meets, inBudget } = useMealSelection(mealId);
  const [showEstimate, setShowEstimate] = useState(false);

  useEffect(() => {
    if (found) log("meal_viewed", { mealId: found.meal.id });
  }, [found, log]);

  if (!found) return <NotFound />;
  const { meal, restaurant } = found;
  const level = restaurant.integrationLevel;
  const exclusion = result?.exclusion;

  const header = (
    <div className="flex items-start gap-4 pt-1">
      <Plate palette={meal.palette} size={76} />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[23px] leading-tight font-semibold tracking-[-0.02em]">{meal.name}</h2>
        <p className="mt-1 text-[14px] text-ink-2">{restaurant.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RestaurantBadge restaurant={restaurant} size="sm" />
          <DeliveryTime restaurant={restaurant} />
        </div>
      </div>
    </div>
  );

  // Hard-filtered meals: explain, never offer to order.
  if (exclusion || !config) {
    const text = exclusion ? EXCLUSION_TEXT[exclusion] : "No reliable nutrition information";
    return (
      <Screen title="Meal" back="/macrotable/discover" footer={<Button variant="secondary" onClick={() => navigate(-1)}>Choose another meal</Button>}>
        {header}
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{meal.description}</p>
        <div className="mt-5">
          {exclusion === "no-nutrition" ? (
            <Callout tone="estimated" title="We don't have enough reliable nutrition information to optimize this meal.">
              {restaurant.name} doesn't publish nutrition for this dish, and there isn't enough menu information to estimate it.
              MacroTable won't guess.
            </Callout>
          ) : exclusion === "unavailable" ? (
            <Callout tone="warn" title={meal.unavailableReason ?? "Unavailable"}>
              This item can't be ordered right now, so MacroTable leaves it out of recommendations.
            </Callout>
          ) : (
            <Callout tone="warn" title={text}>
              This meal is excluded by your preferences, so MacroTable won't recommend it.
            </Callout>
          )}
        </div>
      </Screen>
    );
  }

  const changes = changesFromDefault(meal, config.selections);
  const reasons = fitReasons(config, target, { includeData: true });

  // Level 1: recommend + estimate + hand off. No optimisation or configuration.
  if (level === 1) {
    return (
      <Screen
        title="Meal"
        back="/macrotable/results"
        footer={
          <div className="space-y-2">
            <Button onClick={() => navigate("/macrotable/review")} icon="handoff">
              Continue with estimate
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Choose another meal
            </Button>
          </div>
        }
      >
        {header}
        <div className="mt-5">
          <Callout tone="estimated" title="We don't have enough reliable nutrition information to optimize this meal.">
            {restaurant.name} isn't integrated with MacroTable. We can estimate from its public menu and hand you off, but we can't
            change the dish or send an order to the kitchen.
          </Callout>
        </div>
        {!showEstimate ? (
          <Button variant="secondary" className="mt-3" onClick={() => setShowEstimate(true)}>
            View estimate
          </Button>
        ) : (
          <Card className="mt-3 animate-fade-in p-5">
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>Estimate vs target</Eyebrow>
              <ProvenanceBadge provenance={meal.provenance} restaurantName={restaurant.name} size="sm" />
            </div>
            <NutritionComparison nutrition={config.nutrition} price={config.price} target={target} prefs={prefs} provenance={meal.provenance} valueHeading="Estimate" />
            <p className="mt-3 text-[12.5px] text-ink-3">Estimate based on available menu information. Actual nutrition may differ.</p>
          </Card>
        )}
        <ul className="mt-5 mb-6 space-y-2">
          {reasons.map((r) => (
            <ReasonLine key={r.text} tone={r.tone}>
              {r.text}
            </ReasonLine>
          ))}
        </ul>
      </Screen>
    );
  }

  return (
    <Screen
      title="Why this meal"
      back="/macrotable/results"
      footer={
        <div className="space-y-2">
          <Button
            onClick={() => {
              log("macrotable_version_used", { mealId: meal.id });
              navigate(`/macrotable/configure/${meal.id}`);
            }}
          >
            Use MacroTable's version
          </Button>
          <Button variant="secondary" icon="sliders" onClick={() => navigate(`/macrotable/configure/${meal.id}?edit=1`)}>
            Customize
          </Button>
        </div>
      }
    >
      {header}

      <Card className="mt-5 p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Eyebrow>{meets ? "Fits your target" : "Closest supported version"}</Eyebrow>
          <ProvenanceBadge provenance={meal.provenance} restaurantName={restaurant.name} size="sm" />
        </div>
        <NutritionComparison nutrition={config.nutrition} price={config.price} target={target} prefs={prefs} provenance={meal.provenance} />
      </Card>

      {changes.length > 0 && (
        <div className="mt-3 rounded-2xl bg-brand-soft/70 px-4 py-3">
          <p className="text-[12.5px] font-semibold text-brand">MacroTable's version · {changes.length} supported changes</p>
          <p className="mt-0.5 text-[14px] text-ink">{changes.map(describeChange).join(" · ")}</p>
        </div>
      )}

      {!inBudget && (
        <div className="mt-3">
          <Callout tone="warn" title="Over your budget">
            Even the cheapest supported version costs {euro(config.price)}.
          </Callout>
        </div>
      )}

      <section className="mt-6" aria-labelledby="why-h">
        <h3 id="why-h" className="text-[15px] font-semibold">
          Why MacroTable chose this
        </h3>
        <ul className="mt-2.5 space-y-2">
          {reasons.map((r) => (
            <ReasonLine key={r.text} tone={r.tone}>
              {r.text}
            </ReasonLine>
          ))}
        </ul>
      </section>

      <button
        onClick={() => openProvenance(meal.provenance, restaurant.name)}
        className="mt-5 mb-6 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline"
      >
        <Icon name="info" size={16} />
        How was this calculated?
      </button>
    </Screen>
  );
}
