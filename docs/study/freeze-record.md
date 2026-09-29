# Experiment freeze record

Complete this **after** the pilot fixes and the final smoke test, and **before** the first main-study participant (protocol §18). From then on, don't change the experimental interface unless a critical failure forces it. If one does, stop collection, record the issue and version below, and assess whether earlier observations stay comparable.

| Item | Frozen value |
|---|---|
| Version | **V3.5 (product-candidate treatment)**. Don't pool with V2, V3 or V3.1 data |
| Treatment identity in data | Every session has `build.treatmentVersion` (V3.5) and `build.appCommit`. `analyze.py --treatment V3.5` (the default) excludes anything else. Logging schema: `macrotable.research.v2`, with the optional `build` stamp and 5 appended CSV columns |
| Agent config fingerprint (candidate) | `20e66fac682e2aa11717dcfb174d6973b44b2dff214edb90ea555fd58fb8f639`: the fallback policy names `gemini-3.8-flash` → `gemini-3.7-flash` → offline, and `optimizeMeal` documents the "no X" rule (MacroAgent audit gaps 1 + 4). Pinned in `tests/prepilot.test.ts`; confirm at freeze. History: `24e9ac49…` → `e6b5839d…` → this |
| Exclusion criteria | Sessions without `build.treatmentVersion = V3.5`; aborted/incomplete sessions. Per the engine decision, using the CSV `agent_engine` column: sessions containing `secondary` → exclude / separate / pool (**decide**); sessions containing `offline` (or `agent_fallbacks` > 0) → exclude / separate / pool (**decide**) |
| Study restaurant dataset | `STUDY_RESTAURANTS` in `src/data/restaurants.ts`: FitKitchen (L3), Urban Bowl (L2), Local Grill (L1), used by `/baseline` and by the treatment while a trial runs. Public-only demo brands and real restaurants are never shown in trials |
| Prototype commit | `________` (`git rev-parse --short HEAD` on `main`) |
| Agent engine | Proxy URL `________` · **primary** model `________` (planned `gemini-3.8-flash`) · **secondary** model `________` (planned `gemini-3.7-flash`, or none) · offline demo agent as last resort · from `/v1/health` and `/research` → Freeze record values · Gemini tier: free / paid |
| Agent config fingerprint | SHA-256 (prompt + tool schemas + settings + fallback policy) `________________` · temperature 0.2 · max 1024 tokens · ≤ 6 tool rounds |
| Sessions with agent fallback | **Secondary** (`agent_engine` contains `secondary`): together / separately / exclude · **Offline** (`agent_engine` contains `offline`): together / separately / exclude (decide both now) |
| Deployment version / date | GitHub Actions run `#____` · deployed `____-__-__` |
| Scenarios | Task 1 = **A** (700 kcal · ≥45 g P · ≤ €18), Task 2 = **B** (800 kcal · ≥55 g P · ≤ €20 · lower fat) — *confirm* |
| Baseline nutrition setting | Visible / Hidden — **decide** (protocol §7 recommends visible if plausible for a conventional digital menu). Set on `/research` → Demo settings on **every study device**, and check it before each session |
| Primary outcome | \|kcal − target\| among feasible orders — **record the decision on protein** (see [scenario-difficulty.md](scenario-difficulty.md)): option 1 / 2 / 3 |
| Secondary outcomes | completion time, protein success, hard-constraint success, price, modifier changes, meals viewed, effort, confidence, satisfaction, usefulness, trust, delegation comfort, likelihood of use |
| Participant instructions | Protocol §9 wording, verbatim in the app (`PARTICIPANT_INSTRUCTION` in `src/lib/research.ts`) |
| Survey questions | [questionnaire.md](questionnaire.md) as of commit `________` |
| Counterbalancing | Alternating AB / BA by participant number, per [assignment-schedule.md](assignment-schedule.md) |
| Eligibility | Adults with some familiarity with calorie/macro tracking, fitness nutrition or choosing meals around nutrition goals. No recruitment on medical conditions |
| Devices | e.g. team iPhone ____ (Safari __) / participants' own phones |
| Data-export procedure | After every participant: `/research` → Export JSON + CSV → save as `<code>_<device>_<date>.json` → study folder. Raw exports are never edited; analysis with `analysis/analyze.py` writes derived files separately |

## Deviations log (after freeze)

| Date | What happened | Participants affected | Action | Comparable? |
|---|---|---|---|---|
| | | | | |
