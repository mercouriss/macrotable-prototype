import type { Nutrition, Preferences, Provenance, UserTarget } from "../types";
import { Icon } from "./Icon";
import { buildComparisonRows } from "./NutritionComparison";
import { approx } from "./ProvenanceBadge";

const ROWS = [
  { key: "calories", label: "Calories", unit: "kcal", color: "var(--color-ink-2)" },
  { key: "protein", label: "Protein", unit: "g", color: "var(--color-protein)" },
  { key: "carbs", label: "Carbs", unit: "g", color: "var(--color-carbs)" },
  { key: "fat", label: "Fat", unit: "g", color: "var(--color-fat)" },
] as const;

/**
 * Target vs meal, one restrained bar per macro. The tick is your remaining target
 * (for protein: the minimum); calories also show the ±10 % range MacroTable aims for.
 * Status is always icon + text, never colour alone. Decision context, not a dashboard.
 */
export function MacroFit({
  nutrition,
  target,
  provenance,
  prefs,
  compact = false,
}: {
  nutrition: Nutrition;
  target: UserTarget;
  provenance: Provenance;
  prefs?: Preferences;
  /** Calories + protein only (cards). */
  compact?: boolean;
}) {
  const status = buildComparisonRows(nutrition, 0, target, prefs);
  const ap = approx(provenance);
  const rows = compact ? ROWS.slice(0, 2) : ROWS;
  return (
    <ul className={compact ? "space-y-2" : "space-y-3"} aria-label="Your remaining target compared with this meal">
      {rows.map((r, i) => {
        const value = nutrition[r.key];
        const goal = target[r.key];
        const max = Math.max(goal * 1.5, value * 1.08, 1);
        const s = status[i];
        const good = s.tone === "good";
        const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
        const goalText = r.key === "protein" ? `≥${goal} ${r.unit}` : `${goal} ${r.unit}`;
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                {r.label}
              </span>
              <span className="tnum flex items-center gap-1 text-[13px] whitespace-nowrap">
                <Icon name={good ? "check" : s.tone === "warn" ? "alert" : "minus"} size={12} stroke={2.6} className={good ? "text-brand" : s.tone === "warn" ? "text-warn" : "text-ink-3"} />
                <span className="font-semibold text-ink">
                  {ap}
                  {value}
                </span>
                <span className="text-ink-3">/ {goalText}</span>
                <span className="sr-only">: {s.status}</span>
              </span>
            </div>
            <div className={`relative mt-1 rounded-full bg-sunken ${compact ? "h-1.5" : "h-2"}`} aria-hidden="true">
              {r.key === "calories" && (
                <span className="absolute inset-y-0 rounded-full bg-brand/15" style={{ left: pct(goal * 0.9), width: `calc(${pct(goal * 1.1)} - ${pct(goal * 0.9)})` }} />
              )}
              <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300" style={{ width: pct(value), background: r.color, opacity: good || r.key !== "calories" ? 1 : 0.55 }} />
              <span className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full bg-ink" style={{ left: `calc(${pct(goal)} - 1px)` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
