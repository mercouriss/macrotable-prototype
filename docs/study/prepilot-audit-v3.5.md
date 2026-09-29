# V3.5 pre-pilot freeze audit (2026-09-29)

Audited at `c5554d3`. The validity-blocking fixes below are in the commit that adds this file. **Nothing here freezes the study.** The freeze happens after the V3.5 pilot, in [freeze-record.md](freeze-record.md).

## Validity-blocking findings (fixed before the pilot)

| # | Finding at `c5554d3` | Fix |
|---|---|---|
| 1 | **Sessions didn't record which treatment produced them.** V3, V3.1 and V3.5 sessions shared one storage key and one schema string, so older sessions could be silently pooled as V3.5. | Every new session gets a `build` stamp at *Begin*: `treatmentVersion` "V3.5", `appCommit`, `baselineNutritionVisible`, `agentMode`, `agentProxyConfigured` and `studyRestaurants`. The stamp is exported to JSON and to 5 appended CSV columns. `analyze.py` now analyses only `--treatment V3.5` by default, lists unstamped or older sessions as excluded, and warns if the observations come from more than one commit. |
| 2 | **Deep links could reach non-study restaurants mid-trial.** `/macrotable/meal/…`, `/configure/…`, `/explore/<id>`, `/r/<id>` and `/baseline/restaurant/…` / `/baseline/meal/…` resolved any restaurant. *Your orders* → *Order again* could complete a trial with a public-only brand. | Scoped lookups (`getScopedRestaurant` / `getScopedMeal`) at every entry point. The baseline resolves only `STUDY_RESTAURANTS`. During a trial `placeOrder()` refuses any restaurant outside the study set. Past demo orders, their success and ticket pages, Premium and Saved are unreachable mid-trial, including by URL. |

Neither fix changes the optimizer, feasibility rules, scenarios, the study data, the agent prompt, tools or settings, or the freeze fingerprint.

## MacroAgent capability audit: fixes before the pilot/main study (2026-09-29)

| Gap | Was | Now | Tests |
|---|---|---|---|
| 1 · Engine configuration | Deployed Worker used `gemini-3.7-flash` as secondary; the committed config and docs named an older secondary model | One configuration everywhere: `gemini-3.8-flash` → `gemini-3.7-flash` (once, retryable failures only) → offline agent. `wrangler.toml` committed; `ENGINE_MODELS` in `src/lib/freeze.ts`; fallback policy (fingerprint) names both | `tests/agent-audit-gaps.test.ts` keeps the config file, Worker default, code constant and 4 docs in agreement |
| 3 · Confidence language | VERIFY only checked numbers; "verified" for an ESTIMATED dish passed silently | `overstatedConfidence` in `src/agent/orchestrator.ts`: "verified", "official", "printed on the menu" must not exceed the tool label of the dish/restaurant the claim refers to; "exact/guaranteed" nutrition is flagged. Live replies get a warning card; card labels stay authoritative. Negations ("not verified") and real restaurants (no nutrition label) are ignored | flags + accepts + live-turn card |
| 4 · "No X" semantics | Dishes that simply don't contain X were dropped as "can't comply"; "no rice" mapped to quinoa/freekeh | `resolveRemoval` in `src/lib/optimizer.ts`: a dish that doesn't list X complies unchanged; every X component group must be set to a supported "None"; X listed without such a group is refused ("comes with rice…"). Specific ingredients match only themselves; category words (carbs, sauce, cheese, meat) match their members. Less/more/exact are unchanged | per-dish resolutions, cross-store and study-scope searches, canonical A–D picks unchanged |
| 2 · Offline follow-ups | Missed "I don't want rice" (generic help); narrowed to the last recommended restaurant; forgot earlier constraints | `src/agent/mock.ts`: "don't want / avoid / leave out / X-free" → none; session memory of stated budget, kcal, protein, diet flags and avoided ingredients (later statements win); searches stay at a restaurant only if the user anchored there (named it, table QR, restaurant or meal page); "compare" releases it. "Prioritize protein" still has no tool parameter (audit gap 7, deferred) | phrasings, "What can you do?", budget change searches all stores, memory, anchoring, small talk, study scope |

## Freeze inputs

