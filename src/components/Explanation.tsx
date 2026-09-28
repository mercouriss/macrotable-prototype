import { explainConfiguration } from "../lib/optimizer";
import type { Configuration, UserTarget } from "../types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ReasonLine } from "./ui";

/** "Why this meal?" — Meets · Trade-offs · Confidence. No scores, no health percentages. */
export function Explanation({ config, target }: { config: Configuration; target: UserTarget }) {
  const e = explainConfiguration(config, target);
  return (
    <div className="space-y-5">
      <Group title="Meets">
        {e.meets.map((t) => (
          <ReasonLine key={t} tone="good">
            {t}
          </ReasonLine>
        ))}
        {e.misses.map((t) => (
          <ReasonLine key={t} tone="warn">
            {t}
          </ReasonLine>
        ))}
      </Group>
      {e.tradeoffs.length > 0 && (
        <Group title="Trade-offs">
          {e.tradeoffs.map((t) => (
            <ReasonLine key={t} tone="info">
              {t}
            </ReasonLine>
          ))}
        </Group>
      )}
      <section>
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Confidence</h4>
        <ProvenanceBadge provenance={e.confidence.provenance} restaurantName={config.restaurant.name} showSub size="sm" />
        <p className="mt-2 text-[13.5px] leading-snug text-ink-2">{e.confidence.text}</p>
      </section>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h4>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}
