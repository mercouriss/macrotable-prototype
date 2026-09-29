import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAgent, type LiveStatus } from "../agent/agentState";
import type { AgentMessage, QuickAction } from "../agent/types";
import { AgentCardView } from "../components/agent/AgentCards";
import { Icon } from "../components/Icon";
import { Screen } from "../components/Screen";
import { getOrders } from "../lib/experiment";
import { completedOrderFor } from "../lib/orderState";
import { useAppState } from "../state/AppState";

export interface AgentContextRequest {
  kind: "restaurant" | "meal" | "scan";
  id?: string;
  entry: string;
}

const SUGGESTIONS = ["What should I eat near me?", "Something high protein under €18", "Compare stores", "Show FitKitchen's menu"];

const STATUS: Record<LiveStatus, { label: string; tone: string }> = {
  live: { label: "Live · Gemini", tone: "bg-brand-soft text-brand" },
  checking: { label: "Connecting…", tone: "bg-sunken text-ink-3" },
  unreachable: { label: "Offline demo agent", tone: "bg-estimated-soft text-estimated" },
  "not-configured": { label: "Offline demo agent", tone: "bg-sunken text-ink-2" },
  "offline-mode": { label: "Offline demo agent", tone: "bg-sunken text-ink-2" },
};

/** MacroAgent workspace: chat + tool-backed cards + approval. */
export function Agent() {
  const agent = useAgent();
  const { state, busy, liveStatus, send, progress } = agent;
  const { settings, setSettings, target } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const handled = useRef<string | null>(null);

  // Contextual entry (QR scan, Explore, restaurant/meal page, menu scan) — run once, then drop the nav state.
  useEffect(() => {
    const req = (location.state as { agentContext?: AgentContextRequest } | null)?.agentContext;
    if (!req) return;
    const key = `${location.key}:${req.kind}:${req.id}`;
    if (handled.current === key) return;
    handled.current = key;
    agent.openContext(req.kind, req.id, req.entry);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [state.messages.length, busy, progress]);

  const submit = (text: string, source: "typed" | "chip" = "typed") => {
    if (!text.trim() || busy) return;
    setDraft("");
    void send(text, source);
  };

  const status = STATUS[liveStatus];
  const showDisclosure = liveStatus === "live" && !settings.agentDisclosureSeen;

  return (
    <Screen
      title="MacroAgent"
      right={<span className={`mr-2 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${status.tone}`}>{status.label}</span>}
      nav
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor="agent-input" className="sr-only">
            Message MacroAgent
          </label>
          <textarea
            id="agent-input"
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder="Ask about a meal, a store, or 'less rice'…"
            maxLength={500}
            enterKeyHint="send"
            className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-[16px] leading-snug outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40"
          >
            <Icon name="send" size={19} />
          </button>
        </form>
      }
    >
      {showDisclosure && (
        <div role="note" className="mt-1 rounded-2xl bg-sunken p-3.5 text-[12.5px] leading-snug text-ink-2">
          <p className="font-semibold text-ink">Live AI assistant</p>
          Your messages are sent via MacroTable's proxy to Google's Gemini model. On the free tier Google may use them to improve its products.
          Please don't share personal information. Nutrition and prices always come from MacroTable's own calculations.
          <button onClick={() => setSettings({ agentDisclosureSeen: true })} className="mt-2 block min-h-9 font-semibold text-brand">
            OK, got it
          </button>
        </div>
      )}

      {state.messages.length === 0 ? (
        <div className="pt-6 pb-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand" aria-hidden="true">
            <Icon name="chat" size={24} />
          </span>
          <h2 className="mt-4 font-display text-[24px] leading-tight font-semibold tracking-tight">What are you in the mood for?</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
            You have <span className="tnum font-semibold text-ink">{target.calories} kcal</span> and need at least{" "}
            <span className="tnum font-semibold text-ink">{target.protein} g protein</span> (budget €{target.maxBudget}). I'll find nearby options,
            configure a dish with changes the restaurant supports, and prepare a pickup or in-store order for you to approve.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => submit(s, "chip")} className="min-h-10 rounded-full border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink-2 hover:bg-sunken">
                {s}
              </button>
            ))}
          </div>
          {liveStatus !== "live" && liveStatus !== "checking" && (
            <p className="mt-6 text-[12.5px] leading-snug text-ink-3">
              Offline demo agent: it understands common requests and uses the same MacroTable tools, but isn't a live language model.
            </p>
          )}
        </div>
      ) : (
        <ol className="space-y-4 pt-2 pb-4" aria-live="polite">
          {state.messages.map((m, i) => (
            <MessageView key={m.id} m={m} last={i === state.messages.length - 1} onAction={(a) => runAction(a)} />
          ))}
          {busy && (
            <li className="flex items-center gap-2 text-[13px] text-ink-2" role="status">
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand" aria-hidden="true" />
              {progress ?? "Working"}…
            </li>
          )}
        </ol>
      )}
      <div ref={endRef} />
    </Screen>
  );

  function runAction(a: QuickAction) {
    if (busy) return;
    if (a.kind === "send") submit(a.text, "chip");
    else if (a.kind === "navigate") navigate(a.to, { state: a.state });
    else agent.prepare(a.mode);
  }
}

