# V3.5 pre-pilot freeze audit (2026-09-29)

Audited at `c5554d3`. The validity-blocking fixes below are in the commit that adds this file. **Nothing here freezes the study.** The freeze happens after the V3.5 pilot, in [freeze-record.md](freeze-record.md).

## Validity-blocking findings (fixed before the pilot)

| # | Finding at `c5554d3` | Fix |
|---|---|---|
| 1 | **Sessions didn't record which treatment produced them.** V3, V3.1 and V3.5 sessions shared one storage key and one schema string, so older sessions could be silently pooled as V3.5. | Every new session gets a `build` stamp at *Begin*: `treatmentVersion` "V3.5", `appCommit`, `baselineNutritionVisible`, `agentMode`, `agentProxyConfigured` and `studyRestaurants`. The stamp is exported to JSON and to 5 appended CSV columns. `analyze.py` now analyses only `--treatment V3.5` by default, lists unstamped or older sessions as excluded, and warns if the observations come from more than one commit. |
| 2 | **Deep links could reach non-study restaurants mid-trial.** `/macrotable/meal/…`, `/configure/…`, `/explore/<id>`, `/r/<id>` and `/baseline/restaurant/…` / `/baseline/meal/…` resolved any restaurant. *Your orders* → *Order again* could complete a trial with a public-only brand. | Scoped lookups (`getScopedRestaurant` / `getScopedMeal`) at every entry point. The baseline resolves only `STUDY_RESTAURANTS`. During a trial `placeOrder()` refuses any restaurant outside the study set. Past demo orders, their success and ticket pages, Premium and Saved are unreachable mid-trial, including by URL. |

Neither fix changes the optimizer, feasibility rules, scenarios, the study data, the agent prompt, tools or settings, or the freeze fingerprint.

## Freeze inputs

| Input | Current value | Source of truth | Frozen? | Validity impact if changed | Before pilot | Before main |
|---|---|---|---|---|---|---|
| Commit | Latest `main` after this audit (deployed by CI) | `git rev-parse --short HEAD`; `/research` → Freeze record values; `build.appCommit` in every session | no | A different build is a different treatment | Pilot on the deployed commit; note it | Record the commit after the post-pilot fixes |
| Model ID | None in use: the proxy isn't deployed, so production runs the offline demo agent only. Planned: `gemini-3.8-flash` | `proxy/wrangler.toml` `GEMINI_MODEL` (server-side, **changeable without an app change**); per live reply in the `agent_reply.detail.model` log | no | Different reasoning/wording in the treatment arm | Decide the engine (see Fallback policy) | Record the model, and check the exports show one model |
| Freeze fingerprint | `24e9ac493899deaa7502d7029993892725f96769f03bb7ddfa59013b9cc5501c` (V3.1 was `9207dca2…`) | `agentConfigDocument()` in `src/lib/freeze.ts`; pinned by `tests/prepilot.test.ts` | candidate | The agent's instructions/tools changed | none | Re-confirm after any post-pilot fix |
| Fallback policy | Live Gemini when configured and reachable. On error or timeout (25 s) the offline agent answers the same turn (labelled in the UI, logged as `agent_fallback`). If the proxy is unreachable at load, **every** turn is offline, recorded only as `provider: mock` | `FALLBACK_POLICY` in `src/lib/freeze.ts`; `orchestrator.ts`; `agentState.tsx` | no | Participants would get different agent mechanisms | **Researcher decision** (below) | Record it, plus the exclusion rule |
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
   - **(a) Offline agent only.** Deterministic, no model ID, no free-tier data sharing. This is today's production. The agent has limited language understanding.
   - **(b) Live Gemini**, with the proxy deployed and the `AGENT_PROXY_URL` repo variable set. Also choose how to treat sessions whose `agent_provider` is `mock` or `mixed`, or whose `agent_fallbacks` > 0:
     - (b1) exclude them;
     - (b2) analyse them separately;
     - (b3) pool them with the rest.

   Either way, keep every study device on `agentMode = auto`. The value is stamped per session.
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
