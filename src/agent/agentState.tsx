import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMeal } from "../data/restaurants";
import { getOrders } from "../lib/experiment";
import type { ExtraLine } from "../lib/extras";
import { scanLedgerId } from "../lib/ledger";
import { completedOrderFor } from "../lib/orderState";
import { useAppState } from "../state/AppState";
import type { PlacedOrder, ServiceMode } from "../types";
import { checkProxyHealth, PROXY_URL } from "./gemini";
import { liveAvailable, msgId, runAgentTurn, runContextTurn, type TurnOutcome } from "./orchestrator";
import type { ToolContext } from "./tools";
import { UNDERSTANDING } from "./steps";
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
  /** Current real activity while busy (model call / tool name / verify). */
  progress: string | null;
  liveStatus: LiveStatus;
  send: (text: string, source?: "typed" | "chip") => Promise<void>;
  openContext: (kind: "restaurant" | "meal" | "scan", id?: string, entry?: string) => void;
  prepare: (mode: ServiceMode | "handoff") => void;
  /** `table`: required when dining in at a table-service restaurant (normal mode). */
  /** `extras`: drinks and desserts the user added on the card (normal mode; ignored during a research trial). */
  approveDraft: (draftId: string, table?: string, extras?: ExtraLine[]) => { order: PlacedOrder; research: boolean } | null;
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
  const [progress, setProgress] = useState<string | null>(null);
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
  const sessionKey = `${app.lock?.sessionId ?? "demo"}|${app.scenarioId}|${app.demoEpoch ?? 0}`;
  const lastKey = useRef(sessionKey);
  useEffect(() => {
    if (lastKey.current !== sessionKey) {
      lastKey.current = sessionKey;
      commit(empty());
    }
  }, [sessionKey]);

  useEffect(() => {
    let live = true;
    // Live AI OFF (or an offline trial): no proxy traffic at all, not even a health check.
    if (app.agentEngine === "offline") return void setLiveStatus("offline-mode");
    if (!PROXY_URL) return void setLiveStatus("not-configured");
    setLiveStatus("checking");
    void checkProxyHealth().then((ok) => live && setLiveStatus(ok ? "live" : "unreachable"));
    return () => {
      live = false;
    };
  }, [app.agentEngine]);

  function commit(next: AgentSessionState) {
    ref.current = next;
    setState(next);
  }

  const ctxFor = (): ToolContext => ({ target: appRef.current.target, prefs: appRef.current.prefs, state: structuredClone(ref.current), inTrial: !!appRef.current.lock });

  const record = (o: TurnOutcome, extraMessages: AgentMessage[] = []) => {
    const { log } = appRef.current;
    for (const r of o.toolRuns) log("agent_tool_called", { detail: { name: r.name, ok: r.ok } });
    log("agent_reply", {
      detail: {
        provider: o.message.provider,
        model: o.message.model,
        /** Engine identity: gemini + modelFallback=false → primary; true → secondary; mock → offline. */
        modelFallback: !!o.message.modelFallback,
        fallback: !!o.message.fallbackReason,
        latencyMs: o.latencyMs,
        tools: o.toolRuns.map((r) => r.name),
      },
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
      const mode = appRef.current.agentEngine === "offline" || liveStatus === "unreachable" ? "offline" : "auto";
      setProgress(mode === "auto" ? UNDERSTANDING : null);
      const o = await runAgentTurn(trimmed, ctx, ref.current.providerHistory, mode, { onProgress: setProgress });
      const history = o.historyAppend ? [...ref.current.providerHistory, o.historyAppend].slice(-MAX_HISTORY_TURNS) : ref.current.providerHistory;
      commit({ ...ctx.state, messages: [...ref.current.messages, o.message], providerHistory: history });
      record(o);
    } finally {
      setBusy(false);
      setProgress(null);
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
      progress,
      liveStatus,
      send,
      openContext: (kind, id, entry) => {
        appRef.current.log("agent_opened", { detail: { entry: entry ?? kind, context: kind, id } });
        runContext(kind, id);
      },
      prepare: (mode) => {
        // Never draft a second order for a recommendation that was already ordered in this session.
        const rec = ref.current.currentRecommendation;
        const since = ref.current.messages.find((m) => m.cards?.some((c) => c.kind === "recommendation" && c.rec.mealId === rec?.mealId))?.createdAt ?? 0;
        if (rec && completedOrderFor(rec, { since }, getOrders())) return;
        appRef.current.log("order_prepared", { detail: { mode } });
        runContext("prepare", mode === "handoff" ? "pickup" : mode);
      },
      approveDraft: (draftId, table, extras) => {
        const d = ref.current.orderDrafts.find((x) => x.id === draftId);
        if (!d || d.status !== "awaiting-approval") return null;
        // Already ordered through another path after this draft was prepared → no duplicate.
        if (completedOrderFor(d, { since: d.createdAt ?? Number.MAX_SAFE_INTEGER }, getOrders())) return null;
        const markDone = (patch: Partial<typeof d>) =>
          commit({ ...ref.current, orderDrafts: ref.current.orderDrafts.map((x) => (x.id === draftId ? { ...x, status: "approved", ...patch } : x)) });
        if (!getMeal(d.mealId)) {
          markDone({}); // scanned-menu dish: nothing to send — the user orders at the counter
          // …but they confirmed the meal, so it counts toward today (normal mode only; once per draft).
          const scan = ref.current.scannedMenu;
          appRef.current.recordCounterHandoff({
            id: scan ? scanLedgerId(scan.scanId, d.mealId) : d.id, // same id as "Add to today" for this dish: never counted twice
            at: Date.now(),
            nutrition: d.nutrition,
            name: d.mealName,
            provenance: d.provenance,
            source: "counter-handoff",
          });
          return null;
        }
        const selection = { mealId: d.mealId, selections: d.selections, recommended: d.selections };
        appRef.current.selectMeal(selection);
        // Log before placing: placing an order completes (and unlocks) a research trial.
        appRef.current.log("order_approved_in_agent", { mealId: d.mealId, detail: { mode: d.mode } });
        const result = appRef.current.placeOrder(d.mode === "in-store" ? "in-store" : "pickup", selection, { table, ...(extras?.length ? { extras } : {}) });
        if (!result) return null;
        markDone({ orderNumber: result.order.orderNumber, pickupCode: result.order.pickupCode });
        return result;
      },
      cancelDraft: (draftId) =>
        commit({ ...ref.current, orderDrafts: ref.current.orderDrafts.map((x) => (x.id === draftId ? { ...x, status: "cancelled" } : x)) }),
      setScannedMenu: (m) => {
        const next = (id: string | null | undefined) => (m ? "scan" : id === "scan" ? null : (id ?? null));
        commit({ ...ref.current, scannedMenu: m, currentRestaurantId: next(ref.current.currentRestaurantId), referenceRestaurantId: next(ref.current.referenceRestaurantId) });
      },
      setCurrentRestaurant: (id) => commit({ ...ref.current, currentRestaurantId: id, referenceRestaurantId: id }),
      clear: () => commit({ ...empty(), scannedMenu: ref.current.scannedMenu, currentRestaurantId: ref.current.currentRestaurantId, referenceRestaurantId: ref.current.referenceRestaurantId }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, busy, progress, liveStatus, send],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAgent(): AgentApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAgent outside AgentStateProvider");
  return v;
}

export { liveAvailable };
