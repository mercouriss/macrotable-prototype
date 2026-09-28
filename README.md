# MacroTable — mobile research prototype

> **MacroTable is a university research prototype. Restaurant integrations, nutrition values, health synchronization, commerce actions and orders are simulated unless explicitly stated otherwise.**

Team 44 · Information Strategy

**Live app:** https://mercouriss.github.io/macrotable-prototype/
**Repository:** https://github.com/mercouriss/macrotable-prototype

## Concept

MacroTable is a nutrition-aware food-commerce agent. You give it your remaining calories and macros, a budget and your preferences. It searches restaurant meals and **uses only the modifications each restaurant supports**. It then picks the best feasible configuration, explains the choice and where its nutrition data comes from, and asks for your approval. Finally it turns the decision into a restaurant-readable kitchen order.

> **AI interprets. Optimization calculates. Restaurant constraints determine what can actually be made.**

The research question the prototype exists to test:

> *Does MacroTable help users select a feasible restaurant order that better fits their nutritional objective than conventional ordering?*

## Status

V2 is a controlled research prototype, not a product. It has three operating modes:

| Mode | Entry | Behaviour |
|---|---|---|
| **Demo** | `/demo` (or just open the app) | Scenario A, canonical data, presenter panel on wide screens, **nothing is logged** |
| **Participant** | `/experiment?participant=P001&condition=baseline&scenario=A` | Neutral instructions → **Begin** starts timing → assigned condition/scenario locked → neutral completion screen |
| **Researcher** | `/research` | Create participant links (copy / share / QR), inspect sessions and summaries, export CSV/JSON, clear local data |

## Install, run, test, build

Requires Node 20+ (CI uses Node 24).

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm test             # Vitest — 48 tests
npm run build        # production build into dist/ (base "/")
npm run preview      # serve the production build
```

To build for GitHub Pages locally: `VITE_BASE=/macrotable-prototype/ npm run build`. See `.env.example`.

CI (`.github/workflows/ci.yml`) runs `npm ci → typecheck → test → build` on every push and PR. On `main` it then deploys `dist/` to GitHub Pages. No linter is configured.

## Routes

| Route | Purpose |
|---|---|
| `/` → `/macrotable` | Treatment app (Home). First visit shows a 3-screen onboarding (`/welcome`) |
| `/macrotable/preferences` | Budget, diet, priority, preferences, validated editable targets, **Reset demo values** |
| `/macrotable/results` | Best option per restaurant, ranked by fit |
| `/macrotable/meal/:id` | "Why this meal": target vs order, **Meets / Trade-offs / Confidence** |
| `/macrotable/configure/:id` | Original → MacroTable version; supported modifiers only |
| `/macrotable/review` | Approval (nothing is ordered without it) |
| `/macrotable/success/:n`, `/macrotable/ticket/:n` | Simulated order + kitchen ticket |
| `/macrotable/failure` | No exact match / budget failure / diet failure |
| `/macrotable/scan?type=menu\|qr` | Camera: menu photo or table QR |
| `/r/:restaurantId` | Table-QR landing (demo QR codes encode this URL) |
| `/macrotable/discover`, `/orders`, `/profile` | Browse restaurants, demo orders, profile/share/reset |
| `/baseline` | Conventional ordering (unrecorded preview unless started from an experiment link) |
| `/experiment?participant=&condition=&scenario=` | Participant assignment link |
| `/experiment/done` | Neutral completion screen |
| `/research` | Researcher dashboard |
| `/demo` | Demo lock: reset to Scenario A, canonical data |
| `/privacy` | Prototype privacy notice |

`?scenario=A|B|C|D` on any demo-mode URL switches scenario. It is ignored during a participant trial.

## Camera and HTTPS

- The camera is requested **only after a tap** on *Scan menu*, *Scan QR* or *Open camera*. Opening a scan URL directly does not start it.
- The rear camera is preferred (`facingMode: { ideal: "environment" }`) and audio is never requested. All tracks are stopped on capture, cancel, leaving the screen, or when the app is backgrounded.
- There are clear states for permission denied, no camera, camera busy, insecure page (HTTP) and unsupported browser. Every state offers **Upload photo** (`<input type="file" accept="image/*">`).
- Browsers only allow the camera on **HTTPS** (or `localhost`). Use the public `https://` URL on phones.
- Photos stay in memory as `blob:` URLs on the device and are **never uploaded**.
- **Menu analysis is simulated:** "Prototype analysis — matching this image to our demo menu dataset." No OCR or AI reads the photo, and the user can correct the matched demo menu.
- **QR decoding is real** (jsQR, lazy-loaded). Known demo codes open `/r/<restaurant>`. Unknown codes say there is no structured data and offer estimated mode. Printable demo QR codes are on `/research`.

