import { useEffect, useReducer, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { QRCode } from "../components/QRCode";
import { Screen } from "../components/Screen";
import { AgentModeToggle } from "./Account";
import { Button, Card, Eyebrow } from "../components/ui";
import { getMeal, STUDY_RESTAURANTS } from "../data/restaurants";
import { SCENARIO_IDS, SCENARIOS } from "../data/scenarios";
import { clearOrders } from "../lib/experiment";
import { clock, duration, euro } from "../lib/format";
import { weightsFor } from "../lib/optimizer";
import {
  assignmentPath,
  downloadText,
  nextParticipantId,
  researchStore,
  sessionStatus,
  sessionsToCSV,
  sessionsToJSON,
  summarize,
  type ConditionSummary,
  type ParticipantSession,
} from "../lib/research";
import { appUrl, copyText, shareLink } from "../lib/share";
import { useAppState } from "../state/AppState";
import { GENERATION_CONFIG, MAX_TOOL_ROUNDS, PROXY_URL, proxyHealth } from "../agent/gemini";
import { agentConfigDocument, FALLBACK_POLICY, sha256Hex } from "../lib/freeze";
import type { Mode, ScenarioId } from "../types";

const COND_LABEL: Record<Mode, string> = { baseline: "Baseline", macrotable: "MacroTable" };
const pct = (v?: number) => (v === undefined ? "—" : `${Math.round(v * 100)}%`);
const kcal = (v?: number) => (v === undefined ? "—" : `${Math.round(v)} kcal`);

/** Researcher dashboard: participant links, trials, descriptive summaries, export/reset. */
export function Research() {
  const { scenarioId, setScenario, settings, setSettings, prefs, lock } = useAppState();
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const sessions = [...researchStore.list()].sort((a, b) => b.startedAt - a.startedAt);
  const summary = summarize(sessions);
  const w = weightsFor(prefs);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  // During a trial the participant may hold the device: show only the status gate, never data or controls.
  if (lock) {
    return (
      <Screen title="Research">
        <TrialGate />
      </Screen>
    );
  }

  return (
    <Screen title="Research" back="/macrotable/profile">
      <LinkBuilder sessions={sessions} disabled={!!lock} />

      <Section title="Summary" note="Descriptive only — no significance testing. Completed trials only.">
        <div className="grid grid-cols-2 gap-2">
          {summary.map((s) => (
            <SummaryCard key={s.condition} s={s} />
          ))}
        </div>
      </Section>

      <Section title={`Sessions (${sessions.length})`} action={<RefreshButton onClick={refresh} />}>
        {sessions.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">No sessions yet. Create a participant link above.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.sessionId}>
                <SessionCard s={s} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" icon="download" disabled={!sessions.length} onClick={() => downloadText(`macrotable-research-${stamp}.csv`, sessionsToCSV(sessions), "text/csv;charset=utf-8")}>
            Export CSV
          </Button>
          <Button variant="secondary" icon="download" disabled={!sessions.length} onClick={() => downloadText(`macrotable-research-${stamp}.json`, sessionsToJSON(sessions), "application/json")}>
            Export JSON
          </Button>
        </div>
        <Button
          variant="ghost"
          icon="x"
          className="mt-1"
          disabled={!!lock}
          onClick={() => {
            if (window.confirm(`Delete all ${sessions.length} research sessions and simulated orders stored on this device? Export first — this can't be undone.`)) {
              researchStore.clear();
              clearOrders();
              refresh();
            }
          }}
        >
          Clear local research data
        </Button>
        <p className="mt-1 text-[12px] leading-snug text-ink-3">
          Data is stored only in this browser on this device and disappears if site data is cleared. Export after every session.
        </p>
      </Section>

      <Section title="Demo settings">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-sunken p-1">
          {SCENARIO_IDS.map((id) => (
            <button
              key={id}
              disabled={!!lock}
              onClick={() => setScenario(id)}
              aria-pressed={scenarioId === id}
              className={`h-10 rounded-lg text-[13.5px] font-semibold ${scenarioId === id ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}
            >
              {id}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-ink-3">
          {SCENARIOS[scenarioId].summary} · also via <code>?scenario=B</code> on any page, or <Link className="underline" to="/demo">/demo</Link> to reset.
        </p>
        <AgentModeToggle />
        <p className="mt-1.5 px-1 text-[12px] text-ink-3">
          Live proxy: {import.meta.env.VITE_AGENT_PROXY_URL ? import.meta.env.VITE_AGENT_PROXY_URL : "not configured (offline demo agent only)"}
        </p>
        <Card className="mt-3 p-4">
          <label className="flex items-center justify-between gap-3 text-[14px]">
            <span>
              <span className="block font-medium">Show nutrition in baseline</span>
              <span className="block text-[12px] text-ink-3">Menu nutrition as some conventional apps list it</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-brand)]"
              checked={settings.baselineShowNutrition}
              onChange={(e) => setSettings({ baselineShowNutrition: e.target.checked })}
            />
          </label>
        </Card>
      </Section>

      <FreezeInfo />

      <details className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-[14px] font-semibold">Printable demo QR codes</summary>
        <p className="mt-2 text-[12.5px] text-ink-3">
          Each code opens the restaurant's page in the app — scan with the in-app scanner or the phone's own camera.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {STUDY_RESTAURANTS.map((r) => (
            <figure key={r.id} className="flex flex-col items-center rounded-xl border border-line-2 p-3">
              <QRCode text={appUrl(`r/${r.id}`)} size={132} label={`QR code for ${r.name}`} />
              <figcaption className="mt-1.5 text-[12.5px] font-semibold">{r.name}</figcaption>
            </figure>
          ))}
          <figure className="flex flex-col items-center rounded-xl border border-line-2 p-3">
            <QRCode text="https://example.com/some-other-menu.pdf" size={132} label="QR code with no MacroTable data" />
            <figcaption className="mt-1.5 text-[12.5px] font-semibold">Unknown code</figcaption>
          </figure>
        </div>
      </details>

      <details className="mt-3 rounded-2xl border border-line bg-surface p-4 text-[13px]">
        <summary className="cursor-pointer font-semibold">Ranking heuristic (current preferences)</summary>
        <p className="mt-2 text-ink-2">
          D = {w.calories}·|kcal error| + {w.proteinShortfall}·protein shortfall + {w.carbs}·|carb error| + {w.fat}·
          {w.fatExcessOnly ? "fat excess" : "|fat error|"} (each relative to target). Configurations reaching the target range (kcal ±10%,
          protein ≥ target) rank first. Prototype heuristic — not a validated nutrition model; never shown to participants.
        </p>
      </details>

      <details className="mt-3 mb-8 rounded-2xl border border-line bg-surface p-4 text-[12px]">
        <summary className="cursor-pointer text-[13px] font-semibold">Event log</summary>
        <ol className="tnum mt-2 max-h-72 space-y-1 overflow-y-auto font-mono text-ink-2">
          {sessions
            .flatMap((s) => s.events.map((e) => ({ ...e, p: s.participantId })))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 100)
            .map((e, i) => (
              <li key={i} className="break-words">
                {clock(e.timestamp)} {e.p} {e.mode === "macrotable" ? "MT" : "BL"}/{e.scenario} {e.event}
                {e.mealId ? ` · ${e.mealId}` : ""}
              </li>
            ))}
        </ol>
      </details>
    </Screen>
  );
}

function TrialGate() {
  const { lock, abortExperiment } = useAppState();
  const navigate = useNavigate();
  if (!lock) return null;
  return (
    <div className="pt-10">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-ink-2" aria-hidden="true">
        <Icon name="lock" size={22} />
      </span>
      <h2 className="mt-4 font-display text-[24px] font-semibold tracking-tight">A study task is in progress</h2>
      <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
        The research dashboard is hidden until the task is finished.
      </p>
      <div className="mt-6 space-y-2">
        <Button onClick={() => navigate(lock.condition === "baseline" ? "/baseline/browse" : "/macrotable")}>Back to the task</Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (window.confirm(`Researcher only: abort ${lock.participantId}'s trial? It is kept as "aborted" and the dashboard reopens.`)) abortExperiment();
          }}
        >
          Researcher: abort trial
        </Button>
      </div>
    </div>
  );
}

function Section({ title, note, action, children }: { title: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>{title}</Eyebrow>
        {action}
      </div>
      {children}
      {note && <p className="mt-1.5 text-[12px] text-ink-3">{note}</p>}
    </section>
  );
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex min-h-9 items-center gap-1 text-[12.5px] font-medium text-ink-2">
      <Icon name="refresh" size={14} /> Refresh
    </button>
  );
}

function LinkBuilder({ sessions, disabled }: { sessions: ParticipantSession[]; disabled: boolean }) {
  const suggested = nextParticipantId(sessions);
  const [participant, setParticipant] = useState(suggested);
  const [condition, setCondition] = useState<Mode>(sessions[0]?.condition === "baseline" ? "macrotable" : "baseline");
  const [scenario, setScenarioId] = useState<ScenarioId>("A");
  const [status, setStatus] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const navigate = useNavigate();

  useEffect(() => setParticipant(suggested), [suggested]);

  const valid = /^[A-Za-z]{1,4}\d{1,5}$/.test(participant.trim());
  const path = assignmentPath({ participantId: participant.trim().toUpperCase(), condition, scenarioId: scenario });
  const url = appUrl(path);
  const flash = (s: string) => {
    setStatus(s);
    setTimeout(() => setStatus(null), 2200);
  };

  return (
    <Section title="New participant link">
      <Card className="p-4">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <label className="text-[12.5px] font-medium text-ink-3">
            Anonymous participant code
            <input
              value={participant}
              onChange={(e) => setParticipant(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              aria-invalid={!valid}
              className={`tnum mt-1 block h-11 w-full rounded-xl border bg-surface px-3 text-[16px] font-semibold text-ink outline-none focus:border-ink ${valid ? "border-line" : "border-warn"}`}
            />
          </label>
          <label className="text-[12.5px] font-medium text-ink-3">
            Scenario
            <select
              value={scenario}
              onChange={(e) => setScenarioId(e.target.value as ScenarioId)}
              className="mt-1 block h-11 rounded-xl border border-line bg-surface px-3 text-[16px] font-semibold text-ink"
            >
              {SCENARIO_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!valid && <p className="mt-1 text-[12px] font-medium text-warn">Use a code like P001 — never a name, email or student number.</p>}
        <div role="radiogroup" aria-label="Condition" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1">
          {(["baseline", "macrotable"] as Mode[]).map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={condition === c}
              onClick={() => setCondition(c)}
              className={`h-10 rounded-lg text-[13.5px] font-semibold ${condition === c ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}
            >
              {COND_LABEL[c]}
            </button>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-sunken px-3 py-2 font-mono text-[11.5px] break-all text-ink-2">{url}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button variant="secondary" full disabled={!valid} onClick={async () => flash((await copyText(url)) ? "Copied" : "Copy failed")} className="px-2 text-[13.5px]">
            Copy
          </Button>
          <Button
            variant="secondary"
            disabled={!valid}
            onClick={async () => {
              const r = await shareLink(url, "MacroTable study task", `Study task for ${participant.toUpperCase()}`);
              if (r === "copied") flash("Copied");
              if (r === "failed") flash("Couldn't share");
            }}
            className="px-2 text-[13.5px]"
          >
            Share
          </Button>
          <Button variant="secondary" disabled={!valid} onClick={() => setShowQR((s) => !s)} className="px-2 text-[13.5px]" aria-expanded={showQR}>
            QR
          </Button>
        </div>
        {showQR && valid && (
          <div className="mt-3 flex justify-center">
            <QRCode text={url} size={200} label={`QR code for participant ${participant.toUpperCase()} link`} />
          </div>
        )}
        <Button className="mt-2" disabled={!valid || disabled} onClick={() => navigate(`/${path}`)}>
          Start on this device
        </Button>
        <p className="mt-2 text-[12px] leading-snug text-ink-3" aria-live="polite">
          {status ?? (disabled ? "Finish or abort the running trial first." : "Tip: alternate conditions between participants to counterbalance.")}
        </p>
      </Card>
    </Section>
  );
}

function SummaryCard({ s }: { s: ConditionSummary }) {
  const rows: [string, string][] = [
    ["Completed", `${s.completed} / ${s.started}`],
    ["Median time", s.medianTimeMs === undefined ? "—" : duration(s.medianTimeMs)],
    ["Mean |kcal dev|", kcal(s.meanAbsCalorieDeviation)],
    ["Median |kcal dev|", kcal(s.medianAbsCalorieDeviation)],
    ["Protein met", pct(s.proteinSuccessRate)],
    ["Feasible order", pct(s.feasibleOrderRate)],
    ["In target range", pct(s.targetRangeRate)],
  ];
  return (
    <Card className="p-3.5">
      <p className="text-[13.5px] font-semibold">{COND_LABEL[s.condition]}</p>
      <dl className="tnum mt-2 space-y-1 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-ink-3">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Check({ ok, label }: { ok?: boolean; label: string }) {
  if (ok === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${ok ? "bg-brand-soft text-brand" : "bg-warn-soft text-warn"}`}>
      <Icon name={ok ? "check" : "x"} size={11} stroke={3} />
      {label}
    </span>
  );
}

function SessionCard({ s }: { s: ParticipantSession }) {
  const st = sessionStatus(s);
  const f = s.selectedMealId ? getMeal(s.selectedMealId) : undefined;
  const n = s.finalNutrition;
  const o = s.outcome;
  const changes = s.events.filter((e) => e.event === "modifier_changed").length;
  const viewed = s.events.filter((e) => e.event === "meal_viewed").length;
  return (
    <Card className="p-4 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {s.participantId} · {COND_LABEL[s.condition]} · {s.scenarioId}
        </span>
        <span className={`tnum text-[12.5px] font-semibold ${st === "completed" ? "" : st === "aborted" ? "text-warn" : "text-ink-3"}`}>
          {st === "completed" ? duration(s.completionTimeMs) : st}
        </span>
      </div>
      <p className="text-[12px] text-ink-3">
        {new Date(s.startedAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
        {viewed} {viewed === 1 ? "meal" : "meals"} viewed · {changes} modifier {changes === 1 ? "change" : "changes"}
      </p>
      {f && n && (
        <div className="mt-2 border-t border-line-2 pt-2">
          <p className="font-medium">
            {f.meal.name} <span className="font-normal text-ink-3">· {f.restaurant.name} · {s.provenance?.toUpperCase()}</span>
          </p>
          {!!s.modifierLabels?.length && <p className="text-ink-3">{s.modifierLabels.join(", ")}</p>}
          <p className="tnum mt-0.5">
            {n.calories} kcal ({o && (o.calorieDeviation >= 0 ? "+" : "−") + Math.abs(o.calorieDeviation)}) · P {n.protein} · C {n.carbs} · F {n.fat} ·{" "}
            {euro(s.finalPrice ?? 0)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Check ok={o?.withinBudget} label="Budget" />
            <Check ok={o?.dietOk} label="Diet" />
            <Check ok={o?.proteinMet} label="Protein" />
            <Check ok={o?.caloriesWithinRange} label="kcal ±10%" />
          </div>
        </div>
      )}
    </Card>
  );
}

/** Values for docs/study/freeze-record.md — copy them at freeze time. */
function FreezeInfo() {
  const { settings } = useAppState();
  const [model, setModel] = useState<string>("checking…");
  const [hash, setHash] = useState<string>("…");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void sha256Hex(agentConfigDocument()).then((h) => setHash(h.slice(0, 16)));
    if (!PROXY_URL) setModel("none — offline demo agent only");
    else void proxyHealth().then((r) => setModel(r.ok ? (r.model ?? "unknown") : `proxy unreachable (${PROXY_URL})`));
  }, []);
  const rows: [string, string][] = [
    ["App commit", __APP_COMMIT__],
    ["Agent model (server-side)", model],
    ["Proxy", PROXY_URL || "not configured"],
    ["Prompt + tools + settings SHA-256", hash],
    ["Generation settings", `temperature ${GENERATION_CONFIG.temperature} · max ${GENERATION_CONFIG.maxOutputTokens} tokens · ≤${MAX_TOOL_ROUNDS} tool rounds`],
    ["Fallback policy", FALLBACK_POLICY],
    ["Agent mode on this device", settings.agentMode === "offline" ? "offline demo agent only" : "live when available"],
    ["Baseline nutrition on this device", settings.baselineShowNutrition ? "visible" : "hidden"],
  ];
  return (
    <details className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer text-[14px] font-semibold">Freeze record values</summary>
      <dl className="mt-3 space-y-2 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink-3">{k}</dt>
            <dd className="font-mono break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={async () => {
          setCopied(await copyText(rows.map(([k, v]) => `${k}: ${v}`).join("\n")));
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy for freeze record"}
      </Button>
    </details>
  );
}
