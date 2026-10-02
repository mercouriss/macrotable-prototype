import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { getScopedMeal, getScopedRestaurant, setStudyScope } from "../src/data/restaurants";
import { agentConfigDocument } from "../src/lib/freeze";
import { createResearchStore, CSV_COLUMNS, sessionsToCSV, sessionsToJSON, type KV, type SessionBuild } from "../src/lib/research";
import { TREATMENT_VERSION } from "../src/lib/version";

afterEach(() => setStudyScope(false));

const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const BUILD: SessionBuild = {
  treatmentVersion: TREATMENT_VERSION,
  appCommit: "abc1234",
  baselineNutritionVisible: true,
  agentMode: "auto",
  agentProxyConfigured: false,
  studyRestaurants: ["fitkitchen", "urbanbowl", "localgrill"],
};

describe("pre-pilot: study boundary on deep links", () => {
  it("scoped lookups hide public-only brands and real restaurants during a trial", () => {
    setStudyScope(true);
    expect(getScopedRestaurant("pastametrica")).toBeUndefined();
    expect(getScopedRestaurant("toko-smoor")).toBeUndefined();
    expect(getScopedMeal("pm-turkey-bolognese")).toBeUndefined();
    expect(getScopedMeal("ss-chicken-tikka-bowl")).toBeUndefined();
    expect(getScopedRestaurant("fitkitchen")?.id).toBe("fitkitchen");
    expect(getScopedMeal("fk-chicken-power-bowl")?.meal.id).toBe("fk-chicken-power-bowl");
    setStudyScope(false);
    expect(getScopedMeal("pm-turkey-bolognese")?.meal.id).toBe("pm-turkey-bolognese");
  });

  it("entry points use the scoped lookups; baseline resolves only the study set; placing an order is guarded", () => {
    const src = (f: string) => readFileSync(f, "utf8");
    for (const f of ["src/screens/RestaurantPage.tsx", "src/screens/RestaurantEntry.tsx", "src/screens/Scan.tsx"]) expect(src(f)).toMatch(/getScopedRestaurant\(/);
    expect(src("src/state/useMealSelection.ts")).toMatch(/getScopedMeal\(/);
    expect(src("src/baseline/Baseline.tsx")).toMatch(/const getRestaurant = \(id: string \| undefined\) => STUDY_RESTAURANTS\.find/);
    expect(src("src/state/AppState.tsx")).toMatch(/s\.lock && !\(STUDY_RESTAURANT_IDS as readonly string\[\]\)\.includes\(found\.restaurant\.id\)\) return null/);
    // Premium, saved meals and past demo orders are not reachable mid-trial, even by URL.
    expect(src("src/screens/Premium.tsx")).toMatch(/if \(lock\) return <Navigate/);
    expect(src("src/screens/Account.tsx")).toMatch(/if \(lock\) return <Navigate to="\/macrotable"/);
    expect(src("src/screens/Account.tsx")).toMatch(/const orders = lock \? \[\]/);
  });
});

describe("pre-pilot: treatment-version identity in collected data", () => {
  it("stamps each new session and exports the stamp (CSV + JSON)", () => {
    const store = createResearchStore(memKV());
    const s = store.start({ participantId: "VT001", condition: "macrotable", scenarioId: "A", agentMode: "auto" }, 0, BUILD);
    expect(store.get(s.sessionId)?.build).toEqual(BUILD);
    const csv = sessionsToCSV(store.list()).split("\r\n");
    const cols = csv[0].split(",");
    const row = csv[1].split(",");
    expect(row[cols.indexOf("treatment_version")]).toBe("V3.5");
    expect(row[cols.indexOf("app_commit")]).toBe("abc1234");
    expect(row[cols.indexOf("baseline_nutrition_visible")]).toBe("1");
    expect(row[cols.indexOf("agent_mode")]).toBe("auto");
    const json = JSON.parse(sessionsToJSON(store.list()));
    expect(json.schema).toBe("macrotable.research.v2"); // unchanged: the analysis script still reads it
    expect(json.exportedBy.treatmentVersion).toBe("V3.5");
    expect(json.sessions[0].build.treatmentVersion).toBe("V3.5");
  });

  it("an older (unstamped) session exports a blank version — it can never read as V3.5", () => {
    const store = createResearchStore(memKV());
    store.start({ participantId: "VT002", condition: "baseline", scenarioId: "A", agentMode: "auto" }, 0);
    const [head, row] = sessionsToCSV(store.list()).split("\r\n");
    expect(row.split(",")[head.split(",").indexOf("treatment_version")]).toBe("");
    // New columns are appended, so positional consumers of the old columns are unaffected.
    expect(CSV_COLUMNS.indexOf("event_count")).toBe(37);
  });
});

describe("pre-pilot: freeze fingerprint", () => {
  it("is deterministic", () => {
    expect(agentConfigDocument()).toBe(agentConfigDocument());
  });

  it("matches the V3.5 candidate (a change here means a NEW treatment version)", () => {
    const hex = createHash("sha256").update(agentConfigDocument()).digest("hex");
    // Re-pinned before the pilot (nothing frozen yet). History:
    //   24e9ac49… (2fbb74b) → e6b5839d… (fdd863f: fallback policy gained the secondary model)
    //   → current: the policy names the models (gemini-3.8-flash → gemini-3.7-flash) and optimizeMeal
    //     documents the "no X" semantics (MacroAgent audit gaps 1 + 4).
    expect(hex).toBe("20e66fac682e2aa11717dcfb174d6973b44b2dff214edb90ea555fd58fb8f639");
  });
});
