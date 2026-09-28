import { useEffect, useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { Screen } from "../components/Screen";
import { Button, Card, Eyebrow } from "../components/ui";
import { SCENARIOS } from "../data/scenarios";
import { targetDrafts, TARGET_FIELDS, validateTargetField, type TargetKey } from "../lib/validation";
import { useAppState } from "../state/AppState";
import type { Diet, Priority } from "../types";

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
  const { target, prefs, setTarget, setPrefs, resetTargets, scenarioId, lock, log } = useAppState();
  const [params] = useSearchParams();
  const scope = params.get("scope");
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState(() => targetDrafts(target));

  // Keep drafts in sync when targets change elsewhere (scenario switch, reset).
  useEffect(() => setDrafts(targetDrafts(target)), [target]);

  const errors = Object.fromEntries(
    (Object.keys(drafts) as TargetKey[]).map((k) => {
      const r = validateTargetField(k, drafts[k]);
      return [k, "error" in r ? r.error : undefined];
    }),
  ) as Record<TargetKey, string | undefined>;
  const invalid = Object.values(errors).some(Boolean);

  const edit = (k: TargetKey, raw: string) => {
    setDrafts((d) => ({ ...d, [k]: raw }));
    const r = validateTargetField(k, raw);
    if ("value" in r) setTarget({ [k]: r.value });
  };

  const submit = () => {
    if (invalid) return;
    log("preferences_set", { detail: { ...prefs, ...target, dietaryRestrictions: undefined } });
    navigate(`/macrotable/search${scope ? `?scope=${scope}` : ""}`);
  };

  const canon = SCENARIOS[scenarioId];
  const isCanonical =
    JSON.stringify({ ...target, dietaryRestrictions: [] }) === JSON.stringify({ ...canon.target, dietaryRestrictions: [] }) &&
    JSON.stringify(prefs) === JSON.stringify(canon.preferences);

  return (
    <Screen
      title="Preferences"
      back="/macrotable"
      footer={
        <div className="space-y-1.5">
          {invalid && (
            <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-warn">
              <Icon name="alert" size={15} /> Fix the highlighted values to continue.
            </p>
          )}
          <Button onClick={submit} disabled={invalid} className="min-h-14 text-[16px]">
            Find meals
          </Button>
        </div>
      }
    >
      <h2 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em]">What matters tonight?</h2>

      <Card as="section" className="mt-5 p-5">
        <div className="flex items-end justify-between gap-3">
          <TargetField k="maxBudget" value={drafts.maxBudget} error={errors.maxBudget} onChange={edit} large />
          <div className="flex shrink-0 gap-1 pb-0.5">
            {[-1, 1].map((d) => (
              <button
                key={d}
                type="button"
                aria-label={d < 0 ? "Decrease budget by €1" : "Increase budget by €1"}
                onClick={() => {
                  const cur = Number(drafts.maxBudget.replace(",", ".")) || target.maxBudget;
                  const next = Math.min(TARGET_FIELDS.maxBudget.max, Math.max(TARGET_FIELDS.maxBudget.min, Math.round(cur + d)));
                  edit("maxBudget", String(next));
                }}
                className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-sunken"
              >
                <Icon name={d < 0 ? "minus" : "plus"} size={17} />
              </button>
            ))}
          </div>
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
              type="button"
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
                type="button"
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
                type="button"
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

      <Card as="section" className="mt-6 mb-6 p-5">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow>Remaining today</Eyebrow>
          <button
            type="button"
            onClick={resetTargets}
            disabled={isCanonical}
            className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-[12.5px] font-semibold text-brand hover:bg-brand-soft disabled:text-ink-3 disabled:hover:bg-transparent"
          >
            <Icon name="refresh" size={14} /> Reset {lock ? "to task" : "demo"} values
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
          {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
            <TargetField key={k} k={k} value={drafts[k]} error={errors[k]} onChange={edit} />
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-snug text-ink-3">
          A meal fits when calories are within ±10% and protein is at least your target. Carbs and fat guide the ranking.
        </p>
      </Card>
    </Screen>
  );
}

function TargetField({
  k,
  value,
  error,
  onChange,
  large = false,
}: {
  k: TargetKey;
  value: string;
  error?: string;
  onChange: (k: TargetKey, raw: string) => void;
  large?: boolean;
}) {
  const id = useId();
  const f = TARGET_FIELDS[k];
  const isEuro = f.unit === "€";
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-[12.5px] font-medium text-ink-3">
        {f.label}
      </label>
      <div
        className={`mt-1 flex items-center rounded-xl border bg-surface px-3 focus-within:border-ink ${
          error ? "border-warn" : "border-line"
        } ${large ? "h-12" : "h-11"}`}
      >
        {isEuro && <span className={`mr-0.5 font-semibold text-ink-2 ${large ? "text-[20px]" : "text-[15px]"}`}>€</span>}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(k, e.target.value)}
          inputMode={f.decimals ? "decimal" : "numeric"}
          enterKeyHint="done"
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`tnum w-full min-w-0 bg-transparent font-semibold outline-none ${large ? "text-[20px]" : "text-[16px]"}`}
        />
        {!isEuro && <span className="ml-1 text-[13px] text-ink-3">{f.unit}</span>}
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-[12px] font-medium text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
