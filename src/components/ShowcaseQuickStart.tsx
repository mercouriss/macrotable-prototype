import { appUrl } from "../lib/share";
import { QRCode } from "./QRCode";
import { useMediaQuery } from "./useMediaQuery";

/** The team's screen recording (Home → Profile → Use Gemini API → MacroAgent "Live · Gemini"), silent, in public/guide/. */
export const LIVE_AI_GUIDE = { video: "guide/live-ai-guide.mp4", poster: "guide/live-ai-guide-poster.jpg" } as const;

const STEPS: [string, string][] = [
  ["Home", "Start on the Home tab."],
  ["Profile", "Tap Profile, bottom right."],
  ["Use Gemini API", "Under Settings, switch on Live AI. MacroAgent then shows Live · Gemini."],
];

/**
 * Desktop showcase (never mounted on phones or for study participants): a QR code to open the app on a
 * phone, and the screen recording of how to turn on Live AI for a live agent demo. Live AI stays off by default.
 */
export function ShowcaseQuickStart() {
  const url = appUrl("");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const base = import.meta.env.BASE_URL;
  return (
    <div className="flex flex-col gap-4">
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

      <section data-showcase-guide aria-labelledby="guide-h" className="rounded-[24px] border border-line bg-surface p-5 shadow-card">
        <p className="text-[11px] font-semibold tracking-[0.09em] text-brand uppercase">For live agent use</p>
        <h2 id="guide-h" className="mt-1 text-[18px] leading-snug font-semibold text-ink">
          Turn on Live AI in 3 taps
        </h2>
        <div className="mt-4 flex items-start gap-5">
          <video
            src={`${base}${LIVE_AI_GUIDE.video}`}
            poster={`${base}${LIVE_AI_GUIDE.poster}`}
            // Silent, on a loop; with reduced motion it waits for the viewer to press play.
            autoPlay={!reducedMotion}
            controls={reducedMotion}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Screen recording: on a phone, Home, then Profile, then switching on Use Gemini API, after which MacroAgent shows Live, Gemini"
            className="aspect-[540/1170] w-[132px] shrink-0 rounded-[18px] border border-line bg-ink object-cover"
          />
          <div className="min-w-0 flex-1">
            <ol className="space-y-2.5 text-[13px] text-ink-2">
              {STEPS.map(([step, text], i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
                  <span>
                    <span className="font-semibold text-ink">{step}.</span> {text}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[12px] leading-snug text-ink-3">
              Live AI is off by default. When it's on, MacroAgent answers with the live Gemini model, and API usage may incur costs. Switch it off
              again after the demo.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
