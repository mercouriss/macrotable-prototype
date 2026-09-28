export function euro(v: number): string {
  return `€${v.toFixed(2)}`;
}

/** €18 rather than €18.00 for round budgets. */
export function euroShort(v: number): string {
  return Number.isInteger(v) ? `€${v}` : euro(v);
}

export function signed(v: number, unit = ""): string {
  if (v === 0) return `±0${unit}`;
  return `${v > 0 ? "+" : "−"}${Math.abs(v)}${unit}`;
}

export function signedEuro(v: number): string {
  if (Math.round(v * 100) === 0) return "±€0";
  return `${v > 0 ? "+" : "−"}€${Math.abs(v).toFixed(2)}`;
}

export function duration(ms: number | undefined): string {
  if (ms === undefined) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
