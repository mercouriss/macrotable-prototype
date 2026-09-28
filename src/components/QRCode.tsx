import { useEffect, useState } from "react";

/** QR code rendered as plain SVG rects; the encoder is lazy-loaded so it never weighs on the main bundle. */
export function QRCode({ text, size = 168, label }: { text: string; size?: number; label: string }) {
  const [cells, setCells] = useState<boolean[][] | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      const grid = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
      if (live) setCells(grid);
    });
    return () => {
      live = false;
    };
  }, [text]);

  if (!cells) return <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-sunken" aria-label={label} role="img" />;
  const n = cells.length;
  const quiet = 4;
  const dim = n + quiet * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="rounded-lg"
    >
      <rect width={dim} height={dim} fill="#fff" />
      {cells.flatMap((row, r) => row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#16181c" /> : null)))}
    </svg>
  );
}
