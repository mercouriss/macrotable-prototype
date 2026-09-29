# MacroAgent proxy (Cloudflare Worker)

This is the only place the **Gemini API key** lives. The app on GitHub Pages calls this Worker, and the Worker calls Google's Gemini `generateContent` API.

```
Browser (GitHub Pages) ──HTTPS──▶ this Worker (holds GEMINI_API_KEY) ──▶ Gemini API
```

Never put the key in `VITE_*` variables, the repository, GitHub Actions variables or the app bundle. `VITE_AGENT_PROXY_URL` is only the Worker's **public URL**.

## Guardrails

| Guardrail | Detail |
|---|---|
| Origin allow-list | `ALLOWED_ORIGINS` in `wrangler.toml`. Other browser origins get 403 |
| Fixed models | Primary `GEMINI_MODEL` (default `gemini-3.8-flash`); optional secondary `GEMINI_FALLBACK_MODEL` (e.g. `gemini-2.5-flash`). Clients can't choose either |
| Model fallback | The primary is always called first. The secondary is called **once**, only after a retryable primary failure (429, 500/502/503/504, `RESOURCE_EXHAUSTED` / `UNAVAILABLE` / `DEADLINE_EXCEEDED`, network error or timeout; per-attempt budgets 14 s + 9 s). Never after 400/401/403/404. If both fail, the app's offline agent answers |
| Engine metadata | Responses carry `X-MacroTable-Model` (the model that answered) and `X-MacroTable-Model-Fallback` (`0`/`1`), exposed to the app via CORS. No other metadata, and never the key |
| Request limits | Body ≤ 6 MB, ≤ 60 turns, output ≤ 4096 tokens, temperature clamped to 0–1, field allow-list |
| Server policy preamble | Keeps the model on MacroTable's task; it refuses unrelated requests and medical/allergen advice |
| Rate limit | Best-effort, per IP per Worker isolate (default 30/min). Also **set a quota or budget in Google AI Studio** |
| No logging | Request bodies (chat text, menu photos) are never logged or stored by the Worker |

The origin check stops other *websites* from using the proxy. It can't stop someone running curl with a spoofed Origin header, which is why the quota and rate limit matter.

## Deploy (about 5 minutes)

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/). Note that on the **free tier, Google may use submitted content to improve its products**. The app discloses this to users. Use a paid tier if that's unacceptable for your study.
2. Deploy the Worker. Wrangler asks you to log in to Cloudflare, and the `secret put` step prompts for the key:
   ```bash
   cd proxy
   npm install
   npx wrangler login
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler deploy
   ```
   Wrangler prints the URL, e.g. `https://macrotable-agent-proxy.<your-subdomain>.workers.dev`.
3. Check it: `curl https://…workers.dev/v1/health` should return `{"ok":true,"model":"gemini-3.8-flash","fallbackModel":"gemini-2.5-flash"}` (`null` when no secondary is set).
4. Point the app at the proxy (a public URL, not a secret) and redeploy:
   ```bash
   gh variable set AGENT_PROXY_URL --repo mercouriss/macrotable-prototype --body "https://macrotable-agent-proxy.<your-subdomain>.workers.dev"
   gh workflow run ci.yml --repo mercouriss/macrotable-prototype
   ```
5. Open the app → **Agent**. The pill should say **Live · Gemini**.

For local development, put `VITE_AGENT_PROXY_URL=https://…workers.dev` in `.env.local`. `http://localhost:5173` is already in `ALLOWED_ORIGINS`.

To switch the model (e.g. `gemini-3.5-flash-lite` for lower latency or cost), edit `GEMINI_MODEL` in `wrangler.toml` and run `npx wrangler deploy`.
