import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMeal } from "../data/restaurants";
import { useAppState } from "../state/AppState";
import type { PlacedOrder, ServiceMode } from "../types";
import { checkProxyHealth, PROXY_URL } from "./gemini";
import { liveAvailable, msgId, runAgentTurn, runContextTurn, type TurnOutcome } from "./orchestrator";
import type { ToolContext } from "./tools";
import type { AgentMessage, AgentSessionState, ScannedMenu } from "./types";

/*
 * Persistent MacroAgent session (sessionStorage — current browser session only).
 * Knows the restaurant you're at (QR / Explore / restaurant page), your scanned
 * menu (text only — photos stay in IndexedDB), the current recommendation and
 * order drafts. Reset whenever a research trial begins or the demo is reset.
 */

const KEY = "macrotable.agent.v1";
const MAX_HISTORY_TURNS = 6;

const empty = (): AgentSessionState => ({ messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] });

function load(): AgentSessionState {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? { ...empty(), ...(JSON.parse(raw) as AgentSessionState) } : empty();
  } catch {
    return empty();
  }
}

export type LiveStatus = "checking" | "live" | "unreachable" | "not-configured" | "offline-mode";

interface AgentApi {
  state: AgentSessionState;
  busy: boolean;
  liveStatus: LiveStatus;
  send: (text: string, source?: "typed" | "chip") => Promise<void>;
  openContext: (kind: "restaurant" | "meal" | "scan", id?: string, entry?: string) => void;
  prepare: (mode: ServiceMode | "handoff") => void;
  approveDraft: (draftId: string) => { order: PlacedOrder; research: boolean } | null;
  cancelDraft: (draftId: string) => void;
  setScannedMenu: (m: ScannedMenu | null) => void;
  setCurrentRestaurant: (id: string | null) => void;
  clear: () => void;
}

const Ctx = createContext<AgentApi | null>(null);

export function AgentStateProvider({ children }: { children: ReactNode }) {
  const app = useAppState();
  const [state, setState] = useState<AgentSessionState>(load);
  const [busy, setBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("checking");
  const ref = useRef(state);
  ref.current = state;
  const appRef = useRef(app);
  appRef.current = app;

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  // Fresh agent session per research trial, and after a demo reset / scenario switch.
  const sessionKey = `${app.lock?.sessionId ?? "demo"}|${app.scenarioId}`;
  const lastKey = useRef(sessionKey);
  useEffect(() => {
    if (lastKey.current !== sessionKey) {
      lastKey.current = sessionKey;
      commit(empty());
    }
  }, [sessionKey]);

  useEffect(() => {
    let live = true;
    if (app.settings.agentMode === "offline") return void setLiveStatus("offline-mode");
    if (!PROXY_URL) return void setLiveStatus("not-configured");
    setLiveStatus("checking");
    void checkProxyHealth().then((ok) => live && setLiveStatus(ok ? "live" : "unreachable"));
    return () => {
      live = false;
    };
  }, [app.settings.agentMode]);

  function commit(next: AgentSessionState) {
    ref.current = next;
    setState(next);
  }

  const ctxFor = (): ToolContext => ({ target: appRef.current.target, prefs: appRef.current.prefs, state: structuredClone(ref.current) });

  const record = (o: TurnOutcome, extraMessages: AgentMessage[] = []) => {
    const { log } = appRef.current;
    for (const r of o.toolRuns) log("agent_tool_called", { detail: { name: r.name, ok: r.ok } });
    log("agent_reply", {
      detail: { provider: o.message.provider, model: o.message.model, fallback: !!o.message.fallbackReason, latencyMs: o.latencyMs, tools: o.toolRuns.map((r) => r.name) },
    });
    if (o.message.fallbackReason) log("agent_fallback", { detail: { reason: o.message.fallbackReason } });
    void extraMessages;
  };

  const send = useCallback(async (text: string, source: "typed" | "chip" = "typed") => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: AgentMessage = { id: msgId(), role: "user", text: trimmed, createdAt: Date.now() };
    commit({ ...ref.current, messages: [...ref.current.messages, userMsg] });
    // Research: never the raw text — only its length and how it was entered.
    appRef.current.log("agent_message_sent", { detail: { chars: trimmed.length, source } });
    setBusy(true);
    try {
      const ctx = ctxFor();
      const mode = appRef.current.settings.agentMode === "offline" || liveStatus === "unreachable" ? "offline" : "auto";
      const o = await runAgentTurn(trimmed, ctx, ref.current.providerHistory, mode);
      const history = o.historyAppend ? [...ref.current.providerHistory, o.historyAppend].slice(-MAX_HISTORY_TURNS) : ref.current.providerHistory;
      commit({ ...ctx.state, messages: [...ref.current.messages, o.message], providerHistory: history });
      record(o);
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, liveStatus]);

  const runContext = (kind: "restaurant" | "meal" | "scan" | "prepare", arg?: string) => {
    const ctx = ctxFor();
    const o = runContextTurn(kind, ctx, arg);
    commit({ ...ctx.state, messages: [...ref.current.messages, o.message] });
    record(o);
    return ctx;
  };

  const api: AgentApi = useMemo(
    () => ({
      state,
      busy,
      liveStatus,
      send,
      openContext: (kind, id, entry) => {
        appRef.current.log("agent_opened", { detail: { entry: entry ?? kind, context: kind, id } });
        runContext(kind, id);
      },
      prepare: (mode) => {
        appRef.current.log("order_prepared", { detail: { mode } });
        runContext("prepare", mode === "handoff" ? "pickup" : mode);
      },
      approveDraft: (draftId) => {
        const d = ref.current.orderDrafts.find((x) => x.id === draftId);
        if (!d || d.status !== "awaiting-approval") return null;
        const markDone = (patch: Partial<typeof d>) =>
          commit({ ...ref.current, orderDrafts: ref.current.orderDrafts.map((x) => (x.id === draftId ? { ...x, status: "approved", ...patch } : x)) });
        if (!getMeal(d.mealId)) {
          markDone({}); // scanned-menu dish: nothing to send — the user orders at the counter
          return null;
        }
        const selection = { mealId: d.mealId, selections: d.selections, recommended: d.selections };
        appRef.current.selectMeal(selection);
        const result = appRef.current.placeOrder(d.mode === "in-store" ? "in-store" : "pickup", selection);
        if (!result) return null;
        appRef.current.log("order_approved_in_agent", { mealId: d.mealId, detail: { mode: d.mode } });
        markDone({ orderNumber: result.order.orderNumber, pickupCode: result.order.pickupCode });
        return result;
      },
      cancelDraft: (draftId) =>
        commit({ ...ref.current, orderDrafts: ref.current.orderDrafts.map((x) => (x.id === draftId ? { ...x, status: "cancelled" } : x)) }),
      setScannedMenu: (m) => commit({ ...ref.current, scannedMenu: m, currentRestaurantId: m ? "scan" : ref.current.currentRestaurantId === "scan" ? null : ref.current.currentRestaurantId }),
      setCurrentRestaurant: (id) => commit({ ...ref.current, currentRestaurantId: id }),
      clear: () => commit({ ...empty(), scannedMenu: ref.current.scannedMenu, currentRestaurantId: ref.current.currentRestaurantId }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, busy, liveStatus, send],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAgent(): AgentApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAgent outside AgentStateProvider");
  return v;
}

export { liveAvailable };
