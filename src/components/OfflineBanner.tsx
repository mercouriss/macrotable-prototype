import { useEffect, useState } from "react";
import { useInTrial } from "../state/AppState";
import { Icon } from "./Icon";

/** The prototype needs no network after first load; this just tells people that's fine. */
export function OfflineBanner() {
  const trial = useInTrial();
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const [recovered, setRecovered] = useState(false);
  useEffect(() => {
    const off = () => {
      setOffline(true);
      setRecovered(false);
    };
    const on = () => {
      setOffline(false);
      setRecovered(true);
      setTimeout(() => setRecovered(false), 2500);
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);
  if (!offline && !recovered) return null;
  return (
    <div
      role="status"
      className={`absolute inset-x-3 top-[max(8px,env(safe-area-inset-top))] z-40 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[13px] font-medium shadow-lift ${
        offline ? "bg-ink text-white" : "bg-brand-soft text-brand"
      }`}
    >
      <Icon name={offline ? "info" : "check"} size={16} />
      {offline ? (trial ? "You're offline — the prototype keeps working from saved files." : "You're offline. The prototype keeps working from saved files.") : "Back online."}
    </div>
  );
}
