import { getMeal } from "../data/restaurants";
import { isScenarioId, SCENARIOS } from "../data/scenarios";
import type {
  ExperimentEvent,
  IntegrationLevel,
  Meal,
  Mode,
  Nutrition,
  Provenance,
  Restaurant,
  ScenarioId,
  Selections,
  UserTarget,
} from "../types";
import { CALORIE_TOLERANCE, mealExclusion, withinBudget } from "./feasibility";
import { changesFromDefault, describeChange } from "./nutrition";
import { APP_COMMIT, TREATMENT_VERSION } from "./version";

/*
 * Anonymous participant sessions for the baseline-vs-MacroTable study.
 * Browser-local only (localStorage, with an in-memory fallback): no names,
 * emails, phone or student numbers, and nothing leaves the device unless the
 * researcher exports it.
 */

export const RESEARCH_SCHEMA = "macrotable.research.v2";
const SESSIONS_KEY = "macrotable.sessions.v2";

export interface SessionOutcome {
  /** Signed: order kcal − target kcal. */
  calorieDeviation: number;
  caloriesWithinRange: boolean;
  proteinMet: boolean;
  withinBudget: boolean;
  dietOk: boolean;
  /** Hard constraints satisfied: within budget and matching the assigned diet. */
  feasibleOrder: boolean;
  /** Feasible AND calories ±10% AND protein ≥ target — the same rule the app uses. */
  targetRange: boolean;
}

/**
 * What produced this session — recorded once, when the trial begins. Sessions from before
 * V3.5 have no `build` and must be treated as an unknown/older treatment, never as V3.5.
 */
export interface SessionBuild {
  treatmentVersion: string;
  appCommit: string;
  /** Device setting that changes what the baseline shows (/research → Demo settings). */
  baselineNutritionVisible: boolean;
  /** Device setting: "offline" forces the offline demo agent for the whole trial. */
  agentMode: "auto" | "offline";
  /** Whether this build can reach a live model at all (VITE_AGENT_PROXY_URL set). */
  agentProxyConfigured: boolean;
  /** Restaurant ids the participant could order from (the frozen study dataset). */
  studyRestaurants: string[];
}

export interface ParticipantSession {
  participantId: string;
  sessionId: string;
  condition: Mode;
  scenarioId: ScenarioId;
  /** The assigned scenario target — outcomes are always scored against this. */
  target: UserTarget;
  startedAt: number;
  /** V3.5+: build / treatment identity (absent on older sessions). */
  build?: SessionBuild;
  completedAt?: number;
  abortedAt?: number;
  selectedMealId?: string;
  selectedRestaurantId?: string;
  selectedModifiers?: Selections;
  modifierLabels?: string[];
  finalNutrition?: Nutrition;
  finalPrice?: number;
  provenance?: Provenance;
  integrationLevel?: IntegrationLevel;
  handoff?: boolean;
  orderNumber?: string;
  completionTimeMs?: number;
  outcome?: SessionOutcome;
  events: ExperimentEvent[];
}

export type SessionStatus = "completed" | "aborted" | "in-progress";
export const sessionStatus = (s: ParticipantSession): SessionStatus =>
  s.completedAt ? "completed" : s.abortedAt ? "aborted" : "in-progress";

// ─── Assignment links ─────────────────────────────────────────────────────

export interface Assignment {
  participantId: string;
  condition: Mode;
  scenarioId: ScenarioId;
}

const PARTICIPANT_RE = /^[A-Za-z]{1,4}\d{1,5}$/;

export function parseAssignment(params: URLSearchParams): { ok: true; value: Assignment } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const participant = (params.get("participant") ?? "").trim();
  const condition = (params.get("condition") ?? "").trim().toLowerCase();
  const scenario = (params.get("scenario") ?? "").trim().toUpperCase();
  if (!participant) errors.push("Missing participant code.");
  else if (!PARTICIPANT_RE.test(participant))
    errors.push("Participant code must be anonymous, like P001 — never a name, email, phone or student number.");
  if (condition !== "baseline" && condition !== "macrotable") errors.push('Condition must be "baseline" or "macrotable".');
  if (!isScenarioId(scenario)) errors.push("Scenario must be A, B, C or D.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { participantId: participant.toUpperCase(), condition: condition as Mode, scenarioId: scenario as ScenarioId } };
}

export function assignmentPath(a: Assignment): string {
  return `experiment?participant=${encodeURIComponent(a.participantId)}&condition=${a.condition}&scenario=${a.scenarioId}`;
}

