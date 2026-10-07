import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState, type Settings } from "../state/AppState";
import { useSheet } from "./Sheet";
import { Button } from "./ui";
import { useMediaQuery } from "./useMediaQuery";

/*
 * Phones only: right after the intro, Home offers a skippable tip on turning on Live AI (on desktop the
 * presenter panel has the Live AI switch itself). Shown once; never in a research trial, never after a
 * demo reset (no intro), and not when Live AI is already on.
 */

export const LIVE_AI_TIP_TITLE = "Turn on Live AI in 3 steps";

/** The team's screen recording (Home → Profile → Use Gemini API → MacroAgent "Live · Gemini"), silent, in public/guide/. */
export const LIVE_AI_GUIDE = { video: "guide/live-ai-guide.mp4", poster: "guide/live-ai-guide-poster.jpg" } as const;

export const LIVE_AI_STEPS: [string, string][] = [
  ["Home", "Start on the Home tab."],
  ["Profile", "Tap Profile, bottom right."],
  ["Use Gemini API", "Under Settings, switch on Live AI. MacroAgent then shows Live · Gemini."],
];

/**
 * Plays once, silently, then stops on its last frame with a play button (not a distracting loop).
 * With reduced motion it waits on the first frame.
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

export function liveAiTipDue(o: { lock: boolean; phone: boolean; settings: Settings }): boolean {
  return !o.lock && o.phone && o.settings.liveAiTipPending === true && o.settings.agentMode !== "auto";
}

/** Mounted on Home in normal mode: opens the tip once when it's due. Renders nothing itself. */
export function LiveAiTip() {
  const { settings, setSettings, lock } = useAppState();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { openCustom, close } = useSheet();
  const navigate = useNavigate();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const shown = useRef(false);
  const due = liveAiTipDue({ lock: !!lock, phone: !desktop, settings });

  useEffect(() => {
    // Desktop already shows this guide in the showcase, and Live AI that's already on needs no tip.
    if (settings.liveAiTipPending && (desktop || settings.agentMode === "auto")) setSettings({ liveAiTipPending: false });
  }, [desktop, settings.liveAiTipPending, settings.agentMode, setSettings]);

  useEffect(() => {
    if (!due || shown.current) return;
    // A short pause so Home has drawn before the sheet slides up.
    const t = setTimeout(() => {
      shown.current = true;
      setSettings({ liveAiTipPending: false }); // once, whatever they choose
      openCustom(
        LIVE_AI_TIP_TITLE,
        <LiveAiTipBody
          autoPlay={!reducedMotion}
          onOpenProfile={() => {
            close();
            navigate("/macrotable/profile", { state: { focus: "live-ai" } });
          }}
          onSkip={close}
        />,
      );
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);

  return null;
}

export function LiveAiTipBody({ autoPlay, onOpenProfile, onSkip }: { autoPlay: boolean; onOpenProfile: () => void; onSkip: () => void }) {
  return (
    <div data-live-ai-tip>
      <p className="text-[14px] leading-snug text-ink-2">
        Want MacroAgent to answer with the live AI model? It's off by default, and switching it on takes three taps.
      </p>
      <div className="mt-4 flex items-start gap-4">
        <GuideVideo base={import.meta.env.BASE_URL} autoPlay={autoPlay} className="w-[112px]" />
        <ol className="min-w-0 flex-1 space-y-2.5 text-[13.5px] text-ink-2">
          {LIVE_AI_STEPS.map(([step, text], i) => (
            <li key={step} className="flex gap-2.5">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
              <span>
                <span className="font-semibold text-ink">{step}.</span> {text}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-3 text-[12px] leading-snug text-ink-3">API usage may incur costs. You can switch it off again any time in Profile.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onSkip} className="min-h-12">
          Skip
        </Button>
        <Button onClick={onOpenProfile} className="min-h-12">
          Open Profile
        </Button>
      </div>
    </div>
  );
}
