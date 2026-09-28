import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { IntegrationLevel, Provenance } from "../types";
import { Icon } from "./Icon";
import { PROVENANCE_META } from "./ProvenanceBadge";
import { LEVEL_META } from "./RestaurantBadge";

type SheetContent =
  | { kind: "provenance"; provenance: Provenance; restaurantName?: string }
  | { kind: "level"; level: IntegrationLevel; restaurantName?: string }
  | { kind: "custom"; title: string; body: ReactNode };

interface SheetApi {
  openProvenance: (provenance: Provenance, restaurantName?: string) => void;
  openLevel: (level: IntegrationLevel, restaurantName?: string) => void;
  openCustom: (title: string, body: ReactNode) => void;
  close: () => void;
}

const Ctx = createContext<SheetApi | null>(null);

/** Bottom sheet rendered inside the device frame (the provider must sit inside a `relative` container). */
export function SheetProvider({ children, onOpen }: { children: ReactNode; onOpen?: (c: SheetContent) => void }) {
  const [content, setContent] = useState<SheetContent | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback(
    (c: SheetContent) => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setContent(c);
      onOpen?.(c);
    },
    [onOpen],
  );
  const close = useCallback(() => {
    setContent(null);
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!content) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [content, close]);

  const api: SheetApi = {
    openProvenance: (provenance, restaurantName) => open({ kind: "provenance", provenance, restaurantName }),
    openLevel: (level, restaurantName) => open({ kind: "level", level, restaurantName }),
    openCustom: (title, body) => open({ kind: "custom", title, body }),
    close,
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {content && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <button aria-label="Close" className="absolute inset-0 animate-fade-in bg-ink/35" onClick={close} />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            className="relative max-h-[85%] animate-sheet-in overflow-y-auto rounded-t-[28px] bg-surface px-6 pt-3 pb-8 shadow-lift outline-none"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <button
              onClick={close}
              aria-label="Close"
              className="absolute top-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-sunken text-ink-2 hover:bg-line"
            >
              <Icon name="x" size={18} />
            </button>
            <SheetBody content={content} />
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

function SheetBody({ content }: { content: SheetContent }) {
  if (content.kind === "custom") {
    return (
      <>
        <h2 id="sheet-title" className="pr-10 text-[20px] font-semibold tracking-tight">
          {content.title}
        </h2>
        <div className="mt-3 text-[15px] leading-relaxed text-ink-2">{content.body}</div>
      </>
    );
  }
  if (content.kind === "level") {
    const m = LEVEL_META[content.level];
    return (
      <>
        <p className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-3">Integration level {content.level}</p>
        <h2 id="sheet-title" className="mt-1 pr-10 text-[22px] font-semibold tracking-tight">
          {m.title}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{m.detail(content.restaurantName)}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-[13.5px]">
          <div>
            <p className="mb-1.5 font-semibold">Data</p>
            <ul className="space-y-1 text-ink-2">
              {m.data.map((d) => (
                <li key={d}>· {d}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 font-semibold">MacroTable can</p>
            <ul className="space-y-1 text-ink-2">
              {m.can.map((d) => (
                <li key={d}>· {d}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-5 text-[13px] text-ink-3">Integration depth affects data confidence and what can be ordered — never how a meal is ranked.</p>
      </>
    );
  }
  const m = PROVENANCE_META[content.provenance];
  return (
    <>
      <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold tracking-[0.06em] ${m.chip}`}>
        <Icon name={m.icon} size={14} stroke={2.4} />
        {m.label}
      </div>
      <h2 id="sheet-title" className="mt-3 pr-10 text-[22px] font-semibold tracking-tight">
        {m.sheetTitle}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2">
        {m.sheetBody(content.restaurantName).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="mt-5 rounded-2xl bg-sunken p-4 text-[13.5px] leading-snug text-ink-2">
        <p className="mb-1 font-semibold text-ink">How MacroTable calculates</p>
        AI may help interpret menus, but it never calculates nutrition. Totals are computed deterministically: base dish + the
        nutrition change of each restaurant-supported modification.
      </div>
      <p className="mt-4 text-[13px] text-ink-3">Nutrition information may vary with actual preparation. MacroTable is not a medical tool.</p>
    </>
  );
}

export function useSheet(): SheetApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSheet outside SheetProvider");
  return v;
}
