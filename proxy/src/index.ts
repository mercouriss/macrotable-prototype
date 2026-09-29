/*
 * MacroTable agent proxy — Cloudflare Worker.
 * Browser → this Worker → Gemini generateContent. The API key lives ONLY here
 * (a Worker secret), never in the app bundle, repo or GitHub Pages.
 *
 * Guardrails: origin allow-list, model fixed server-side, request-size and
 * output-token caps, field allow-list, a server policy preamble that keeps the
 * model on MacroTable's task, and a best-effort per-IP rate limit. Request
 * bodies (chat text, menu photos) are never logged or stored.
 *
 * Model fallback: the PRIMARY model (GEMINI_MODEL) is always called first. Only
 * if it fails with a retryable, temporary upstream condition (see isRetryable)
 * is the SECONDARY model (GEMINI_FALLBACK_MODEL) called — exactly once, no loops.
 * Every response says which model answered (X-MacroTable-Model) and whether the
 * secondary was used (X-MacroTable-Model-Fallback: 0/1). If both fail, the app's
 * own offline demo agent takes over, as before.
 */

export interface Env {
  GEMINI_API_KEY?: string;
  /** Comma-separated origins, e.g. "https://mercouriss.github.io,http://localhost:5173". */
  ALLOWED_ORIGINS?: string;
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODEL?: string;
  MAX_BODY_BYTES?: string;
  RATE_LIMIT_PER_MINUTE?: string;
}

export const DEFAULT_MODEL = "gemini-3.8-flash";
/** Per-attempt upstream budget. Primary + secondary stay under the app's 25 s per-round timeout. */
export const PRIMARY_TIMEOUT_MS = 14_000;
export const SECONDARY_TIMEOUT_MS = 9_000;
/** Response headers readable by the app (non-sensitive: model id + fallback flag). */
export const MODEL_HEADER = "X-MacroTable-Model";
export const FALLBACK_HEADER = "X-MacroTable-Model-Fallback";
const UPSTREAM = "https://generativelanguage.googleapis.com/v1beta/models";

export const SERVER_POLICY =
  "Server policy (MacroTable research prototype): Only help with choosing restaurant food, nutrition targets, menus and pickup/in-store orders inside MacroTable, or with reading a restaurant menu photo into JSON. Politely refuse unrelated requests. Never give medical, medication, insulin or allergen-safety advice.";

const buckets = new Map<string, { count: number; reset: number }>();

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "content-type";
    h["Access-Control-Max-Age"] = "600";
    h["Access-Control-Expose-Headers"] = `${MODEL_HEADER}, ${FALLBACK_HEADER}`;
  }
  return h;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json", "cache-control": "no-store" } });
}

type Part = Record<string, unknown>;
type Content = { role?: unknown; parts?: unknown };

/** Keep only the generateContent fields MacroTable uses; clamp generation settings. */
export function sanitizeRequest(body: Record<string, unknown>) {
  const contents = Array.isArray(body.contents) ? (body.contents as Content[]).slice(-60) : [];
  const cleanContents = contents
    .filter((c) => c && (c.role === "user" || c.role === "model") && Array.isArray(c.parts))
    .map((c) => ({ role: c.role, parts: (c.parts as Part[]).slice(0, 20) }));
  const sys = body.systemInstruction as { parts?: { text?: unknown }[] } | undefined;
  const sysText = Array.isArray(sys?.parts) ? sys!.parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("\n").slice(0, 12_000) : "";
  const gc = (body.generationConfig ?? {}) as Record<string, unknown>;
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: Math.min(Math.max(Number(gc.maxOutputTokens) || 1024, 64), 4096),
    temperature: Math.min(Math.max(Number(gc.temperature ?? 0.2), 0), 1),
  };
  if (gc.responseMimeType === "application/json") generationConfig.responseMimeType = "application/json";
  if (gc.responseSchema && typeof gc.responseSchema === "object") generationConfig.responseSchema = gc.responseSchema;
  const out: Record<string, unknown> = {
    contents: cleanContents,
    systemInstruction: { parts: [{ text: `${SERVER_POLICY}\n\n${sysText}`.trim() }] },
    generationConfig,
  };
  const tools = body.tools as { functionDeclarations?: unknown[] }[] | undefined;
  if (Array.isArray(tools) && Array.isArray(tools[0]?.functionDeclarations)) {
    out.tools = [{ functionDeclarations: tools[0].functionDeclarations!.slice(0, 16) }];
  }
  return out;
}

