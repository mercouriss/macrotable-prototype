import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { DEFAULT_MODEL, isRetryable, sanitizeRequest, SERVER_POLICY, type Env } from "../proxy/src/index";

const ORIGIN = "https://mercouriss.github.io";
const env = (over: Partial<Env> = {}): Env => ({ GEMINI_API_KEY: "test-secret-key", ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`, ...over });
const post = (body: unknown, origin: string | null = ORIGIN, ip = "1.2.3.4") =>
  new Request("https://proxy.test/v1/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

afterEach(() => vi.unstubAllGlobals());

function stubUpstream(response: unknown = { candidates: [{ content: { role: "model", parts: [{ text: "hi" }] } }] }, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status });
  });
  return calls;
}

describe("agent proxy (Cloudflare Worker)", () => {
  it("health reports the model and never the key", async () => {
    const res = await worker.fetch(new Request("https://proxy.test/v1/health", { headers: { Origin: ORIGIN } }), env());
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, model: DEFAULT_MODEL, fallbackModel: null });
    expect(text).not.toContain("test-secret-key");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it("CORS: allowed origins only", async () => {
    const ok = await worker.fetch(new Request("https://proxy.test/v1/generate", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env());
    expect(ok.status).toBe(204);
    const bad = await worker.fetch(new Request("https://proxy.test/v1/generate", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), env());
    expect(bad.status).toBe(403);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await worker.fetch(post({ contents: [] }, "https://evil.example"), env())).status).toBe(403);
    expect((await worker.fetch(post({ contents: [] }, null), env())).status).toBe(403);
  });

  it("forwards to the server-chosen model with the key in a header, never in the URL or body", async () => {
    const calls = stubUpstream();
    const res = await worker.fetch(post({ model: "some-expensive-model", contents: [{ role: "user", parts: [{ text: "hi" }] }], evil: true }), env());
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-secret-key");
    const sent = String(calls[0].init.body);
    expect(sent).not.toContain("test-secret-key");
    expect(sent).not.toContain("some-expensive-model");
    expect(sent).not.toContain("evil");
  });

  it("sanitises: policy preamble, token/temperature clamps, role filter, schema passthrough", () => {
    const out = sanitizeRequest({
      contents: [{ role: "user", parts: [{ text: "a" }] }, { role: "system", parts: [{ text: "x" }] }],
      systemInstruction: { parts: [{ text: "client prompt" }] },
      generationConfig: { maxOutputTokens: 999999, temperature: 7, responseMimeType: "application/json", responseSchema: { type: "object" }, topK: 1 },
      tools: [{ functionDeclarations: [{ name: "optimizeMeal" }] }],
    }) as any;
    expect(out.contents).toHaveLength(1);
    expect(out.systemInstruction.parts[0].text.startsWith(SERVER_POLICY)).toBe(true);
    expect(out.systemInstruction.parts[0].text).toContain("client prompt");
    expect(out.generationConfig).toEqual({ maxOutputTokens: 4096, temperature: 1, responseMimeType: "application/json", responseSchema: { type: "object" } });
    expect(out.tools[0].functionDeclarations).toEqual([{ name: "optimizeMeal" }]);
  });

  it("rejects oversized and invalid bodies, and missing configuration", async () => {
    stubUpstream();
    expect((await worker.fetch(post("x".repeat(200)), env({ MAX_BODY_BYTES: "100" }))).status).toBe(413);
    expect((await worker.fetch(post("{not json", ORIGIN, "9.9.9.9"), env())).status).toBe(400);
    expect((await worker.fetch(post({ contents: [] }, ORIGIN, "8.8.8.8"), env({ GEMINI_API_KEY: undefined }))).status).toBe(503);
  });

  it("rate-limits per client and sanitises upstream errors", async () => {
    stubUpstream({ error: { message: "quota exceeded" } }, 429);
    const e = env({ RATE_LIMIT_PER_MINUTE: "2" });
    const r1 = await worker.fetch(post({ contents: [] }, ORIGIN, "5.5.5.5"), e);
    expect(r1.status).toBe(429);
    expect(await r1.json()).toEqual({ error: "quota exceeded" });
    await worker.fetch(post({ contents: [] }, ORIGIN, "5.5.5.5"), e);
    const r3 = await worker.fetch(post({ contents: [] }, ORIGIN, "5.5.5.5"), e);
    expect(await r3.json()).toEqual({ error: "Too many requests" });
  });
});

// ─── Primary → secondary model fallback ────────────────────────────────────

const FALLBACK = "gemini-3.7-flash";
const OK_BODY = { candidates: [{ content: { role: "model", parts: [{ text: "hi" }] } }] };

/** Scripted upstream: one response per call, in order; records which model each call hit. */
function scriptUpstream(...responses: ({ status: number; body: unknown } | "network-error")[]) {
  const models: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    models.push(decodeURIComponent(url.split("/models/")[1].split(":")[0]));
    const r = responses[models.length - 1];
    if (!r || r === "network-error") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  return models;
}
const fbEnv = (over: Partial<Env> = {}) => env({ GEMINI_MODEL: "gemini-3.8-flash", GEMINI_FALLBACK_MODEL: FALLBACK, ...over });
let ipN = 0;
const gen = (e: Env) => worker.fetch(post({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }, ORIGIN, `10.0.0.${++ipN}`), e);

describe("agent proxy: primary → secondary model fallback", () => {
  it("health reports primary and fallback model ids, never the key", async () => {
    const res = await worker.fetch(new Request("https://proxy.test/v1/health", { headers: { Origin: ORIGIN } }), fbEnv());
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, model: "gemini-3.8-flash", fallbackModel: FALLBACK });
    expect(text).not.toContain("test-secret-key");
  });

  it("primary success: the secondary is never called; metadata says primary", async () => {
    const models = scriptUpstream({ status: 200, body: OK_BODY });
    const res = await gen(fbEnv());
    expect(res.status).toBe(200);
    expect(models).toEqual(["gemini-3.8-flash"]);
    expect(res.headers.get("X-MacroTable-Model")).toBe("gemini-3.8-flash");
    expect(res.headers.get("X-MacroTable-Model-Fallback")).toBe("0");
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-MacroTable-Model-Fallback");
  });

  it.each([
    ["429 rate/quota", { status: 429, body: { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } } }],
    ["503 high demand", { status: 503, body: { error: { status: "UNAVAILABLE", message: "The model is overloaded" } } }],
    ["500 internal", { status: 500, body: { error: { status: "INTERNAL" } } }],
    ["504 deadline", { status: 504, body: { error: { status: "DEADLINE_EXCEEDED" } } }],
    ["network error / timeout", "network-error" as const],
  ])("retryable primary failure (%s) → one secondary call, returned normally", async (_label, first) => {
    const models = scriptUpstream(first, { status: 200, body: OK_BODY });
    const res = await gen(fbEnv());
    expect(res.status).toBe(200);
    expect(models).toEqual(["gemini-3.8-flash", FALLBACK]);
    expect(res.headers.get("X-MacroTable-Model")).toBe(FALLBACK);
    expect(res.headers.get("X-MacroTable-Model-Fallback")).toBe("1");
    expect(await res.json()).toEqual(OK_BODY);
  });

  it.each([
    ["400 malformed request / invalid tool schema", 400, "INVALID_ARGUMENT"],
    ["401 auth", 401, "UNAUTHENTICATED"],
    ["403 permission / policy", 403, "PERMISSION_DENIED"],
    ["404 unknown model", 404, "NOT_FOUND"],
  ])("non-retryable primary failure (%s) → no secondary call", async (_label, status, errorStatus) => {
    const models = scriptUpstream({ status, body: { error: { status: errorStatus, message: "nope" } } }, { status: 200, body: OK_BODY });
    const res = await gen(fbEnv());
    expect(models).toEqual(["gemini-3.8-flash"]);
    expect(res.status).toBe(502);
    expect(res.headers.get("X-MacroTable-Model-Fallback")).toBe("0");
  });

  it("both live models unavailable → error (the app's offline agent then answers); exactly two calls, no loop", async () => {
    const models = scriptUpstream({ status: 503, body: { error: { status: "UNAVAILABLE" } } }, { status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } });
    const res = await gen(fbEnv());
    expect(models).toEqual(["gemini-3.8-flash", FALLBACK]);
    expect(res.ok).toBe(false);
    expect(res.headers.get("X-MacroTable-Model-Fallback")).toBe("1");
  });

  it("no fallback model configured (or same as primary) → single attempt", async () => {
    const m1 = scriptUpstream({ status: 503, body: {} });
    await gen(fbEnv({ GEMINI_FALLBACK_MODEL: undefined }));
    expect(m1).toEqual(["gemini-3.8-flash"]);
    const m2 = scriptUpstream({ status: 503, body: {} });
    await gen(fbEnv({ GEMINI_FALLBACK_MODEL: "gemini-3.8-flash" }));
    expect(m2).toEqual(["gemini-3.8-flash"]);
  });

  it("classifies statuses conservatively", () => {
    for (const s of [0, 429, 500, 502, 503, 504]) expect(isRetryable(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 413, 422]) expect(isRetryable(s, "UNAVAILABLE")).toBe(false);
    expect(isRetryable(501)).toBe(false);
    expect(isRetryable(501, "UNAVAILABLE")).toBe(true);
  });
});
