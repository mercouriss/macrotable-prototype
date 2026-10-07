import { useId, useState } from "react";
import type { MenuExtra } from "../data/extras";
import { extrasFor, extrasProvenance, extrasTotals, MAX_EXTRA_QTY, resolveExtras, type ExtraLine } from "../lib/extras";
import { euro, euroShort } from "../lib/format";
import type { Macros } from "../lib/ledger";
import type { Restaurant, UserTarget } from "../types";
import { Icon } from "./Icon";
import { approx } from "./ProvenanceBadge";

/*
 * Drinks and desserts (normal/demo mode only). The picker lets the user add them to the dish they chose;
 * OrderTotal shows what the whole order adds up to against what's left today. Recommendations never
 * include them: they're the user's own additions. Research trials never render either component.
 */

const macrosLine = (n: Macros, a: string) => `${a}${n.calories} kcal · ${a}${n.protein} g protein · ${a}${n.carbs} g carbs · ${a}${n.fat} g fat`;
/** Compact, for a menu row on a phone: "175 kcal · P 25 g · C 12 g · F 3 g". */
// Non-breaking spaces inside each part, so a narrow phone wraps between parts, never inside "P 15 g".
const macrosShort = (n: Macros, a: string) =>
  [`${a}${n.calories} kcal`, `P ${a}${n.protein} g`, `C ${a}${n.carbs} g`, `F ${a}${n.fat} g`].map((s) => s.replace(/ /g, "\u00a0")).join(" · ");

/** Drinks and desserts for one restaurant: quantity steppers, or a plain list when `readOnly`. */
export function ExtrasPicker({
  restaurant,
  lines,
  onChange,
  readOnly = false,
  compact = false,
  defaultOpen,
}: {
  restaurant: Restaurant;
  lines?: ExtraLine[];
  onChange?: (lines: ExtraLine[]) => void;
  readOnly?: boolean;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const items = extrasFor(restaurant.id);
  const chosen = resolveExtras(restaurant.id, lines);
  const count = extrasTotals(chosen).count;
  const [open, setOpen] = useState(defaultOpen ?? (readOnly || count > 0));
  const panelId = useId();
  if (!items.length) return null;
  const a = approx(extrasProvenance(restaurant));
  const qtyOf = (id: string) => chosen.find((x) => x.id === id)?.qty ?? 0;
  const set = (id: string, qty: number) => {
    const next = chosen.map((x) => ({ id: x.id, qty: x.qty })).filter((x) => x.id !== id);
    if (qty > 0) next.push({ id, qty: Math.min(MAX_EXTRA_QTY, qty) });
    // Keep the menu's order so the ticket and log read the same way every time.
    onChange?.(items.filter((x) => next.some((l) => l.id === x.id)).map((x) => ({ id: x.id, qty: next.find((l) => l.id === x.id)!.qty })));
  };
  const title = readOnly ? "Drinks & desserts" : "Add a drink or dessert";

  return (
    <section data-extras className={compact ? "mt-3" : "mt-4"} aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 text-left ${compact ? "min-h-11 rounded-xl px-3" : ""}`}
      >
        <span className="min-w-0">
          <span className={`block font-semibold ${compact ? "text-[13.5px]" : "text-[14.5px]"}`}>{title}</span>
          {!readOnly && <span className="block text-[12px] text-ink-3">{count ? `${count} added to your order` : "Optional. Counts toward today's nutrition."}</span>}
        </span>
        <Icon name="chevronDown" size={18} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={panelId} className="mt-2">
          {(["drink", "dessert"] as const).map((kind) => (
            <div key={kind} className="mt-2 first:mt-0">
              <p className="px-1 text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{kind === "drink" ? "Drinks" : "Desserts"}</p>
              <ul className="mt-1 divide-y divide-line-2 overflow-hidden rounded-2xl border border-line-2 bg-surface">
                {items
                  .filter((x) => x.kind === kind)
                  .map((x) => (
                    <ExtraRow key={x.id} x={x} a={a} qty={qtyOf(x.id)} readOnly={readOnly} onSet={(q) => set(x.id, q)} />
                  ))}
              </ul>
            </div>
          ))}
          {a && <p className="mt-2 px-1 text-[12px] text-ink-3">≈ Estimated from the menu. Actual nutrition may differ.</p>}
        </div>
      )}
    </section>
  );
}

function ExtraRow({ x, a, qty, readOnly, onSet }: { x: MenuExtra; a: string; qty: number; readOnly: boolean; onSet: (qty: number) => void }) {
  return (
    <li data-extra={x.id} className="flex items-center gap-2 px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-snug font-semibold">{x.name}</span>
        <span className="tnum block text-[12px] text-ink-3">
          {x.serving} · <span className="font-semibold text-ink">{euro(x.price)}</span>
        </span>
        <span className="tnum mt-0.5 block text-[12px] text-ink-2" title={macrosLine(x.nutrition, a)}>
          {macrosShort(x.nutrition, a)}
        </span>
      </span>
      {!readOnly &&
        (qty === 0 ? (
          <button
            type="button"
            onClick={() => onSet(1)}
            aria-label={`Add ${x.name}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-brand hover:bg-sunken"
          >
            <Icon name="plus" size={17} />
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1" role="group" aria-label={`${x.name} quantity`}>
            <button type="button" onClick={() => onSet(qty - 1)} aria-label={qty === 1 ? `Remove ${x.name}` : `One less ${x.name}`} className="grid h-11 w-9 place-items-center rounded-full text-ink-2 hover:bg-sunken">
              <Icon name="minus" size={16} />
            </button>
            <span className="tnum w-5 text-center text-[14px] font-semibold" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => onSet(qty + 1)}
              disabled={qty >= MAX_EXTRA_QTY}
              aria-label={`One more ${x.name}`}
              className="grid h-11 w-9 place-items-center rounded-full text-brand hover:bg-sunken disabled:opacity-35"
            >
              <Icon name="plus" size={16} />
            </button>
          </span>
        ))}
    </li>
  );
}