export function nextParticipantId(sessions: ParticipantSession[]): string {
  const nums = sessions.map((s) => /^P(\d+)$/.exec(s.participantId)?.[1]).filter(Boolean).map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `P${String(next).padStart(3, "0")}`;
}

/** Study protocol §9 — the single neutral instruction shown in both conditions. */
export const PARTICIPANT_INSTRUCTION =
  "Imagine these are the nutritional targets you have remaining for dinner today. Choose a restaurant meal you would actually be willing to order while staying within the stated constraints. You may use the options shown in the app. Complete the task when you are satisfied with your choice.";

/** Scenario constraints beyond kcal/protein/budget, stated identically to both conditions. */
export function taskConstraints(scenarioId: ScenarioId): string[] {
  const p = SCENARIOS[scenarioId].preferences;
  const out: string[] = [];
  if (p.diet !== "none") out.push(p.diet === "vegan" ? "Vegan" : "Vegetarian");
  if (p.lowerFat) out.push("Preference: lower fat");
  if (p.noSpicy) out.push("No spicy food");
  return out;
}

// ─── Condition lock ───────────────────────────────────────────────────────

export interface ExperimentLock extends Assignment {
  sessionId: string;
  startedAt: number;
}

export const conditionHome = (c: Mode) => (c === "baseline" ? "/baseline/browse" : "/macrotable");

/**
 * While a trial runs, the participant can't wander into the other condition
 * (or demo tooling). Returns the path to redirect to, or null if allowed.
 */
