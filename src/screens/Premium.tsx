import { useState } from "react";
import { Icon } from "../components/Icon";
import { Screen } from "../components/Screen";
import { ButtonLink, Card } from "../components/ui";

/*
 * MacroTable Premium — a PROTOTYPE PRICING CONCEPT (team decision 2026-09-29).
 * No billing exists: nothing is locked, nothing can be bought, no payment details
 * are ever asked for. Features are labelled honestly as built ("In this prototype")
 * or not built ("Concept"). The purpose is to make one hypothesis testable:
 * is cross-restaurant, agentic convenience worth paying for?
 */

type Status = "built" | "concept" | "sample";
const STATUS: Record<Status, string> = { built: "In this prototype", concept: "Concept · not built", sample: "Sample data" };

const FREE: [string, Status][] = [
  ["Browse restaurants and menus with nutrition", "built"],
  ["Best-fit pick with supported changes, per search", "built"],
  ["Table QR at MacroTable restaurants", "built"],
  ["Basic tracking of what's left today", "sample"],
];

const PREMIUM: [string, string, Status][] = [
  ["MacroAgent across restaurants", "Compares nearby places, configures a dish and prepares the order for your approval.", "built"],
  ["Camera menu reading", "Photograph any menu; MacroAgent reads it (MENU-READ / ESTIMATED).", "built"],
  ["Saved meals & order again", "Keep exact configurations and reorder in two taps.", "built"],
  ["Food photo recognition", "Recognise a plate you're served.", "concept"],
  ["Personalised meal plans", "Plan the week's restaurant meals around your goals.", "concept"],
  ["Advanced nutrition insights", "Trends across your orders.", "concept"],
];

export function Premium() {
  const [plan, setPlan] = useState<"month" | "year">("month");
  return (
    <Screen title="MacroTable Premium" back="/macrotable/profile" footer={<ButtonLink to="/macrotable" variant="secondary">Back to MacroTable</ButtonLink>}>
      <div className="mt-2 overflow-hidden rounded-[24px] bg-ink p-6 text-white shadow-lift">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] text-white/85">
          <Icon name="sparkle" size={13} /> PROTOTYPE PRICING · CONCEPT
        </span>
        <h2 className="mt-4 font-display text-[26px] leading-tight font-semibold tracking-[-0.02em]">Your nutrition goals, turned into restaurant orders.</h2>
        <div role="radiogroup" aria-label="Billing period" className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1">
          {(
            [
              ["month", "Monthly"],
              ["year", "Yearly · save 37%"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={plan === id}
              onClick={() => setPlan(id)}
              className={`min-h-10 rounded-xl text-[13px] font-semibold ${plan === id ? "bg-white text-ink" : "text-white/75"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="tnum mt-4 text-[34px] leading-none font-semibold tracking-tight">
          {plan === "month" ? "€7.99" : "€59.99"}
          <span className="ml-1 text-[15px] font-medium text-white/70">/ {plan}</span>
        </p>
        {plan === "year" && <p className="tnum mt-1 text-[12.5px] text-white/65">≈ €5.00 a month</p>}
        <p className="mt-4 rounded-xl bg-white/10 px-3 py-2.5 text-[12.5px] leading-snug text-white/85">
          Beta: every Premium feature that exists is unlocked for free. There is no billing and MacroTable never asks for payment details.
        </p>
      </div>

      <section className="mt-6" aria-labelledby="free-h">
        <h3 id="free-h" className="text-[15px] font-semibold">
          Free <span className="font-normal text-ink-3">· always</span>
        </h3>
        <Card className="mt-2 divide-y divide-line-2 overflow-hidden">
          {FREE.map(([t, st]) => (
            <div key={t} className="flex items-center gap-3 px-4 py-3">
              <Icon name="check" size={16} stroke={2.4} className="shrink-0 text-brand" />
              <span className="flex-1 text-[14px]">{t}</span>
              <StatusTag s={st} />
            </div>
          ))}
        </Card>
      </section>

      <section className="mt-6" aria-labelledby="premium-h">
        <h3 id="premium-h" className="text-[15px] font-semibold">
          Premium <span className="font-normal text-ink-3">· everything in Free, plus</span>
        </h3>
        <Card className="mt-2 divide-y divide-line-2 overflow-hidden">
          {PREMIUM.map(([t, d, st]) => (
            <div key={t} className="flex items-start gap-3 px-4 py-3">
              <Icon name={st === "concept" ? "clock" : "sparkle"} size={16} className={`mt-0.5 shrink-0 ${st === "concept" ? "text-ink-3" : "text-brand"}`} />
              <span className="flex-1">
                <span className={`block text-[14px] font-medium ${st === "concept" ? "text-ink-2" : ""}`}>{t}</span>
                <span className="block text-[12.5px] leading-snug text-ink-3">{d}</span>
              </span>
              <StatusTag s={st} />
            </div>
          ))}
        </Card>
      </section>

      <section className="mt-6 mb-6 rounded-[22px] bg-sunken p-4 text-[13px] leading-relaxed text-ink-2" aria-labelledby="earn-h">
        <h3 id="earn-h" className="font-semibold text-ink">
          How MacroTable would earn money
        </h3>
        <p className="mt-1">
          Premium subscriptions from users, plus integration or transaction fees from restaurants that connect their menus. Restaurants can never pay for
          placement: recommendations are ranked only by fit to your targets.
        </p>
        <p className="mt-2 text-[12px] text-ink-3">Prototype pricing / concept — no billing. Prices are a hypothesis we're testing, not an offer.</p>
      </section>
    </Screen>
  );
}

function StatusTag({ s }: { s: Status }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${s === "built" ? "bg-brand-soft text-brand" : s === "sample" ? "bg-estimated-soft text-estimated" : "bg-sunken text-ink-3"}`}
    >
      {STATUS[s]}
    </span>
  );
}
