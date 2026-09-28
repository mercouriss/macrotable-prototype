import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Screen } from "../components/Screen";
import { useAppState } from "../state/AppState";
import { useSearch } from "../state/useMealSelection";

const STEP_MS = 420;

/** Short, honest progress: every step shows a real number from the deterministic search. */
export function Search() {
  const [params] = useSearchParams();
  const scope = params.get("scope");
  const r = useSearch(scope);
  const { log, target } = useAppState();
  const navigate = useNavigate();
  const [done, setDone] = useState(0);
  const finished = useRef(false);

  const s = r.stats;
  const steps = [
    { label: "Checking menus", detail: `${s.restaurants} ${s.restaurants === 1 ? "restaurant" : "restaurants"} · ${s.meals} meals` },
    {
      label: "Filtering feasible meals",
      detail: `${s.matchingDiet} available and match your diet`,
    },
    {
      label: "Checking supported modifications",
      detail: `${s.configurations} supported configurations · ${s.unsupportedSkipped} unsupported options never used`,
    },
    { label: "Comparing nutrition", detail: `${s.reachingTarget} configurations reach your target range` },
    { label: "Checking your budget", detail: `${s.withinBudget} of ${s.configurations} within €${target.maxBudget}` },
  ];

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    log("search_run", { detail: { scope, ...s, anyMeetsTarget: r.anyMeetsTarget } });
    const q = scope ? `?scope=${scope}` : "";
    navigate(`/macrotable/${r.anyMeetsTarget ? "results" : "failure"}${q}`, { replace: true });
  };

  useEffect(() => {
    if (done < steps.length) {
      const t = setTimeout(() => setDone((d) => d + 1), STEP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(finish, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <Screen back="/macrotable/preferences" right={<SkipButton onClick={finish} />}>
      <div className="flex min-h-full flex-col justify-center pb-16">
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Finding your best options…</h1>
        {r.scope && <p className="mt-1 text-[14px] text-ink-3">At {r.scope.name}</p>}
        <ol className="mt-8 space-y-5" aria-live="polite">
          {steps.map((st, i) => {
            const complete = i < done;
            const active = i === done;
            return (
              <li key={st.label} className={`flex gap-3.5 transition-opacity duration-300 ${complete || active ? "opacity-100" : "opacity-35"}`}>
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${
                    complete ? "bg-brand text-white" : "border-2 border-line"
                  }`}
                  aria-hidden="true"
                >
                  {complete && <Icon name="check" size={14} stroke={3} />}
                  {active && <span className="h-2 w-2 animate-pulse rounded-full bg-ink-3" />}
                </span>
                <span>
                  <span className="block text-[15.5px] font-semibold">
                    {st.label}
                    <span className="sr-only">{complete ? " — done" : ""}</span>
                  </span>
                  {complete && <span className="tnum block animate-fade-in text-[13px] text-ink-3">{st.detail}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <p className={`mt-10 text-[14px] font-medium text-ink-2 transition-opacity ${done >= steps.length ? "opacity-100" : "opacity-0"}`}>
          Optimizing feasible meals…
        </p>
      </div>
    </Screen>
  );
}

function SkipButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="min-h-11 rounded-full px-4 text-[14px] font-medium text-ink-2 hover:bg-sunken">
      Skip
    </button>
  );
}
