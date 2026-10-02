import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeminiTurn } from "../src/agent/gemini";
import { runAgentTurn } from "../src/agent/orchestrator";
import type { ToolContext } from "../src/agent/tools";
import { SCENARIOS } from "../src/data/scenarios";
import { readJSON, STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { assignmentPath, parseAssignment, type Assignment } from "../src/lib/research";
import { extractMenuFromImage } from "../src/scan/menuExtraction";
import { Profile } from "../src/screens/Account";
import { AppStateProvider, loadSettings, resolveAgentEngine, serializeSettings, sessionBuildFor, SETTINGS_VERSION, type Settings } from "../src/state/AppState";

/*
 * Live AI cost control. The invariant: Live AI OFF → ZERO Gemini generation requests.
 * Live AI is settings.agentMode ("auto" = ON, "offline" = OFF), the one normal-mode permission.
 * Research trials take their engine from the participant link instead.
 */

const ctxA = (): ToolContext => ({
  target: { ...SCENARIOS.A.target },
  prefs: { ...SCENARIOS.A.preferences },
  state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] },
});
const liveTurn: GeminiTurn = { text: "Live answer", toolRuns: [], model: "gemini-3.8-flash", modelFallback: false, contents: [] };
const QUERY = "Find me a meal around 700 calories with at least 45g protein under €18.";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    dump: () => Object.fromEntries(m),
  };
}
let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const profileHtml = () => renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(Profile))));

describe("Live AI setting: defaults resolve to OFF", () => {
  it("1. fresh install / cleared storage: OFF, and Settings shows it", () => {
    expect(loadSettings(null).agentMode).toBe("offline");
    expect(readJSON(STORAGE_KEYS.settings, null)).toBeNull();
    const html = profileHtml();
    expect(html).toContain('data-live-ai="off"');
    expect(html).toContain("LIVE AI OFF");
    expect(html).toContain("Offline MacroAgent active");
    expect(html).toContain("No Gemini API requests are sent.");
    expect(html).toMatch(/role="switch" aria-checked="false"/);
  });

  it("2. missing stored value: OFF", () => {
    expect(loadSettings({ v: SETTINGS_VERSION, onboardingDone: true }).agentMode).toBe("offline");
    expect(loadSettings({}).agentMode).toBe("offline");
  });

  it("3. invalid stored value: OFF (and pre-v2 'auto', which was a silent default, resets once to OFF)", () => {
    for (const raw of [{ v: SETTINGS_VERSION, agentMode: "banana" }, { v: SETTINGS_VERSION, agentMode: true }, "garbage", 42, [], { v: 99, agentMode: "auto" }])
      expect(loadSettings(raw).agentMode).toBe("offline");
    expect(loadSettings({ agentMode: "auto", onboardingDone: true, baselineShowNutrition: false })).toEqual({
      agentMode: "offline", // v1 value discarded…
      onboardingDone: true, // …other settings kept
      baselineShowNutrition: false,
      agentDisclosureSeen: false,
    });
  });
});

describe("Live AI setting: explicit choices persist", () => {
  const roundTrip = (s: Settings) => {
    writeJSON(STORAGE_KEYS.settings, serializeSettings(s)); // exactly what AppStateProvider writes
    return loadSettings(readJSON(STORAGE_KEYS.settings, null)); // exactly what it reads on the next launch
  };
  const base = loadSettings(null);

  it("4. explicit OFF persists", () => {
    expect(roundTrip({ ...base, agentMode: "offline" }).agentMode).toBe("offline");
    expect(profileHtml()).toContain("LIVE AI OFF");
  });

  it("5. explicit ON persists (and Settings shows it with the cost note)", () => {
    expect(roundTrip({ ...base, agentMode: "auto" }).agentMode).toBe("auto");
    const html = profileHtml();
    expect(html).toContain('data-live-ai="on"');
    expect(html).toContain("Gemini API enabled");
    expect(html).toContain("API usage may incur costs.");
  });
});

