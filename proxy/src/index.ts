/*
 * MacroTable agent proxy — Cloudflare Worker.
 * Browser → this Worker → Gemini generateContent. The API key lives ONLY here
 * (a Worker secret), never in the app bundle, repo or GitHub Pages.
 *
 * Guardrails: origin allow-list, model fixed server-side, request-size and
 * output-token caps, field allow-list, a server policy preamble that keeps the
 * model on MacroTable's task, and a best-effort per-IP rate limit. Request
 * bodies (chat text, menu photos) are never logged or stored.
 */

export interface Env {
  GEMINI_API_KEY?: string;
  /** Comma-separated origins, e.g. "https://mercouriss.github.io,http://localhost:5173". */
  ALLOWED_ORIGINS?: string;
  GEMINI_MODEL?: string;
  MAX_BODY_BYTES?: string;
  RATE_LIMIT_PER_MINUTE?: string;
}

export const DEFAULT_MODEL = "gemini-3.8-flash";
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get("Origin");
    const h = cors(origin, allowed);
    const url = new URL(req.url);
    const model = env.GEMINI_MODEL || DEFAULT_MODEL;

    if (req.method === "OPTIONS") return new Response(null, { status: origin && allowed.includes(origin) ? 204 : 403, headers: h });
    if (url.pathname === "/v1/health" && req.method === "GET") return json({ ok: !!env.GEMINI_API_KEY, model }, env.GEMINI_API_KEY ? 200 : 503, h);
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

    const upstream = await fetch(`${UPSTREAM}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(sanitizeRequest(body)),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      let message = `Upstream error ${upstream.status}`;
      try {
        message = (JSON.parse(text) as { error?: { message?: string } }).error?.message?.slice(0, 300) ?? message;
      } catch {
        /* keep generic */
      }
      return json({ error: message }, upstream.status === 429 ? 429 : 502, h);
    }
    return new Response(text, { status: 200, headers: { ...h, "content-type": "application/json", "cache-control": "no-store" } });
  },
};
