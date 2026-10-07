import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { getMeal, setStudyScope, STUDY_RESTAURANT_IDS } from "../data/restaurants";
import { PROXY_URL } from "../agent/gemini";
import { APP_COMMIT, TREATMENT_VERSION } from "../lib/version";
import { demoDayFor, type DemoDay } from "../data/demoDays";
import { SCENARIOS } from "../data/scenarios";
import { meetsTarget } from "../lib/feasibility";
import { getOrders, nextOrderNumber, readJSON, saveOrder, STORAGE_KEYS, writeJSON } from "../lib/experiment";
import { cleanDiscovery, NO_DISCOVERY, type Discovery } from "../lib/discovery";
import { needsTable, normalizeTable, type DiningChoice } from "../lib/fulfillment";
import {
  consumedToday,
  dailyLedger,
  foodEntryId,
  localDay,
  readLedger,
  recordCounterHandoff,
  removeHandoff,
  resetLedger,
  todayEntries,
  type CounterHandoff,
  type DailyLedger,
  type Macros,
  type TodayEntry,
} from "../lib/ledger";
import { computeConfiguration, configurationId, isSelectionSupported } from "../lib/nutrition";
import { resolveExtras, type ExtraLine } from "../lib/extras";
import { canPlaceSelection } from "../lib/orderState";
import { clearSaved } from "../lib/saved";
import { researchStore, type Assignment, type ExperimentLock, type SessionBuild } from "../lib/research";
import type { ExperimentEvent, PlacedOrder, Preferences, ScenarioId, Selections, ServiceMode, UserTarget } from "../types";

export interface MealSelection {
  mealId: string;
  selections: Selections;
  /** The optimiser's configuration for this meal, used for "Reset to MacroTable version". */
  recommended?: Selections;
  /** Agent recommendation card this attempt started from (so that card can show "Order completed"). */
  origin?: string;
  /** Set once this exact attempt has been ordered: the attempt is immutable and can't be submitted again. */
  placedOrderNumber?: string;
  /** Drinks and desserts added to the dish (normal mode only; research trials never have any). */
  extras?: ExtraLine[];
}

export interface Settings {
  baselineShowNutrition: boolean;
  onboardingDone: boolean;
  /**
   * Live AI (Settings → "Use Gemini API"), the ONE normal-mode permission for paid Gemini calls.
   * "auto" = live Gemini via the proxy when configured (offline fallback); "offline" = the offline
   * MacroAgent only, and no Gemini request is ever sent. Default "offline". Research trials don't use
   * this: their engine comes from the participant link (see resolveAgentEngine).
   */
  agentMode: "auto" | "offline";
  /** The user acknowledged that live-agent messages are sent to Google Gemini. */
  agentDisclosureSeen: boolean;
  /** Set when the intro finishes: Home shows the "Turn on Live AI" tip once (phones only, never in a trial). */
  liveAiTipPending?: boolean;
}

interface PersistedState {
  scenarioId: ScenarioId;
  target: UserTarget;
  prefs: Preferences;
  selection: MealSelection | null;
  /** Set only while an assigned research trial is running (after "Begin"). */
  lock: ExperimentLock | null;
  /** Incremented by Reset demo so other session stores (the agent conversation) reset too. */
  demoEpoch?: number;
  /** Normal mode: how the user is eating at a restaurant (Dine in + table, or Pickup), chosen on its QR landing or Review. */
  dining?: DiningChoice | null;
  /** Normal mode: what food the user is looking for (Explore + Find My Next Meal) and Explore's view. */
  discovery?: Discovery;
}

/** Food the user adds to today themselves (normal mode): eaten elsewhere, or a signed correction of the totals. */
export interface FoodEntryInput {
  name: string;
  nutrition: Macros;
  source: "manual-food" | "adjustment";
}

export interface PlaceOrderResult {
  order: PlacedOrder;
  /** True when this order completed a research trial — show the neutral completion screen. */
  research: boolean;
}