export function lockedRedirect(lock: ExperimentLock | null, pathname: string): string | null {
  if (!lock) return null;
  const always = ["/experiment", "/research", "/privacy"];
  if (always.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  const inTreatment = pathname.startsWith("/macrotable") || pathname.startsWith("/r/");
  const inBaseline = pathname.startsWith("/baseline");
  if (lock.condition === "baseline" && inBaseline && pathname !== "/baseline") return null;
  if (lock.condition === "macrotable" && inTreatment) return null;
  return conditionHome(lock.condition);
}

// ─── Store ────────────────────────────────────────────────────────────────

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function safeLocalStorage(): KV | null {
  try {
    const k = "__macrotable_probe__";
    localStorage.setItem(k, k);
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

let idCounter = 0;
export function newSessionId(now = Date.now()): string {
  idCounter = (idCounter + 1) % 1000;
  return `s-${now.toString(36)}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function scoreOutcome(target: UserTarget, meal: Meal, nutrition: Nutrition, price: number, diet: Assignment["scenarioId"]): SessionOutcome {
  const prefs = SCENARIOS[diet].preferences;
  const dietOk = mealExclusion(meal, { ...prefs, noSpicy: false }) !== "diet";
  const inBudget = withinBudget(price, target);
  const caloriesWithinRange = Math.abs(nutrition.calories - target.calories) <= target.calories * CALORIE_TOLERANCE;
  const proteinMet = nutrition.protein >= target.protein;
  const feasibleOrder = inBudget && dietOk;
  return {
    calorieDeviation: nutrition.calories - target.calories,
    caloriesWithinRange,
    proteinMet,
    withinBudget: inBudget,
    dietOk,
    feasibleOrder,
    targetRange: feasibleOrder && caloriesWithinRange && proteinMet,
  };
}

export interface CompletionInput {
  meal: Meal;
  restaurant: Restaurant;
  selections: Selections;
  nutrition: Nutrition;
  price: number;
  orderNumber?: string;
  at?: number;
}

export function createResearchStore(kv: KV | null) {
  let memory: ParticipantSession[] = [];

  const read = (): ParticipantSession[] => {
    if (!kv) return memory;
    try {
      const raw = kv.getItem(SESSIONS_KEY);
      return raw ? (JSON.parse(raw) as ParticipantSession[]) : memory;
    } catch {
      return memory;
    }
  };
  const write = (sessions: ParticipantSession[]) => {
    memory = sessions;
    if (!kv) return;
    try {
      kv.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
      /* quota / blocked — keep the in-memory copy */
    }
  };
  const update = (sessionId: string, fn: (s: ParticipantSession) => ParticipantSession) => {
    const all = read();
    const i = all.findIndex((s) => s.sessionId === sessionId);
    if (i < 0) return undefined;
    all[i] = fn(all[i]);
    write(all);
    return all[i];
  };
  const event = (s: ParticipantSession, name: string, at: number, extra?: Partial<ExperimentEvent>): ExperimentEvent => ({
    timestamp: at,
    mode: s.condition,
    scenario: s.scenarioId,
    sessionId: s.sessionId,
    event: name,
    ...extra,
  });

  return {
    list: read,
    get: (id: string) => read().find((s) => s.sessionId === id),

    start(a: Assignment, at = Date.now(), build?: SessionBuild): ParticipantSession {
      const base: ParticipantSession = {
        participantId: a.participantId,
        sessionId: newSessionId(at),
        condition: a.condition,
        scenarioId: a.scenarioId,
        target: { ...SCENARIOS[a.scenarioId].target },
        startedAt: at,
        ...(build ? { build } : {}),
        events: [],
      };
      const s = { ...base, events: [event(base, "experiment_started", at)] };
      write([...read(), s]);
      return s;
    },

    log(sessionId: string, name: string, extra?: Partial<ExperimentEvent>, at = Date.now()) {
      return update(sessionId, (s) => (s.completedAt || s.abortedAt ? s : { ...s, events: [...s.events, event(s, name, at, extra)] }));
    },

    complete(sessionId: string, input: CompletionInput) {
      const at = input.at ?? Date.now();
      return update(sessionId, (s) => {
        if (s.completedAt || s.abortedAt) return s;
        const outcome = scoreOutcome(s.target, input.meal, input.nutrition, input.price, s.scenarioId);
        const detail = { orderNumber: input.orderNumber, price: input.price, ...input.nutrition };
        return {
          ...s,
          completedAt: at,
          completionTimeMs: at - s.startedAt,
          selectedMealId: input.meal.id,
          selectedRestaurantId: input.restaurant.id,
          selectedModifiers: input.selections,
          modifierLabels: changesFromDefault(input.meal, input.selections).map(describeChange),
          finalNutrition: input.nutrition,
          finalPrice: input.price,
          provenance: input.meal.provenance,
          integrationLevel: input.restaurant.integrationLevel,
          handoff: input.restaurant.integrationLevel === 1,
          orderNumber: input.orderNumber,
          outcome,
          events: [
            ...s.events,
            event(s, "order_confirmed", at, { mealId: input.meal.id, detail }),
            event(s, "experiment_completed", at, { detail: { completionTimeMs: at - s.startedAt } }),
          ],
        };
      });
    },

    abort(sessionId: string, at = Date.now()) {
      return update(sessionId, (s) =>
        s.completedAt || s.abortedAt ? s : { ...s, abortedAt: at, events: [...s.events, event(s, "experiment_aborted", at)] },
      );
    },

    clear() {
      memory = [];
      try {
        kv?.removeItem(SESSIONS_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

export type ResearchStore = ReturnType<typeof createResearchStore>;

// ─── Analysis helpers (descriptive only — no significance testing) ────────

const count = (s: ParticipantSession, name: string) => s.events.filter((e) => e.event === name).length;

export function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function mean(values: number[]): number | undefined {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

export interface ConditionSummary {
  condition: Mode;
  started: number;
  completed: number;
  medianTimeMs?: number;
  meanAbsCalorieDeviation?: number;
  medianAbsCalorieDeviation?: number;
  proteinSuccessRate?: number;
  feasibleOrderRate?: number;
  targetRangeRate?: number;
}

export function summarize(sessions: ParticipantSession[]): ConditionSummary[] {
  return (["baseline", "macrotable"] as Mode[]).map((condition) => {
    const all = sessions.filter((s) => s.condition === condition);
    const done = all.filter((s) => s.completedAt && s.outcome);
    const rate = (f: (s: ParticipantSession) => boolean) => (done.length ? done.filter(f).length / done.length : undefined);
    const absDev = done.map((s) => Math.abs(s.outcome!.calorieDeviation));
    return {
      condition,
      started: all.length,
      completed: done.length,
      medianTimeMs: median(done.map((s) => s.completionTimeMs!)),
      meanAbsCalorieDeviation: mean(absDev),
      medianAbsCalorieDeviation: median(absDev),
      proteinSuccessRate: rate((s) => s.outcome!.proteinMet),
      feasibleOrderRate: rate((s) => s.outcome!.feasibleOrder),
      targetRangeRate: rate((s) => s.outcome!.targetRange),
    };
  });
}

// ─── Export ───────────────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  "participant_id",
  "session_id",
  "condition",
  "scenario",
  "status",
  "started_at",
  "completed_at",
  "completion_time_s",
  "meal_id",
  "meal_name",
  "restaurant",
  "integration_level",
  "provenance",
  "handoff",
  "modifiers",
  "kcal",
  "protein_g",
  "carbs_g",
  "fat_g",
  "price_eur",
  "target_kcal",
  "target_protein_g",
  "target_budget_eur",
  "calorie_deviation_kcal",
  "calories_within_10pct",
  "protein_met",
  "within_budget",
  "diet_ok",
  "feasible_order",
  "target_range",
  "meals_viewed",
  "modifier_changes",
  "provenance_views",
  "agent_messages",
  "agent_tool_calls",
  "agent_provider",
  "agent_fallbacks",
  "event_count",
  // V3.5 treatment identity (blank = session recorded before V3.5: never pool it as V3.5)
  "treatment_version",
  "app_commit",
  "baseline_nutrition_visible",
  "agent_mode",
  "agent_proxy_configured",
] as const;

/** Which agent engine answered in a session: gemini / mock / mixed, or "" if the agent wasn't used. */
export function agentProvider(s: ParticipantSession): string {
  const p = new Set(
    s.events.filter((e) => e.event === "agent_reply").map((e) => (e.detail as { provider?: string } | undefined)?.provider).filter((x) => x === "gemini" || x === "mock"),
  );
  return p.size === 2 ? "mixed" : ([...p][0] ?? "");
}

export function csvCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = typeof v === "boolean" ? (v ? "1" : "0") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const iso = (t?: number) => (t ? new Date(t).toISOString() : "");

export function sessionsToCSV(sessions: ParticipantSession[]): string {
  const rows = sessions.map((s) => {
    const meal = s.selectedMealId ? getMeal(s.selectedMealId) : undefined;
    const o = s.outcome;
    const n = s.finalNutrition;
    const row: Record<(typeof CSV_COLUMNS)[number], unknown> = {
      participant_id: s.participantId,
      session_id: s.sessionId,
      condition: s.condition,
      scenario: s.scenarioId,
      status: sessionStatus(s),
      started_at: iso(s.startedAt),
      completed_at: iso(s.completedAt),
      completion_time_s: s.completionTimeMs !== undefined ? (s.completionTimeMs / 1000).toFixed(1) : "",
      meal_id: s.selectedMealId,
      meal_name: meal?.meal.name,
      restaurant: meal?.restaurant.name,
      integration_level: s.integrationLevel,
      provenance: s.provenance,
      handoff: s.handoff,
      modifiers: s.modifierLabels?.join("; "),
      kcal: n?.calories,
      protein_g: n?.protein,
      carbs_g: n?.carbs,
      fat_g: n?.fat,
      price_eur: s.finalPrice?.toFixed(2),
      target_kcal: s.target.calories,
      target_protein_g: s.target.protein,
      target_budget_eur: s.target.maxBudget,
      calorie_deviation_kcal: o?.calorieDeviation,
      calories_within_10pct: o?.caloriesWithinRange,
      protein_met: o?.proteinMet,
      within_budget: o?.withinBudget,
      diet_ok: o?.dietOk,
      feasible_order: o?.feasibleOrder,
      target_range: o?.targetRange,
      meals_viewed: count(s, "meal_viewed"),
      modifier_changes: count(s, "modifier_changed"),
      provenance_views: count(s, "provenance_viewed"),
      agent_messages: count(s, "agent_message_sent"),
      agent_tool_calls: count(s, "agent_tool_called"),
      agent_provider: agentProvider(s),
      agent_fallbacks: count(s, "agent_fallback"),
      event_count: s.events.length,
      treatment_version: s.build?.treatmentVersion,
      app_commit: s.build?.appCommit,
      baseline_nutrition_visible: s.build?.baselineNutritionVisible,
      agent_mode: s.build?.agentMode,
      agent_proxy_configured: s.build?.agentProxyConfigured,
    };
    return CSV_COLUMNS.map((c) => csvCell(row[c])).join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function sessionsToJSON(sessions: ParticipantSession[], now = new Date()): string {
  return JSON.stringify(
    { schema: RESEARCH_SCHEMA, exportedAt: now.toISOString(), exportedBy: { treatmentVersion: TREATMENT_VERSION, appCommit: APP_COMMIT }, summary: summarize(sessions), sessions },
    null,
    2,
  );
}

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const researchStore = createResearchStore(typeof window === "undefined" ? null : safeLocalStorage());
