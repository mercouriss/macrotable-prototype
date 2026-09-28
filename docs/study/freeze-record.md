# Experiment freeze record

Complete this **after** the pilot fixes and the final smoke test, and **before** the first main-study participant (protocol §18). From then on, don't change the experimental interface unless a critical failure forces it. If one does, stop collection, record the issue and version below, and assess whether earlier observations stay comparable.

| Item | Frozen value |
|---|---|
| Version | **V3 (agent-guided treatment)**. Don't pool with V2 data |
| Prototype commit | `________` (`git rev-parse --short HEAD` on `main`) |
| Agent engine | Proxy URL `________` · model `________` (from `proxy/wrangler.toml`) · Gemini tier: free / paid |
| Sessions with agent fallback | Analyse together / separately / exclude (decide now) |
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
