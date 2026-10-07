import { PROXY_URL } from "../agent/gemini";
import { appUrl } from "../lib/share";
import { useAppState } from "../state/AppState";
import { QRCode } from "./QRCode";

/** Desktop showcase (never mounted on phones or for study participants): a QR code to open the app on a phone. */
export function ShowcaseQuickStart() {
  const url = appUrl("");
  return (
    <section data-showcase-qr aria-labelledby="qr-h" className="flex items-center gap-5 rounded-[24px] border border-line bg-surface p-5 shadow-card">
      <QRCode text={url} size={132} label="QR code that opens MacroTable on your phone" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase">Try it yourself</p>
        <h2 id="qr-h" className="mt-1 text-[18px] leading-snug font-semibold text-ink">
          Scan to open MacroTable on your phone
        </h2>
        <p className="mt-1.5 text-[12.5px] break-all text-ink-3">{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
      </div>
    </section>
  );
}

/**
 * Presenter controls: the Live AI switch, large enough to find at a glance during a demo. Same setting as
 * Profile → "Use Gemini API" (off by default); unavailable in a build without the agent proxy.
 */
export function PresenterLiveAiToggle() {
  const { settings, setSettings } = useAppState();
  const on = settings.agentMode === "auto";
  const available = !!PROXY_URL;
  return (
    <div
      data-presenter-live-ai={on ? "on" : "off"}
      className={`mt-3 flex items-center gap-4 rounded-2xl border p-4 transition-colors ${on ? "border-brand/40 bg-brand-soft/60" : "border-line bg-surface"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="text-[17px] font-semibold text-ink">Live AI</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-[0.06em] ${on ? "bg-brand text-white" : "bg-sunken text-ink-2"}`}>
            {on ? "ON" : "OFF"}
          </span>
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
          {on ? "MacroAgent answers with the live Gemini model. API usage may incur costs." : "Offline MacroAgent. Switch on to demo the live Gemini agent."}
          {!available && " Not available in this build (no agent proxy configured)."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Use Gemini API (Live AI)"
        disabled={!available && !on}
        onClick={() => setSettings({ agentMode: on ? "offline" : "auto" })}
        className={`relative h-9 w-16 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-brand" : "bg-ink-3/35"}`}
      >
        <span className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-white shadow-card transition-transform ${on ? "translate-x-7" : ""}`} />
      </button>
    </div>
  );
}
