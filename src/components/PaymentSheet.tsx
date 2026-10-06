import { useRef, useState } from "react";
import { euro } from "../lib/format";
import type { ServiceMode } from "../types";
import { Icon, type IconName } from "./Icon";
import { Button } from "./ui";

/*
 * Simulated payment step (normal mode only): the user picks how they would pay before the existing simulated
 * order completes. Nothing is charged and no payment API, SDK or network call is involved — the choice is
 * only handed back to the caller (and shown on the confirmation). Research trials and hand-offs never see it.
 */

export type PaymentMethod = "apple-pay" | "pay-in-store";

/** The confirmation line: "Apple Pay (simulated)", "Pay at pickup" or "Pay at restaurant". */
export function paymentLabel(method: PaymentMethod, mode: ServiceMode): string {
  if (method === "apple-pay") return "Apple Pay (simulated)";
  return mode === "in-store" ? "Pay at restaurant" : "Pay at pickup";
}

/** A payment method from navigation state, or undefined when it's absent or not one of ours. */
export function readPaymentMethod(state: unknown): PaymentMethod | undefined {
  const m = (state as { payment?: unknown } | null)?.payment;
  return m === "apple-pay" || m === "pay-in-store" ? m : undefined;
}

export function PaymentSheet({
  mode,
  total,
  onBack,
  onConfirm,
}: {
  mode: ServiceMode;
  total: number;
  onBack: () => void;
  onConfirm: (method: PaymentMethod) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("apple-pay");
  const [submitting, setSubmitting] = useState(false);
  const sent = useRef(false); // a rapid second tap can't complete the order twice

  const options: [PaymentMethod, IconName, string, string][] = [
    ["apple-pay", "wallet", "Apple Pay", "Simulated"],
    ["pay-in-store", "building", mode === "in-store" ? "Pay at restaurant" : "Pay at pickup", mode === "in-store" ? "Pay at the restaurant" : "Pay when you collect"],
  ];

  const place = () => {
    if (sent.current) return;
    sent.current = true;
    setSubmitting(true);
    onConfirm(method);
  };

  return (
    <div data-payment-sheet>
      <div role="radiogroup" aria-label="Payment method" className="space-y-2">
        {options.map(([id, icon, label, sub]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={method === id}
            data-payment-option={id}
            onClick={() => setMethod(id)}
            className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left ${method === id ? "border-ink bg-surface" : "border-line"}`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-ink-2">
              <Icon name={icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">{label}</span>
              <span className="block text-[12.5px] text-ink-3">{sub}</span>
            </span>
            <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${method === id ? "border-ink" : "border-line"}`}>
              {method === id && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
            </span>
          </button>
        ))}
      </div>
      <p className="tnum mt-4 flex items-baseline justify-between px-1 text-[15px] font-semibold">
        <span>Total</span> <span data-payment-total>{euro(total)}</span>
      </p>
      <p className="mt-1 px-1 text-[12.5px] text-ink-3">Demo only — no payment will be charged.</p>
      {/* Pinned to the bottom of the sheet (like the Add food footer), so it stays reachable on small phones. */}
      <div className="sticky -bottom-8 -mx-6 mt-4 -mb-8 space-y-2 border-t border-line-2 bg-surface px-6 pt-3 pb-8">
        <Button onClick={place} disabled={submitting} className="min-h-12">
          Place simulated order
        </Button>
        <Button variant="secondary" onClick={onBack} disabled={submitting} className="min-h-12">
          Back
        </Button>
      </div>
    </div>
  );
}
