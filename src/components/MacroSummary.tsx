import type { DailyLedger } from "../lib/ledger";
import type { UserTarget } from "../types";

const MACROS = [
  { key: "protein", label: "Protein", color: "var(--color-protein)" },
  { key: "carbs", label: "Carbs", color: "var(--color-carbs)" },
  { key: "fat", label: "Fat", color: "var(--color-fat)" },
] as const;

/** Share of the base target already confirmed today (0–1). */
const share = (consumed: number, base: number) => (base > 0 ? Math.min(1, consumed / base) : consumed > 0 ? 1 : 0);

/**
 * "Remaining today": the ring and bars show today's confirmed meals against the daily target, and the
 * numbers what's left — all from the same ledger. Past a calorie/carb/fat target it says how far over,
 * like the optimizer's "over your calorie range"; protein is a minimum, so reaching it reads "Goal met".
 * Locked research trials don't use this component (see TrialMacroSummary).
 */
export function MacroSummary({ ledger }: { ledger: DailyLedger }) {
  const { base, consumed, remaining, over } = ledger;
  const eatenFrac = share(consumed.calories, base.calories);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-5" data-ledger-consumed={consumed.calories} data-ledger-remaining={remaining.calories}>
      <div className="relative h-[132px] w-[132px] shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-sunken)" strokeWidth="9" />
          {eatenFrac > 0 && (
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={over.calories > 0 ? "var(--color-warn)" : "var(--color-ink)"}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${c * eatenFrac} ${c}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum font-display text-[30px] leading-none font-semibold tracking-tight">{over.calories > 0 ? over.calories : remaining.calories}</span>
          <span className="mt-1 text-[12px] font-medium text-ink-3">{over.calories > 0 ? "kcal over" : "kcal left"}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-3">
        {MACROS.map((m) => {
          // Protein is a minimum: reaching or passing it is the goal, not an excess.
          const goalMet = m.key === "protein" && base.protein > 0 && consumed.protein >= base.protein;
          const isOver = !goalMet && over[m.key] > 0;
          return (
            <li key={m.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-ink-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                  {m.label}
                </span>
                {goalMet ? (
                  <span className="tnum text-[15px] font-semibold whitespace-nowrap" data-protein-goal="met">
                    <span className="text-[12px] font-medium text-brand">Goal met</span>
                    {over.protein > 0 ? ` · +${over.protein} g` : ""}
                  </span>
                ) : (
                  <span className="tnum text-[15px] font-semibold">
                    {isOver ? over[m.key] : remaining[m.key]} g <span className="text-[12px] font-normal text-ink-3">{isOver ? "over" : "left"}</span>
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${share(consumed[m.key], base[m.key]) * 100}%`, background: m.color }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TargetStrip({ target }: { target: UserTarget }) {
  const items = [
    `${target.calories} kcal`,
    target.protein > 0 ? `≥${target.protein} g protein` : "Protein goal met", // nothing left to reach after today's meals
    `${target.carbs} g carbs`,
    `${target.fat} g fat`,
    `≤ €${target.maxBudget}`,
  ];
  return (
    <div className="scrollbar-none -mx-5 flex gap-1.5 overflow-x-auto px-5">
      {items.map((t) => (
        <span key={t} className="tnum shrink-0 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2">
          {t}
        </span>
      ))}
    </div>
  );
}
