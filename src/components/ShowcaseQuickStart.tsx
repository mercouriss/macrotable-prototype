import { useEffect, useRef, useState } from "react";
import { appUrl } from "../lib/share";
import { QRCode } from "./QRCode";
import { useMediaQuery } from "./useMediaQuery";

/** The team's screen recording (Home → Profile → Use Gemini API → MacroAgent "Live · Gemini"), silent, in public/guide/. */
export const LIVE_AI_GUIDE = { video: "guide/live-ai-guide.mp4", poster: "guide/live-ai-guide-poster.jpg" } as const;

export const LIVE_AI_STEPS: [string, string][] = [
  ["Home", "Start on the Home tab."],
  ["Profile", "Tap Profile, bottom right."],
  ["Use Gemini API", "Under Settings, switch on Live AI. MacroAgent then shows Live · Gemini."],
];

/**
 * Plays once, silently, when the page opens, then stops on its last frame with a play button, so it
 * doesn't keep moving beside the live demo. With reduced motion it waits on the first frame.
 */
export function GuideVideo({ base, autoPlay, className = "w-[132px]" }: { base: string; autoPlay: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"playing" | "paused" | "ended">(autoPlay ? "playing" : "paused");
  useEffect(() => {
    if (!autoPlay) return;
    ref.current?.play().catch(() => setState("paused")); // autoplay blocked: show the play button
  }, [autoPlay]);
  const play = () => {
    const v = ref.current;
    if (!v) return;
    if (v.ended) v.currentTime = 0;
    v.play().catch(() => setState("paused"));
  };
  return (
    <div data-guide-video={state} className={`relative shrink-0 ${className}`}>
      <video
        ref={ref}
        src={`${base}${LIVE_AI_GUIDE.video}`}
        poster={`${base}${LIVE_AI_GUIDE.poster}`}
        muted
        playsInline
        preload="metadata"
        onPlay={() => setState("playing")}
        onPause={(e) => setState(e.currentTarget.ended ? "ended" : "paused")}
        onEnded={() => setState("ended")}
        onClick={() => (state === "playing" ? ref.current?.pause() : play())}
        aria-label="Screen recording: on a phone, Home, then Profile, then switching on Use Gemini API, after which MacroAgent shows Live, Gemini"
        className="block aspect-[540/1170] w-full rounded-[18px] border border-line bg-ink object-cover"
      />
      {state !== "playing" && (
        <button
          type="button"
          onClick={play}
          aria-label={state === "ended" ? "Play the Live AI guide again" : "Play the Live AI guide"}
          className="group absolute inset-0 grid place-items-center rounded-[18px] bg-ink/10 transition-colors hover:bg-ink/20"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ink/80 text-white shadow-lift transition-transform group-hover:scale-105">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="ml-0.5">
              <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}

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
          <GuideVideo base={base} autoPlay={!reducedMotion} />
          <div className="min-w-0 flex-1">
            <ol className="space-y-2.5 text-[13px] text-ink-2">
              {LIVE_AI_STEPS.map(([step, text], i) => (
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
