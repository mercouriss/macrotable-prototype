# Real-device smoke test (before recruiting)

Production: https://mercouriss.github.io/macrotable-prototype/

Mark each cell **PASS**, **FAIL** (with a note) or **NOT TESTED**. Everything starts as NOT TESTED. The build agent had no real phone and no camera hardware.

Before starting, clear the site's data or use a private tab, so onboarding shows on first visit. After the smoke test, open `/research` → **Clear local research data** so test sessions never mix with pilot data.

| # | Check | iPhone Safari (model / iOS) | Android Chrome (model / version) |
|---|---|---|---|
| 1 | Root URL loads; onboarding → Home; no sideways scrolling | NOT TESTED | NOT TESTED |
| 2 | `/demo` → Scenario A path to kitchen ticket (682 kcal / 49 g / €16.50) | NOT TESTED | NOT TESTED |
| 3 | Scan menu: camera permission prompt appears **only after the tap** | NOT TESTED | NOT TESTED |
| 4 | Rear camera used (not selfie) | NOT TESTED | NOT TESTED |
| 5 | Capture → Retake → capture → Analyze menu → "Prototype analysis" wording → Find what fits | NOT TESTED | NOT TESTED |
| 6 | Camera indicator turns off after capture, Cancel and leaving the screen | NOT TESTED | NOT TESTED |
| 7 | Deny permission → clear message → Upload photo works | NOT TESTED | NOT TESTED |
| 8 | Scan QR on a printed demo code (`/research` → Printable demo QR codes) → restaurant page | NOT TESTED | NOT TESTED |
| 9 | Phone's own camera app on a demo QR → opens the app at `/r/...` | NOT TESTED | NOT TESTED |
| 10 | Preferences: numeric keyboard, validation message, page doesn't zoom on focus | NOT TESTED | NOT TESTED |
| 11 | Pilot link `VT001` Task 1 (baseline A) → Begin → order → "Task complete" | NOT TESTED | NOT TESTED |
| 12 | Pilot link `VT001` Task 2 (MacroTable B) → Begin → order → "Task complete" | NOT TESTED | NOT TESTED |
| 13 | Mid-trial: typing `/macrotable` or `/demo` in the address bar returns to the assigned task | NOT TESTED | NOT TESTED |
| 14 | `/research` shows both sessions; **Export CSV** and **Export JSON** save/open on the phone | NOT TESTED | NOT TESTED |
| 15 | Share button opens the share sheet (or copies the link) | NOT TESTED | NOT TESTED |
| 16 | Add to Home Screen → opens standalone; top/bottom not hidden under notch or home bar | NOT TESTED | NOT TESTED |
| 17 | Airplane mode after one visit → app still opens | NOT TESTED | NOT TESTED |
| 18 | **V3** Agent pill shows *Live · Gemini* (proxy deployed) | NOT TESTED | NOT TESTED |
| 19 | **V3** "What should I eat near me?" → FitKitchen, 682 kcal / 49 g / €16.50, DEMO VERIFIED; steps checklist shown | NOT TESTED | NOT TESTED |
| 20 | **V3** "less rice" at Urban Bowl is refused with supported options | NOT TESTED | NOT TESTED |
| 21 | **V3** Prepare pickup → Approve → pickup code; in a trial → "Task complete" | NOT TESTED | NOT TESTED |
| 22 | **V3.1** Explore map tiles load; real pins dashed, DEMO pins tagged; tapping a pin brings its card into view; illustrated fallback in airplane mode | NOT TESTED | NOT TESTED |
| 25 | **V3.1** Real restaurant (e.g. Mozza) → Ask Agent → "not affiliated" + Scan the menu here | NOT TESTED | NOT TESTED |
| 26 | **V3.1** Phone shows only the app (no showcase/video); desktop ≥1024 px shows the showcase, except on study links | NOT TESTED | NOT TESTED |
| 23 | **V3** Menu photo → consent → Gemini extraction → agent shows MENU-READ/ESTIMATED; Delete scan works | NOT TESTED | NOT TESTED |
| 24 | **V3** Airplane mode → Agent shows "Offline demo agent" and still answers | NOT TESTED | NOT TESTED |

**Go/no-go (V3):** rows 1, 2, 11–14, 18, 19 and 21 must PASS on at least one phone type used by participants before recruiting. Camera rows (3–9) affect demo credibility, not the main experiment, because the experiment doesn't use the camera.
