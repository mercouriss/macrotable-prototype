import { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SCENARIO_IDS, SCENARIOS, isScenarioId } from "../data/scenarios";
import { lockedRedirect } from "../lib/research";
import { useAppState } from "../state/AppState";
import type { ScenarioId } from "../types";
import { Icon } from "./Icon";
import { OfflineBanner } from "./OfflineBanner";
import { SheetProvider } from "./Sheet";

/** Applies ?scenario=A|B|C|D from any URL (demo mode only), then strips it so refreshes don't reset progress. */
function ScenarioFromQuery() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const { scenarioId, setScenario, lock } = useAppState();
  const q = params.get("scenario");
  const isAssignmentLink = pathname === "/experiment";
  useEffect(() => {
    if (!q || isAssignmentLink) return;
    if (!lock && isScenarioId(q) && q.toUpperCase() !== scenarioId) setScenario(q.toUpperCase() as ScenarioId);
    const next = new URLSearchParams(params);
    next.delete("scenario");
    setParams(next, { replace: true });
  }, [q, isAssignmentLink, lock, scenarioId, setScenario, params, setParams]);
  return null;
}

/** /demo — Demo lock: Scenario A, canonical data, no logging, straight to Home. */
export function DemoReset() {
  const { resetDemo, setSettings, lock } = useAppState();
  useEffect(() => {
    if (resetDemo()) setSettings({ onboardingDone: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Navigate to={lock ? "/experiment" : "/macrotable"} replace />;
}

/**
 * Mobile: the app fills the screen. Desktop (Demo Day): the app sits in a 390×844
 * device frame, with a presenter panel beside it on wide screens (hidden during trials).
 */
export function AppFrame() {
  const { log, lock } = useAppState();
  const { pathname } = useLocation();
  const redirect = lockedRedirect(lock, pathname);
  return (
    <div className="flex h-full items-center justify-center sm:gap-10 sm:p-6">
      {/* Presenter controls never appear to participants: hidden during trials and on assignment links. */}
      {!lock && !pathname.startsWith("/experiment") && <DemoPanel />}
      <div
        className="relative h-full w-full overflow-hidden bg-canvas sm:h-[min(844px,calc(100dvh-48px))] sm:w-[390px] sm:shrink-0 sm:rounded-[46px] sm:shadow-device"
        style={{ isolation: "isolate" }}
      >
        <SheetProvider onOpen={(c) => c.kind === "provenance" && log("provenance_viewed", { detail: { provenance: c.provenance } })}>
          <OfflineBanner />
          <ScenarioFromQuery />
          {redirect ? <Navigate to={redirect} replace /> : <Outlet />}
        </SheetProvider>
      </div>
    </div>
  );
}

function DemoPanel() {
  const { scenarioId, setScenario, resetDemo } = useAppState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mode = pathname.startsWith("/baseline") ? "baseline" : pathname.startsWith("/research") ? "research" : "macrotable";
  return (
    <aside className="hidden w-[260px] shrink-0 self-center text-ink-2 xl:block" aria-label="Presenter controls">
      <div className="flex items-center gap-2.5">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
        <div>
          <p className="text-[15px] font-semibold text-ink">MacroTable</p>
          <p className="text-[12px] text-ink-3">Team 44 · research prototype</p>
        </div>
      </div>
      <p className="mt-5 text-[13px] leading-relaxed">
        AI interprets. Optimization calculates. Restaurant constraints determine what can actually be made.
      </p>

      <button
        onClick={() => {
          resetDemo();
          navigate("/macrotable");
        }}
        className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[13.5px] font-semibold text-white hover:bg-ink/90"
      >
        <Icon name="refresh" size={16} /> Reset demo
      </button>

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
          { to: "/research", label: "Research dashboard", key: "research" },
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
      <p className="mt-8 text-[11.5px] leading-relaxed text-ink-3">
        Demo mode — nothing is logged. Restaurants, nutrition data, orders and checkout are simulated.
      </p>
    </aside>
  );
}