const PROVIDER_LABEL = { gemini: "Gemini", mock: "Offline demo agent", tools: "MacroTable tools" } as const;

function MessageView({ m, last, onAction }: { m: AgentMessage; last: boolean; onAction: (a: QuickAction) => void }) {
  const [showTools, setShowTools] = useState(false);
  const { state } = useAgent();
  // A recommendation that was already ordered can't be prepared again from its quick replies.
  const rec = state.currentRecommendation;
  const recCompleted = !!rec && !!completedOrderFor(rec, { since: m.createdAt }, getOrders());
  if (m.role === "user")
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[14.5px] leading-snug whitespace-pre-wrap text-white">{m.text}</p>
      </li>
    );
  return (
    <li className="space-y-2">
      {m.fallbackReason && (
        <p className="text-[11.5px] text-estimated">Live model unavailable — answered by the offline demo agent.</p>
      )}
      {!!m.steps?.length && (
        <ol className="flex flex-wrap gap-x-3 gap-y-1" aria-label="What MacroAgent did">
          {m.steps.map((s, i) => (
            <li key={s} className="inline-flex animate-rise items-center gap-1 text-[11.5px] font-medium text-brand" style={{ animationDelay: `${i * 60}ms` }}>
              <Icon name="check" size={11} stroke={3} /> {s}
            </li>
          ))}
        </ol>
      )}
      <p className="max-w-[92%] animate-rise rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-[14.5px] leading-snug whitespace-pre-wrap shadow-card">{m.text}</p>
      {m.cards?.map((c, i) => (
        <div key={i} className="animate-rise" style={{ animationDelay: `${80 + i * 60}ms` }}>
          <AgentCardView card={c} since={m.createdAt} originId={`${m.id}:${i}`} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
        <span>{PROVIDER_LABEL[m.provider ?? "mock"]}</span>
        {!!m.toolRuns?.length && (
          <button onClick={() => setShowTools((s) => !s)} aria-expanded={showTools} className="inline-flex min-h-7 items-center gap-1 hover:text-ink-2">
            <Icon name="tools" size={12} /> Tool details
          </button>
        )}
      </div>
      {showTools && m.toolRuns && (
        <ol className="rounded-xl bg-sunken px-3 py-2 font-mono text-[11.5px] text-ink-2">
          {m.toolRuns.map((t, i) => (
            <li key={i}>
              {t.ok ? "✓" : "✗"} {t.name}()
            </li>
          ))}
        </ol>
      )}
      {last && !!m.actions?.length && (
        <div className="flex flex-wrap gap-2 pt-1">
          {m.actions.filter((a) => !(a.kind === "prepare" && recCompleted)).map((a) => (
            <button
              key={a.label}
              onClick={() => onAction(a)}
              className={`min-h-10 rounded-full px-3.5 text-[13.5px] font-semibold ${a.kind === "prepare" ? "bg-brand text-white hover:bg-brand-hover" : "border border-line bg-surface text-ink-2 hover:bg-sunken"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
