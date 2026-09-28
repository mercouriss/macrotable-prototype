import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

/** Go back in history when there is somewhere to go back to, otherwise to a sensible fallback. */
export function useBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback);
  };
}

export function Screen({
  title,
  back,
  right,
  children,
  footer,
  nav = false,
  bleed = false,
  className = "",
}: {
  title?: ReactNode;
  /** Fallback path for the back button; omit for no back button. */
  back?: string;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  nav?: boolean;
  bleed?: boolean;
  className?: string;
}) {
  const goBack = useBack(back ?? "/macrotable");
  return (
    <div className="flex h-full flex-col bg-canvas">
      {(title || back || right) && (
        <header className="relative flex h-14 shrink-0 items-center px-2">
          {back !== undefined && (
            <button onClick={goBack} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-sunken">
              <Icon name="chevronLeft" size={22} />
            </button>
          )}
          {title && (
            <h1 className="pointer-events-none absolute inset-x-16 truncate text-center text-[16px] font-semibold tracking-tight">{title}</h1>
          )}
          <div className="ml-auto flex items-center">{right}</div>
        </header>
      )}
      <main className={`scrollbar-none min-h-0 flex-1 overflow-y-auto ${bleed ? "" : "px-5"} ${className}`}>{children}</main>
      {footer && (
        <div className="shrink-0 border-t border-line-2 bg-canvas/95 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
          {footer}
        </div>
      )}
      {nav && <BottomNavigation />}
    </div>
  );
}

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/macrotable", label: "Home", icon: "home", end: true },
  { to: "/macrotable/discover", label: "Discover", icon: "compass" },
  { to: "/macrotable/orders", label: "Orders", icon: "receipt" },
  { to: "/macrotable/profile", label: "Profile", icon: "user" },
];

export function BottomNavigation() {
  return (
    <nav aria-label="Main" className="shrink-0 border-t border-line-2 bg-surface/95 pb-[max(6px,env(safe-area-inset-bottom))] backdrop-blur">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? "text-ink" : "text-ink-3 hover:text-ink-2"}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={t.icon} size={22} stroke={isActive ? 2.1 : 1.7} />
                  {t.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
