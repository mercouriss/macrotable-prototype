import { SCENARIOS } from "../data/scenarios";
import { GENERATION_CONFIG, MAX_TOOL_ROUNDS } from "../agent/gemini";
import { systemPrompt } from "../agent/systemPrompt";
import { TOOL_DECLARATIONS } from "../agent/tools";

/*
 * Experiment freeze fingerprint (study protocol / V3.1 §11): everything that defines
 * the agent treatment, hashed so the team can record it and detect accidental changes.
 */
export const FALLBACK_POLICY =
  "Live Gemini via proxy when configured and reachable; on any error or timeout (25 s) the offline MockAgent answers the same turn with the same tools, labelled in the UI and logged as agent_fallback.";

export function agentConfigDocument(): string {
  const ctx = {
    target: { ...SCENARIOS.A.target },
    prefs: { ...SCENARIOS.A.preferences },
    state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] },
  };
  return JSON.stringify({ systemPromptScenarioA: systemPrompt(ctx), tools: TOOL_DECLARATIONS, generationConfig: GENERATION_CONFIG, maxToolRounds: MAX_TOOL_ROUNDS, fallbackPolicy: FALLBACK_POLICY });
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
