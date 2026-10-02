import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { TargetStrip } from "../components/MacroSummary";
import { MealCard } from "../components/MealCard";
import { approx } from "../components/ProvenanceBadge";
import { Screen } from "../components/Screen";
import { EXCLUSION_TEXT } from "../lib/feasibility";
import { euro } from "../lib/format";
import type { ScoredConfiguration } from "../lib/optimizer";
import { menuState, restaurantMenuPath } from "../lib/menuNav";
import { useAppState } from "../state/AppState";
import { useRememberScroll } from "../state/useRememberScroll";
import { useSearch } from "../state/useMealSelection";

export function Results() {
  const [params] = useSearchParams();
  const scope = params.get("scope");
  const r = useSearch(scope);
  const { target, selectMeal, log, lock } = useAppState();
  const scroll = useRememberScroll();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const open = (c: ScoredConfiguration, rank: number) => {
    selectMeal({ mealId: c.meal.id, selections: c.selections, recommended: c.selections });
    log("recommendation_selected", { mealId: c.meal.id, detail: { rank } });
    navigate(`/macrotable/meal/${c.meal.id}`);
  };

  const excluded = r.meals.filter((m) => m.exclusion);
  const overBudget = r.meals.filter((m) => !m.exclusion && !m.best);
  const byPriority = { macros: "fit to your targets", price: "price (among meals that fit)", distance: "distance (among meals that fit)" }[
    target.priority
  ];

  return (
    <Screen
      title={r.scope ? r.scope.name : "Recommendations"}
      back="/macrotable/preferences"
      right={
        <button
          onClick={() => navigate(`/macrotable/preferences${scope ? `?scope=${scope}` : ""}`)}
          aria-label="Edit preferences"
          className="grid h-11 w-11 place-items-center rounded-full text-ink-2 hover:bg-sunken"
        >
          <Icon name="sliders" size={20} />
        </button>
      }
    >
      <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.02em]">Your best options</h2>
      <p className="mt-1 text-[14px] text-ink-3">
        {r.ranked.length} feasible meals compared · ranked by {byPriority}
      </p>
      <div className="mt-4">
        <TargetStrip target={target} />
      </div>

      <div ref={scroll.ref} className="mt-5 space-y-4">
        {r.recommendations.map((c, i) => (
          <MealCard
            key={c.meal.id}
            config={c}
            target={target}
            meets={c.meets}
            label={i === 0 && c.meets ? "BEST MATCH" : `OPTION ${i + 1}`}
            highlight={i === 0 && c.meets}
            onSelect={() => open(c, i + 1)}
            menu={!lock ? { to: restaurantMenuPath(c.restaurant.id), state: menuState("results", c.meal.id, c.selections), onClick: scroll.remember } : undefined}
          />
        ))}
      </div>

      {!r.scope && (
        <p className="mt-4 px-1 text-[12.5px] leading-snug text-ink-3">
          Showing the best option from each restaurant. Ranking reflects fit to your targets — not how deeply a restaurant is
          integrated.
        </p>
      )}

      <section className="mt-6 mb-8">
        <button
          onClick={() => setShowAll((s) => !s)}
          aria-expanded={showAll}
          className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 text-[14px] font-semibold"
        >
          All {r.ranked.length} ranked meals
          {(excluded.length > 0 || overBudget.length > 0) && (
            <span className="ml-2 text-[12.5px] font-normal text-ink-3">+ {excluded.length + overBudget.length} filtered out</span>
          )}
          <Icon name="chevronDown" size={17} className={`ml-auto text-ink-3 transition-transform ${showAll ? "rotate-180" : ""}`} />
        </button>
        {showAll && (
          <div className="mt-2 animate-fade-in overflow-hidden rounded-2xl border border-line-2 bg-surface">
            <ol className="divide-y divide-line-2">
              {r.ranked.map((c, i) => (
                <li key={c.meal.id}>
                  <button onClick={() => open(c, i + 1)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken/60">
                    <span className="tnum w-5 text-[13px] font-semibold text-ink-3">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">{c.meal.name}</span>
                      <span className="tnum block text-[12.5px] text-ink-3">
                        {c.restaurant.name} · {approx(c.meal.provenance)}
                        {c.nutrition.calories} kcal · {c.nutrition.protein} g protein · {euro(c.price)}
                      </span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[12px] font-medium ${c.meets ? "text-brand" : "text-ink-3"}`}
                    >
                      <Icon name={c.meets ? "check" : "minus"} size={13} stroke={2.4} />
                      {c.meets ? "Fits" : "Close"}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {(excluded.length > 0 || overBudget.length > 0) && (
              <div className="border-t border-line-2 bg-sunken/60 px-4 py-3">
                <p className="mb-1.5 text-[12px] font-semibold text-ink-2">Filtered out</p>
                <ul className="space-y-1 text-[12.5px] text-ink-3">
                  {excluded.map((m) => (
                    <li key={m.meal.id}>
                      <span className="font-medium text-ink-2">{m.meal.name}</span> — {EXCLUSION_TEXT[m.exclusion!]}
                    </li>
                  ))}
                  {overBudget.map((m) => (
                    <li key={m.meal.id}>
                      <span className="font-medium text-ink-2">{m.meal.name}</span> — Over your €{target.maxBudget} budget in every
                      supported configuration
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </Screen>
  );
}
