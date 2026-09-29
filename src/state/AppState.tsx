import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMeal, setStudyScope, STUDY_RESTAURANT_IDS } from "../data/restaurants";
import { PROXY_URL } from "../agent/gemini";
import { APP_COMMIT, TREATMENT_VERSION } from "../lib/version";
import { SCENARIOS } from "../data/scenarios";
import { meetsTarget } from "../lib/feasibility";
import { nextOrderNumber, readJSON, saveOrder, STORAGE_KEYS, writeJSON } from "../lib/experiment";
import { computeConfiguration, configurationId, isSelectionSupported } from "../lib/nutrition";
import { canPlaceSelection } from "../lib/orderState";
import { clearSaved } from "../lib/saved";
import { researchStore, type Assignment, type ExperimentLock } from "../lib/research";
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
}

export interface Settings {
  baselineShowNutrition: boolean;
  onboardingDone: boolean;
  /** "auto" = live model via proxy when configured (offline fallback); "offline" = deterministic demo agent only. */
  agentMode: "auto" | "offline";
  /** The user acknowledged that live-agent messages are sent to Google Gemini. */
  agentDisclosureSeen: boolean;
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
}

export interface PlaceOrderResult {
  order: PlacedOrder;
  /** True when this order completed a research trial — show the neutral completion screen. */
  research: boolean;
}

interface AppStateValue extends PersistedState {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  /** Ignored while a research trial is locked. */
  setScenario: (id: ScenarioId) => void;
  setTarget: (patch: Partial<UserTarget>) => void;
  setPrefs: (patch: Partial<Preferences>) => void;
  /** Restore the current scenario's canonical targets and preferences. */
  resetTargets: () => void;
  selectMeal: (sel: MealSelection) => void;
  setOption: (groupId: string, optionId: string) => void;
  resetSelection: () => void;
  beginExperiment: (a: Assignment) => ExperimentLock;
  abortExperiment: () => void;
  /** Research logging — a no-op outside an assigned trial (demo mode never logs). */
  log: (event: string, extra?: Partial<Pick<ExperimentEvent, "mealId" | "configurationId" | "detail">>) => void;
  /** Places the current selection, or `selection` when given (the agent approves a specific draft). */
  placeOrder: (mode?: ServiceMode, selection?: MealSelection) => PlaceOrderResult | null;
  /** Demo lock: Scenario A, canonical data, no selection, no saved meals. Refused during a research trial. */
  resetDemo: () => boolean;
}

const Ctx = createContext<AppStateValue | null>(null);
const DEFAULT_SETTINGS: Settings = { baselineShowNutrition: true, onboardingDone: false, agentMode: "auto", agentDisclosureSeen: false };

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

/** Guard against stale/partial persisted state from an older version. */
function loadState(): PersistedState {
  const raw = readJSON<Partial<PersistedState> | null>(STORAGE_KEYS.state, null);
  if (!raw || !raw.scenarioId || !(raw.scenarioId in SCENARIOS) || !raw.target || !raw.prefs) return initialFor("A");
  const lock = raw.lock && researchStore.get(raw.lock.sessionId)?.completedAt === undefined ? raw.lock : null;
  return { ...initialFor(raw.scenarioId), ...raw, lock } as PersistedState;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);
  const [settings, setSettingsState] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readJSON<Partial<Settings>>(STORAGE_KEYS.settings, {}),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  // Frozen study dataset while a trial runs. Set during render (idempotent) so every child
  // that renders in the same pass already sees the right restaurant scope.
  setStudyScope(!!state.lock);

  useEffect(() => writeJSON(STORAGE_KEYS.state, state), [state]);
  useEffect(() => writeJSON(STORAGE_KEYS.settings, settings), [settings]);

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
    const st = settingsRef.current;
    const session = researchStore.start(a, Date.now(), {
      treatmentVersion: TREATMENT_VERSION,
      appCommit: APP_COMMIT,
      baselineNutritionVisible: st.baselineShowNutrition,
      agentMode: st.agentMode,
      agentProxyConfigured: !!PROXY_URL,
      studyRestaurants: [...STUDY_RESTAURANT_IDS],
    });
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

  const placeOrder = useCallback((mode: ServiceMode = "pickup", explicit?: MealSelection): PlaceOrderResult | null => {
    const s = explicit ? { ...stateRef.current, selection: explicit } : stateRef.current;
    if (!s.selection) return null;
    // Idempotent: an attempt that was already ordered can never be submitted again (double tap,
    // browser back, programmatic call). Changing the configuration starts a new attempt.
    if (!canPlaceSelection(s.selection) || (explicit && !canPlaceSelection(stateRef.current.selection, explicit))) return null;
    const found = getMeal(s.selection.mealId);
    if (!found || !found.meal.nutrition || !isSelectionSupported(found.meal, s.selection.selections)) return null;
    // Study boundary: during a trial only the frozen study restaurants can complete it.
    if (s.lock && !(STUDY_RESTAURANT_IDS as readonly string[]).includes(found.restaurant.id)) return null;
    const { nutrition, price } = computeConfiguration(found.meal, s.selection.selections);
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
      meetsTarget: meetsTarget(nutrition, s.target),
    };
    saveOrder(order);
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
    () => ({
      ...state,
      settings,
      setSettings: (patch) => setSettingsState((p) => ({ ...p, ...patch })),
      setScenario: (id) => {
        if (stateRef.current.lock) return;
        commit(initialFor(id));
      },
      setTarget: (patch) => setState((s) => ({ ...s, target: { ...s.target, ...patch } })),
      setPrefs: (patch) =>
        setState((s) => {
          const prefs = { ...s.prefs, ...patch };
          return { ...s, prefs, target: { ...s.target, dietaryRestrictions: dietToRestrictions(prefs.diet) } };
        }),
      resetTargets: () =>
        setState((s) => ({ ...s, target: { ...SCENARIOS[s.scenarioId].target }, prefs: { ...SCENARIOS[s.scenarioId].preferences } })),
      selectMeal: (selection) => setState((s) => ({ ...s, selection })),
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
        commit({ ...initialFor("A"), demoEpoch: (stateRef.current.demoEpoch ?? 0) + 1 });
        return true;
      },
    }),
    [state, settings, beginExperiment, abortExperiment, log, placeOrder],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside provider");
  return v;
}

/** Wipe only the app's UI state (never research data) — used by the error boundary. */
export function hardResetUiState(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.state);
  } catch {
    /* ignore */
  }
}
