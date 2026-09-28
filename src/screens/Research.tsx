import { useReducer } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Screen } from "../components/Screen";
import { Button, Card, Eyebrow } from "../components/ui";
import { getMeal } from "../data/restaurants";
import { SCENARIO_IDS, SCENARIOS } from "../data/scenarios";
import { clearResearchData, exportResearchData, getEvents, getOrders, summarizeTrials } from "../lib/experiment";
import { clock, duration, euro } from "../lib/format";
import { changesFromDefault, describeChange } from "../lib/nutrition";
import { weightsFor } from "../lib/optimizer";
import { useAppState } from "../state/AppState";

/** Hidden researcher screen: scenario switching, trial summaries, local event log. */
export function Research() {
  const { scenarioId, setScenario, settings, setSettings, prefs } = useAppState();
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const events = getEvents();
  const trials = summarizeTrials(events, getOrders());
  const w = weightsFor(prefs);

  return (
    <Screen title="Research" back="/macrotable/profile">
      <Eyebrow className="mt-2">Scenario</Eyebrow>
      <div className="mt-2 space-y-2">
        {SCENARIO_IDS.map((id) => {
          const s = SCENARIOS[id];
          const on = id === scenarioId;
          return (
            <button
              key={id}
              onClick={() => setScenario(id)}
              aria-pressed={on}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left ${on ? "border-ink bg-surface" : "border-line bg-surface hover:bg-sunken/60"}`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold ${on ? "bg-ink text-white" : "bg-sunken text-ink-2"}`}>
                {id}
              </span>
              <span className="flex-1 text-[13.5px] leading-snug">
                <span className="block font-semibold">{s.label}</span>
                <span className="tnum block text-ink-3">{s.summary}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] text-ink-3">
        Selecting a scenario resets targets and preferences. URL shortcut: <code>?scenario=B</code> on any page.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link to="/macrotable" className="rounded-2xl border border-line bg-surface p-3.5 text-[13.5px] font-semibold shadow-card hover:bg-sunken/40">
          MacroTable
          <span className="block text-[12px] font-normal text-ink-3">Treatment · /macrotable</span>
        </Link>
        <Link to="/baseline" className="rounded-2xl border border-line bg-surface p-3.5 text-[13.5px] font-semibold shadow-card hover:bg-sunken/40">
          Baseline
          <span className="block text-[12px] font-normal text-ink-3">Conventional · /baseline</span>
        </Link>
      </div>

      <Card className="mt-4 p-4">
        <label className="flex items-center justify-between gap-3 text-[14px]">
          <span>
            <span className="block font-medium">Show nutrition in baseline</span>
            <span className="block text-[12px] text-ink-3">Menu nutrition as a conventional app might list it</span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--color-brand)]"
            checked={settings.baselineShowNutrition}
            onChange={(e) => setSettings({ baselineShowNutrition: e.target.checked })}
          />
        </label>
      </Card>

      <div className="mt-7 flex items-center justify-between">
        <Eyebrow>Trials ({trials.length})</Eyebrow>
        <button onClick={refresh} className="inline-flex min-h-9 items-center gap-1 text-[12.5px] font-medium text-ink-2">
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>
      {trials.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-ink-3">No trials yet. Start one from MacroTable or Baseline.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {trials.map((t) => {
            const f = t.order && getMeal(t.order.mealId);
            return (
              <li key={t.sessionId}>
                <Card className="p-4 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {t.mode === "macrotable" ? "MacroTable" : "Baseline"} · Scenario {t.scenario}
                    </span>
                    <span className="tnum font-semibold">{t.completedAt ? duration(t.durationMs) : "incomplete"}</span>
                  </div>
                  <p className="text-ink-3">
                    Started {clock(t.startedAt)} · {t.mealsViewed} {t.mealsViewed === 1 ? "meal" : "meals"} viewed · {t.modifierChanges}{" "}
                    {t.modifierChanges === 1 ? "modifier change" : "modifier changes"}
                  </p>
                  {t.order && f && (
                    <div className="mt-2 border-t border-line-2 pt-2">
                      <p className="font-medium">
                        {f.meal.name} <span className="font-normal text-ink-3">· {f.restaurant.name}</span>
                      </p>
                      {changesFromDefault(f.meal, t.order.selections).length > 0 && (
                        <p className="text-ink-3">{changesFromDefault(f.meal, t.order.selections).map(describeChange).join(", ")}</p>
                      )}
                      <p className="tnum mt-0.5">
                        {t.order.nutrition.calories} kcal · P {t.order.nutrition.protein} · C {t.order.nutrition.carbs} · F {t.order.nutrition.fat} ·{" "}
                        {euro(t.order.price)}
                      </p>
                      <p className={`mt-0.5 inline-flex items-center gap-1 font-medium ${t.order.meetsTarget ? "text-brand" : "text-warn"}`}>
                        <Icon name={t.order.meetsTarget ? "check" : "alert"} size={13} stroke={2.4} />
                        {t.order.meetsTarget ? "Reached target range" : "Outside target range"}
                      </p>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" icon="download" onClick={exportResearchData}>
          Export JSON
        </Button>
        <Button
          variant="secondary"
          icon="x"
          onClick={() => {
            if (window.confirm("Delete all locally stored trials, events and orders on this device?")) {
              clearResearchData();
              refresh();
            }
          }}
        >
          Clear data
        </Button>
      </div>

      <details className="mt-6 rounded-2xl border border-line bg-surface p-4 text-[13px]">
        <summary className="cursor-pointer font-semibold">Ranking heuristic (current preferences)</summary>
        <p className="mt-2 text-ink-2">
          D = {w.calories}·|kcal error| + {w.proteinShortfall}·protein shortfall + {w.carbs}·|carb error| + {w.fat}·
          {w.fatExcessOnly ? "fat excess" : "|fat error|"} (each relative to target). Configurations reaching the target range
          (kcal ±10%, protein ≥ target) rank first. Prototype heuristic — not a validated nutrition model; scores are never shown to
          participants.
        </p>
      </details>

      <details className="mt-3 mb-8 rounded-2xl border border-line bg-surface p-4 text-[12px]">
        <summary className="cursor-pointer text-[13px] font-semibold">Event log ({events.length})</summary>
        <ol className="tnum mt-2 max-h-72 space-y-1 overflow-y-auto font-mono text-ink-2">
          {[...events]
            .reverse()
            .slice(0, 80)
            .map((e, i) => (
              <li key={i}>
                {clock(e.timestamp)} {e.mode === "macrotable" ? "MT" : "BL"}/{e.scenario} {e.event}
                {e.mealId ? ` · ${e.mealId}` : ""}
              </li>
            ))}
        </ol>
      </details>
    </Screen>
  );
}
