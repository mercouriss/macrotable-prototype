/** Illustrated plate built from the meal's palette — no photos, works fully offline. */
export function Plate({ palette, size = 64, className = "" }: { palette: string[]; size?: number; className?: string }) {
  const step = 360 / palette.length;
  const segs = palette.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(", ");
  return (
    <div
      aria-hidden="true"
      className={`shrink-0 rounded-full bg-white ${className}`}
      style={{
        width: size,
        height: size,
        padding: size * 0.1,
        boxShadow: "inset 0 0 0 1px #E4E1DA, 0 6px 14px -8px rgb(22 24 28 / 0.35)",
      }}
    >
      <div
        className="h-full w-full rounded-full"
        style={{
          background: `radial-gradient(circle at 34% 30%, rgb(255 255 255 / 0.45), transparent 48%), radial-gradient(circle at 50% 50%, transparent 60%, rgb(0 0 0 / 0.08) 100%), conic-gradient(from 25deg, ${segs})`,
        }}
      />
    </div>
  );
}
