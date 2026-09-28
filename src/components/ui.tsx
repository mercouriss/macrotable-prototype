import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "dark";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_4px_14px_-4px_rgb(30_107_82/0.5)]",
  secondary: "bg-surface text-ink border border-line hover:border-ink-3/40 shadow-card",
  ghost: "text-ink-2 hover:bg-sunken",
  dark: "bg-ink text-white hover:bg-ink/90",
};

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold tracking-[-0.01em] transition-colors disabled:opacity-45 disabled:shadow-none";

export function Button({
  variant = "primary",
  icon,
  full = true,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; full?: boolean }) {
  return (
    <button {...rest} className={`${BASE} ${VARIANT[variant]} ${full ? "w-full" : ""} ${className}`}>
      {icon && <Icon name={icon} size={19} />}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = "primary",
  icon,
  full = true,
  className = "",
  children,
  onClick,
}: {
  to: string;
  variant?: Variant;
  icon?: IconName;
  full?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link to={to} onClick={onClick} className={`${BASE} ${VARIANT[variant]} ${full ? "w-full" : ""} ${className}`}>
      {icon && <Icon name={icon} size={19} />}
      {children}
    </Link>
  );
}

export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <As className={`rounded-[22px] border border-line-2 bg-surface shadow-card ${className}`}>{children}</As>;
}

export function Eyebrow({ children, className = "", tone = "muted" }: { children: ReactNode; className?: string; tone?: "muted" | "brand" }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.09em] ${tone === "brand" ? "text-brand" : "text-ink-3"} ${className}`}>{children}</p>
  );
}

export function Chip({ children, tone = "neutral", icon }: { children: ReactNode; tone?: "neutral" | "brand" | "warn" | "estimated"; icon?: IconName }) {
  const tones = {
    neutral: "bg-sunken text-ink-2",
    brand: "bg-brand-soft text-brand",
    warn: "bg-warn-soft text-warn",
    estimated: "bg-estimated-soft text-estimated",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${tones[tone]}`}>
      {icon && <Icon name={icon} size={13} stroke={2.2} />}
      {children}
    </span>
  );
}

export function Callout({ tone = "info", title, children, icon }: { tone?: "info" | "warn" | "estimated"; title?: string; children: ReactNode; icon?: IconName }) {
  const tones = {
    info: "bg-sunken text-ink-2 border-line",
    warn: "bg-warn-soft text-warn border-warn/15",
    estimated: "bg-estimated-soft text-estimated border-estimated/15",
  } as const;
  const defaultIcon: IconName = tone === "info" ? "info" : "alert";
  return (
    <div role={tone === "warn" ? "alert" : undefined} className={`flex gap-3 rounded-2xl border p-3.5 text-[13.5px] leading-snug ${tones[tone]}`}>
      <Icon name={icon ?? defaultIcon} size={18} className="mt-px shrink-0" />
      <div>
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        <div className={tone === "info" ? "" : "text-ink-2"}>{children}</div>
      </div>
    </div>
  );
}

/** Small list line with a check / warning / info mark — marks are icons, never colour alone. */
export function ReasonLine({ tone, children }: { tone: "good" | "warn" | "info"; children: ReactNode }) {
  const icon: IconName = tone === "good" ? "check" : tone === "warn" ? "alert" : "info";
  const color = tone === "good" ? "text-brand" : tone === "warn" ? "text-warn" : "text-ink-3";
  return (
    <li className="flex items-start gap-2 text-[14px] leading-snug text-ink-2">
      <Icon name={icon} size={16} stroke={2.2} className={`mt-[2px] shrink-0 ${color}`} />
      <span>{children}</span>
    </li>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-line-2 ${className}`} />;
}