interface AppStateValue extends PersistedState {
  /**
   * What's left for today — what every screen, recommendation and the agent use. Outside research:
   * the base target minus today's confirmed meals (lib/ledger). During a trial: the assigned target.
   */
  target: UserTarget;
  /** The daily target the user sets in Preferences (what `setTarget` edits). */
  baseTarget: UserTarget;
  /** Today's ledger (base, consumed, remaining, over). Null during a research trial: trials never use it. */
  ledger: DailyLedger | null;
  /**
   * Normal mode: the scenario's demo day — what was eaten earlier today and the full-day target it implies
   * (scenario target + earlier meals). Display only: never part of the ledger, targets, optimizer, agent or
   * research. Null during a research trial.
   */
  demoDay: DemoDay | null;
  /** Log a confirmed counter hand-off that has no order record (a scanned-menu dish). Ignored in trials. */
  recordCounterHandoff: (h: CounterHandoff) => void;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  /** Ignored while a research trial is locked. */
  setScenario: (id: ScenarioId) => void;
  setTarget: (patch: Partial<UserTarget>) => void;
  setPrefs: (patch: Partial<Preferences>) => void;
  /** Restore the current scenario's canonical targets and preferences. */
  resetTargets: () => void;
  selectMeal: (sel: MealSelection) => void;
  /** Normal mode: the drinks and desserts added to the current dish. Ignored during a research trial or once ordered. */
  setExtras: (extras: ExtraLine[]) => void;
  setOption: (groupId: string, optionId: string) => void;
  resetSelection: () => void;
  beginExperiment: (a: Assignment) => ExperimentLock;
  abortExperiment: () => void;
  /** Research logging — a no-op outside an assigned trial (demo mode never logs). */
  log: (event: string, extra?: Partial<Pick<ExperimentEvent, "mealId" | "configurationId" | "detail">>) => void;
  /**
   * Places the current selection, or `selection` when given (the agent approves a specific draft). Dining in at a
   * table-service restaurant (normal mode) needs `table`; without a valid one nothing is placed.
   */
  /** `opts.extras` (else the selection's own) adds drinks and desserts; ignored during a research trial. */
  placeOrder: (mode?: ServiceMode, selection?: MealSelection, opts?: { table?: string; extras?: ExtraLine[] }) => PlaceOrderResult | null;
  /** Remember the dining choice for a restaurant (normal mode; ignored during a research trial). */
  setDining: (choice: DiningChoice | null) => void;
  /** Normal mode: the food filter and Explore view (always the empty filter during a research trial). */
  discovery: Discovery;
  /** Update the food filter / Explore view (ignored during a research trial). */
  setDiscovery: (patch: Partial<Discovery>) => void;
  /** Today's food log, newest first (empty during a research trial). */
  todayLog: TodayEntry[];
  /** Add food eaten elsewhere / adjust today's totals. Ignored during a research trial. */
  addFood: (entry: FoodEntryInput) => boolean;
  /** Remove an entry the user added. Ignored during a research trial. */
  removeFood: (id: string) => void;
  /** Demo lock: Scenario A, canonical data, no selection, no saved meals, a fresh daily ledger (order history kept). Refused during a research trial. */
  resetDemo: () => boolean;
  /** The engine every agent turn and menu scan must use right now (resolveAgentEngine). */
  agentEngine: AgentEngine;
}

const Ctx = createContext<AppStateValue | null>(null);
const DEFAULT_SETTINGS: Settings = { baselineShowNutrition: true, onboardingDone: false, agentMode: "offline", agentDisclosureSeen: false };

export type AgentEngine = Settings["agentMode"];

/**
 * Settings schema version. v2: Live AI defaults to OFF. Builds before v2 stored agentMode "auto" as a
 * silent default rather than a choice, so a value without v2 is discarded once (back to OFF).
 */
export const SETTINGS_VERSION = 2;

/** Parse stored settings: anything missing, invalid or from before v2 resolves Live AI to OFF. */
export function loadSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Settings | "v", unknown>>;
  return {
    baselineShowNutrition: typeof s.baselineShowNutrition === "boolean" ? s.baselineShowNutrition : DEFAULT_SETTINGS.baselineShowNutrition,
    onboardingDone: s.onboardingDone === true,
    agentMode: s.v === SETTINGS_VERSION && s.agentMode === "auto" ? "auto" : "offline",
    agentDisclosureSeen: s.agentDisclosureSeen === true,
    ...(s.liveAiTipPending === true ? { liveAiTipPending: true } : {}),
  };
}

