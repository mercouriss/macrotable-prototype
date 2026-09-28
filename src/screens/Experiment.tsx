import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Screen } from "../components/Screen";
import { Button, Callout, Card, Eyebrow } from "../components/ui";
import { SCENARIOS } from "../data/scenarios";
import { euroShort } from "../lib/format";
import { conditionHome, parseAssignment } from "../lib/research";
import { useAppState } from "../state/AppState";

/**
 * /experiment?participant=P001&condition=baseline&scenario=A
 * Neutral instructions (identical wording for both conditions); timing starts on Begin.
 */
export function Experiment() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { lock, beginExperiment } = useAppState();
  const parsed = parseAssignment(params);

  // A trial is already running on this device.
  if (lock) {
    const same = parsed.ok && parsed.value.participantId === lock.participantId && parsed.value.condition === lock.condition;
    return (
      <Screen footer={<Button onClick={() => navigate(conditionHome(lock.condition))}>Continue the task</Button>}>
        <div className="pt-16">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Task in progress</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            {same ? "You've already started this task." : "Another task is already running on this device."} Continue where you left
            off.
          </p>
          {!same && <p className="mt-4 text-[13px] text-ink-3">Researcher: abort the running trial from the Research screen first.</p>}
        </div>
      </Screen>
    );
  }

  if (!parsed.ok) {
    return (
      <Screen back="/research" title="Study link">
        <div className="pt-6">
          <h1 className="font-display text-[24px] font-semibold tracking-tight">This study link isn't valid</h1>
          <div className="mt-4">
            <Callout tone="warn" title="Please ask the researcher for a new link.">
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {parsed.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          </div>
          <p className="mt-4 font-mono text-[12px] text-ink-3">Format: /experiment?participant=P001&amp;condition=baseline&amp;scenario=A</p>
        </div>
      </Screen>
    );
  }

  const a = parsed.value;
  const t = SCENARIOS[a.scenarioId].target;
  const diet = SCENARIOS[a.scenarioId].preferences.diet;

  return (
    <Screen
      footer={
        <div className="space-y-2">
          <Button
            onClick={() => {
              const l = beginExperiment(a);
              navigate(conditionHome(l.condition), { replace: true });
            }}
            className="min-h-14 text-[16px]"
          >
            Begin
          </Button>
          <p className="text-center text-[12.5px] text-ink-3">Timing starts when you tap Begin.</p>
        </div>
      }
    >
      <div className="pt-10">
        <p className="text-[13px] font-medium text-ink-3">Study task · Participant {a.participantId}</p>
        <h1 className="mt-1 font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">Order tonight's dinner</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Imagine it's evening and you want to order dinner from a nearby restaurant using this app. Choose and order the one meal you
          think fits best. There are no right or wrong answers, and you can take as long as you need.
        </p>
      </div>
      <Card className="mt-6 p-5">
        <Eyebrow>What you have left today</Eyebrow>
        <ul className="tnum mt-2 space-y-1.5 text-[15.5px] font-medium">
          <li>About {t.calories} kcal</li>
          <li>At least {t.protein} g protein</li>
          <li>
            A budget of {euroShort(t.maxBudget)}
            {diet !== "none" ? ` · ${diet}` : ""}
          </li>
        </ul>
      </Card>
      <ul className="mt-5 space-y-2 text-[13.5px] leading-snug text-ink-2">
        <li className="flex gap-2">
          <Icon name="info" size={16} className="mt-px shrink-0 text-ink-3" />
          Restaurants, food and orders are simulated — nothing is really ordered or paid.
        </li>
        <li className="flex gap-2">
          <Icon name="lock" size={16} className="mt-px shrink-0 text-ink-3" />
          Only your anonymous code and your taps in this app are recorded, on this device.{" "}
          <Link to="/privacy" className="font-medium text-brand underline-offset-2 hover:underline">
            Privacy
          </Link>
        </li>
      </ul>
      <div className="h-6" />
    </Screen>
  );
}

/** Neutral end screen — never reveals the expected best answer. */
export function ExperimentDone() {
  const { lock } = useAppState();
  if (lock) return <Navigate to={conditionHome(lock.condition)} replace />;
  return (
    <Screen>
      <div className="flex min-h-full flex-col items-center justify-center pb-16 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ink text-white">
          <Icon name="check" size={32} stroke={2.6} />
        </span>
        <h1 className="mt-5 font-display text-[26px] font-semibold tracking-[-0.02em]">Task complete</h1>
        <p className="mt-2 max-w-[280px] text-[15px] leading-relaxed text-ink-2">
          Thank you. Please return the device to the researcher, or tell them you've finished.
        </p>
      </div>
    </Screen>
  );
}
