import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { Screen } from "../components/Screen";
import { Button, Card, Eyebrow } from "../components/ui";
import { useAppState } from "../state/AppState";
import type { Diet, Priority, UserTarget } from "../types";

const PRIORITIES: { id: Priority; label: string; sub: string; icon: IconName }[] = [
  { id: "macros", label: "Hit my macros", sub: "Closest to your targets", icon: "scale" },
  { id: "price", label: "Lowest price", sub: "Cheapest meal that still fits", icon: "receipt" },
  { id: "distance", label: "Closest", sub: "Fastest delivery (simulated)", icon: "clock" },
];

const DIETS: { id: Diet; label: string }[] = [
  { id: "none", label: "No restriction" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
];

export function Preferences() {
  const { target, prefs, setTarget, setPrefs, startSession, log } = useAppState();
  const [params] = useSearchParams();
  const scope = params.get("scope");
  const navigate = useNavigate();
  const [showTargets, setShowTargets] = useState(false);

  const submit = () => {
    startSession("macrotable");
    log("preferences_set", { detail: { ...prefs, maxBudget: target.maxBudget, priority: target.priority } });
    navigate(`/macrotable/search${scope ? `?scope=${scope}` : ""}`);
  };

  return (
    <Screen
      title="Preferences"
      back="/macrotable"
      footer={
        <Button onClick={submit} className="min-h-14 text-[16px]">
          Find meals
        </Button>
      }
    >
      <h2 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em]">What matters tonight?</h2>

      <Card as="section" className="mt-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>Budget</Eyebrow>
            <p className="tnum mt-1 text-[22px] font-semibold tracking-tight">
              €{target.maxBudget} <span className="text-[14px] font-medium text-ink-3">max</span>
            </p>
          </div>
          <Stepper
            label="budget"
            value={target.maxBudget}
            onChange={(v) => setTarget({ maxBudget: v })}
            min={8}
            max={40}
            step={1}
          />
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">A hard limit — nothing above it is recommended.</p>
      </Card>

      <section className="mt-6" aria-labelledby="diet-h">
        <Eyebrow>
          <span id="diet-h">Diet</span>
        </Eyebrow>
        <div role="radiogroup" aria-labelledby="diet-h" className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-sunken p-1">
          {DIETS.map((d) => (
            <button
              key={d.id}
              role="radio"
              aria-checked={prefs.diet === d.id}
              onClick={() => setPrefs({ diet: d.id })}
              className={`min-h-11 rounded-xl text-[13.5px] font-semibold transition-colors ${
                prefs.diet === d.id ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="prio-h">
        <Eyebrow>
          <span id="prio-h">Prioritize</span>
        </Eyebrow>
        <div role="radiogroup" aria-labelledby="prio-h" className="mt-2 grid gap-2">
          {PRIORITIES.map((p) => {
            const on = target.priority === p.id;
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={on}
                onClick={() => setTarget({ priority: p.id })}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  on ? "border-ink bg-surface" : "border-line bg-surface hover:bg-sunken/60"
                }`}
              >
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-ink" : "border-line"}`} aria-hidden="true">
                  {on && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">{p.label}</span>
                  <span className="block text-[12.5px] text-ink-3">{p.sub}</span>
                </span>
                <Icon name={p.icon} size={18} className="text-ink-3" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="pref-h">
        <Eyebrow>
          <span id="pref-h">Preferences</span>
        </Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["highProtein", "High protein"],
              ["lowerFat", "Lower fat"],
              ["noSpicy", "No spicy food"],
            ] as const
          ).map(([key, label]) => {
            const on = prefs[key];
            return (
              <button
                key={key}
                role="checkbox"
                aria-checked={on}
                onClick={() => setPrefs({ [key]: !on })}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-colors ${
                  on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:bg-sunken"
                }`}
              >
                {on && <Icon name="check" size={15} stroke={2.6} />}
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 mb-6">
        <button
          onClick={() => setShowTargets((s) => !s)}
          aria-expanded={showTargets}
          className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 text-left"
        >
          <span>
            <span className="block text-[13px] font-medium text-ink-3">Remaining targets</span>
            <span className="tnum block text-[14px] font-semibold">
              {target.calories} kcal · {target.protein} g P · {target.carbs} g C · {target.fat} g F
            </span>
          </span>
          <Icon name={showTargets ? "chevronDown" : "edit"} size={17} className="text-ink-3" />
        </button>
        {showTargets && (
          <Card className="mt-2 divide-y divide-line-2 px-4">
            {(
              [
                ["calories", "Calories", "kcal", 50],
                ["protein", "Protein (minimum)", "g", 5],
                ["carbs", "Carbs", "g", 5],
                ["fat", "Fat", "g", 2],
              ] as [keyof UserTarget, string, string, number][]
            ).map(([k, label, unit, step]) => (
              <div key={k} className="flex items-center justify-between py-3">
                <span className="text-[14px] text-ink-2">{label}</span>
                <Stepper
                  label={label}
                  value={target[k] as number}
                  unit={unit}
                  step={step}
                  min={0}
                  max={3000}
                  onChange={(v) => setTarget({ [k]: v })}
                />
              </div>
            ))}
          </Card>
        )}
      </section>
    </Screen>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-sunken disabled:opacity-40"
      >
        <Icon name="minus" size={17} />
      </button>
      {unit && (
        <span className="tnum min-w-16 text-center text-[15px] font-semibold" aria-live="polite">
          {value} {unit}
        </span>
      )}
      <button
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-sunken disabled:opacity-40"
      >
        <Icon name="plus" size={17} />
      </button>
    </div>
  );
}
