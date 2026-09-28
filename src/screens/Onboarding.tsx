import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Plate } from "../components/Plate";
import { PROVENANCE_META } from "../components/ProvenanceBadge";
import { Button } from "../components/ui";
import { useAppState } from "../state/AppState";
import type { Provenance } from "../types";

const STEPS = [
  {
    title: "Restaurant food that fits the rest of your day",
    body: "Ask MacroAgent. It knows what you have left today (calories, protein, budget) and finds nearby food that fits.",
    art: "fit",
  },
  {
    title: "Only changes the restaurant supports",
    body: "MacroTable adjusts dishes using the kitchen's own options, like half rice or extra chicken. It never invents a modification.",
    art: "mods",
  },
  {
    title: "You stay in control",
    body: "Every meal shows where its nutrition comes from, from verified to estimated. MacroAgent prepares pickup or in-store orders, and nothing is ordered until you approve it.",
    art: "control",
  },
] as const;

/** First-run onboarding: 3 screens, skippable, completion stored locally. */
export function Onboarding() {
  const [i, setI] = useState(0);
  const { setSettings } = useAppState();
  const navigate = useNavigate();
  const finish = () => {
    setSettings({ onboardingDone: true });
    navigate("/macrotable", { replace: true });
  };
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="flex h-full flex-col bg-canvas px-6 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="flex h-12 items-center justify-end">
        {!last && (
          <button onClick={finish} className="min-h-11 rounded-full px-4 text-[14px] font-medium text-ink-2 hover:bg-sunken">
            Skip
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center" aria-live="polite">
        <div key={i} className="animate-rise">
          <Art kind={step.art} />
          <p className="mt-10 text-[13px] font-medium text-ink-3">
            {i + 1} of {STEPS.length}
          </p>
          <h1 className="mt-1 font-display text-[28px] leading-[1.15] font-semibold tracking-[-0.02em]">{step.title}</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{step.body}</p>
        </div>
      </div>
      <div className="mb-4 flex justify-center gap-1.5" aria-hidden="true">
        {STEPS.map((_, j) => (
          <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? "w-6 bg-ink" : "w-1.5 bg-line"}`} />
        ))}
      </div>
      <Button onClick={() => (last ? finish() : setI(i + 1))} className="min-h-14 text-[16px]">
        {last ? "Get started" : "Next"}
      </Button>
      <p className="mt-3 text-center text-[12px] text-ink-3">
        University prototype · all restaurant data simulated ·{" "}
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
      </p>
    </div>
  );
}

function Art({ kind }: { kind: (typeof STEPS)[number]["art"] }) {
  if (kind === "fit")
    return (
      <div className="flex items-center gap-4" aria-hidden="true">
        <Plate palette={["#E9D9B6", "#C98F5A", "#6F9A5B", "#D8B35A"]} size={96} />
        <div className="space-y-2">
          {[
            ["700 kcal", "left"],
            ["45 g", "protein"],
            ["€18", "budget"],
          ].map(([a, b]) => (
            <p key={a} className="tnum text-[15px]">
              <span className="font-semibold">{a}</span> <span className="text-ink-3">{b}</span>
            </p>
          ))}
        </div>
      </div>
    );
  if (kind === "mods")
    return (
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {["+50 g chicken", "Half rice", "Light sauce", "Double veg"].map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-2 text-[14px] font-semibold text-brand">
            <Icon name="check" size={14} stroke={2.6} /> {t}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-2 text-[14px] font-medium text-ink-3">
          <Icon name="lock" size={14} /> Sauce on the side
        </span>
      </div>
    );
  return (
    <div className="space-y-2" aria-hidden="true">
      {(["verified", "official", "estimated"] as Provenance[]).map((p) => {
        const m = PROVENANCE_META[p];
        return (
          <div key={p} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold tracking-[0.06em] ${m.chip} mr-2`}>
            <Icon name={m.icon} size={14} stroke={2.4} /> {m.label}
            <span className="font-medium tracking-normal opacity-80">· {m.sub}</span>
          </div>
        );
      })}
      <div className="mt-2 inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-white">
        <Icon name="check" size={16} stroke={2.6} /> You approve every order
      </div>
    </div>
  );
}
