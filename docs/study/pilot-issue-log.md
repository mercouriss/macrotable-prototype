# Pilot issue log

| # | Issue | Participant | Severity | Protocol or Product? | Fix? | Retest? | Resolution / commit |
|---|---|---|---|---|---|---|---|
| 0 | *Example:* unclear Begin instruction | T002 | Medium | Protocol | Yes | Yes | |
| 1 | Calories-only primary outcome can favour orders that miss protein (see [scenario-difficulty.md](scenario-difficulty.md)) | — (found before pilot) | **Major** (measurement validity) | Protocol | Decide at freeze | — | |
| 2 | | | | | | | |
| 3 | | | | | | | |

**Severity** (protocol §16):

- **Critical:** invalidates data (wrong condition, logging failure, baseline treatment leakage, optimizer error). Fix before the main study.
- **Major:** materially affects usability or measurement. Fix, and retest where possible.
- **Minor:** cosmetic or low impact. Don't delay the study for it.

## V3 changes (new pilot required)

| Change | Why | Commit |
|---|---|---|
| Treatment becomes agent-guided (MacroAgent tab, tools, Gemini + offline fallback) | Team testing: the agent interaction is part of the mechanism | V3 commits |
| Ordering limited to pickup / in-store, and five-level provenance | V3 scope | V3 commits |

## Changes already made before the V2 pilot

| Change | Why | Commit |
|---|---|---|
| Participant instructions replaced with the protocol §9 wording, verbatim and identical in both conditions | The old text ("the one meal you think fits best") implied a single correct answer | *(this commit)* |
| Scenario B's lower-fat preference (and C's vegetarian) now appears on the instructions screen and in the baseline task banner | Baseline participants previously never saw the lower-fat constraint that MacroTable applied, an information asymmetry between conditions | *(this commit)* |
