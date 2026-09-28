import { CALORIE_TOLERANCE } from "../lib/feasibility";
import { euro, euroShort } from "../lib/format";
import type { Nutrition, Preferences, Provenance, UserTarget } from "../types";
import { Icon, type IconName } from "./Icon";
import { approx } from "./ProvenanceBadge";

type Tone = "good" | "warn" | "neutral";
interface Row {
  label: string;
  dot?: string;
  target: string;
  value: string;
  status: string;
  tone: Tone;
}

const TONE: Record<Tone, { icon: IconName; cls: string }> = {
  good: { icon: "check", cls: "text-brand" },
  warn: { icon: "alert", cls: "text-warn" },
  neutral: { icon: "info", cls: "text-ink-3" },
};

function softStatus(value: number, target: number, overIsNotable: boolean): { status: string; tone: Tone } {
  const diff = value - target;
  if (Math.abs(diff) <= Math.max(5, target * 0.15)) return { status: "Close", tone: "good" };
  return { status: `${diff > 0 ? "+" : "−"}${Math.abs(diff)} g`, tone: overIsNotable && diff > 0 ? "warn" : "neutral" };
}

export function buildComparisonRows(n: Nutrition, price: number, target: UserTarget, prefs?: Preferences): Row[] {
  const calDiff = n.calories - target.calories;
  const calPct = Math.abs(calDiff) / target.calories;
  const cal: Row = {
    label: "Calories",
    target: `${target.calories} kcal`,
    value: `${n.calories} kcal`,
    ...(calPct <= 0.05
      ? { status: "On target", tone: "good" as Tone }
      : calPct <= CALORIE_TOLERANCE
        ? { status: "Within 10%", tone: "good" as Tone }
        : { status: `${calDiff > 0 ? "+" : "−"}${Math.abs(calDiff)} kcal`, tone: "warn" as Tone }),
  };
  const protein: Row = {
    label: "Protein",
    dot: "var(--color-protein)",
    target: `≥${target.protein} g`,
    value: `${n.protein} g`,
    ...(n.protein >= target.protein
      ? { status: "Met", tone: "good" as Tone }
      : { status: `${target.protein - n.protein} g short`, tone: "warn" as Tone }),
  };
  const carbs: Row = { label: "Carbs", dot: "var(--color-carbs)", target: `${target.carbs} g`, value: `${n.carbs} g`, ...softStatus(n.carbs, target.carbs, false) };
  const fat: Row = { label: "Fat", dot: "var(--color-fat)", target: `${target.fat} g`, value: `${n.fat} g`, ...softStatus(n.fat, target.fat, !!prefs?.lowerFat) };
  if (prefs?.lowerFat && n.fat <= target.fat) Object.assign(fat, { status: "Lower fat", tone: "good" });
  const within = Math.round(price * 100) <= Math.round(target.maxBudget * 100);
  const cost: Row = {
    label: "Price",
    target: `${euroShort(target.maxBudget)} max`,
    value: euro(price),
    ...(within ? { status: "Under budget", tone: "good" as Tone } : { status: "Over budget", tone: "warn" as Tone }),
  };
  return [cal, protein, carbs, fat, cost];
}

/** Side-by-side target vs configured meal. Shortfalls/excesses are stated plainly — no alarm styling. */
export function NutritionComparison({
  nutrition,
  price,
  target,
  prefs,
  provenance,
  valueHeading = "This order",
}: {
  nutrition: Nutrition;
  price: number;
  target: UserTarget;
  prefs?: Preferences;
  provenance: Provenance;
  valueHeading?: string;
}) {
  const rows = buildComparisonRows(nutrition, price, target, prefs).map((r) =>
    provenance === "estimated" && r.label !== "Price" && r.tone !== "good" ? { ...r, status: `≈ ${r.status}` } : r,
  );
  const ap = approx(provenance);
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-left">
      <caption className="sr-only">Your target compared with {valueHeading.toLowerCase()}</caption>
      <colgroup>
        <col className="w-[30%]" />
        <col className="w-[30%]" />
        <col />
      </colgroup>
      <thead>
        <tr className="text-[10.5px] font-semibold uppercase tracking-[0.07em] whitespace-nowrap text-ink-3">
          <th scope="col" className="pb-1.5 font-semibold">
            <span className="sr-only">Nutrient</span>
          </th>
          <th scope="col" className="pb-1.5 font-semibold">
            Your target
          </th>
          <th scope="col" className="pb-1.5 font-semibold">
            {valueHeading}
          </th>
        </tr>
      </thead>
      <tbody className="tnum">
        {rows.map((r, i) => (
          <tr key={r.label} className={i === rows.length - 1 ? "[&>*]:border-t [&>*]:border-line-2" : ""}>
            <th scope="row" className="py-2 pr-2 align-top text-[13px] leading-[22px] font-medium text-ink-2">
              <span className="flex items-center gap-1.5">
                {r.dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.dot }} aria-hidden="true" />}
                {r.label}
              </span>
            </th>
            <td className="py-2 pr-2 align-top text-[14px] leading-[22px] whitespace-nowrap text-ink-3">{r.target}</td>
            <td className="py-2 align-top">
              <span className="flex flex-col">
                <span className="text-[15px] leading-[22px] font-semibold whitespace-nowrap text-ink">
                  {r.label === "Price" ? r.value : ap + r.value}
                </span>
                <span className={`inline-flex items-center gap-1 text-[12px] leading-4 font-medium whitespace-nowrap ${TONE[r.tone].cls}`}>
                  <Icon name={TONE[r.tone].icon} size={12} stroke={2.4} />
                  {r.status}
                </span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
