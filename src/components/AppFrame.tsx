import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SCENARIO_IDS, SCENARIOS, isScenarioId } from "../data/scenarios";
import { useAppState } from "../state/AppState";
import type { ScenarioId } from "../types";
import { Icon } from "./Icon";
import { SheetProvider } from "./Sheet";

/** Applies ?scenario=A|B|C|D from any URL, then strips it so refreshes don't reset progress. */
function ScenarioFromQuery() {
  const [params, setParams] = useSearchParams();
  const { scenarioId, setScenario } = useAppState();
  const q = params.get("scenario");
  useEffect(() => {
    if (!q) return;
    if (isScenarioId(q) && q.toUpperCase() !== scenarioId) setScenario(q.toUpperCase() as ScenarioId);
    const next = new URLSearchParams(params);
    next.delete("scenario");
    setParams(next, { replace: true });
  }, [q, scenarioId, setScenario, params, setParams]);
  return null;
}

/**
 * Mobile: the app fills the screen. Desktop (Demo Day): the app sits in a 390×844
 * device frame, with a small presenter panel beside it on wide screens.
 */
export function AppFrame() {
  const { log } = useAppState();
  return (
    <div className="flex h-full items-center justify-center sm:gap-10 sm:p-6">
      <DemoPanel />
      <div
        className="relative h-full w-full overflow-hidden bg-canvas sm:h-[min(844px,calc(100dvh-48px))] sm:w-[390px] sm:shrink-0 sm:rounded-[46px] sm:shadow-device"
        style={{ isolation: "isolate" }}
      >
        <SheetProvider onOpen={(c) => c.kind === "provenance" && log("provenance_viewed", { detail: { provenance: c.provenance } })}>
          <ScenarioFromQuery />
          <Outlet />
        </SheetProvider>
      </div>
    </div>
  );
}

function DemoPanel() {
  const { scenarioId, setScenario, session } = useAppState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mode = pathname.startsWith("/baseline") ? "baseline" : pathname.startsWith("/research") ? "research" : "macrotable";
  return (
    <aside className="hidden w-[260px] shrink-0 self-center text-ink-2 xl:block" aria-label="Presenter controls">
      <div className="flex items-center gap-2.5">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
        <div>
          <p className="text-[15px] font-semibold text-ink">MacroTable</p>
          <p className="text-[12px] text-ink-3">Team 44 · prototype</p>
        </div>
      </div>
      <p className="mt-5 text-[13px] leading-relaxed">
        AI interprets. Optimization calculates. Restaurant constraints determine what can actually be made.
      </p>

      <p className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">Scenario</p>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-canvas p-1">
        {SCENARIO_IDS.map((id) => (
          <button
            key={id}
            onClick={() => {
              setScenario(id);
              navigate(mode === "baseline" ? "/baseline" : mode === "research" ? "/research" : "/macrotable");
            }}
            aria-pressed={scenarioId === id}
            className={`h-9 rounded-lg text-[13px] font-semibold ${scenarioId === id ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink"}`}
          >
            {id}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-ink-3">{SCENARIOS[scenarioId].summary}</p>

      <p className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">Mode</p>
      <nav className="grid gap-1 text-[13.5px]">
        {[
          { to: "/macrotable", label: "MacroTable (treatment)", key: "macrotable" },
          { to: "/baseline", label: "Conventional (baseline)", key: "baseline" },
          { to: "/research", label: "Research summary", key: "research" },
        ].map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`flex items-center justify-between rounded-lg px-3 py-2 ${mode === l.key ? "bg-surface font-semibold text-ink shadow-card" : "hover:bg-canvas"}`}
          >
            {l.label}
            <Icon name="chevronRight" size={15} className="text-ink-3" />
          </Link>
        ))}
      </nav>
      {session && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Trial running ({session.mode})
        </p>
      )}
      <p className="mt-8 text-[11.5px] leading-relaxed text-ink-3">
        University proof-of-concept. Restaurants, nutrition data, orders and checkout are simulated.
      </p>
    </aside>
  );
}