export const serializeSettings = (s: Settings) => ({ ...s, v: SETTINGS_VERSION });

/** What a trial records about its build when it begins. The agent engine comes from the link only. */
export function sessionBuildFor(a: Assignment, settings: Settings): SessionBuild {
  return {
    treatmentVersion: TREATMENT_VERSION,
    appCommit: APP_COMMIT,
    baselineNutritionVisible: settings.baselineShowNutrition,
    agentMode: a.agentMode, // the researcher's choice in the link, never this device's Live AI setting
    agentProxyConfigured: !!PROXY_URL,
    studyRestaurants: [...STUDY_RESTAURANT_IDS],
  };
}

/**
 * Which agent engine applies. During a research trial: the engine the researcher put in the participant
 * link (a trial in progress from before that field existed keeps the live default it started with).
 * Otherwise: the device's Live AI setting. Never both, so Settings can't change a running trial.
 */
export function resolveAgentEngine(lock: Pick<ExperimentLock, "agentMode"> | null, settings: Pick<Settings, "agentMode">): AgentEngine {
  if (lock) return lock.agentMode === "offline" ? "offline" : "auto";
  return settings.agentMode === "auto" ? "auto" : "offline";
}

function initialFor(id: ScenarioId): PersistedState {
  const s = SCENARIOS[id];
  return { scenarioId: id, target: { ...s.target }, prefs: { ...s.preferences }, selection: null, lock: null };
}

/** Deterministic, human-friendly counter code from the order number (MT1042 → A42). */
export function pickupCodeFor(orderNumber: string): string {
  const n = Number(orderNumber.replace(/\D/g, "")) || 0;
  return `${String.fromCharCode(65 + (Math.floor(n / 100) % 26))}${String(n % 100).padStart(2, "0")}`;
}

function dietToRestrictions(diet: Preferences["diet"]): string[] {
  return diet === "none" ? [] : [diet];
}

/** Today's ledger for a base target, read from the stored confirmations. Never used during a trial. */
export function ledgerFor(base: UserTarget, now = Date.now()): DailyLedger {
  return dailyLedger(base, consumedToday(getOrders(), readLedger(), now));
}

