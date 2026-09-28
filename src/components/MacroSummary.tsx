import type { UserTarget } from "../types";

/** Fictional food already logged today (demo data) — only used to draw progress. */
const LOGGED_TODAY = { calories: 1400, protein: 105, carbs: 175, fat: 48 };

const MACROS = [
  { key: "protein", label: "Protein", color: "var(--color-protein)" },
  { key: "carbs", label: "Carbs", color: "var(--color-carbs)" },
  { key: "fat", label: "Fat", color: "var(--color-fat)" },
] as const;

export function MacroSummary({ target }: { target: UserTarget }) {
  const goal = target.calories + LOGGED_TODAY.calories;
  const eatenFrac = LOGGED_TODAY.calories / goal;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[132px] w-[132px] shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-sunken)" strokeWidth="9" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${c * eatenFrac} ${c}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum font-display text-[30px] leading-none font-semibold tracking-tight">{target.calories}</span>
          <span className="mt-1 text-[12px] font-medium text-ink-3">kcal left</span>
        </div>
      </div>
      <ul className="flex-1 space-y-3">
        {MACROS.map((m) => {
          const left = target[m.key];
          const eaten = LOGGED_TODAY[m.key];
          return (
            <li key={m.key}>
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                  {m.label}
                </span>
                <span className="tnum text-[15px] font-semibold">
                  {left} g <span className="text-[12px] font-normal text-ink-3">left</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${(eaten / (eaten + left)) * 100}%`, background: m.color }} />
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
    `≥${target.protein} g protein`,
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
