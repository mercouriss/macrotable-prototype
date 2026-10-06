import { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SCENARIO_IDS, SCENARIOS, isScenarioId } from "../data/scenarios";
import { lockedRedirect } from "../lib/research";
import { useAppState } from "../state/AppState";
import type { ScenarioId } from "../types";
import { Icon } from "./Icon";
import { ShowcaseVideo } from "./Showcase";
import { useMediaQuery } from "./useMediaQuery";
import { REALISM_DISCLOSURE } from "../lib/provenance";
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
 * < 1024 px (phones, small tablets): ONLY the app, full height — no desktop shell, no video.
 * ≥ 1024 px: presentation layout — interactive phone on the left, showcase column on the right
 * (brand, product-demo video, presenter controls). The showcase is never shown to study
 * participants (trials, /experiment, /baseline) so the baseline can't be contaminated.
 */
export function AppFrame() {
  const { log, lock } = useAppState();
  const { pathname } = useLocation();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const redirect = lockedRedirect(lock, pathname);
  const participantContext = !!lock || pathname.startsWith("/experiment") || pathname.startsWith("/baseline");
  return (
    <div className="flex h-full justify-center bg-canvas lg:items-center lg:gap-12 lg:bg-desk lg:px-10 lg:py-6">
      <div
        className="relative h-full w-full max-w-[520px] overflow-hidden bg-canvas lg:h-[min(844px,calc(100dvh-48px))] lg:w-[390px] lg:max-w-none lg:shrink-0 lg:rounded-[46px] lg:shadow-device"
        style={{ isolation: "isolate" }}
      >
        <SheetProvider onOpen={(c) => c.kind === "provenance" && log("provenance_viewed", { detail: { provenance: c.provenance } })}>
          <OfflineBanner />
          <ScenarioFromQuery />
          {redirect ? <Navigate to={redirect} replace /> : <Outlet />}
        </SheetProvider>
      </div>
      {desktop && !participantContext && <ShowcasePanel />}
    </div>
  );
}

function ShowcasePanel() {
  const { scenarioId, setScenario, resetDemo, settings, setSettings } = useAppState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mode = pathname.startsWith("/research") ? "research" : "macrotable";
  return (
    <aside className="flex max-h-[min(844px,calc(100dvh-48px))] w-full max-w-[640px] min-w-[420px] flex-col gap-5 overflow-y-auto py-1 text-ink-2" aria-label="Product showcase and presenter controls">
      <header>
        <h1>
          <img src={`${import.meta.env.BASE_URL}brand/macrotable-wordmark.png`} alt="MacroTable" width={210} height={56} className="h-14 w-auto" />
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-3">Nutrition-aware restaurant ordering agent · Team 44 research prototype</p>
      </header>

      <ShowcaseVideo />

      <p className="text-[13.5px] leading-relaxed">
        <strong className="text-ink">LLM interprets and orchestrates. Deterministic code calculates. Restaurant data defines what's possible. You approve.</strong>{" "}
        Try it on the phone: ask MacroAgent “What should I eat near me?”, explore the map, or scan a menu.
      </p>

      <section className="rounded-[20px] border border-line bg-surface/70 p-4" aria-label="Presenter controls">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">Presenter</p>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-brand)]"
              checked={settings.agentMode === "auto"}
              onChange={(e) => setSettings({ agentMode: e.target.checked ? "auto" : "offline" })}
            />
            Use Gemini API (Live AI)
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              resetDemo();
              navigate("/macrotable");
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[13px] font-semibold text-white hover:bg-ink/90"
          >
            <Icon name="refresh" size={15} /> Reset demo
          </button>
          <div className="flex gap-1 rounded-xl bg-canvas p-1" role="group" aria-label="Scenario">
            {SCENARIO_IDS.map((id) => (
              <button
                key={id}
                onClick={() => {
                  setScenario(id);
                  navigate(mode === "research" ? "/research" : "/macrotable");
                }}
                aria-pressed={scenarioId === id}
                title={SCENARIOS[id].summary}
                className={`h-8 w-9 rounded-lg text-[12.5px] font-semibold ${scenarioId === id ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink"}`}
              >
                {id}
              </button>
            ))}
          </div>
          <Link to="/baseline" className="inline-flex min-h-10 items-center rounded-xl px-3 text-[13px] font-medium hover:bg-canvas">
            Baseline
          </Link>
          <Link to="/research" className="inline-flex min-h-10 items-center rounded-xl px-3 text-[13px] font-medium hover:bg-canvas">
            Research
          </Link>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">Scenario {scenarioId}: {SCENARIOS[scenarioId].summary} · demo mode never logs.</p>
      </section>

      <p className="text-[11.5px] leading-relaxed text-ink-3">{REALISM_DISCLOSURE}</p>
    </aside>
  );
}
