import type { ReactNode } from "react";

/*
 * Illustrated food icons for the dish types (Pasta, Bowls, …): flat inline SVG in the Plate style — no photos,
 * nothing fetched, works fully offline. Decorative only: the dish type's name is always next to the icon.
 * Used for food choices (filters, "What do you feel like?"), never for restaurants.
 */

const ART: Record<string, ReactNode> = {
  pasta: (
    <>
      <path d="M4 16a12 10 0 0 0 24 0z" fill="#F4EFE6" stroke="#D8CFBF" strokeWidth="1" />
      <ellipse cx="16" cy="15.2" rx="10.5" ry="5" fill="#F2C14E" />
      <path d="M7.5 15.5c2.2-3 5-3 7.2 0s5 3 7.3 0M9.5 13c2-2.2 4.3-2.2 6.3 0s4.3 2.2 6.3 0" fill="none" stroke="#D49A22" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="16" cy="11.6" r="3.4" fill="#D9472B" />
      <circle cx="15" cy="10.6" r="1" fill="#F07A5E" />
      <path d="M17.6 9.2c1.6-1.9 3.8-2 4.9-1.2-.6 1.7-2.8 2.7-4.9 1.2z" fill="#3E9B4F" />
    </>
  ),
  bowls: (
    <>
      <path d="M4 15a12 10.5 0 0 0 24 0z" fill="#3F7E6E" />
      <path d="M5.2 19.5h21.6" stroke="#5E9C8B" strokeWidth="1.4" />
      <ellipse cx="16" cy="15" rx="12" ry="3.4" fill="#FBF8F1" />
      <circle cx="10" cy="13" r="3.1" fill="#F08A5D" />
      <path d="M8.3 12.2l3.4 1.6" stroke="#FBD0B8" strokeWidth=".9" strokeLinecap="round" />
      <ellipse cx="16.4" cy="12.2" rx="3.6" ry="2.5" fill="#9CC15B" />
      <ellipse cx="16.4" cy="12.2" rx="1.6" ry="1.1" fill="#C9E08E" />
      <circle cx="22.4" cy="13" r="2.9" fill="#FFFFFF" stroke="#E6E0D3" strokeWidth=".8" />
      <circle cx="22.4" cy="13" r="1.3" fill="#F2B632" />
    </>
  ),
  salads: (
    <>
      <path d="M4 16a12 9.5 0 0 0 24 0z" fill="#C8925A" />
      <path d="M5.5 20h21" stroke="#B07C47" strokeWidth="1.2" />
      <path d="M5 16.5c-.3-5 3.6-8.6 8.4-7.8-.9 4.2-4.1 7.6-8.4 7.8z" fill="#5DAA4A" />
      <path d="M27 16.5c.3-5-3.6-8.6-8.4-7.8.9 4.2 4.1 7.6 8.4 7.8z" fill="#7FC25E" />
      <path d="M16 6.5c3.2 2.2 4.2 6.4 1.1 9.8-3.2-2.2-4.3-6.4-1.1-9.8z" fill="#4C9A3E" />
      <circle cx="11.2" cy="14" r="2.7" fill="#E2483A" />
      <circle cx="10.4" cy="13.2" r=".8" fill="#F28B7F" />
      <circle cx="21" cy="14.3" r="2.5" fill="#D7EDB1" stroke="#5DAA4A" strokeWidth="1" />
      <circle cx="21" cy="14.3" r=".7" fill="#8DBE5A" />
    </>
  ),
  wraps: (
    <g transform="rotate(-18 16 16)">
      <rect x="3" y="10" width="22" height="12" rx="6" fill="#E8C68C" />
      <path d="M8 11.5l-2 9M13 10.5l-2 11M18 10.5l-2 11" stroke="#D2A867" strokeWidth="1.1" strokeLinecap="round" />
      <ellipse cx="25" cy="16" rx="4.6" ry="6.2" fill="#F4DDB0" stroke="#D2A867" strokeWidth="1" />
      <ellipse cx="25" cy="16" rx="3.2" ry="4.6" fill="#6BB04F" />
      <circle cx="24.2" cy="14" r="1.4" fill="#E2483A" />
      <circle cx="25.9" cy="17.4" r="1.5" fill="#C98B4B" />
      <circle cx="24.3" cy="18.6" r=".9" fill="#F2D06B" />
    </g>
  ),
  curry: (
    <>
      <path d="M12 8.2c-1-1.4 1-2.4 0-3.8M16 7.6c-1-1.4 1-2.4 0-3.8M20 8.2c-1-1.4 1-2.4 0-3.8" fill="none" stroke="#C9C2B5" strokeWidth="1" strokeLinecap="round" />
      <path d="M3 17a13 9 0 0 0 26 0z" fill="#F4EFE6" stroke="#D8CFBF" strokeWidth="1" />
      <ellipse cx="16" cy="17" rx="13" ry="3.8" fill="#E39A2D" />
      <path d="M5.5 17.2c0-3.6 2.9-5.8 6.6-5.8s6.6 2.2 6.6 5.8z" fill="#FFFDF7" stroke="#E6DFD1" strokeWidth=".8" />
      <circle cx="21.6" cy="16.4" r="1.7" fill="#B95F24" />
      <circle cx="25" cy="17.6" r="1.4" fill="#B95F24" />
      <path d="M22.5 13.8c1.2-1.3 2.9-1.3 3.7-.7-.5 1.2-2.1 1.9-3.7.7z" fill="#3E9B4F" />
    </>
  ),
  chicken: (
    <>
      <path d="M18.5 13.5l6.2-6.2" stroke="#DCD3C3" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M18.5 13.5l6.2-6.2" stroke="#FBF7EF" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24.6" cy="5.6" r="2.3" fill="#FBF7EF" stroke="#DCD3C3" strokeWidth=".9" />
      <circle cx="26.6" cy="8.4" r="2.3" fill="#FBF7EF" stroke="#DCD3C3" strokeWidth=".9" />
      <path d="M5.4 22.4c-2.1-6.1 2.6-12.6 9.3-12.8 4.2-.1 6.6 2.9 5.6 6.4-1.2 4.3-6.4 9.3-11.6 8.7-1.6-.2-2.8-1-3.3-2.3z" fill="#C8742F" />
      <ellipse cx="11.6" cy="15" rx="3.4" ry="2" transform="rotate(-35 11.6 15)" fill="#E09A52" />
      <path d="M8 21.5c2.6.4 5.4-.9 7.4-3" fill="none" stroke="#A65B22" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
  seafood: (
    <>
      <path d="M3.5 16c4.2-6.2 12.4-8 18.4-3.6L28 8.5v15l-6.1-3.9C15.9 24 7.7 22.2 3.5 16z" fill="#4F9DC9" />
      <path d="M5.5 17.2c4.3 3.6 10.6 4.3 15.6 1.6" fill="none" stroke="#9CCBE6" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M14.6 11.6c1.4 2.6 1.4 6.2 0 8.8" fill="none" stroke="#3B7FA6" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M17 10.4l2.8-3.2 1.2 4.4z" fill="#3B7FA6" />
      <circle cx="9.6" cy="14.6" r="1.6" fill="#FFFFFF" />
      <circle cx="9.9" cy="14.6" r=".9" fill="#1F3A4D" />
    </>
  ),
  burgers: (
    <>
      <path d="M5 14.8c0-5.4 4.9-8.4 11-8.4s11 3 11 8.4z" fill="#E2A04A" />
      <path d="M11 9.6l.6.4M15.6 8.4l.6.4M20.2 9.4l.6.4M13 12l.6.4M18.4 11.6l.6.4M23 12.4l.6.4M8.6 12.4l.6.4" stroke="#FFF4DC" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M4.2 15.2h23.6v1.4c-1.3 0-1.3 1.3-2.6 1.3s-1.3-1.3-2.6-1.3-1.3 1.3-2.6 1.3-1.3-1.3-2.6-1.3-1.3 1.3-2.6 1.3-1.3-1.3-2.6-1.3-1.3 1.3-2.6 1.3-1.3-1.3-2.6-1.3-1.3 1.3-2.6 1.3S5.5 16.6 4.2 16.6z" fill="#6BB04F" />
      <path d="M5.4 17.6h21.2l-3.4 2.6-2.4-1.6-3 2.4-2.6-2-3.2 2.2-2.4-1.8z" fill="#F6C945" />
      <rect x="5" y="18.4" width="22" height="4" rx="2" fill="#7A4325" />
      <rect x="5" y="23" width="22" height="4.2" rx="2.1" fill="#D99343" />
    </>
  ),
};

export const hasFoodIcon = (id: string) => Object.hasOwn(ART, id);

/** One dish type's illustration on a soft round tile (readable on both light and dark chips). */
export function FoodIcon({ id, size = 24, className = "" }: { id: string; size?: number; className?: string }) {
  if (!hasFoodIcon(id)) return null;
  return (
    <span
      aria-hidden="true"
      data-food-icon={id}
      className={`grid shrink-0 place-items-center rounded-full bg-[#FBF7EF] ${className}`}
      style={{ width: size, height: size, boxShadow: "inset 0 0 0 1px rgb(22 24 28 / 0.06)" }}
    >
      <svg viewBox="0 0 32 32" width={Math.round(size * 0.84)} height={Math.round(size * 0.84)} focusable="false">
        {ART[id]}
      </svg>
    </span>
  );
}

/** The chosen dish types' icons, overlapping (at most `max`, so a long choice stays compact). */
export function FoodIcons({ ids, size = 24, max = 2 }: { ids: string[]; size?: number; max?: number }) {
  const shown = ids.filter(hasFoodIcon).slice(0, max);
  if (!shown.length) return null;
  return (
    <span aria-hidden="true" className="flex shrink-0">
      {shown.map((id, i) => (
        <FoodIcon key={id} id={id} size={size} className={i ? "-ml-2 ring-2 ring-surface" : ""} />
      ))}
    </span>
  );
}
