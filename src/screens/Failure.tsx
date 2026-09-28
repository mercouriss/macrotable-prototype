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
import { useAppState } from "../state/AppState";
import { useSearch } from "../state/useMealSelection";

/** Screen 10 — no supported configuration reaches the target. Never invents a modification. */
export function Failure() {
  const [params] = useSearchParams();
  const scope = params.get("scope");
  const r = useSearch(scope);
  const { target, prefs, selectMeal, log } = useAppState();
  const navigate = useNavigate();
  const c = r.closest;
  const where = r.scope ? r.scope.name : "any restaurant nearby";

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
          {c && <Button onClick={showClosest}>Show closest option</Button>}
          {r.scope ? (
            <Button variant="secondary" onClick={() => navigate("/macrotable/discover")}>
              Choose another restaurant
            </Button>
          ) : (
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
        <h2 className="mt-4 font-display text-[25px] leading-tight font-semibold tracking-[-0.02em]">No exact configuration available</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
          No supported configuration at {where} reaches {target.calories} kcal (±10%) with at least {target.protein} g protein
          within {euroShort(target.maxBudget)}. MacroTable won't invent modifications to get there.
        </p>
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
        <Card className="mt-6 p-5 text-[14px] text-ink-2">
          Nothing on the menu is available within your budget and preferences. Try raising your budget or relaxing a preference.
        </Card>
      )}
    </Screen>
  );
}
