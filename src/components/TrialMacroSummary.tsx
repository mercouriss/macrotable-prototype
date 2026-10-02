import type { UserTarget } from "../types";

/*
 * RESEARCH-TRIAL PRESENTATION ONLY — frozen treatment UI.
 *
 * Before the daily-ledger repair (2026-10-02), Home's "Remaining today" ring and bars were drawn from a
 * fixed, fictional "already logged" amount. Participants in locked treatment trials must keep seeing
 * exactly that, so this component reproduces the pre-repair markup byte for byte (pinned by
 * tests/ledger.test.ts against the pre-repair render).
 *
 * The fixture below is display data for locked trials and nothing else: it never enters AppState,
 * targets, the agent/Gemini context, the optimizer, the ledger or any order calculation, and normal/demo
 * mode never renders this component (Home uses MacroSummary with the real ledger there).
 */
const TRIAL_DISPLAY_LOGGED = { calories: 1400, protein: 105, carbs: 175, fat: 48 };

const MACROS = [
  { key: "protein", label: "Protein", color: "var(--color-protein)" },
  { key: "carbs", label: "Carbs", color: "var(--color-carbs)" },
  { key: "fat", label: "Fat", color: "var(--color-fat)" },
] as const;

/** `target` is the trial's assigned target, shown unchanged as what's left. */
export function TrialMacroSummary({ target }: { target: UserTarget }) {
  const goal = target.calories + TRIAL_DISPLAY_LOGGED.calories;
  const eatenFrac = TRIAL_DISPLAY_LOGGED.calories / goal;
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
          const eaten = TRIAL_DISPLAY_LOGGED[m.key];
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