## Research workflow (summary)

1. On `/research`, enter an anonymous code (suggested `P001`, `P002`, …), pick a condition and scenario, then **Copy / Share / QR**, or **Start on this device**.
2. The participant reads neutral instructions and taps **Begin**. Timing starts then.
3. The condition and scenario are locked. The presenter panel, demo reset and research dashboard are hidden, and the other condition is unreachable.
4. The order confirmation ends the trial and shows a neutral "Task complete" screen that doesn't reveal the best answer.
5. Back on `/research`, review sessions and summaries, then **Export CSV** and **Export JSON** after every session.

Full protocol: [docs/EXPERIMENT.md](docs/EXPERIMENT.md).

## Storage and export limits

Research data lives **only in this browser's localStorage on this device**, with an in-memory fallback if storage is blocked. It is lost if site data is cleared, and it isn't shared across devices or browsers. **Export after every session.** *Clear local research data* deletes sessions and simulated orders after a confirmation. It never touches app code or mock data, and it is separate from **Reset demo**, which only resets the UI to Scenario A and never deletes research data. Exports contain the anonymous code, condition, scenario, timings, configuration, nutrition, price and outcome flags. They contain no photos, names or device identifiers.

## What is simulated

Restaurants, menus, recipes, prices, nutrition values and provenance labels are all fictional. The same goes for restaurant integrations (levels 1–3), order sending, kitchen tickets, hand-off, checkout and payment (nothing is ever charged), delivery times and "closest", the "logged today" macros, and menu-photo recognition. Real: browser camera access, QR decoding, the deterministic optimizer, local research logging and exports, and the PWA install/offline cache.

Not integrated: Uber Eats, DoorDash, Toast, Square, Apple Health, Google Health Connect, maps, geolocation, accounts, payments, LLM APIs, analytics, and any backend.

## Known limitations

- Nutrition data is invented. It is internally consistent but not measured. VERIFIED describes the data source, not guaranteed accuracy.
- Modifier deltas are additive and independent, and orders are one meal only (no sides, fees or tips).
- The ±10 % calorie rule, the protein-as-minimum rule and the ranking weights are prototype design choices, not validated thresholds.
- Research data is per-device localStorage, so export after each session.
- **GitHub Pages deep links:** the build ships real `index.html` copies for the entry routes (`/macrotable`, `/baseline`, `/research`, `/experiment`, `/demo`, `/privacy`, `/welcome`). Opening them directly returns HTTP 200 after one 301 redirect that adds a trailing slash, which the app then removes. Other deep URLs (e.g. `/macrotable/results`) still load through the `404.html` SPA fallback on a first visit: the app renders normally, but the HTTP status is 404. After the first visit the service worker serves the app shell directly.
- The PWA offline cache is best-effort and not guaranteed like a production app.
- Real iPhone Safari / Android Chrome behaviour is **NOT TESTED ON REAL DEVICE** by the build agent. See [docs/DEMO.md](docs/DEMO.md#real-device-checklist).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, real vs simulated
- [docs/EXPERIMENT.md](docs/EXPERIMENT.md): study design, participant links, logging, export
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): restaurants, meals, modifiers, provenance, sessions, events
- [docs/DEMO.md](docs/DEMO.md): Demo Day script, recovery, real-device checklist
- [docs/study/](docs/study/README.md): pilot and main-study pack (smoke test, counterbalanced links, questionnaire, observation sheet, issue log, freeze record, analysis script)
