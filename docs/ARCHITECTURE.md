# Architecture

## V3: agent layer

```
User message / scan / store choice
      ↓
MacroAgent orchestrator (src/agent/orchestrator.ts)
      ├─ live: Gemini generateContent via Cloudflare Worker proxy (proxy/src/index.ts; key only there)
      └─ fallback / offline: MockAgent (src/agent/mock.ts) — deterministic intent parser
      ↓ tool calls (identical for both engines)
─────────────────────────────────────────────────────────────
getUserContext · listNearbyStores · getMenu · optimizeMeal · explainProvenance · analyzeMenuImage · prepareOrder
      (src/agent/tools.ts → lib/optimizer.ts, lib/feasibility.ts, data/*)
─────────────────────────────────────────────────────────────
      ↓ structured results
Cards (from tool results only) + VERIFY (flags model numbers no tool produced) + quick actions
      ↓
User approval (OrderCard → AppState.placeOrder) → pickup / in-store ticket, or counter hand-off
```

| Piece | Files | Notes |
|---|---|---|
| Agent session | `src/agent/agentState.tsx` | sessionStorage: messages, current restaurant, scanned menu (text only), current recommendation, order drafts, Gemini history (last 6 turns, no images). Reset on every trial Begin and demo reset |
| Tools | `src/agent/tools.ts` | JSON-schema declarations for Gemini; each returns `{result, card}`. `prepareOrder` only drafts |
| Adjustments | `lib/optimizer.ts` (`resolveAdjustment`, `optimizeMealConstrained`) | "less/more/none/exact" on a group, resolved against **supported** options only; otherwise a refusal naming the supported options |
| Gemini client | `src/agent/gemini.ts` | Stateless `generateContent` with full history; model content echoed verbatim (keeps `thoughtSignature`); `functionResponse` keeps the call `id`; ≤ 6 tool rounds; 25 s timeout |
| Offline agent | `src/agent/mock.ts` | Same tools. Understands nearby / compare / restaurant names / numbers / diet / "less X" / why / pickup / in-store / menu / scan |
| Proxy | `proxy/` | Origin allow-list, fixed model, body and token caps, field allow-list, server policy preamble, per-IP rate limit, no body logging |
| Map | `src/explore/*` | Leaflet + OSM tiles (attributed), fictional pins; illustrated fallback |
| Scans | `src/scan/imageStore.ts`, `src/scan/menuExtraction.ts`, `src/screens/Scan.tsx` | IndexedDB (30-min TTL, purge on start, Delete scan); consented Gemini extraction to a validated `ScannedMenu`; offline sample clearly labelled |

**Real vs simulated in V3:**
- **Real:** the Gemini calls (once the proxy is deployed), OSM tiles, the camera, QR decoding and IndexedDB.
- **Simulated:** restaurants, locations, integrations, order sending, pickup codes, and the offline sample extraction.

The V2 layers below are unchanged.

MacroTable is a static single-page app with **no backend**: Vite, React 19, TypeScript, Tailwind CSS v4, React Router 7 and `vite-plugin-pwa`. It is deployed to GitHub Pages by GitHub Actions.

```
 UI (screens, components)
   │  reads/writes
   ▼
 State (React context: AppState)  ──►  Research logger (lib/research.ts → localStorage)
   │  target, preferences, selection, experiment lock
   ▼
 Feasibility (lib/feasibility.ts)      hard filters: available, nutrition present, diet, spicy,
   │                                   supported options only, budget
   ▼
 Deterministic optimizer (lib/optimizer.ts, lib/nutrition.ts)
   │  enumerate supported configurations → compute nutrition/price → rank → explain
   ▼
 Mock data (data/restaurants.ts, data/scenarios.ts)
```

## Layers

| Layer | Files | Responsibility |
|---|---|---|
| UI | `src/screens/*`, `src/components/*`, `src/baseline/Baseline.tsx` | Screens for treatment, baseline, research, camera; shared components (ProvenanceBadge, NutritionComparison, ModifierSelector, Explanation, KitchenTicket…) |
| State | `src/state/AppState.tsx`, `useMealSelection.ts` | Scenario, target, preferences, current meal selection, experiment lock; `placeOrder()` completes research sessions |
| Feasibility | `src/lib/feasibility.ts` | "Reaches target" rule (kcal ±10 %, protein ≥ target), meal exclusions, Cartesian enumeration of **supported** options only |
| Optimizer | `src/lib/optimizer.ts`, `src/lib/nutrition.ts` | `x* = argmin_{x∈F} D(N(x),T)`; integer-cent pricing; configurations reaching the target first, then priority (fit / price / delivery time); `explainConfiguration()` (Meets · Trade-offs · Confidence); `infeasibilityReasons()` |
| Mock data | `src/data/*` | 3 fictional restaurants, 11 meals, modifier deltas, 4 scenarios |
| Research logger | `src/lib/research.ts` | Assignment parsing, condition-lock routing, participant sessions, event log, outcome scoring, CSV/JSON export, descriptive summaries |
| Camera | `src/lib/camera.ts`, `src/components/useCamera.ts`, `src/screens/Scan.tsx` | Feature detection, error classification, stream lifecycle, capture, lazy jsQR decoding, upload fallback |
| Platform | `src/components/ErrorBoundary.tsx`, `OfflineBanner.tsx`, `vite.config.ts` | Error recovery, offline notice, PWA manifest + service worker, GitHub Pages base path + `404.html` SPA fallback |

## Invariants (enforced in code and tests)

- **Nutrition is never calculated by AI.** It is base dish + the sum of supported modifier deltas, with money in integer cents.
- **No unsupported modification can be selected, priced or ordered.** Unsupported options never enter the search space, and `computeConfiguration()` throws on them.
- **Ranking follows the user's objective, not integration depth.** A test inverts every restaurant's integration level and asserts an identical ranking.
- **Baseline shares data but not intelligence.** It imports the same `RESTAURANTS` and `computeConfiguration`. A test asserts it never imports the optimizer, recommendations, comparison or explanation components.
- **Demo mode never logs.** `log()` is a no-op unless a participant trial is locked.
- **Participants cannot switch condition.** `lockedRedirect()` routes any other-condition, demo or QR URL back to the assigned condition. `/research` shows only a lock screen mid-trial.

## Real vs simulated

| Real browser behaviour | Simulated external infrastructure |
|---|---|
| Camera via `getUserMedia` (rear camera, tap-only, track cleanup) | Menu photo "analysis" (matches to one of 3 demo menus; no OCR) |
| QR decoding (jsQR) and QR generation (qrcode-generator), both lazy-loaded | Restaurants, menus, recipes, prices, nutrition, provenance |
| File upload fallback | Restaurant integrations (levels 1–3), POS/delivery platforms |
| Deterministic optimizer and explanations | Order sending, kitchen tickets, hand-off, delivery time |
| localStorage research logging, CSV/JSON export | Checkout / payment (never charged) |
| Web Share API with clipboard fallback | "Logged today" food data / health sync |
| PWA install + service-worker cache | Geolocation / "closest" (fixed delivery minutes) |

## Deployment

`.github/workflows/ci.yml` runs on every push to `main`: `npm ci → npm run typecheck → npm test → npm run build` (with `VITE_BASE=/<repo>/`), then uploads `dist/` and deploys it with `actions/deploy-pages`. The router basename comes from `import.meta.env.BASE_URL`. The build copies `index.html` to `404.html` so deep links work on GitHub Pages. The service worker's `navigateFallback` serves the app shell for later navigations.
