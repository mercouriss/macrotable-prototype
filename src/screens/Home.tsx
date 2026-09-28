import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { MacroSummary } from "../components/MacroSummary";
import { Screen } from "../components/Screen";
import { Button, Card, Eyebrow } from "../components/ui";
import { PERSONA } from "../data/scenarios";
import { euroShort, greeting } from "../lib/format";
import { useAppState } from "../state/AppState";

export function Home() {
  const { target, startSession } = useAppState();
  const navigate = useNavigate();
  const go = (to: string) => {
    startSession("macrotable");
    navigate(to);
  };

  return (
    <Screen nav>
      <div className="flex items-center justify-between pt-6">
        <div>
          <p className="text-[13px] font-medium text-ink-3">
            {new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="mt-0.5 font-display text-[27px] leading-tight font-semibold tracking-[-0.02em]">
            {greeting()}, {PERSONA.name}
          </h1>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-full bg-ink text-[15px] font-semibold text-white" aria-hidden="true">
          {PERSONA.name[0]}
        </div>
      </div>

      <Card as="section" className="mt-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <Eyebrow>Remaining today</Eyebrow>
          <span className="text-[11.5px] text-ink-3">Sample data</span>
        </div>
        <MacroSummary target={target} />
      </Card>

      <button
        onClick={() => navigate("/macrotable/preferences")}
        className="mt-3 flex min-h-16 w-full items-center justify-between rounded-[22px] border border-line-2 bg-surface px-5 py-3.5 text-left shadow-card hover:bg-sunken/50"
      >
        <span>
          <span className="block text-[12.5px] font-medium text-ink-3">Dinner budget</span>
          <span className="tnum block text-[20px] font-semibold tracking-tight">{euroShort(target.maxBudget)}</span>
        </span>
        <span className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
          Edit <Icon name="chevronRight" size={16} />
        </span>
      </button>

      <div className="mt-6 space-y-2.5">
        <Button onClick={() => go("/macrotable/preferences")} className="min-h-14 text-[16px]">
          Find me a meal
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" icon="camera" onClick={() => go("/macrotable/scan?type=menu")}>
            Scan menu
          </Button>
          <Button variant="secondary" icon="qr" onClick={() => go("/macrotable/scan?type=qr")}>
            Scan QR
          </Button>
        </div>
      </div>

      <section className="mt-8 mb-6" aria-labelledby="how">
        <Eyebrow>
          <span id="how">How MacroTable works</span>
        </Eyebrow>
        <ol className="mt-3 space-y-3">
          {[
            ["You set the goal", "Remaining macros, budget and preferences."],
            ["Only real options", "MacroTable only uses modifications the restaurant supports."],
            ["You approve", "Nothing is ordered until you confirm."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sunken text-[12.5px] font-semibold text-ink-2">
                {i + 1}
              </span>
              <span className="text-[14px] leading-snug">
                <span className="font-semibold">{t}</span>
                <span className="block text-ink-3">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </Screen>
  );
}
