import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMeal } from "../data/restaurants";
import { SCENARIOS } from "../data/scenarios";
import { meetsTarget } from "../lib/feasibility";
import { appendEvent, newSessionId, nextOrderNumber, readJSON, saveOrder, STORAGE_KEYS, writeJSON } from "../lib/experiment";
import { computeConfiguration, configurationId, isSelectionSupported } from "../lib/nutrition";
import type { Mode, PlacedOrder, Preferences, ScenarioId, Selections, UserTarget } from "../types";

export interface MealSelection {
  mealId: string;
  selections: Selections;
  /** The optimiser's configuration for this meal, used for "Reset to MacroTable version". */
  recommended?: Selections;
}

export interface Settings {
  baselineShowNutrition: boolean;
}

interface PersistedState {
  scenarioId: ScenarioId;
  target: UserTarget;
  prefs: Preferences;
  selection: MealSelection | null;
  session: { id: string; mode: Mode; startedAt: number } | null;
}

interface AppStateValue extends PersistedState {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  setScenario: (id: ScenarioId) => void;
  setTarget: (patch: Partial<UserTarget>) => void;
  setPrefs: (patch: Partial<Preferences>) => void;
  selectMeal: (sel: MealSelection) => void;
  setOption: (groupId: string, optionId: string) => void;
  resetSelection: () => void;
  startSession: (mode: Mode) => void;
  log: (event: string, extra?: { mealId?: string; configurationId?: string; detail?: Record<string, unknown> }) => void;
  placeOrder: () => PlacedOrder | null;
  resetDemo: () => void;
}

const Ctx = createContext<AppStateValue | null>(null);

function initialFor(id: ScenarioId): PersistedState {
  const s = SCENARIOS[id];
  return { scenarioId: id, target: { ...s.target }, prefs: { ...s.preferences }, selection: null, session: null };
}

function dietToRestrictions(diet: Preferences["diet"]): string[] {
  return diet === "none" ? [] : [diet];
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => readJSON(STORAGE_KEYS.state, initialFor("A")));
  const [settings, setSettingsState] = useState<Settings>(() =>
    readJSON(STORAGE_KEYS.settings, { baselineShowNutrition: true }),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => writeJSON(STORAGE_KEYS.state, state), [state]);
  useEffect(() => writeJSON(STORAGE_KEYS.settings, settings), [settings]);

  const log = useCallback<AppStateValue["log"]>((event, extra) => {
    const s = stateRef.current;
    if (!s.session) return;
    appendEvent({
      timestamp: Date.now(),
      mode: s.session.mode,
      scenario: s.scenarioId,
      sessionId: s.session.id,
      event,
      ...extra,
    });
  }, []);

  const startSession = useCallback((mode: Mode) => {
    const s = stateRef.current;
    if (s.session && s.session.mode === mode) return;
    const session = { id: newSessionId(), mode, startedAt: Date.now() };
    const next = { ...s, session };
    stateRef.current = next;
    setState(next);
    appendEvent({ timestamp: session.startedAt, mode, scenario: s.scenarioId, sessionId: session.id, event: "experiment_started" });
  }, []);

  const placeOrder = useCallback((): PlacedOrder | null => {
    const s = stateRef.current;
    if (!s.selection) return null;
    const found = getMeal(s.selection.mealId);
    if (!found || !isSelectionSupported(found.meal, s.selection.selections)) return null;
    const { nutrition, price } = computeConfiguration(found.meal, s.selection.selections);
    const order: PlacedOrder = {
      orderNumber: nextOrderNumber(),
      placedAt: Date.now(),
      mode: s.session?.mode ?? "macrotable",
      scenario: s.scenarioId,
      restaurantId: found.restaurant.id,
      mealId: found.meal.id,
      selections: s.selection.selections,
      configurationId: configurationId(found.meal, s.selection.selections),
      nutrition,
      price,
      handoff: found.restaurant.integrationLevel === 1,
      sessionId: s.session?.id,
      meetsTarget: meetsTarget(nutrition, s.target),
    };
    saveOrder(order);
    if (s.session) {
      const base = { mode: s.session.mode, scenario: s.scenarioId, sessionId: s.session.id, mealId: order.mealId, configurationId: order.configurationId };
      appendEvent({ ...base, timestamp: order.placedAt, event: "order_confirmed", detail: { orderNumber: order.orderNumber, price, ...nutrition } });
      appendEvent({ ...base, timestamp: order.placedAt, event: "experiment_completed", detail: { durationMs: order.placedAt - s.session.startedAt } });
    }
    const next = { ...s, session: null };
    stateRef.current = next;
    setState(next);
    return order;
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      ...state,
      settings,
      setSettings: (patch) => setSettingsState((p) => ({ ...p, ...patch })),
      setScenario: (id) => setState(initialFor(id)),
      setTarget: (patch) => setState((s) => ({ ...s, target: { ...s.target, ...patch } })),
      setPrefs: (patch) =>
        setState((s) => {
          const prefs = { ...s.prefs, ...patch };
          return { ...s, prefs, target: { ...s.target, dietaryRestrictions: dietToRestrictions(prefs.diet) } };
        }),
      selectMeal: (selection) => setState((s) => ({ ...s, selection })),
      setOption: (groupId, optionId) =>
        setState((s) =>
          s.selection ? { ...s, selection: { ...s.selection, selections: { ...s.selection.selections, [groupId]: optionId } } } : s,
        ),
      resetSelection: () =>
        setState((s) =>
          s.selection?.recommended ? { ...s, selection: { ...s.selection, selections: { ...s.selection.recommended } } } : s,
        ),
      startSession,
      log,
      placeOrder,
      resetDemo: () => setState(initialFor(stateRef.current.scenarioId)),
    }),
    [state, settings, startSession, log, placeOrder],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside provider");
  return v;
}
