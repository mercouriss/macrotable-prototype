import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState, type Settings } from "../state/AppState";
import { useSheet } from "./Sheet";
import { GuideVideo, LIVE_AI_STEPS } from "./ShowcaseQuickStart";
import { Button } from "./ui";
import { useMediaQuery } from "./useMediaQuery";

/*
 * Phones only: right after the intro, Home offers a skippable tip on turning on Live AI (the desktop
 * showcase has the same guide beside the phone). Shown once; never in a research trial, never after a
 * demo reset (no intro), and not when Live AI is already on.
 */

export const LIVE_AI_TIP_TITLE = "Turn on Live AI in 3 steps";

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