| Input | Current value | Source of truth | Frozen? | Validity impact if changed | Before pilot | Before main |
|---|---|---|---|---|---|---|
| Commit | Latest `main` after this audit (deployed by CI) | `git rev-parse --short HEAD`; `/research` → Freeze record values; `build.appCommit` in every session | no | A different build is a different treatment | Pilot on the deployed commit; note it | Record the commit after the post-pilot fixes |
| Model ID | Primary `gemini-3.8-flash`; secondary `gemini-3.7-flash`. Deployed: the Worker's `/v1/health` reports exactly these two (checked 2026-09-29), `AGENT_PROXY_URL` is set, and `wrangler.toml` is committed with the same values. `ENGINE_MODELS` in `src/lib/freeze.ts` names them for the fingerprint, and a test keeps all three in agreement | `proxy/wrangler.toml` `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` (server-side, **changeable without an app change**); `/v1/health` reports both; per live reply in `agent_reply.detail.model` + `modelFallback` | no | Different reasoning/wording in the treatment arm | Deploy the Worker; decide how secondary/offline sessions are treated | Record both model ids; check `agent_models` in the exports |
| Freeze fingerprint | `20e66fac682e2aa11717dcfb174d6973b44b2dff214edb90ea555fd58fb8f639`: re-pinned for the MacroAgent audit fixes (the fallback policy names both models; `optimizeMeal` documents "no X"). Earlier candidates `e6b5839d…` (`fdd863f`) and `24e9ac49…`; V3.1 was `9207dca2…` | `agentConfigDocument()` in `src/lib/freeze.ts`; pinned by `tests/prepilot.test.ts` | candidate | The agent's instructions, tools or fallback policy changed | none | Re-confirm after any post-pilot fix |
| Fallback policy | Primary Gemini → (retryable failure only) secondary Gemini, once → offline agent if both fail or on any other error/timeout (25 s). If the proxy is unreachable at load, **every** turn is offline, recorded as `provider: mock` | `FALLBACK_POLICY` in `src/lib/freeze.ts`; `proxy/src/index.ts` (`isRetryable`); `orchestrator.ts`; `agentState.tsx` | no | Participants would get three different agent mechanisms | **Researcher decision** (below) | Record it, plus the rule for secondary and offline sessions |
| Baseline nutrition visibility | Default **visible**; a per-device setting | `settings.baselineShowNutrition` (`/research` → Demo settings); now stamped as `build.baselineNutritionVisible` | no | Changes the information the control arm gets | **Researcher decision** (below); set it on every device | Record the decision; the exports must show one value |
| Protein and primary outcome | Primary = \|kcal − target\| among feasible orders (budget + diet); protein is secondary | `EXPERIMENT.md`, [scenario-difficulty.md](scenario-difficulty.md), `analyze.py` | no | Changing it after seeing data = analytic flexibility | none (the pilot doesn't test the hypothesis) | **Researcher decision** (below), recorded before the first main participant |

### What the fingerprint covers
The fingerprint hashes:
- the system prompt, instantiated for Scenario A;
- all 7 tool declarations (names, descriptions, JSON schemas);
- the generation config (temperature 0.2, max 1024 tokens);
- the maximum of 6 tool rounds;
- the fallback-policy text.

**Why V3.5 changed it:** V3.5 rewrote the descriptions of `listNearbyStores` and `getMenu.restaurantId`. The system prompt is unchanged.

**Properties:**
- It is deterministic (tested).
- UI and presentation changes don't affect it.
- It does **not** cover the model ID (server-side), the proxy URL, the restaurant data, the optimizer, the offline agent or the UI. The commit does.
- It is not stored per session, but `build.appCommit` is, and the commit determines it.

## Decisions the researcher must make (bounded)

1. **Agent engine and fallback. Pick one before the pilot.**
   - **(a) Offline agent only.** Deterministic, no model ID, no free-tier data sharing. The agent has limited language understanding.
   - **(b) Live Gemini** (now deployed, with `AGENT_PROXY_URL` set). Choose how to treat sessions by `agent_engine`, separately for each non-primary state:
     - sessions containing **`secondary`** (Gemini 3.7 answered after a primary failure): exclude / analyse separately / pool with primary;
     - sessions containing **`offline`** (the offline agent answered): exclude / analyse separately / pool.

   If you choose (b) but don't want a secondary model at all, set `GEMINI_FALLBACK_MODEL = ""` before deploying. The proxy then calls only the primary.

   **Three distinct engine states** (never pooled silently):

   | State | What answers | How it's recorded |
   |---|---|---|
   | **Primary** | Gemini `gemini-3.8-flash` (`GEMINI_MODEL`) through the proxy | `agent_reply.detail`: `provider: "gemini"`, `modelFallback: false`, `model` → CSV `agent_engine` = `primary` |
   | **Secondary** | Gemini `gemini-3.7-flash` (`GEMINI_FALLBACK_MODEL`), called by the proxy **once**, only after a retryable primary failure (429; 500/502/503/504; `RESOURCE_EXHAUSTED` / `UNAVAILABLE` / `DEADLINE_EXCEEDED`; network error or timeout). Never after 400/401/403/404 or a safety-blocked answer | `provider: "gemini"`, `modelFallback: true`, `model` → `agent_engine` = `secondary` |
   | **Offline** | the deterministic offline demo agent (same tools), when both live models fail, the proxy is unreachable, or the device is set to offline | `provider: "mock"` (plus an `agent_fallback` event when a live attempt failed) → `agent_engine` = `offline` |

   A session that mixes states exports e.g. `primary+secondary` or `primary+offline`. `agent_models` lists the model ids that answered. Context turns built directly from tool results (`provider: "tools"`) are deterministic and aren't an engine.

   Whichever option you pick, keep every study device on `agentMode = auto`. The value is stamped per session.
2. **Baseline nutrition visibility. Pick one; it applies to all devices.**
   - **(a) Visible.** The control arm sees per-dish macros, per-option macro deltas and the configured total. This tests MacroTable's *optimization/agency* against a nutrition-labelled menu.
   - **(b) Hidden.** The control arm sees only names, descriptions, prices and option labels. This tests MacroTable against a typical menu, so it also measures the value of *information*.

   The treatment always shows nutrition and targets. The task card (targets) is shown in both conditions either way.
3. **Primary outcome and protein. Freeze one before the first main participant.**
   - **(1)** \|kcal − target\| among budget + diet-feasible orders; protein as secondary.
   - **(2)** The same, but feasibility also requires protein ≥ target. Orders missing protein count as task failures, and that rate is reported.
   - **(3)** Two co-primary outcomes, E_K and E_P, with no combined score.

   Current logging supports all three: `finalNutrition`, `target`, `outcome.proteinMet`, and `protein_error` / `protein_success` in `analyze.py`.

## Pilot scope (V3.5, codes `VT001–VT006`)
- 4–6 participants on the chosen engine and baseline setting, using the AB/BA schedule.
- Look for: confusing treatment UI, unexpected navigation, any study-scope leak, fallback behaviour, logging or export failures, device-specific failures, and scenario misunderstanding.
- After each participant, export JSON and check it: `build.treatmentVersion` = V3.5, one commit, the expected `baselineNutritionVisible` and `agentMode`, and a completed event sequence.
- After the pilot, make **validity-blocking fixes only**, then freeze. Pilot observations are not main-study data.

## Verified in this audit (desktop Chromium, emulated phone sizes)
- **Study scope, both arms:**
  - Home, Explore, search, filters, recommendations and agent tools show 3 restaurants.
  - 14 deep links to public or real restaurants show "Nothing here" or redirect.
  - Premium and Saved redirect; Orders is empty; `/research` is locked; `/demo` is refused.
  - A reload mid-trial keeps the scope. A second assignment link mid-trial shows "Task in progress".
  - A demo agent conversation is reset when a trial starts.
- **Scenario calibration in study scope:** A–D reproduce [scenario-difficulty.md](scenario-difficulty.md) exactly, including after a public-scope search.
- **Service-worker update:** a client with the `c5554d3` build installed and cached moved to the new build on its next navigation. It auto-reloaded, left no waiting worker, and the precache held only the new bundle.
- **Layout:** 360 px, 13 key screens, no overflow. 390 / 768: app only. 1024 / 1280 / 1440: phone + showcase; never on `/baseline` or during trials.
- **Map:** all 6 demo pins inside the frame when reached through the bottom nav; one active label next to its pin; pin → card sync; attribution on one line.
- **Not verified here:** real iPhone, real Android, real camera, the live Gemini agent. See [smoke-test.md](smoke-test.md).