/** Guard against stale/partial persisted state from an older version. */
function loadState(): PersistedState {
  const raw = readJSON<Partial<PersistedState> | null>(STORAGE_KEYS.state, null);
  if (!raw || !raw.scenarioId || !(raw.scenarioId in SCENARIOS) || !raw.target || !raw.prefs) return initialFor("A");
  const lock = raw.lock && researchStore.get(raw.lock.sessionId)?.completedAt === undefined ? raw.lock : null;
  return { ...initialFor(raw.scenarioId), ...raw, lock } as PersistedState;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(readJSON<unknown>(STORAGE_KEYS.settings, null)));
  const stateRef = useRef(state);
  stateRef.current = state;
  // Bumped whenever a confirmation or a reset changes the ledger (and at local midnight).
  const [ledgerTick, bumpLedger] = useReducer((n: number) => n + 1, 0);
  const today = localDay(Date.now());
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const t = setTimeout(bumpLedger, midnight - now.getTime() + 1000);
    return () => clearTimeout(t);
  }, [today]);
  // Frozen study dataset while a trial runs. Set during render (idempotent) so every child
  // that renders in the same pass already sees the right restaurant scope.
  setStudyScope(!!state.lock);

  useEffect(() => writeJSON(STORAGE_KEYS.state, state), [state]);
  useEffect(() => writeJSON(STORAGE_KEYS.settings, serializeSettings(settings)), [settings]);

  const commit = (next: PersistedState) => {
    stateRef.current = next;
    setStudyScope(!!next.lock);
    setState(next);
  };

  const log = useCallback<AppStateValue["log"]>((event, extra) => {
    const lock = stateRef.current.lock;
    if (lock) researchStore.log(lock.sessionId, event, extra);
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const beginExperiment = useCallback((a: Assignment): ExperimentLock => {
    const current = stateRef.current.lock;
    if (current) researchStore.abort(current.sessionId);
    const session = researchStore.start(a, Date.now(), sessionBuildFor(a, settingsRef.current));
    const lock: ExperimentLock = { ...a, sessionId: session.sessionId, startedAt: session.startedAt };
    commit({ ...initialFor(a.scenarioId), lock });
    return lock;
  }, []);

  const abortExperiment = useCallback(() => {
    const s = stateRef.current;
    if (!s.lock) return;
    researchStore.abort(s.lock.sessionId);
    commit({ ...initialFor(s.scenarioId), lock: null });
  }, []);

  const placeOrder = useCallback((mode: ServiceMode = "pickup", explicit?: MealSelection, opts?: { table?: string; extras?: ExtraLine[] }): PlaceOrderResult | null => {
    const s = explicit ? { ...stateRef.current, selection: explicit } : stateRef.current;
    if (!s.selection) return null;
    // Idempotent: an attempt that was already ordered can never be submitted again (double tap,
    // browser back, programmatic call). Changing the configuration starts a new attempt.
    if (!canPlaceSelection(s.selection) || (explicit && !canPlaceSelection(stateRef.current.selection, explicit))) return null;
    const found = getMeal(s.selection.mealId);
    if (!found || !found.meal.nutrition || !isSelectionSupported(found.meal, s.selection.selections)) return null;
    // Study boundary: during a trial only the frozen study restaurants can complete it.
    if (s.lock && !(STUDY_RESTAURANT_IDS as readonly string[]).includes(found.restaurant.id)) return null;
    // Dine in at a table-service restaurant needs a table (normal mode; trials keep the original in-store flow).
    const tableNeeded = needsTable(found.restaurant, mode, !!s.lock);
    const table = tableNeeded ? normalizeTable(opts?.table) : null;
    if (tableNeeded && !table) return null;
    const { nutrition, price } = computeConfiguration(found.meal, s.selection.selections);
    // Drinks and desserts the user added: normal mode only, so a research trial's order never carries any.
    const extras = s.lock ? [] : resolveExtras(found.restaurant.id, opts?.extras ?? s.selection.extras);
    // "Fits" is judged against what was left before this meal (the assigned target during a trial).
    const before = s.lock ? s.target : ledgerFor(s.target).remaining;
    const order: PlacedOrder = {
      orderNumber: nextOrderNumber(),
      placedAt: Date.now(),
      mode: s.lock?.condition ?? "macrotable",
      scenario: s.scenarioId,
      restaurantId: found.restaurant.id,
      mealId: found.meal.id,
      selections: s.selection.selections,
      configurationId: configurationId(found.meal, s.selection.selections),
      nutrition,
      price,
      handoff: found.restaurant.integrationLevel === 1,
      serviceMode: found.restaurant.integrationLevel === 1 ? "handoff" : mode,
      pickupCode: pickupCodeFor(nextOrderNumber()),
      sessionId: s.lock?.sessionId,
      ...(s.selection.origin ? { origin: s.selection.origin } : {}),
      ...(table ? { table } : {}),
      ...(extras.length ? { extras } : {}),
      meetsTarget: meetsTarget(nutrition, before),
    };
    saveOrder(order);
    bumpLedger();
    const placedSelection = { ...s.selection, placedOrderNumber: order.orderNumber };
    if (s.lock) {
      researchStore.complete(s.lock.sessionId, {
        meal: found.meal,
        restaurant: found.restaurant,
        selections: order.selections,
        nutrition,
        price,
        orderNumber: order.orderNumber,
        at: order.placedAt,
      });
      // Keep `selection`: clearing it here makes the review screen's own "no selection" guard
      // redirect after we navigate to the neutral completion screen. Begin resets state anyway.
      commit({ ...s, selection: placedSelection, lock: null });
      return { order, research: true };
    }
    commit({ ...s, selection: placedSelection });
    return { order, research: false };
  }, []);

  const value = useMemo<AppStateValue>(
    () => {
      // Research isolation: a trial sees exactly its assigned target, and no ledger.
      const ledger = state.lock ? null : ledgerFor(state.target);
      return {
        ...state,
        target: ledger ? ledger.remaining : state.target,
        baseTarget: state.target,
        ledger,
        recordCounterHandoff: (h) => {
          if (stateRef.current.lock) return;
          if (recordCounterHandoff(h)) bumpLedger();
        },
        demoDay: state.lock ? null : demoDayFor(state.scenarioId, state.target),
        todayLog: state.lock ? [] : todayEntries(getOrders(), readLedger()),
        addFood: (e) => {
          if (stateRef.current.lock) return false;
          const at = Date.now();
          const ok = recordCounterHandoff({ id: foodEntryId(at), at, nutrition: e.nutrition, name: e.name, source: e.source });
          if (ok) bumpLedger();
          return ok;
        },
        removeFood: (id) => {
          if (stateRef.current.lock) return;
          if (removeHandoff(id)) bumpLedger();
        },
        settings,
        setSettings: (patch) => setSettingsState((p) => ({ ...p, ...patch })),
        setScenario: (id) => {
          if (stateRef.current.lock) return;
          commit(initialFor(id));
        },
        setTarget: (patch) => setState((s) => ({ ...s, target: { ...s.target, ...patch } })),
        setDining: (choice) => {
          if (stateRef.current.lock) return;
          commit({ ...stateRef.current, dining: choice });
        },
        // Research isolation: trials always see the empty filter, and can't set one.
        discovery: state.lock ? NO_DISCOVERY : cleanDiscovery(state.discovery),
        setDiscovery: (patch) => {
          if (stateRef.current.lock) return;
          commit({ ...stateRef.current, discovery: { ...cleanDiscovery(stateRef.current.discovery), ...patch } });
        },
        setPrefs: (patch) =>
          setState((s) => {
            const prefs = { ...s.prefs, ...patch };
            return { ...s, prefs, target: { ...s.target, dietaryRestrictions: dietToRestrictions(prefs.diet) } };
          }),
        resetTargets: () =>
          setState((s) => ({ ...s, target: { ...SCENARIOS[s.scenarioId].target }, prefs: { ...SCENARIOS[s.scenarioId].preferences } })),
        selectMeal: (selection) => setState((s) => ({ ...s, selection })),
        setExtras: (lines) => {
          const s = stateRef.current;
          if (s.lock || !s.selection || s.selection.placedOrderNumber) return;
          const r = getMeal(s.selection.mealId)?.restaurant;
          const clean = r ? resolveExtras(r.id, lines).map((x) => ({ id: x.id, qty: x.qty })) : [];
          commit({ ...s, selection: { ...s.selection, extras: clean } });
        },
        setOption: (groupId, optionId) =>
          setState((s) =>
            s.selection
              ? { ...s, selection: { ...s.selection, selections: { ...s.selection.selections, [groupId]: optionId }, placedOrderNumber: undefined } }
              : s,
          ),
        resetSelection: () =>
          setState((s) =>
            s.selection?.recommended ? { ...s, selection: { ...s.selection, selections: { ...s.selection.recommended }, placedOrderNumber: undefined } } : s,
          ),
        beginExperiment,
        abortExperiment,
        log,
        placeOrder,
        resetDemo: () => {
          if (stateRef.current.lock) return false;
          clearSaved();
          resetLedger();
          bumpLedger();
          commit({ ...initialFor("A"), demoEpoch: (stateRef.current.demoEpoch ?? 0) + 1 });
          return true;
        },
        agentEngine: resolveAgentEngine(state.lock, settings),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, settings, beginExperiment, abortExperiment, log, placeOrder, ledgerTick, today],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside provider");
  return v;
}

/** True during a research trial: shared screens keep their frozen trial wording. False outside the provider. */
export function useInTrial(): boolean {
  return !!useContext(Ctx)?.lock;
}

/** Wipe only the app's UI state (never research data) — used by the error boundary. */
export function hardResetUiState(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.state);
  } catch {
    /* ignore */
  }
}