describe("Live AI OFF: zero Gemini generation requests (enforced in the shared orchestration layer)", () => {
  it("6. an OFF agent turn makes no proxy call, even with a live provider injected", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gemini = vi.fn(async () => liveTurn);
    const engine = resolveAgentEngine(null, loadSettings(null));
    expect(engine).toBe("offline");
    await runAgentTurn(QUERY, ctxA(), [], engine, { gemini });
    expect(gemini).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("6b. menu-photo reading refuses before any request when OFF", async () => {
    const fetchImpl = vi.fn();
    await expect(extractMenuFromImage(new Blob(["x"]), "scan-1", "offline", { proxyUrl: "https://proxy.test", fetchImpl })).rejects.toThrow("Live AI is off");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("7. OFF routes the turn straight to the offline MacroAgent (not a fallback)", async () => {
    const o = await runAgentTurn(QUERY, ctxA(), [], "offline", { gemini: vi.fn(async () => liveTurn) });
    expect(o.message.provider).toBe("mock");
    expect(o.message.fallbackReason).toBeUndefined();
    expect(o.toolRuns.map((r) => r.name)).toContain("optimizeMeal"); // same deterministic tools
  });

  it("8. ON permits the existing live path (unchanged)", async () => {
    const gemini = vi.fn(async () => liveTurn);
    const o = await runAgentTurn(QUERY, ctxA(), [], resolveAgentEngine(null, { agentMode: "auto" }), { gemini });
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(o.message.provider).toBe("gemini");
    expect(o.message.model).toBe("gemini-3.8-flash");
  });
});

describe("no secret in the frontend", () => {
  it("9. persisted settings hold only the four preferences + schema version; no key/secret anywhere in src", () => {
    writeJSON(STORAGE_KEYS.settings, serializeSettings({ ...loadSettings(null), agentMode: "auto" }));
    const stored = JSON.parse(storage.dump()[STORAGE_KEYS.settings]);
    expect(Object.keys(stored).sort()).toEqual(["agentDisclosureSeen", "agentMode", "baselineShowNutrition", "onboardingDone", "v"]);
    expect(JSON.stringify(storage.dump())).not.toMatch(/AIza|api[_-]?key|secret|token|bearer/i);
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
    for (const f of files("src")) expect(readFileSync(f, "utf8"), f).not.toMatch(/GEMINI_API_KEY|x-goog-api-key|AIza[0-9A-Za-z_-]{20,}/);
  });
});

describe("10. research engine: explicit per link, isolated from the Live AI setting", () => {
  const a = (agentMode: Assignment["agentMode"]): Assignment => ({ participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode });

  it("the link carries the researcher's engine choice; old links keep the live treatment; bad values are rejected", () => {
    expect(assignmentPath(a("auto"))).toBe("experiment?participant=P001&condition=macrotable&scenario=A&engine=live");
    expect(assignmentPath(a("offline"))).toBe("experiment?participant=P001&condition=macrotable&scenario=A&engine=offline");
    expect(assignmentPath({ ...a("auto"), condition: "baseline" })).not.toContain("engine="); // no agent in the baseline
    for (const m of ["auto", "offline"] as const) expect(parseAssignment(new URLSearchParams(assignmentPath(a(m)).split("?")[1]))).toEqual({ ok: true, value: a(m) });
    expect(parseAssignment(new URLSearchParams("participant=P001&condition=macrotable&scenario=A"))).toMatchObject({ ok: true, value: { agentMode: "auto" } });
    expect(parseAssignment(new URLSearchParams("participant=P001&condition=macrotable&scenario=A&engine=turbo")).ok).toBe(false);
  });

  it("during a trial the link's engine wins in both directions; the Settings toggle can't change it", () => {
    expect(resolveAgentEngine({ agentMode: "auto" }, { agentMode: "offline" })).toBe("auto");
    expect(resolveAgentEngine({ agentMode: "offline" }, { agentMode: "auto" })).toBe("offline");
    expect(resolveAgentEngine({} as { agentMode: "auto" }, { agentMode: "offline" })).toBe("auto"); // a trial begun before engine= existed
    expect(resolveAgentEngine(null, { agentMode: "auto" })).toBe("auto");
    expect(resolveAgentEngine(null, { agentMode: "offline" })).toBe("offline");
  });

  it("the session records the link's engine, never the device setting", () => {
    expect(sessionBuildFor(a("offline"), { ...loadSettings(null), agentMode: "auto" }).agentMode).toBe("offline");
    expect(sessionBuildFor(a("auto"), loadSettings(null)).agentMode).toBe("auto");
  });

  it("Settings (and its Live AI toggle) is hidden while a trial runs", () => {
    writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: SCENARIOS.A.target, prefs: SCENARIOS.A.preferences, selection: null, lock: { ...a("auto"), sessionId: "s1", startedAt: 0 } });
    const html = profileHtml();
    expect(html).not.toContain("Live AI");
    expect(html).not.toContain("Use Gemini API");
  });
});