/** Gemini error statuses that mean "temporarily unavailable", independent of the HTTP code. */
const RETRYABLE_STATUS = new Set(["RESOURCE_EXHAUSTED", "UNAVAILABLE", "DEADLINE_EXCEEDED"]);

/**
 * Retry on the secondary model ONLY for temporary upstream availability problems:
 * 429 (rate/quota/capacity), 500/502/503/504, Gemini's RESOURCE_EXHAUSTED / UNAVAILABLE /
 * DEADLINE_EXCEEDED, or a network error/timeout reaching Gemini (status 0).
 * NOT retried: 400 (malformed request, invalid tool schema), 401/403 (auth/permission),
 * 404 (unknown model/misconfiguration), 413, and any 2xx (including safety-blocked answers).
 */
export function isRetryable(status: number, errorStatus?: string): boolean {
  if (status === 0 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  if (status >= 400 && status < 500) return false;
  return !!errorStatus && RETRYABLE_STATUS.has(errorStatus);
}

interface Attempt {
  ok: boolean;
  status: number;
  text: string;
  errorStatus?: string;
  message?: string;
}

async function callModel(model: string, key: string, payload: string, timeoutMs: number): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch(`${UPSTREAM}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, status: 0, text: "", message: "Upstream unreachable or timed out" };
  }
  const text = await res.text();
  if (res.ok) return { ok: true, status: res.status, text };
  let message = `Upstream error ${res.status}`;
  let errorStatus: string | undefined;
  try {
    const e = (JSON.parse(text) as { error?: { message?: string; status?: string } }).error;
    message = e?.message?.slice(0, 300) ?? message;
    errorStatus = e?.status;
  } catch {
    /* keep generic */
  }
  return { ok: false, status: res.status, text, errorStatus, message };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get("Origin");
    const h = cors(origin, allowed);
    const url = new URL(req.url);
    const model = env.GEMINI_MODEL || DEFAULT_MODEL;
    const fallbackModel = env.GEMINI_FALLBACK_MODEL && env.GEMINI_FALLBACK_MODEL !== model ? env.GEMINI_FALLBACK_MODEL : null;

    if (req.method === "OPTIONS") return new Response(null, { status: origin && allowed.includes(origin) ? 204 : 403, headers: h });
    if (url.pathname === "/v1/health" && req.method === "GET") return json({ ok: !!env.GEMINI_API_KEY, model, fallbackModel }, env.GEMINI_API_KEY ? 200 : 503, h);
    if (url.pathname !== "/v1/generate" || req.method !== "POST") return json({ error: "Not found" }, 404, h);

    if (!origin || !allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403, h);
    if (!env.GEMINI_API_KEY) return json({ error: "Proxy not configured" }, 503, h);

    const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
    const limit = Number(env.RATE_LIMIT_PER_MINUTE) || 30;
    const now = Date.now();
    const b = buckets.get(ip);
    if (!b || now > b.reset) buckets.set(ip, { count: 1, reset: now + 60_000 });
    else if (++b.count > limit) return json({ error: "Too many requests" }, 429, h);

    const max = Number(env.MAX_BODY_BYTES) || 6_000_000;
    const raw = await req.text();
    if (raw.length > max) return json({ error: "Request too large" }, 413, h);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, 400, h);
    }

    const payload = JSON.stringify(sanitizeRequest(body));
    let used = model;
    let attempt = await callModel(model, env.GEMINI_API_KEY, payload, PRIMARY_TIMEOUT_MS);
    if (!attempt.ok && fallbackModel && isRetryable(attempt.status, attempt.errorStatus)) {
      used = fallbackModel;
      attempt = await callModel(fallbackModel, env.GEMINI_API_KEY, payload, SECONDARY_TIMEOUT_MS); // one attempt, no loop
    }
    const meta = { [MODEL_HEADER]: used, [FALLBACK_HEADER]: used === model ? "0" : "1" };
    if (!attempt.ok) return json({ error: attempt.message }, attempt.status === 429 ? 429 : 502, { ...h, ...meta });
    return new Response(attempt.text, { status: 200, headers: { ...h, ...meta, "content-type": "application/json", "cache-control": "no-store" } });
  },
};
