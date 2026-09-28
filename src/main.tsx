import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./index.css";
import { AppStateProvider } from "./state/AppState";

// No StrictMode: its dev-only double effects would double-log research events.
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </BrowserRouter>,
);
