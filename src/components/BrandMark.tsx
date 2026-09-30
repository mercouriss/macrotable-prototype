import { useState } from "react";
import type { Restaurant } from "../types";

/** Logos that failed to load in this tab: later renders go straight to the fallback (no flicker, no retry loop). */
const failedLogos = new Set<string>();
export const markLogoFailed = (src: string) => void failedLogos.add(src);

/**
 * THE restaurant logo component (one place for every surface).
 *   - logo in the data  → the local asset in a fixed-size box (object-contain, never stretched, no layout shift)
 *   - logo fails to load → falls back like "no logo" below, and remembers the failure for this tab
 *   - no logo, demo brand → its original monogram in the brand colour
 *   - no logo, real venue → a neutral initial with a dashed ring (nothing implies branding or a relationship)
 * A logo is identity only. Relationship and provenance labels ("Real · not affiliated", DEMO, DEMO VERIFIED)
 * are rendered next to it by the caller and are never replaced by it.
 * `decorative` (default): the restaurant name is shown right next to the mark, so the image is hidden from
 * screen readers to avoid announcing the name twice. Pass decorative={false} where the mark stands alone.
 */
export function BrandMark({
  restaurant,
  size = 40,
  className = "",
  decorative = true,
}: {
  restaurant: Pick<Restaurant, "id" | "name" | "identity" | "brand" | "logo">;
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const logo = restaurant.logo;
  const [broken, setBroken] = useState(() => !!logo && failedLogos.has(logo.src));
  const radius = Math.round(size * 0.3);
  const box = { width: size, height: size, borderRadius: radius };
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": logo?.alt ?? `${restaurant.name} (no logo)` };

  if (logo && !broken) {
    const real = restaurant.identity === "real";
    return (
      <span
        {...a11y}
        data-logo={logo.source}
        className={`grid shrink-0 place-items-center overflow-hidden ${real ? "border border-dashed border-ink-3/45 bg-white" : "bg-sunken"} ${className}`}
        style={{ ...box, padding: real ? size * 0.1 : 0 }}
      >
        <img
          src={`${import.meta.env.BASE_URL}${logo.src}`}
          alt={decorative ? "" : logo.alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => {
            markLogoFailed(logo.src);
            setBroken(true);
          }}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  if (restaurant.identity === "real" || !restaurant.brand) {
    return (
      <span
        {...a11y}
        data-logo="placeholder"
        className={`grid shrink-0 place-items-center border border-dashed border-ink-3/45 bg-sunken font-semibold text-ink-2 ${className}`}
        style={{ ...box, fontSize: size * 0.4 }}
      >
        {restaurant.name.replace(/^(the|de|het)\s+/i, "")[0]}
      </span>
    );
  }
  const { color, mark } = restaurant.brand;
  return (
    <span
      {...a11y}
      data-logo="monogram"
      className={`grid shrink-0 place-items-center font-bold tracking-[-0.02em] text-white ${className}`}
      style={{
        ...box,
        background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 78%, black))`,
        fontSize: size * (mark.length > 2 ? 0.28 : 0.36),
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.18)",
      }}
    >
      {mark}
    </span>
  );
}
