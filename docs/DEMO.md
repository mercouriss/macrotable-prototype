# Demo Day

**URL:** https://mercouriss.github.io/macrotable-prototype/demo

Use a laptop browser window ≥1280 px wide. The app appears in a phone frame, with the presenter panel (Reset demo, scenarios A–D, mode links) on the left. On a phone the app fills the screen.

## Before you present

1. Open `/demo` once while online. This resets to Scenario A and caches the app for offline use.
2. Check that the presenter panel says **Demo mode — nothing is logged**.
3. If you'll show QR: open `/research` → *Printable demo QR codes*, and print them or show them on a second screen.

## V3 Demo Day story (agent)

Before you start, check the Agent pill:
- **Live · Gemini** means the proxy is deployed and reachable.
- **Offline demo agent** is fine too. It uses the same tools, but say it's the offline agent.
- If Wi-Fi is unreliable, turn on Profile → **Offline demo agent only**.

```
1. /demo → Home: 700 kcal · ≥45 g protein remaining, €18
2. Explore → map with three fictional stores (FitKitchen 360 m, Local Grill 520 m, Urban Bowl 530 m)
3. Agent → "What should I eat near me?" (or the suggestion chip)
4. Agent compares stores → stores card
5. FitKitchen has the strongest VERIFIED match
6. Agent ran optimizeMeal (tap "2 tool calls" to show the tools)
7. Card: Chicken Power Bowl · +50 g chicken, half rice, light sauce, double veg · 682 kcal · 49 g · €16.50
8. Tap the VERIFIED badge → provenance sheet
9. "Prepare pickup" → order card
10. "Approve & send order" → pickup code (e.g. K42) → Kitchen ticket
11. Scan → Scan a menu → photo/upload → Analyze (live: consent → Gemini; offline: labelled sample)
12. Agent reads the temporary menu → best fit shown as MENU-READ / ESTIMATED
13. Point out lower confidence: not verified, can't be modified, "Order at counter" hand-off
14. Explain the integration-depth strategy: VERIFIED partner (configure + ticket) → OFFICIAL (configure) → scan/estimate (recommend + hand-off)
```

Optional extras:
- *"Yes, but less rice"* re-optimises within supported options.
- At Urban Bowl, *"less rice"* is refused, and the agent names the supported options.
- Scan QR → *Demo: simulate FitKitchen's table QR* → "You're at FitKitchen…".

## V2 exact sequence (guided flow)

```
/demo                      → resets to Scenario A, lands on Home
Reset Demo                 → (presenter panel) only needed between run-throughs
Scenario A                 → Home: 700 kcal · 45 g protein · 75 g carbs · 22 g fat left, €18 budget
Home                       → tap "Find me a meal"
Preferences                → leave defaults (€18, no restriction, Hit my macros, High protein) → "Find meals"
Searching                  → counts: 3 restaurants · 11 meals · 134 supported configurations · 113 within €18 (or tap Skip)
Results                    → BEST MATCH Chicken Power Bowl (VERIFIED) · Teriyaki Salmon Bowl (OFFICIAL) · Grilled Chicken Salad (ESTIMATED)
Chicken Power Bowl         → "View order"
Why this meal              → Target vs order: 682 kcal · 49 g · 72 g · 20 g · €16.50; Meets / Trade-offs / Confidence
Configuration              → "Use MacroTable's version": +50 g chicken, half rice, light sauce, double veg; tap a row to show locked unsupported options
Provenance                 → "How was this calculated?" → Verified recipe sheet
Approval                   → "Review order" → "Confirm configuration"
Kitchen ticket             → "View kitchen ticket": MACROTABLE ORDER #MT10xx
Scenario D failure case    → presenter panel "D" → Find me a meal → Find meals → "No exact configuration available";
                             closest: Chicken Power Bowl (+100 g chicken, no rice, no sauce, double veg) 454 kcal / 57 g — 8 g short
```

Optional extras: Discover → Urban Bowl → "Find what fits my macros here" (restaurant-level failure: 760 kcal / 40 g / €17.20). Scan QR → "Demo: simulate FitKitchen's table QR". Profile → Share app.

## Recovery

| Problem | Fix |
|---|---|
| Wrong screen or state | Presenter panel → **Reset demo** (or open `/demo`) |
| Wrong scenario | Presenter panel → **A** (or add `?scenario=A` to the URL) |
| "Something went wrong" screen | **Return home**, or **Reset demo** (UI state only; research data is never deleted) |
| Onboarding appears | Tap **Skip** (or open `/demo`, which marks it done) |
| "Task in progress" / app stuck in baseline | A participant trial is still locked → `/research` → **Researcher: abort trial** → `/demo` |
| Camera prompt denied | Use **Upload photo**, or the **Demo: simulate FitKitchen's table QR** button |
| No internet | After one online visit the service worker serves the app offline. Otherwise run locally: `npm run dev` |
| Stale version after a deploy | Reload once; the service worker updates automatically |

## Real-device checklist

The build agent tested in desktop Chromium with phone-size emulation (390×844 and 360×740). The camera was tested with an **emulated** stream, not real hardware. Everything below is **NOT TESTED ON REAL DEVICE** until the team ticks it.

Production URL: https://mercouriss.github.io/macrotable-prototype/

| Check | iPhone Safari | Android Chrome |
|---|---|---|
| URL opens; onboarding → Home; no sideways scrolling | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Scan menu: permission prompt only after tapping | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Rear camera is used (not selfie) | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Capture → preview → Retake → capture → Analyze menu | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Deny permission → clear message → Upload photo works | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Camera light turns off after capture / Cancel / leaving screen | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Scan QR: point at a printed demo QR → restaurant opens | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Phone's own camera app on a demo QR → opens `/r/...` | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Full MacroTable flow (Scenario A → kitchen ticket) | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Target fields: numeric keyboard, validation, no zoom-on-focus | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Experiment link (from QR/share) → Begin → order → "Task complete" | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| `/research`: session appears; Export CSV and JSON download/open | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Share link opens native share sheet (or copies) | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Add to Home Screen → opens standalone, safe areas OK | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |
| Airplane mode after first visit → app still opens | NOT TESTED ON REAL DEVICE | NOT TESTED ON REAL DEVICE |

Record the device model, OS and browser version next to each tick, plus any issue.
