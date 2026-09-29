# Study pack: pilot and main experiment

> **V3 update:** the treatment is now **agent-guided** (MacroAgent + deterministic tools). The revised hypothesis asks whether an agent that gathers context, invokes deterministic optimization tools, explains trade-offs and guides execution improves the user's food-ordering decision. Run a **new V3 pilot** (`VT001–VT006`) before the main study (`VP001–VP040`). **Don't combine V2 observations with V3 data.** Before recruiting, deploy the proxy ([../../proxy/README.md](../../proxy/README.md)) so participants get the live agent, and check the Agent pill says *Live · Gemini* on each study device.

Operational materials for the MacroTable pilot and main study (protocol: *MacroTable — Pilot Study & Main Experiment Protocol*). **Feature development is paused**: change the app only for critical or major pilot findings.

```
Real-device check → Pilot → Fix protocol → Freeze → Main experiment → Analyze → Strategic decision
```

| File | Use |
|---|---|
| [smoke-test.md](smoke-test.md) | Real iPhone / Android PASS / FAIL / NOT TESTED before recruiting |
| [scenario-difficulty.md](scenario-difficulty.md) | Objective task difficulty, plus **an outcome-definition decision needed before freeze** |
| [assignment-schedule.md](assignment-schedule.md) · [.csv](assignment-schedule.csv) | Counterbalanced AB/BA links: pilot `T001–T006`, main `P001–P040` |
| [questionnaire.md](questionnaire.md) · [responses template](questionnaire-responses-template.csv) | Post-task 1–7 questions and final open questions |
| [observation-sheet.md](observation-sheet.md) | One per participant, plus the after-participant data check |
| [pilot-issue-log.md](pilot-issue-log.md) | Issues, severity, fixes |
| [prepilot-audit-v3.5.md](prepilot-audit-v3.5.md) | **V3.5:** freeze inputs, the three open researcher decisions, pilot scope |
| [freeze-record.md](freeze-record.md) | Fill in at freeze, and log any deviations |
| [analysis/analyze.py](analysis/analyze.py) | Descriptive analysis from JSON exports + questionnaire CSV |

## Session procedure (~10–15 min; the pilot establishes the real duration)

1. Take the next unused code from the schedule, and check the device's **baseline nutrition setting** (`/research` → Demo settings).
2. Open **Task 1**'s link. The participant reads the instructions alone. Don't add explanation, and don't say MacroTable should do better or that one meal is correct.
3. The participant taps **Begin** and completes the task. Don't coach, but record any help on the observation sheet.
4. At "Task complete", ask Q1–Q3 (plus Q4–Q7 after the MacroTable task).
5. Open **Task 2**'s link and repeat steps 2–4.
6. Ask the four final open questions.
7. On `/research`, run the after-participant data check, then **Export JSON + CSV**.

## Analysis

```bash
python3 docs/study/analysis/analyze.py exports/*.json --survey questionnaire-responses.csv --out analysis-output
```

This writes `observations.csv` (one row per participant × condition: the protocol §19 columns plus dimension errors E_K / E_P / E_C / E_F), `within.csv` (Δᵢ = deviation_baseline − deviation_MacroTable; positive means MacroTable was closer), and `report.md` (per-condition n, mean, median, SD, range, feasible rate, within-participant table, secondary outcomes and **failure cases**).

The output is descriptive only: no significance tests and no weighted macro score. Sessions are de-duplicated across device exports, and raw exports are never modified. Keep pilot (`T…`) and main (`P…`) exports in separate folders.

## Evidence labels for the final report (§22)

- **TESTED:** baseline vs MacroTable deviation, completion time, protein and hard-constraint success
- **INTERVIEWED:** open-question findings, trust concerns
- **DOCUMENTED:** POS/API capabilities
- **ASSUMED:** economics inputs that weren't observed

Restaurant-ticket feedback (§24) is *early operational feasibility evidence*. Show `/macrotable/ticket/…` screens or printed tickets to restaurant staff.
