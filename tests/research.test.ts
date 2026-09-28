import { describe, expect, it } from "vitest";
import { DEMO_MEAL_ID, getMeal } from "../src/data/restaurants";
import { computeConfiguration } from "../src/lib/nutrition";
import {
  createResearchStore,
  CSV_COLUMNS,
  csvCell,
  lockedRedirect,
  nextParticipantId,
  parseAssignment,
  sessionsToCSV,
  sessionsToJSON,
  summarize,
  type ExperimentLock,
  type KV,
} from "../src/lib/research";

function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const DEMO_SELECTIONS = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" };

function completeWith(store: ReturnType<typeof createResearchStore>, sessionId: string, mealId: string, selections: Record<string, string>, at: number) {
  const { meal, restaurant } = getMeal(mealId)!;
  const { nutrition, price } = computeConfiguration(meal, selections);
  return store.complete(sessionId, { meal, restaurant, selections, nutrition, price, orderNumber: "MT1042", at });
}

describe("assignment links", () => {
  it("accepts a valid anonymous assignment and normalises it", () => {
    const r = parseAssignment(new URLSearchParams("participant=p001&condition=Baseline&scenario=a"));
    expect(r).toEqual({ ok: true, value: { participantId: "P001", condition: "baseline", scenarioId: "A" } });
  });

  it("rejects identifying or malformed parameters", () => {
    const r = parseAssignment(new URLSearchParams("participant=alex@uni.nl&condition=other&scenario=Z"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(3);
    expect(parseAssignment(new URLSearchParams("participant=Alex Smith&condition=baseline&scenario=A")).ok).toBe(false);
    expect(parseAssignment(new URLSearchParams("condition=baseline&scenario=A")).ok).toBe(false);
  });

  it("suggests the next sequential participant id", () => {
    const store = createResearchStore(memoryKV());
    expect(nextParticipantId(store.list())).toBe("P001");
    store.start({ participantId: "P007", condition: "baseline", scenarioId: "A" });
    expect(nextParticipantId(store.list())).toBe("P008");
  });
});

describe("condition lock", () => {
  const lock = (condition: "baseline" | "macrotable"): ExperimentLock => ({
    participantId: "P001",
    condition,
    scenarioId: "A",
    sessionId: "s",
    startedAt: 0,
  });

  it("keeps a baseline participant out of MacroTable and demo tooling", () => {
    expect(lockedRedirect(lock("baseline"), "/macrotable/results")).toBe("/baseline/browse");
    expect(lockedRedirect(lock("baseline"), "/demo")).toBe("/baseline/browse");
    expect(lockedRedirect(lock("baseline"), "/r/fitkitchen")).toBe("/baseline/browse");
    expect(lockedRedirect(lock("baseline"), "/baseline/meal/fk-chicken-power-bowl")).toBeNull();
  });

  it("keeps a MacroTable participant out of the baseline", () => {
    expect(lockedRedirect(lock("macrotable"), "/baseline/browse")).toBe("/macrotable");
    expect(lockedRedirect(lock("macrotable"), "/macrotable/configure/x")).toBeNull();
  });

  it("always allows experiment, research and privacy pages; no lock means no redirect", () => {
    for (const p of ["/experiment", "/experiment/done", "/research", "/privacy"]) expect(lockedRedirect(lock("baseline"), p)).toBeNull();
    expect(lockedRedirect(null, "/baseline/browse")).toBeNull();
  });
});

describe("participant sessions", () => {
  it("creates, logs and completes a session scored against the assigned scenario", () => {
    const kv = memoryKV();
    const store = createResearchStore(kv);
    const s = store.start({ participantId: "P001", condition: "macrotable", scenarioId: "A" }, 1_000);
    store.log(s.sessionId, "meal_viewed", { mealId: DEMO_MEAL_ID }, 2_000);
    store.log(s.sessionId, "modifier_changed", {}, 3_000);
    const done = completeWith(store, s.sessionId, DEMO_MEAL_ID, DEMO_SELECTIONS, 61_000)!;

    expect(done.completionTimeMs).toBe(60_000);
    expect(done.finalNutrition).toEqual({ calories: 682, protein: 49, carbs: 72, fat: 20 });
    expect(done.finalPrice).toBe(16.5);
    expect(done.provenance).toBe("verified");
    expect(done.modifierLabels).toEqual(["+50 g chicken", "Half rice", "Light sauce", "Double vegetables"]);
    expect(done.outcome).toMatchObject({ calorieDeviation: -18, proteinMet: true, feasibleOrder: true, targetRange: true });
    expect(done.events.map((e) => e.event)).toEqual([
      "experiment_started",
      "meal_viewed",
      "modifier_changed",
      "order_confirmed",
      "experiment_completed",
    ]);
    // persisted, and survives a new store instance on the same storage
    expect(createResearchStore(kv).get(s.sessionId)?.completedAt).toBe(61_000);
  });

  it("ignores events after completion and can't complete twice", () => {
    const store = createResearchStore(memoryKV());
    const s = store.start({ participantId: "P002", condition: "baseline", scenarioId: "A" }, 0);
    completeWith(store, s.sessionId, DEMO_MEAL_ID, {}, 10_000);
    store.log(s.sessionId, "meal_viewed", {}, 11_000);
    completeWith(store, s.sessionId, "lg-chicken-salad", {}, 12_000);
    const after = store.get(s.sessionId)!;
    expect(after.selectedMealId).toBe(DEMO_MEAL_ID);
    expect(after.events.filter((e) => e.event === "meal_viewed")).toHaveLength(0);
  });

  it("flags a vegetarian-scenario order of a meat dish as a diet failure", () => {
    const store = createResearchStore(memoryKV());
    const s = store.start({ participantId: "P003", condition: "baseline", scenarioId: "C" }, 0);
    const done = completeWith(store, s.sessionId, DEMO_MEAL_ID, {}, 1)!;
    expect(done.outcome).toMatchObject({ dietOk: false, feasibleOrder: false, targetRange: false });
  });

  it("works without storage (in-memory fallback)", () => {
    const store = createResearchStore(null);
    const s = store.start({ participantId: "P004", condition: "baseline", scenarioId: "B" });
    expect(store.list()).toHaveLength(1);
    store.abort(s.sessionId);
    expect(store.get(s.sessionId)?.abortedAt).toBeDefined();
    store.clear();
    expect(store.list()).toHaveLength(0);
  });
});

describe("exports and summaries", () => {
  function seeded() {
    const store = createResearchStore(memoryKV());
    const a = store.start({ participantId: "P001", condition: "macrotable", scenarioId: "A" }, 0);
    completeWith(store, a.sessionId, DEMO_MEAL_ID, DEMO_SELECTIONS, 40_000);
    const b = store.start({ participantId: "P002", condition: "baseline", scenarioId: "A" }, 0);
    completeWith(store, b.sessionId, DEMO_MEAL_ID, { chicken: "chicken-100", veg: "veg-double" }, 90_000);
    store.start({ participantId: "P003", condition: "baseline", scenarioId: "A" }, 0); // left in progress
    return store;
  }

  it("exports one CSV row per session with a stable header", () => {
    const csv = sessionsToCSV(seeded().list());
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(4);
    const header = lines[0].split(",");
    const row = lines[1].split(",");
    expect(row[header.indexOf("participant_id")]).toBe("P001");
    expect(row[header.indexOf("kcal")]).toBe("682");
    expect(row[header.indexOf("price_eur")]).toBe("16.50");
    expect(row[header.indexOf("target_range")]).toBe("1");
    expect(lines[3].split(",")[header.indexOf("status")]).toBe("in-progress");
  });

  it("escapes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(true)).toBe("1");
  });

  it("exports JSON with schema, summary and full sessions", () => {
    const parsed = JSON.parse(sessionsToJSON(seeded().list(), new Date(0)));
    expect(parsed.schema).toBe("macrotable.research.v2");
    expect(parsed.exportedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(parsed.sessions).toHaveLength(3);
    expect(parsed.sessions[0].events.length).toBeGreaterThan(0);
  });

  it("summarises completed trials per condition", () => {
    const [baseline, macrotable] = summarize(seeded().list());
    expect(baseline).toMatchObject({ condition: "baseline", started: 2, completed: 1, medianTimeMs: 90_000 });
    expect(baseline.medianAbsCalorieDeviation).toBe(370); // 1070 kcal vs 700
    expect(baseline.targetRangeRate).toBe(0);
    expect(macrotable).toMatchObject({ completed: 1, medianTimeMs: 40_000, proteinSuccessRate: 1, targetRangeRate: 1 });
  });
});

describe("participant instructions (protocol §9)", () => {
  it("uses the frozen neutral wording and never implies a single correct meal", async () => {
    const { PARTICIPANT_INSTRUCTION } = await import("../src/lib/research");
    expect(PARTICIPANT_INSTRUCTION).toBe(
      "Imagine these are the nutritional targets you have remaining for dinner today. Choose a restaurant meal you would actually be willing to order while staying within the stated constraints. You may use the options shown in the app. Complete the task when you are satisfied with your choice.",
    );
    expect(PARTICIPANT_INSTRUCTION).not.toMatch(/best|correct|right answer/i);
  });

  it("states each scenario's extra constraints identically to both conditions", async () => {
    const { taskConstraints } = await import("../src/lib/research");
    expect(taskConstraints("A")).toEqual([]);
    expect(taskConstraints("B")).toEqual(["Preference: lower fat"]);
    expect(taskConstraints("C")).toEqual(["Vegetarian"]);
  });
});
