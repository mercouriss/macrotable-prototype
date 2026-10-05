import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { NutritionComparison } from "../components/NutritionComparison";
import { Plate } from "../components/Plate";
import { approx, ProvenanceBadge } from "../components/ProvenanceBadge";
import { Screen } from "../components/Screen";
import { Button, Card, Eyebrow } from "../components/ui";
import { euro, euroShort } from "../lib/format";
import { changesFromDefault, describeChange } from "../lib/nutrition";
import { infeasibilityReasons } from "../lib/optimizer";
import { activeCount, foodPhrase, NO_FOOD_FILTER } from "../lib/discovery";
import { useAppState } from "../state/AppState";
import { useSearch } from "../state/useMealSelection";

/** Screen 10 — no supported configuration reaches the target. Never invents a modification. */
export function Failure() {
  const [params] = useSearchParams();
  const scope = params.get("scope");
  const { target, prefs, selectMeal, log, lock, discovery, setDiscovery } = useAppState();
  // Normal mode: the "What do you feel like?" choice. Never silently swapped for a different kind of food.
  const food = !lock && activeCount(discovery.food) ? discovery.food : undefined;
  const r = useSearch(scope, food);
  const navigate = useNavigate();
  const c = r.closest;
  const where = r.scope ? r.scope.name : "any restaurant nearby";
  // Which constraint failed first: the food choice itself (no such dish at all) → diet → budget → macro match.
  const kind: "food" | "diet" | "budget" | "match" =
    food && r.stats.meals === 0 ? "food" : r.stats.matchingDiet === 0 ? "diet" : r.ranked.length === 0 ? "budget" : "match";
  const want = food ? foodPhrase(food) : "";
  const cheapest = r.meals
    .map((m) => m.cheapestOverBudget)
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.price - b.price)[0];
  const dietLabel = prefs.diet === "none" ? "" : prefs.diet;
  const title = {
    food: `Nothing on the menus${r.scope ? ` at ${r.scope.name}` : ""} matches ${want}`,
    diet: `No ${dietLabel || "matching"} meals${r.scope ? ` at ${r.scope.name}` : ""}`,
    budget: `Nothing fits ${euroShort(target.maxBudget)}`,
    match: target.calories > 0 ? "No exact configuration available" : "You've reached today's calorie target",
  }[kind];
  const body = {
    food: `None of the restaurants with menu data${r.scope ? ` (${r.scope.name})` : ""} has a dish matching ${want}. MacroTable only uses their own menus, so it won't suggest a different kind of food instead.`,
    diet: `None of the available dishes${r.scope ? ` at ${r.scope.name}` : ""} match your preferences${
      prefs.diet !== "none" ? ` (${prefs.diet}${prefs.noSpicy ? ", no spicy food" : ""})` : prefs.noSpicy ? " (no spicy food)" : ""
    }. MacroTable only uses the restaurant's own dietary labels and doesn't guess.`,
    budget: cheapest
      ? `Every supported configuration${r.scope ? ` at ${r.scope.name}` : ""} costs more than ${euroShort(target.maxBudget)}. The cheapest is ${cheapest.meal.name} at ${euro(cheapest.price)}.`
      : `Nothing is available within ${euroShort(target.maxBudget)}.`,
    match:
      target.calories > 0
        ? `No supported configuration at ${where} reaches ${target.calories} kcal (±10%) with at least ${target.protein} g protein within ${euroShort(target.maxBudget)}. MacroTable won't invent modifications to get there.`
        : // After today's confirmed meals nothing is left to fit; say so instead of "reaches 0 kcal".
          `The meals you confirmed today already use your calories${target.protein > 0 ? `, with ${target.protein} g protein still to go` : ""}, so no meal fits what's left.${c ? " The closest option is shown for reference only." : ""}`,
  }[kind];
  const showAllFood = () => {
    setDiscovery({ food: NO_FOOD_FILTER });
    navigate(`/macrotable/search${scope ? `?scope=${scope}` : ""}`);
  };

  const showClosest = () => {
    if (!c) return;
    selectMeal({ mealId: c.meal.id, selections: c.selections, recommended: c.selections });
    log("closest_option_viewed", { mealId: c.meal.id });
    navigate(`/macrotable/meal/${c.meal.id}`);
  };

  return (
    <Screen
      title={r.scope?.name ?? "Recommendations"}
      back="/macrotable/preferences"
      footer={
        <div className="space-y-2">
          {c && <Button onClick={showClosest}>{food ? `Show closest ${want} option` : "Show closest option"}</Button>}
          {food && (
            <Button variant="secondary" onClick={showAllFood}>
              Show all kinds of food instead
            </Button>
          )}
          {kind !== "match" && (
            <Button icon="sliders" onClick={() => navigate(`/macrotable/preferences${scope ? `?scope=${scope}` : ""}`)}>
              {kind === "budget" ? "Adjust budget" : "Adjust preferences"}
            </Button>
          )}
          {r.scope ? (
            <Button variant="secondary" onClick={() => navigate("/macrotable/discover")}>
              Choose another restaurant
            </Button>
          ) : kind !== "match" ? null : (
            <Button variant="secondary" icon="sliders" onClick={() => navigate("/macrotable/preferences")}>
              Adjust my targets
            </Button>
          )}
        </div>
      }
    >
      <div className="pt-2">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-warn-soft text-warn" aria-hidden="true">
          <Icon name="ban" size={24} />
        </span>
        <h2 className="mt-4 font-display text-[25px] leading-tight font-semibold tracking-[-0.02em]">{title}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{body}</p>
        {food && kind !== "food" && (
          <p data-food-failure className="mt-2 text-[14px] leading-relaxed text-ink-2">
            You asked for <span className="font-semibold text-ink">{want}</span>, so only those dishes were considered.
          </p>
        )}
      </div>

      {c ? (
        <>
          <Card className="mt-6 p-5">
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>Closest supported option</Eyebrow>
              <ProvenanceBadge provenance={c.meal.provenance} restaurantName={c.restaurant.name} size="sm" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Plate palette={c.meal.palette} size={48} />
              <div className="min-w-0">
                <p className="text-[16.5px] leading-tight font-semibold">{c.meal.name}</p>
                <p className="text-[13px] text-ink-3">{c.restaurant.name}</p>
              </div>
            </div>
            {changesFromDefault(c.meal, c.selections).length > 0 && (
              <p className="mt-3 text-[13px] text-ink-2">{changesFromDefault(c.meal, c.selections).map(describeChange).join(" · ")}</p>
            )}
            <div className="tnum mt-4 flex items-baseline gap-4">
              <span className="text-[22px] font-semibold tracking-tight">
                {approx(c.meal.provenance)}
                {c.nutrition.calories} <span className="text-[13px] font-medium text-ink-3">kcal</span>
              </span>
              <span className="text-[22px] font-semibold tracking-tight">
                {approx(c.meal.provenance)}
                {c.nutrition.protein} <span className="text-[13px] font-medium text-ink-3">g protein</span>
              </span>
              <span className="ml-auto text-[17px] font-semibold">{euro(c.price)}</span>
            </div>
            <div className="mt-4 border-t border-line-2 pt-3">
              <NutritionComparison nutrition={c.nutrition} price={c.price} target={target} prefs={prefs} provenance={c.meal.provenance} valueHeading="Closest" />
            </div>
          </Card>

          <section className="mt-6 mb-6" aria-labelledby="why-fail">
            <h3 id="why-fail" className="text-[15px] font-semibold">
              Why?
            </h3>
            <ul className="mt-2 space-y-2.5">
              {infeasibilityReasons(c, target).map((t) => (
                <li key={t} className="flex gap-2 text-[14px] leading-snug text-ink-2">
                  <Icon name="lock" size={15} className="mt-[2px] shrink-0 text-ink-3" />
                  {t}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="mt-6 text-[13.5px] text-ink-3">Try relaxing a preference or choosing another restaurant.</p>
      )}
    </Screen>
  );
}
