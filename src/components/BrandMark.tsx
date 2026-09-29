import type { Restaurant } from "../types";

/**
 * Visual identity without photography. Fictional demo brands get an original monogram
 * in their brand colour; real restaurants get a neutral initial with a dashed ring, so
 * nothing implies branding, endorsement or a relationship we don't have.
 */
export function BrandMark({ restaurant, size = 40, className = "" }: { restaurant: Pick<Restaurant, "name" | "identity" | "brand">; size?: number; className?: string }) {
  const radius = Math.round(size * 0.3);
  if (restaurant.identity === "real" || !restaurant.brand) {
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center border border-dashed border-ink-3/45 bg-sunken font-semibold text-ink-2 ${className}`}
        style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.4 }}
      >
        {restaurant.name.replace(/^(the|de|het)\s+/i, "")[0]}
      </span>
    );
  }
  const { color, mark } = restaurant.brand;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center font-bold tracking-[-0.02em] text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 78%, black))`,
        fontSize: size * (mark.length > 2 ? 0.28 : 0.36),
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.18)",
      }}
    >
      {mark}
    </span>
  );
}
