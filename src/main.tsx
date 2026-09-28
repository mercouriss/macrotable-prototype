import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { AppStateProvider } from "./state/AppState";
import { AgentStateProvider } from "./agent/agentState";

// Service worker only in production builds (never interferes with the dev server).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}

// Temporary menu photos: drop anything past its TTL on start-up.
void import("./scan/imageStore").then((m) => m.purgeExpiredScans());

// No StrictMode: its dev-only double effects would double-log research events.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
      <AppStateProvider>
        <AgentStateProvider>
          <App />
        </AgentStateProvider>
      </AppStateProvider>
    </BrowserRouter>
  </ErrorBoundary>,
);
