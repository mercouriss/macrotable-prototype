import { useEffect, useState, type ReactNode } from "react";
import { ACCEPTANCE_STAGES, acceptanceTimeline, canSimulateAcceptance, type AcceptanceStage } from "../lib/orderState";
import type { PlacedOrder, Restaurant } from "../types";
import { Icon } from "./Icon";

/** Orders whose sequence already played in this tab — revisiting or scrolling never replays it. */
const played = new Set<string>();

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Simulated hand-off for a FICTIONAL demo brand with a (simulated) kitchen integration:
 * approved → sending → waiting for the restaurant → accepted → ticket revealed (children).
 * The order already exists when this starts; the sequence is presentation only.
 * Anything else (real unaffiliated restaurants, hand-offs, scanned menus) renders the
 * children immediately and never claims an acceptance.
 */
export function AcceptanceSequence({
  order,
  restaurant,
  animate,
  compact = false,
  children,
}: {
  order: PlacedOrder;
  restaurant: Pick<Restaurant, "name" | "identity" | "integrationLevel">;
  /** Play the timed sequence (only right after approval, once per order). */
  animate: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  const eligible = canSimulateAcceptance(restaurant, order);
  const run = eligible && animate && !played.has(order.orderNumber) && !reducedMotion();
  const [stage, setStage] = useState<AcceptanceStage>(run ? "sending" : "ticket");

  useEffect(() => {
    if (!run) return;
    played.add(order.orderNumber);
    const tl = acceptanceTimeline(false);
    const timers = (["waiting", "accepted", "ticket"] as const).map((s) => setTimeout(() => setStage(s), tl[s]));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.orderNumber]);

  if (!eligible) return <>{children}</>;
  const at = ACCEPTANCE_STAGES.indexOf(stage);
  const steps: { key: AcceptanceStage; label: string }[] = [
    { key: "sending", label: `Sending your approved order to ${restaurant.name}` },
    { key: "waiting", label: `Waiting for ${restaurant.name}` },
    { key: "accepted", label: `${restaurant.name} accepted (simulated)` },
  ];

  return (
    <div>
      <ol className={compact ? "space-y-1" : "space-y-2.5"} aria-label="Order status">
        {steps.map((st, i) => {
          const idx = ACCEPTANCE_STAGES.indexOf(st.key);
          const done = at > idx || (st.key === "accepted" && at >= idx);
          const current = at === idx && !done;
          return (
            <li key={st.key} className={`flex items-center gap-2.5 ${compact ? "text-[12.5px]" : "text-[14px]"} ${done ? "text-ink" : current ? "font-medium text-ink" : "text-ink-3"}`}>
              <span
                aria-hidden="true"
                className={`grid shrink-0 place-items-center rounded-full ${compact ? "h-4.5 w-4.5" : "h-6 w-6"} ${done ? "bg-brand text-white" : current ? "border-2 border-brand/25 border-t-brand animate-spin" : "border-2 border-line"}`}
              >
                {done && <Icon name="check" size={compact ? 10 : 13} stroke={3} />}
              </span>
              <span>
                {st.label}
                {i === 2 && done && !compact && <span className="block text-[12px] font-normal text-ink-3">Demo restaurant: no real kitchen was contacted.</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {stage === "ticket" ? `${restaurant.name} accepted the order (simulated). Ticket ready.` : steps[Math.min(at, 2)].label}
      </p>
      {stage === "ticket" && <div className={`${run ? "animate-rise" : ""} ${compact ? "mt-2" : "mt-6"}`}>{children}</div>}
    </div>
  );
}
