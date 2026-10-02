import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Keep a screen's scroll position across "open something → Back", on ordinary history: `remember()`
 * stores the current scroll offset in this screen's own history entry just before navigating away,
 * and the screen scrolls back to it when that entry is shown again. Put `ref` on any element inside
 * the screen (the scroll container is the enclosing <main>).
 */
export function useRememberScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const saved = (location.state as { scrollTop?: number } | null)?.scrollTop;

  useEffect(() => {
    if (saved) ref.current?.closest("main")?.scrollTo(0, saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remember = () =>
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { ...((location.state as object | null) ?? {}), scrollTop: ref.current?.closest("main")?.scrollTop ?? 0 },
    });
  return { ref, remember };
}
