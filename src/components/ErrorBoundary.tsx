import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORAGE_KEYS } from "../lib/experiment";

const home = () => `${import.meta.env.BASE_URL}macrotable`;

function trialRunning(): boolean {
  try {
    return !!JSON.parse(localStorage.getItem(STORAGE_KEYS.state) ?? "null")?.lock;
  } catch {
    return false;
  }
}

/** Top-level safety net. "Reset demo" clears UI state only — never research data — and is hidden during a trial. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("MacroTable crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const locked = trialRunning();
    return (
      <div role="alert" className="flex min-h-full flex-col items-center justify-center bg-canvas px-8 py-16 text-center">
        <h1 className="font-display text-[24px] font-semibold tracking-tight">Something went wrong.</h1>
        <p className="mt-2 max-w-[300px] text-[14.5px] text-ink-2">
          {locked ? "Your task is still saved. Return to it and continue." : "You can return home, or reset the demo to its starting state."}
        </p>
        <div className="mt-8 grid w-full max-w-[300px] gap-2.5">
          <button
            className="min-h-12 rounded-2xl bg-brand px-5 text-[15px] font-semibold text-white"
            onClick={() => window.location.assign(locked ? `${import.meta.env.BASE_URL}experiment` : home())}
          >
            {locked ? "Return to task" : "Return home"}
          </button>
          {!locked && (
            <button
              className="min-h-12 rounded-2xl border border-line bg-surface px-5 text-[15px] font-semibold"
              onClick={() => {
                try {
                  localStorage.removeItem(STORAGE_KEYS.state);
                } catch {
                  /* ignore */
                }
                window.location.assign(home());
              }}
            >
              Reset demo
            </button>
          )}
        </div>
      </div>
    );
  }
}