/**
 * The whole order (dish + drinks and desserts) against what's left today. Warns when it goes over the
 * remaining calories or the budget, but never blocks: people do order dessert.
 */
export function OrderTotal({
  total,
  extrasCount,
  remaining,
  approxValues = false,
  compact = false,
}: {
  total: { nutrition: Macros; price: number };
  extrasCount: number;
  remaining: UserTarget;
  approxValues?: boolean;
  compact?: boolean;
}) {
  if (!extrasCount) return null;
  const a = approxValues ? "≈ " : "";
  const overKcal = Math.round(total.nutrition.calories - remaining.calories);
  const overBudget = Math.round((total.price - remaining.maxBudget) * 100) / 100;
  const left = Math.max(0, Math.round(remaining.calories - total.nutrition.calories));
  return (
    <div data-order-total className={`rounded-2xl bg-sunken/70 px-4 py-3 ${compact ? "mt-3 rounded-xl px-3 py-2.5" : "mt-4"}`}>
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">
          Your order · dish + {extrasCount} {extrasCount === 1 ? "extra" : "extras"}
        </span>
        <span className="tnum text-[15px] font-semibold">{euro(total.price)}</span>
      </p>
      <p className="tnum mt-0.5 text-[12.5px] text-ink-2">{macrosLine(total.nutrition, a)}</p>
      {overKcal > 0 || overBudget > 0 ? (
        <p role="status" className="mt-1.5 flex gap-1.5 text-[12.5px] font-medium text-warn">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>
            {[overKcal > 0 && `${overKcal} kcal over what's left today`, overBudget > 0 && `${euro(overBudget)} over your ${euroShort(remaining.maxBudget)} budget`]
              .filter(Boolean)
              .join(" and ")}
            . You can still order it.
          </span>
        </p>
      ) : (
        <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
          {a}
          {left} kcal left today after this order.
        </p>
      )}
    </div>
  );
}
