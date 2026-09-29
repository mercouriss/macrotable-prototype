import { systemPrompt } from "./systemPrompt";
import { executeTool, TOOL_DECLARATIONS, type ToolContext } from "./tools";
import type { ToolRun } from "./types";
import { COMPOSING, STEP_ACTIVE, UNDERSTANDING } from "./steps";

/*
 * Live provider: Gemini generateContent via MacroTable's serverless proxy.
 * The browser never sees the API key. Tools run here in the app, so all
 * nutrition/price data comes from deterministic code; the model only chooses
 * tools and writes the explanation.
 *
 * Multi-turn rule (Gemini 3): the model's `content` is echoed back verbatim,
 * which carries any thoughtSignature parts; functionResponse keeps the call id.
 */

export const PROXY_URL: string = (import.meta.env.VITE_AGENT_PROXY_URL ?? "").replace(/\/+$/, "");
export const MAX_TOOL_ROUNDS = 6;
/** Frozen model settings for the agent (recorded in the freeze fingerprint). */
export const GENERATION_CONFIG = { temperature: 0.2, maxOutputTokens: 1024 } as const;

export class ProviderError extends Error {}

type Part = { text?: string; thought?: boolean; functionCall?: { id?: string; name: string; args?: Record<string, unknown> }; [k: string]: unknown };
type Content = { role: "user" | "model"; parts: Part[] };

export interface GeminiTurn {
  text: string;
  toolRuns: ToolRun[];
  model?: string;
  /** True if any round of this turn was answered by the proxy's SECONDARY (fallback) model. */
  modelFallback: boolean;
  /** This turn's contents (user text, model calls, function responses, final answer) for history. */
  contents: Content[];
}

export async function runGeminiTurn(
  userText: string,
  ctx: ToolContext,
  history: unknown[][],
  opts: { proxyUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number; onProgress?: (label: string) => void } = {},
): Promise<GeminiTurn> {
  const url = (opts.proxyUrl ?? PROXY_URL).replace(/\/+$/, "");
  if (!url) throw new ProviderError("No proxy configured");
  const f = opts.fetchImpl ?? fetch;
  const turn: Content[] = [{ role: "user", parts: [{ text: userText }] }];
  const toolRuns: ToolRun[] = [];
  let model: string | undefined;
  let modelFallback = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    opts.onProgress?.(round === 0 ? UNDERSTANDING : COMPOSING);
    let res: Response;
    try {
      res = await f(`${url}/v1/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [...(history.flat() as Content[]), ...turn],
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
          generationConfig: GENERATION_CONFIG,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
      });
    } catch (e) {
      throw new ProviderError(`Network: ${(e as Error).message}`);
    }
    if (!res.ok) throw new ProviderError(`Proxy HTTP ${res.status}`);
    // Proxy metadata (non-sensitive): which model answered, and whether it was the secondary.
    if (res.headers.get("X-MacroTable-Model-Fallback") === "1") modelFallback = true;
    const data = (await res.json()) as { candidates?: { content?: Content; finishReason?: string }[]; modelVersion?: string };
    model = data.modelVersion ?? res.headers.get("X-MacroTable-Model") ?? model;
    const cand = data.candidates?.[0];
    const content = cand?.content;
    if (!content?.parts?.length) throw new ProviderError(`Empty response (${cand?.finishReason ?? "no candidate"})`);
    turn.push({ role: "model", parts: content.parts }); // verbatim — keeps thought signatures

    const calls = content.parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = content.parts
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      if (!text) throw new ProviderError("No text in final answer");
      return { text, toolRuns, model, modelFallback, contents: turn };
    }
    const responses: Part[] = calls.map((p) => {
      const fc = p.functionCall!;
      opts.onProgress?.(STEP_ACTIVE[fc.name] ?? "Using a tool");
      const run = executeTool(fc.name, fc.args ?? {}, ctx);
      toolRuns.push(run);
      return { functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: { result: run.result } } };
    });
    turn.push({ role: "user", parts: responses });
  }
  throw new ProviderError("Too many tool rounds");
}

export async function checkProxyHealth(opts: { proxyUrl?: string; fetchImpl?: typeof fetch } = {}): Promise<boolean> {
  return (await proxyHealth(opts)).ok;
}

/** Health + the model the proxy is configured to use (server-side). */
export async function proxyHealth(opts: { proxyUrl?: string; fetchImpl?: typeof fetch } = {}): Promise<{ ok: boolean; model?: string }> {
  const url = (opts.proxyUrl ?? PROXY_URL).replace(/\/+$/, "");
  if (!url) return { ok: false };
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${url}/v1/health`, { signal: AbortSignal.timeout(5000) });
    const body = (await res.json().catch(() => ({}))) as { model?: string };
    return { ok: res.ok, model: body.model };
  } catch {
    return { ok: false };
  }
}
